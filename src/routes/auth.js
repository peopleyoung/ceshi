const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const config = require('../config');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,50}$/;

router.post('/register', (req, res) => {
  const { username, password } = req.body;

  if (!username || typeof username !== 'string') {
    return res.status(400).json({ code: 400, message: '请输入用户名' });
  }
  if (!USERNAME_REGEX.test(username)) {
    return res.status(400).json({ code: 400, message: '用户名须为 3-50 位字母、数字或下划线' });
  }
  if (!password || typeof password !== 'string') {
    return res.status(400).json({ code: 400, message: '请输入密码' });
  }
  if (password.length < 6) {
    return res.status(400).json({ code: 400, message: '密码至少 6 位字符' });
  }

  const existing = db.queryOne('SELECT id FROM users WHERE username = ?', [username]);
  if (existing) {
    return res.status(409).json({ code: 1001, message: '该用户名已被注册' });
  }

  const passwordHash = bcrypt.hashSync(password, 10);
  const result = db.run('INSERT INTO users (username, password_hash) VALUES (?, ?)', [username, passwordHash]);

  console.log(`[Auth] User registered: ${username} (id=${result.lastInsertRowid})`);

  res.status(201).json({
    code: 0,
    message: '注册成功',
    data: { id: result.lastInsertRowid, username },
  });
});

router.post('/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || typeof username !== 'string') {
    return res.status(400).json({ code: 400, message: '请输入用户名' });
  }
  if (!password || typeof password !== 'string') {
    return res.status(400).json({ code: 400, message: '请输入密码' });
  }

  const user = db.queryOne('SELECT * FROM users WHERE username = ?', [username]);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ code: 1010, message: '用户名或密码错误' });
  }

  const token = jwt.sign({ id: user.id, username: user.username }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  });

  console.log(`[Auth] User logged in: ${username} (id=${user.id})`);

  res.json({
    code: 0,
    message: '登录成功',
    data: {
      token,
      user: { id: user.id, username: user.username },
    },
  });
});

router.get('/me', authMiddleware, (req, res) => {
  const user = db.queryOne('SELECT id, username, created_at FROM users WHERE id = ?', [req.user.id]);
  if (!user) {
    return res.status(404).json({ code: 404, message: '用户不存在' });
  }
  res.json({ code: 0, data: { user } });
});

module.exports = router;
