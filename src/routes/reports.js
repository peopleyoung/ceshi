const express = require('express');
const PDFDocument = require('pdfkit');
const { Document, Packer, Paragraph, TextRun, HeadingLevel } = require('docx');
const db = require('../db');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

const CONCLUSION_LABELS = {
  met: '满足',
  not_met: '不满足',
  insufficient: '信息不足',
  triggered: '触发',
  not_triggered: '未触发',
  valid: '有效',
  expired: '已过期',
  not_stated: '未载明',
};

const CATEGORY_LABELS = {
  qualification: '资格项审查',
  disqualification: '废标项审查',
  certificate: '证件有效期审查',
};

function sanitizeText(text) {
  if (!text) return '';
  return text.replace(/[^\x00-\x7F\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/g, '').trim() || '[content]';
}

router.get('/:taskId/export/pdf', authMiddleware, (req, res) => {
  const taskId = parseInt(req.params.taskId);
  if (isNaN(taskId)) {
    return res.status(400).json({ code: 400, message: '任务 ID 格式不正确' });
  }

  const task = db.queryOne(
    `SELECT rt.*, tf.original_name as tender_file_name, bf.original_name as bid_file_name
     FROM review_tasks rt
     JOIN files tf ON rt.tender_file_id = tf.id
     JOIN files bf ON rt.bid_file_id = bf.id
     WHERE rt.id = ? AND rt.user_id = ?`,
    [taskId, req.user.id]
  );

  if (!task) {
    return res.status(404).json({ code: 404, message: '任务不存在' });
  }
  if (task.status !== 'completed') {
    return res.status(400).json({ code: 400, message: '任务尚未完成' });
  }

  const results = db.queryAll(
    'SELECT * FROM review_results WHERE task_id = ? ORDER BY category, sort_order',
    [taskId]
  );

  const grouped = { qualification: [], disqualification: [], certificate: [] };
  for (const r of results) {
    grouped[r.category].push(r);
  }

  let content = '标书审核报告\n\n';
  content += `招标文件：${task.tender_file_name}\n`;
  content += `投标文件：${task.bid_file_name}\n`;
  content += `投标截止日期：${task.bid_deadline}\n`;
  content += `创建时间：${task.created_at}\n`;
  content += `完成时间：${task.completed_at}\n\n`;

  for (const [category, items] of Object.entries(grouped)) {
    content += `${CATEGORY_LABELS[category]}\n`;
    content += '='.repeat(40) + '\n';

    if (items.length === 0) {
      content += '暂无审核条目\n\n';
      continue;
    }

    items.forEach((item, idx) => {
      content += `\n${idx + 1}. ${item.title}\n`;
      content += `   结论：${CONCLUSION_LABELS[item.conclusion] || item.conclusion}\n`;
      if (item.excerpt) {
        content += `   原文摘录：${item.excerpt}\n`;
      }
      if (item.basis) {
        content += `   判定依据：${item.basis}\n`;
      }
      content += `   置信度：${Math.round(item.confidence * 100)}%\n`;
    });
    content += '\n';
  }

  const doc = new PDFDocument({ margin: 50 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="review-report-${taskId}.pdf"`);
  doc.pipe(res);

  const lines = content.split('\n');
  let yPos = 50;

  for (const line of lines) {
    if (yPos > 750) {
      doc.addPage();
      yPos = 50;
    }

    const isTitle = line === '标书审核报告';
    const isSection = Object.values(CATEGORY_LABELS).includes(line);

    if (isTitle) {
      doc.fontSize(20).text(sanitizeText(line), 50, yPos, { align: 'center' });
      yPos += 30;
    } else if (isSection) {
      yPos += 10;
      doc.fontSize(14).text(sanitizeText(line), 50, yPos);
      yPos += 20;
    } else if (line.startsWith('='.repeat(10))) {
      yPos += 5;
    } else {
      doc.fontSize(10).text(sanitizeText(line), 50, yPos, { lineGap: 2 });
      const textHeight = doc.heightOfString(sanitizeText(line), { width: 500 });
      yPos += textHeight + 2;
    }
  }

  doc.end();
});

router.get('/:taskId/export/word', authMiddleware, async (req, res) => {
  const taskId = parseInt(req.params.taskId);
  if (isNaN(taskId)) {
    return res.status(400).json({ code: 400, message: '任务 ID 格式不正确' });
  }

  const task = db.queryOne(
    `SELECT rt.*, tf.original_name as tender_file_name, bf.original_name as bid_file_name
     FROM review_tasks rt
     JOIN files tf ON rt.tender_file_id = tf.id
     JOIN files bf ON rt.bid_file_id = bf.id
     WHERE rt.id = ? AND rt.user_id = ?`,
    [taskId, req.user.id]
  );

  if (!task) {
    return res.status(404).json({ code: 404, message: '任务不存在' });
  }
  if (task.status !== 'completed') {
    return res.status(400).json({ code: 400, message: '任务尚未完成' });
  }

  const results = db.queryAll(
    'SELECT * FROM review_results WHERE task_id = ? ORDER BY category, sort_order',
    [taskId]
  );

  const children = [
    new Paragraph({
      text: '标书审核报告',
      heading: HeadingLevel.TITLE,
      alignment: 'center',
    }),
    new Paragraph({ text: '' }),
    new Paragraph({ text: `招标文件：${task.tender_file_name}` }),
    new Paragraph({ text: `投标文件：${task.bid_file_name}` }),
    new Paragraph({ text: `投标截止日期：${task.bid_deadline}` }),
    new Paragraph({ text: `创建时间：${task.created_at}` }),
    new Paragraph({ text: `完成时间：${task.completed_at}` }),
    new Paragraph({ text: '' }),
  ];

  const grouped = { qualification: [], disqualification: [], certificate: [] };
  for (const r of results) {
    grouped[r.category].push(r);
  }

  for (const [category, items] of Object.entries(grouped)) {
    children.push(
      new Paragraph({
        text: CATEGORY_LABELS[category],
        heading: HeadingLevel.HEADING_1,
      })
    );

    if (items.length === 0) {
      children.push(new Paragraph({ text: '暂无审核条目' }));
      continue;
    }

    items.forEach((item, idx) => {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: `${idx + 1}. ${item.title}`, bold: true })],
        })
      );
      children.push(new Paragraph({ text: `结论：${CONCLUSION_LABELS[item.conclusion] || item.conclusion}` }));
      if (item.excerpt) {
        children.push(new Paragraph({ text: `原文摘录：${item.excerpt}`, indent: { left: 720 } }));
      }
      if (item.basis) {
        children.push(new Paragraph({ text: `判定依据：${item.basis}`, indent: { left: 720 } }));
      }
      children.push(new Paragraph({ text: `置信度：${Math.round(item.confidence * 100)}%` }));
      children.push(new Paragraph({ text: '' }));
    });
  }

  const doc = new Document({ sections: [{ children }] });
  const buffer = await Packer.toBuffer(doc);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  res.setHeader('Content-Disposition', `attachment; filename="review-report-${taskId}.docx"`);
  res.send(buffer);
});

module.exports = router;
