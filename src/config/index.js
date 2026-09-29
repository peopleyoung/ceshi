const path = require('path');

const config = {
  port: process.env.PORT || 3000,
  jwtSecret: process.env.JWT_SECRET || 'bid-review-platform-secret-key-change-in-production',
  jwtExpiresIn: '24h',
  dbPath: path.resolve(__dirname, '../../data/db/app.db'),
  uploadDir: path.resolve(__dirname, '../../data/uploads'),
  maxFileSize: 50 * 1024 * 1024,
  allowedFileTypes: ['.pdf', '.doc', '.docx', '.png', '.jpg', '.jpeg'],
  defaultAiConfig: {
    endpoint: 'https://api.openai.com/v1',
    modelName: 'gpt-4-turbo',
    apiKey: '',
  },
};

module.exports = config;
