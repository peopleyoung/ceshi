const express = require('express');
const db = require('../db');
const authMiddleware = require('../middleware/auth');
const reviewService = require('../services/reviewService');

const router = express.Router();

router.post('/', authMiddleware, (req, res) => {
  const { tenderFileId, bidFileId, bidDeadline } = req.body;

  if (!tenderFileId || typeof tenderFileId !== 'string') {
    return res.status(400).json({ code: 400, message: '请上传招标文件' });
  }
  if (!bidFileId || typeof bidFileId !== 'string') {
    return res.status(400).json({ code: 400, message: '请上传投标文件' });
  }
  if (!bidDeadline || typeof bidDeadline !== 'string') {
    return res.status(400).json({ code: 400, message: '请选择投标截止日期' });
  }

  const deadlineDate = new Date(bidDeadline);
  if (isNaN(deadlineDate.getTime())) {
    return res.status(400).json({ code: 400, message: '投标截止日期格式不正确' });
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (deadlineDate < today) {
    return res.status(400).json({ code: 400, message: '投标截止日期不能早于今天' });
  }

  const tenderFile = db.queryOne('SELECT * FROM files WHERE id = ? AND user_id = ?', [tenderFileId, req.user.id]);
  if (!tenderFile) {
    return res.status(404).json({ code: 404, message: '招标文件不存在' });
  }

  const bidFile = db.queryOne('SELECT * FROM files WHERE id = ? AND user_id = ?', [bidFileId, req.user.id]);
  if (!bidFile) {
    return res.status(404).json({ code: 404, message: '投标文件不存在' });
  }

  const result = db.run(
    `INSERT INTO review_tasks (user_id, tender_file_id, bid_file_id, bid_deadline, status)
     VALUES (?, ?, ?, ?, 'pending')`,
    [req.user.id, tenderFileId, bidFileId, bidDeadline]
  );

  const taskId = result.lastInsertRowid;
  console.log(`[Review] Task created: id=${taskId}, user=${req.user.username}`);

  setImmediate(() => reviewService.processTask(taskId));

  res.status(201).json({
    code: 0,
    message: '审核任务已创建',
    data: { taskId },
  });
});

router.get('/', authMiddleware, (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize) || 20));
  const offset = (page - 1) * pageSize;

  const countResult = db.queryOne('SELECT COUNT(*) as count FROM review_tasks WHERE user_id = ?', [req.user.id]);
  const total = countResult ? countResult.count : 0;

  const list = db.queryAll(
    `SELECT rt.id, rt.status, rt.bid_deadline, rt.created_at, rt.completed_at,
            tf.original_name as tender_file_name,
            bf.original_name as bid_file_name
     FROM review_tasks rt
     JOIN files tf ON rt.tender_file_id = tf.id
     JOIN files bf ON rt.bid_file_id = bf.id
     WHERE rt.user_id = ?
     ORDER BY rt.created_at DESC
     LIMIT ? OFFSET ?`,
    [req.user.id, pageSize, offset]
  );

  res.json({
    code: 0,
    data: {
      list: list.map((item) => ({
        id: item.id,
        tenderFileName: item.tender_file_name,
        bidFileName: item.bid_file_name,
        bidDeadline: item.bid_deadline,
        status: item.status,
        createdAt: item.created_at,
        completedAt: item.completed_at,
      })),
      total,
      page,
      pageSize,
    },
  });
});

router.get('/:taskId', authMiddleware, (req, res) => {
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

  const results = db.queryAll(
    'SELECT * FROM review_results WHERE task_id = ? ORDER BY category, sort_order',
    [taskId]
  );

  const grouped = { qualification: [], disqualification: [], certificate: [] };
  for (const r of results) {
    const category = r.category === 'qualification' ? 'qualification' :
      r.category === 'disqualification' ? 'disqualification' : 'certificate';
    grouped[category].push({
      id: r.id,
      title: r.title,
      conclusion: r.conclusion,
      excerpt: r.excerpt,
      basis: r.basis,
      confidence: r.confidence,
    });
  }

  res.json({
    code: 0,
    data: {
      task: {
        id: task.id,
        tenderFileName: task.tender_file_name,
        bidFileName: task.bid_file_name,
        bidDeadline: task.bid_deadline,
        status: task.status,
        errorMessage: task.error_message,
        progress: task.progress,
        currentStep: task.current_step,
        createdAt: task.created_at,
        startedAt: task.started_at,
        completedAt: task.completed_at,
      },
      results: grouped,
    },
  });
});

router.post('/:taskId/retry', authMiddleware, (req, res) => {
  const taskId = parseInt(req.params.taskId);
  if (isNaN(taskId)) {
    return res.status(400).json({ code: 400, message: '任务 ID 格式不正确' });
  }

  const task = db.queryOne('SELECT * FROM review_tasks WHERE id = ? AND user_id = ?', [taskId, req.user.id]);
  if (!task) {
    return res.status(404).json({ code: 404, message: '任务不存在' });
  }
  if (task.status !== 'failed') {
    return res.status(400).json({ code: 400, message: '仅失败任务可重试' });
  }

  db.run(
    `UPDATE review_tasks SET status = 'pending', error_message = NULL, progress = 0,
     current_step = NULL, started_at = NULL, completed_at = NULL, updated_at = datetime('now')
     WHERE id = ?`,
    [taskId]
  );

  db.run('DELETE FROM review_results WHERE task_id = ?', [taskId]);

  console.log(`[Review] Task retry: id=${taskId}`);
  setImmediate(() => reviewService.processTask(taskId));

  res.json({ code: 0, message: '任务已重新提交' });
});

module.exports = router;
