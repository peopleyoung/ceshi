const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const config = require('../config');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

if (!fs.existsSync(config.uploadDir)) {
  fs.mkdirSync(config.uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, config.uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${uuidv4()}${ext}`);
  },
});

function fileFilter(_req, file, cb) {
  const ext = path.extname(file.originalname).toLowerCase();
  if (!config.allowedFileTypes.includes(ext)) {
    return cb(new Error('仅支持 PDF、DOC、DOCX、PNG、JPG 格式'));
  }
  cb(null, true);
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: config.maxFileSize },
});

function getFileType(ext) {
  if (ext === '.pdf') return 'pdf';
  if (ext === '.doc') return 'doc';
  if (ext === '.docx') return 'docx';
  if (ext === '.png' || ext === '.jpg' || ext === '.jpeg') return 'image';
  return 'unknown';
}

router.post('/upload', authMiddleware, upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ code: 400, message: '请选择要上传的文件' });
  }

  const ext = path.extname(req.file.originalname).toLowerCase();
  const fileId = uuidv4();

  db.run(
    `INSERT INTO files (id, user_id, original_name, stored_name, mime_type, size, file_type)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [fileId, req.user.id, req.file.originalname, req.file.filename, req.file.mimetype, req.file.size, getFileType(ext)]
  );

  console.log(`[File] Uploaded: ${req.file.originalname} (id=${fileId}, size=${req.file.size})`);

  res.status(201).json({
    code: 0,
    message: '上传成功',
    data: {
      fileId,
      fileName: req.file.originalname,
      fileSize: req.file.size,
      fileType: getFileType(ext),
      status: 'ready',
    },
  });
});

module.exports = router;
