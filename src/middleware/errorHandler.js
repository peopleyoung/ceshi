function errorHandler(err, req, res, _next) {
  console.error('[Error]', err.message, err.stack);

  if (err.type === 'entity.too.large') {
    return res.status(413).json({ code: 413, message: '请求体过大' });
  }

  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ code: 400, message: '文件大小不能超过 50MB' });
  }

  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    return res.status(400).json({ code: 400, message: '上传了意外的文件字段' });
  }

  const status = err.status || 500;
  const message = status === 500 ? '服务器异常，请稍后重试' : err.message;
  res.status(status).json({ code: status, message });
}

module.exports = errorHandler;
