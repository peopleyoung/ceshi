# 标书审核平台 · API 接口文档

版本：v1.0 | 日期：2026-09-29

---

## 基础信息

- **Base URL**: `http://localhost:3000/api`
- **认证方式**: JWT Bearer Token
- **Content-Type**: `application/json`（文件上传为 `multipart/form-data`）

---

## 通用响应格式

### 成功响应
```json
{
  "code": 0,
  "message": "操作成功",
  "data": { ... }
}
```

### 错误响应
```json
{
  "code": 400,
  "message": "错误描述"
}
```

### 错误码

| 错误码 | 说明 |
|--------|------|
| 0 | 成功 |
| 400 | 请求参数错误 |
| 401 | 未认证 / Token 过期 |
| 404 | 资源不存在 |
| 409 | 资源冲突（如用户名已存在） |
| 500 | 服务器内部错误 |
| 1001 | 用户名已被注册 |
| 1010 | 用户名或密码错误 |

---

## 1. 用户认证模块

### 1.1 注册

**POST** `/api/auth/register`

**请求体：**
```json
{
  "username": "testuser",
  "password": "test123456"
}
```

**校验规则：**
- `username`: 3-50 位字母、数字或下划线，必填
- `password`: 至少 6 位，必填

**成功响应 (201)：**
```json
{
  "code": 0,
  "message": "注册成功",
  "data": {
    "id": 1,
    "username": "testuser"
  }
}
```

**错误响应：**
- `409` + `code: 1001` — 用户名已被注册
- `400` — 参数校验失败

---

### 1.2 登录

**POST** `/api/auth/login`

**请求体：**
```json
{
  "username": "testuser",
  "password": "test123456"
}
```

**成功响应 (200)：**
```json
{
  "code": 0,
  "message": "登录成功",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "user": {
      "id": 1,
      "username": "testuser"
    }
  }
}
```

**错误响应：**
- `401` + `code: 1010` — 用户名或密码错误

---

### 1.3 获取当前用户

**GET** `/api/auth/me`

**Headers:**
```
Authorization: Bearer <token>
```

**成功响应 (200)：**
```json
{
  "code": 0,
  "data": {
    "user": {
      "id": 1,
      "username": "testuser",
      "created_at": "2026-09-29 10:00:00"
    }
  }
}
```

---

## 2. 文件上传模块

### 2.1 上传文件

**POST** `/api/files/upload`

**Headers:**
```
Authorization: Bearer <token>
Content-Type: multipart/form-data
```

**表单字段：**
- `file`: 文件（PDF/DOC/DOCX，最大 50MB）

**成功响应 (201)：**
```json
{
  "code": 0,
  "message": "上传成功",
  "data": {
    "fileId": "uuid-string",
    "fileName": "招标文件.pdf",
    "fileSize": 2345678,
    "fileType": "pdf",
    "status": "ready"
  }
}
```

**错误响应：**
- `400` — 文件格式不支持 / 文件超过 50MB
- `401` — 未认证

---

## 3. 审核任务模块

### 3.1 创建审核任务

**POST** `/api/reviews`

**Headers:**
```
Authorization: Bearer <token>
```

**请求体：**
```json
{
  "tenderFileId": "uuid-string",
  "bidFileId": "uuid-string",
  "bidDeadline": "2026-12-31"
}
```

**校验规则：**
- `tenderFileId`: 必填，须为当前用户已上传的招标文件
- `bidFileId`: 必填，须为当前用户已上传的投标文件
- `bidDeadline`: 必填，格式 YYYY-MM-DD，不早于今天

**成功响应 (201)：**
```json
{
  "code": 0,
  "message": "审核任务已创建",
  "data": {
    "taskId": 1
  }
}
```

**错误响应：**
- `400` — 参数校验失败 / 截止日期不合法
- `404` — 文件不存在

---

### 3.2 获取任务列表

**GET** `/api/reviews?page=1&pageSize=20`

**Headers:**
```
Authorization: Bearer <token>
```

**查询参数：**
- `page`: 页码，默认 1
- `pageSize`: 每页条数，默认 20，最大 100

**成功响应 (200)：**
```json
{
  "code": 0,
  "data": {
    "list": [
      {
        "id": 1,
        "tenderFileName": "招标文件A.pdf",
        "bidFileName": "投标文件A.pdf",
        "bidDeadline": "2026-12-31",
        "status": "completed",
        "createdAt": "2026-09-29 10:00:00",
        "completedAt": "2026-09-29 10:03:25"
      }
    ],
    "total": 1,
    "page": 1,
    "pageSize": 20
  }
}
```

**任务状态 (`status`)：**
| 值 | 说明 |
|----|------|
| `pending` | 等待中 |
| `parsing` | 文件解析中 |
| `reviewing` | AI 审核中 |
| `completed` | 已完成 |
| `failed` | 失败 |

---

### 3.3 获取任务详情

**GET** `/api/reviews/:taskId`

**Headers:**
```
Authorization: Bearer <token>
```

**成功响应 (200)：**
```json
{
  "code": 0,
  "data": {
    "task": {
      "id": 1,
      "tenderFileName": "招标文件A.pdf",
      "bidFileName": "投标文件A.pdf",
      "bidDeadline": "2026-12-31",
      "status": "completed",
      "errorMessage": null,
      "progress": 100,
      "currentStep": "生成报告",
      "createdAt": "2026-09-29 10:00:00",
      "startedAt": "2026-09-29 10:00:01",
      "completedAt": "2026-09-29 10:03:25"
    },
    "results": {
      "qualification": [
        {
          "id": 1,
          "title": "投标人须具备建筑工程施工总承包二级及以上资质",
          "conclusion": "met",
          "excerpt": "投标文件第15页：我司持有建筑工程施工总承包一级资质证书...",
          "basis": "投标文件明确提供了一级资质证书信息，满足二级及以上要求。",
          "confidence": 0.95
        }
      ],
      "disqualification": [
        {
          "id": 3,
          "title": "投标人近3年内有重大违法违规行为",
          "conclusion": "not_triggered",
          "excerpt": "投标文件第25页：我司近3年内无重大违法违规记录声明",
          "basis": "投标文件提供了无违法违规声明，未触发废标条件。",
          "confidence": 0.88
        }
      ],
      "certificate": [
        {
          "id": 5,
          "title": "营业执照有效期",
          "conclusion": "valid",
          "excerpt": "投标文件第10页：营业执照有效期至2030年6月30日",
          "basis": "营业执照有效期至2030年6月30日，晚于投标截止日期，证件有效。",
          "confidence": 0.96
        }
      ]
    }
  }
}
```

**结论值 (`conclusion`)：**

| 类别 | 值 | 含义 |
|------|-----|------|
| 资格项 | `met` | 满足 |
| 资格项 | `not_met` | 不满足 |
| 资格项 | `insufficient` | 信息不足 |
| 废标项 | `triggered` | 触发 |
| 废标项 | `not_triggered` | 未触发 |
| 废标项 | `insufficient` | 信息不足 |
| 证件有效期 | `valid` | 有效 |
| 证件有效期 | `expired` | 已过期 |
| 证件有效期 | `not_stated` | 未载明 |

---

### 3.4 重试失败任务

**POST** `/api/reviews/:taskId/retry`

**Headers:**
```
Authorization: Bearer <token>
```

**成功响应 (200)：**
```json
{
  "code": 0,
  "message": "任务已重新提交"
}
```

**错误响应：**
- `400` — 任务非失败状态，不可重试
- `404` — 任务不存在

---

## 4. 报告导出模块

### 4.1 导出 PDF 报告

**GET** `/api/reviews/:taskId/export/pdf`

**Headers:**
```
Authorization: Bearer <token>
```

**成功响应 (200)：**
- Content-Type: `application/pdf`
- Content-Disposition: `attachment; filename="review-report-{taskId}.pdf"`
- 响应体为 PDF 二进制流

**错误响应：**
- `400` — 任务尚未完成
- `404` — 任务不存在

---

### 4.2 导出 Word 报告

**GET** `/api/reviews/:taskId/export/word`

**Headers:**
```
Authorization: Bearer <token>
```

**成功响应 (200)：**
- Content-Type: `application/vnd.openxmlformats-officedocument.wordprocessingml.document`
- Content-Disposition: `attachment; filename="review-report-{taskId}.docx"`
- 响应体为 DOCX 二进制流

**错误响应：**
- `400` — 任务尚未完成
- `404` — 任务不存在

---

## 5. 系统配置模块

### 5.1 获取 AI 配置

**GET** `/api/config/ai`

**Headers:**
```
Authorization: Bearer <token>
```

**成功响应 (200)：**
```json
{
  "code": 0,
  "data": {
    "endpoint": "https://api.openai.com/v1",
    "modelName": "gpt-4-turbo",
    "apiKey": "sk-****xxxx"
  }
}
```

> 注意：API Key 返回脱敏值，仅显示前 3 位和后 4 位。

---

### 5.2 更新 AI 配置

**PUT** `/api/config/ai`

**Headers:**
```
Authorization: Bearer <token>
```

**请求体：**
```json
{
  "endpoint": "https://api.openai.com/v1",
  "modelName": "gpt-4-turbo",
  "apiKey": "sk-new-api-key-1234567890"
}
```

**校验规则：**
- `endpoint`: 必填，须为合法 URL
- `modelName`: 必填，非空
- `apiKey`: 选填，非空时至少 10 字符；留空则不修改当前 API Key

**成功响应 (200)：**
```json
{
  "code": 0,
  "message": "配置已保存"
}
```

---

### 5.3 恢复默认配置

**POST** `/api/config/ai/reset`

**Headers:**
```
Authorization: Bearer <token>
```

**成功响应 (200)：**
```json
{
  "code": 0,
  "message": "已恢复默认配置",
  "data": {
    "endpoint": "https://api.openai.com/v1",
    "modelName": "gpt-4-turbo",
    "apiKey": ""
  }
}
```

---

## 6. 健康检查

**GET** `/api/health`

**成功响应 (200)：**
```json
{
  "code": 0,
  "message": "ok",
  "timestamp": "2026-09-29T10:00:00.000Z"
}
```

---

## 技术栈

- **Runtime**: Node.js v22
- **Web Framework**: Express 5.x
- **Database**: SQLite (sql.js)
- **Auth**: JWT (jsonwebtoken) + bcryptjs
- **File Upload**: multer
- **PDF Export**: pdfkit
- **Word Export**: docx
- **Document Parsing**: mammoth (DOCX)

## 启动方式

```bash
npm install
npm start        # 生产启动
npm run dev      # 开发模式（watch）
npm test         # 运行 API 测试
```

环境变量：
- `PORT`: 服务端口，默认 3000
- `JWT_SECRET`: JWT 签名密钥
