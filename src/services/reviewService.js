const db = require('../db');
const config = require('../config');
const path = require('path');
const { extractTextFromFile } = require('./textExtractionService');

async function processTask(taskId) {
  const task = db.queryOne('SELECT * FROM review_tasks WHERE id = ?', [taskId]);
  if (!task) {
    console.error(`[ReviewService] Task not found: ${taskId}`);
    return;
  }

  try {
    db.run(
      `UPDATE review_tasks SET status = 'parsing', progress = 25, current_step = '文件解析',
       started_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`,
      [taskId]
    );

    const tenderFile = db.queryOne('SELECT stored_name FROM files WHERE id = ?', [task.tender_file_id]);
    const bidFile = db.queryOne('SELECT stored_name FROM files WHERE id = ?', [task.bid_file_id]);

    const tenderFilePath = path.join(config.uploadDir, tenderFile.stored_name);
    const bidFilePath = path.join(config.uploadDir, bidFile.stored_name);

    console.log(`[ReviewService] Extracting text from tender file: ${path.basename(tenderFilePath)}`);
    const tenderContent = await extractTextFromFile(tenderFilePath);
    console.log(`[ReviewService] Tender text extracted: ${tenderContent.length} chars`);

    console.log(`[ReviewService] Extracting text from bid file: ${path.basename(bidFilePath)}`);
    const bidContent = await extractTextFromFile(bidFilePath);
    console.log(`[ReviewService] Bid text extracted: ${bidContent.length} chars`);

    db.run(
      `UPDATE review_tasks SET status = 'reviewing', progress = 50, current_step = 'AI 审核中',
       updated_at = datetime('now') WHERE id = ?`,
      [taskId]
    );

    const reviewResults = await performAIReview(taskId, tenderContent, bidContent, task.bid_deadline);

    db.run(
      `UPDATE review_tasks SET status = 'completed', progress = 100, current_step = '生成报告',
       completed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`,
      [taskId]
    );

    for (const r of reviewResults) {
      db.run(
        `INSERT INTO review_results (task_id, category, title, conclusion, excerpt, basis, confidence, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [taskId, r.category, r.title, r.conclusion, r.excerpt, r.basis, r.confidence, r.sortOrder]
      );
    }

    console.log(`[ReviewService] Task completed: id=${taskId}, results=${reviewResults.length}`);
  } catch (err) {
    console.error(`[ReviewService] Task failed: id=${taskId}`, err.message);
    db.run(
      `UPDATE review_tasks SET status = 'failed', error_message = ?, updated_at = datetime('now') WHERE id = ?`,
      [err.message, taskId]
    );
  }
}

async function performAIReview(taskId, tenderContent, bidContent, bidDeadline) {
  const aiConfig = db.queryOne('SELECT * FROM ai_config WHERE id = 1');

  if (!aiConfig.api_key) {
    throw new Error('AI 服务未配置：请先在系统配置中设置 AI 大模型的 API Key');
  }

  if (!tenderContent.trim() && !bidContent.trim()) {
    throw new Error('文件内容提取失败：招标文件和投标文件均未提取到有效文本，请确认文件内容是否完整');
  }

  console.log(`[ReviewService] Starting AI review for task ${taskId}`);
  const results = await callAIForReview(aiConfig, tenderContent, bidContent, bidDeadline);
  return results;
}

async function callAIForReview(aiConfig, tenderContent, bidContent, bidDeadline) {
  const prompt = `你是一个标书审核专家。请根据以下招标文件要求，审核投标文件，并返回 JSON 格式的审核结果。

招标文件内容：
${tenderContent}

投标文件内容：
${bidContent}

投标截止日期：${bidDeadline}

请审核以下三类内容：
1. 资格项审查（qualification）：检查投标人是否满足招标文件中的资格要求
2. 废标项审查（disqualification）：检查是否触发废标条件
3. 证件有效期审查（certificate）：检查证件在投标截止日期前是否有效

返回格式：
[
  {
    "category": "qualification|disqualification|certificate",
    "title": "审核项标题",
    "conclusion": "met|not_met|insufficient|triggered|not_triggered|valid|expired|not_stated",
    "excerpt": "原文摘录",
    "basis": "判定依据",
    "confidence": 0.95,
    "sortOrder": 1
  }
]`;

  const response = await fetch(`${aiConfig.endpoint}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${aiConfig.api_key}`,
    },
    body: JSON.stringify({
      model: aiConfig.model_name,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    throw new Error(`AI API call failed: ${response.status}`);
  }

  const data = await response.json();
  const content = data.choices[0].message.content;

  try {
    const results = JSON.parse(content);
    return results.map((r, idx) => ({
      category: r.category,
      title: r.title,
      conclusion: r.conclusion,
      excerpt: r.excerpt || '',
      basis: r.basis || '',
      confidence: r.confidence || 0.8,
      sortOrder: r.sortOrder || idx + 1,
    }));
  } catch (err) {
    throw new Error('AI 返回结果解析失败');
  }
}

module.exports = { processTask };
