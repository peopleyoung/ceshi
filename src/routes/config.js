const express = require('express');
const db = require('../db');
const config = require('../config');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

function maskApiKey(key) {
  if (!key || key.length < 10) return '';
  return key.slice(0, 3) + '****' + key.slice(-4);
}

router.get('/ai', authMiddleware, (_req, res) => {
  const row = db.queryOne('SELECT * FROM ai_config WHERE id = 1');
  res.json({
    code: 0,
    data: {
      endpoint: row.endpoint,
      modelName: row.model_name,
      apiKey: maskApiKey(row.api_key),
    },
  });
});

router.put('/ai', authMiddleware, (req, res) => {
  const { endpoint, modelName, apiKey } = req.body;

  if (!endpoint || typeof endpoint !== 'string') {
    return res.status(400).json({ code: 400, message: '请输入 AI 服务地址' });
  }
  try {
    new URL(endpoint);
  } catch {
    return res.status(400).json({ code: 400, message: '请输入有效的 URL 地址' });
  }

  if (!modelName || typeof modelName !== 'string' || !modelName.trim()) {
    return res.status(400).json({ code: 400, message: '请输入模型名称' });
  }

  const current = db.queryOne('SELECT api_key FROM ai_config WHERE id = 1');

  let finalApiKey = current.api_key;
  if (apiKey !== undefined && apiKey !== null && apiKey !== '') {
    if (typeof apiKey !== 'string' || apiKey.length < 10) {
      return res.status(400).json({ code: 400, message: 'API Key 格式不正确' });
    }
    finalApiKey = apiKey;
  }

  db.run(
    `UPDATE ai_config SET endpoint = ?, model_name = ?, api_key = ?, updated_at = datetime('now') WHERE id = 1`,
    [endpoint, modelName.trim(), finalApiKey]
  );

  console.log(`[Config] AI config updated by user=${req.user.username}`);

  res.json({ code: 0, message: '配置已保存' });
});

router.post('/ai/reset', authMiddleware, (req, res) => {
  db.run(
    `UPDATE ai_config SET endpoint = ?, model_name = ?, api_key = '', updated_at = datetime('now') WHERE id = 1`,
    [config.defaultAiConfig.endpoint, config.defaultAiConfig.modelName]
  );

  console.log(`[Config] AI config reset by user=${req.user.username}`);

  res.json({
    code: 0,
    message: '已恢复默认配置',
    data: {
      endpoint: config.defaultAiConfig.endpoint,
      modelName: config.defaultAiConfig.modelName,
      apiKey: '',
    },
  });
});

module.exports = router;
