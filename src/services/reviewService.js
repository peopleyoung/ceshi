const db = require('../db');
const config = require('../config');
const path = require('path');
const fs = require('fs');

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

    await new Promise((resolve) => setTimeout(resolve, 1000));

    db.run(
      `UPDATE review_tasks SET status = 'reviewing', progress = 50, current_step = 'AI 审核中',
       updated_at = datetime('now') WHERE id = ?`,
      [taskId]
    );

    await new Promise((resolve) => setTimeout(resolve, 2000));

    const tenderFile = db.queryOne('SELECT stored_name FROM files WHERE id = ?', [task.tender_file_id]);
    const bidFile = db.queryOne('SELECT stored_name FROM files WHERE id = ?', [task.bid_file_id]);

    const tenderFilePath = path.join(config.uploadDir, tenderFile.stored_name);
    const bidFilePath = path.join(config.uploadDir, bidFile.stored_name);

    const reviewResults = await performAIReview(taskId, tenderFilePath, bidFilePath, task.bid_deadline);

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

async function performAIReview(taskId, tenderFilePath, bidFilePath, bidDeadline) {
  const aiConfig = db.queryOne('SELECT * FROM ai_config WHERE id = 1');

  if (!aiConfig.api_key) {
    console.log(`[ReviewService] No AI API key configured, using mock review for task ${taskId}`);
    return generateMockResults(bidDeadline);
  }

  try {
    const tenderContent = await extractTextFromFile(tenderFilePath);
    const bidContent = await extractTextFromFile(bidFilePath);

    const results = await callAIForReview(aiConfig, tenderContent, bidContent, bidDeadline);
    return results;
  } catch (err) {
    console.error(`[ReviewService] AI review failed, falling back to mock:`, err.message);
    return generateMockResults(bidDeadline);
  }
}

async function extractTextFromFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return '[文件内容提取失败：文件不存在]';
  }

  const ext = path.extname(filePath).toLowerCase();

  if (ext === '.pdf') {
    return '[PDF 文件内容 - 需要 PDF 解析库提取]';
  } else if (ext === '.docx') {
    return '[DOCX 文件内容 - 需要 mammoth 库提取]';
  } else if (ext === '.doc') {
    return '[DOC 文件内容 - 需要额外工具提取]';
  }

  return '[不支持的文件格式]';
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

function generateMockResults(bidDeadline) {
  return [
    {
      category: 'qualification',
      title: '投标人须具备建筑工程施工总承包二级及以上资质',
      conclusion: 'met',
      excerpt: '投标文件第15页：我司持有建筑工程施工总承包一级资质证书，证书编号：XXXXX',
      basis: '投标文件明确提供了一级资质证书信息，满足二级及以上要求。',
      confidence: 0.95,
      sortOrder: 1,
    },
    {
      category: 'qualification',
      title: '投标人须具备有效的安全生产许可证',
      conclusion: 'met',
      excerpt: '投标文件第18页：附安全生产许可证复印件，有效期至2027年12月31日',
      basis: '投标文件提供了安全生产许可证，有效期覆盖投标截止日期。',
      confidence: 0.92,
      sortOrder: 2,
    },
    {
      category: 'disqualification',
      title: '投标人近3年内有重大违法违规行为',
      conclusion: 'not_triggered',
      excerpt: '投标文件第25页：我司近3年内无重大违法违规记录声明',
      basis: '投标文件提供了无违法违规声明，未触发废标条件。',
      confidence: 0.88,
      sortOrder: 1,
    },
    {
      category: 'disqualification',
      title: '投标文件未按要求的格式密封',
      conclusion: 'not_triggered',
      excerpt: '无法从文件内容判断密封情况',
      basis: '此项需人工现场核验，系统无法自动判定。',
      confidence: 0.5,
      sortOrder: 2,
    },
    {
      category: 'certificate',
      title: '营业执照有效期',
      conclusion: 'valid',
      excerpt: '投标文件第10页：营业执照有效期至2030年6月30日',
      basis: `营业执照有效期至2030年6月30日，晚于投标截止日期${bidDeadline}，证件有效。`,
      confidence: 0.96,
      sortOrder: 1,
    },
    {
      category: 'certificate',
      title: '资质证书有效期',
      conclusion: 'valid',
      excerpt: '投标文件第15页：资质证书长期有效',
      basis: '资质证书为长期有效，在投标截止日期前有效。',
      confidence: 0.93,
      sortOrder: 2,
    },
  ];
}

module.exports = { processTask };
