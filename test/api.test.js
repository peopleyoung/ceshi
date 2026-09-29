const http = require('http');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://127.0.0.1:3456';
let authToken = '';
let tenderFileId = '';
let bidFileId = '';
let taskId = '';

function request(method, urlPath, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: {
        ...headers,
      },
    };

    if (body && typeof body === 'object' && !(body instanceof Buffer)) {
      body = JSON.stringify(body);
      options.headers['Content-Type'] = 'application/json';
      options.headers['Content-Length'] = Buffer.byteLength(body);
    }

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data), headers: res.headers });
        } catch {
          resolve({ status: res.statusCode, data, headers: res.headers });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function multipartUpload(filePath, fieldName, token) {
  return new Promise((resolve, reject) => {
    const boundary = '----FormBoundary' + Math.random().toString(36).slice(2);
    const fileName = path.basename(filePath);
    const fileContent = fs.readFileSync(filePath);

    const preamble = Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="${fieldName}"; filename="${fileName}"\r\n` +
      `Content-Type: application/pdf\r\n\r\n`
    );
    const epilogue = Buffer.from(`\r\n--${boundary}--\r\n`);
    const body = Buffer.concat([preamble, fileContent, epilogue]);

    const options = {
      hostname: '127.0.0.1',
      port: 3456,
      path: '/api/files/upload',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length,
      },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        resolve({ status: res.statusCode, data: JSON.parse(data) });
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${message}`);
  }
}

async function runTests() {
  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      console.log(`  ✓ ${name}`);
      passed++;
    } catch (err) {
      console.log(`  ✗ ${name}: ${err.message}`);
      failed++;
    }
  }

  console.log('\n=== Auth API Tests ===');

  await test('Register - success', async () => {
    const res = await request('POST', '/api/auth/register', {
      username: 'testuser_' + Date.now(),
      password: 'test123456',
    });
    assert(res.status === 201, `Expected 201, got ${res.status}`);
    assert(res.data.code === 0, `Expected code 0, got ${res.data.code}`);
  });

  await test('Register - duplicate username', async () => {
    const username = 'dupuser_' + Date.now();
    await request('POST', '/api/auth/register', { username, password: 'test123456' });
    const res = await request('POST', '/api/auth/register', { username, password: 'test123456' });
    assert(res.status === 409, `Expected 409, got ${res.status}`);
    assert(res.data.code === 1001, `Expected code 1001, got ${res.data.code}`);
  });

  await test('Register - invalid username (too short)', async () => {
    const res = await request('POST', '/api/auth/register', { username: 'ab', password: 'test123456' });
    assert(res.status === 400, `Expected 400, got ${res.status}`);
  });

  await test('Register - password too short', async () => {
    const res = await request('POST', '/api/auth/register', { username: 'shortpw', password: '123' });
    assert(res.status === 400, `Expected 400, got ${res.status}`);
  });

  await test('Login - success', async () => {
    const username = 'loginuser_' + Date.now();
    await request('POST', '/api/auth/register', { username, password: 'test123456' });
    const res = await request('POST', '/api/auth/login', { username, password: 'test123456' });
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(res.data.data.token, 'Expected token in response');
    authToken = res.data.data.token;
  });

  await test('Login - wrong password', async () => {
    const username = 'wrongpw_' + Date.now();
    await request('POST', '/api/auth/register', { username, password: 'test123456' });
    const res = await request('POST', '/api/auth/login', { username, password: 'wrongpassword' });
    assert(res.status === 401, `Expected 401, got ${res.status}`);
    assert(res.data.code === 1010, `Expected code 1010, got ${res.data.code}`);
  });

  await test('GET /api/auth/me - success', async () => {
    const res = await request('GET', '/api/auth/me', null, { Authorization: `Bearer ${authToken}` });
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(res.data.data.user.username, 'Expected user in response');
  });

  await test('GET /api/auth/me - no token', async () => {
    const res = await request('GET', '/api/auth/me');
    assert(res.status === 401, `Expected 401, got ${res.status}`);
  });

  console.log('\n=== File Upload API Tests ===');

  const testPdfPath = path.join(__dirname, 'test.pdf');
  fs.writeFileSync(testPdfPath, '%PDF-1.4 test content');

  await test('Upload - success', async () => {
    const res = await multipartUpload(testPdfPath, 'file', authToken);
    assert(res.status === 201, `Expected 201, got ${res.status}`);
    assert(res.data.data.fileId, 'Expected fileId');
    tenderFileId = res.data.data.fileId;
  });

  await test('Upload - second file', async () => {
    const res = await multipartUpload(testPdfPath, 'file', authToken);
    assert(res.status === 201, `Expected 201, got ${res.status}`);
    bidFileId = res.data.data.fileId;
  });

  await test('Upload - no auth', async () => {
    const res = await multipartUpload(testPdfPath, 'file', '');
    assert(res.status === 401, `Expected 401, got ${res.status}`);
  });

  console.log('\n=== Review API Tests ===');

  const futureDate = new Date();
  futureDate.setMonth(futureDate.getMonth() + 2);
  const bidDeadline = futureDate.toISOString().split('T')[0];

  await test('Create review - success', async () => {
    const res = await request('POST', '/api/reviews', {
      tenderFileId,
      bidFileId,
      bidDeadline,
    }, { Authorization: `Bearer ${authToken}` });
    assert(res.status === 201, `Expected 201, got ${res.status}`);
    assert(res.data.data.taskId, 'Expected taskId');
    taskId = res.data.data.taskId;
  });

  await test('Create review - missing file', async () => {
    const res = await request('POST', '/api/reviews', {
      tenderFileId: 'nonexistent',
      bidFileId,
      bidDeadline,
    }, { Authorization: `Bearer ${authToken}` });
    assert(res.status === 404, `Expected 404, got ${res.status}`);
  });

  await test('Create review - past deadline', async () => {
    const res = await request('POST', '/api/reviews', {
      tenderFileId,
      bidFileId,
      bidDeadline: '2020-01-01',
    }, { Authorization: `Bearer ${authToken}` });
    assert(res.status === 400, `Expected 400, got ${res.status}`);
  });

  await test('List reviews - success', async () => {
    const res = await request('GET', '/api/reviews?page=1&pageSize=10', null, {
      Authorization: `Bearer ${authToken}`,
    });
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(Array.isArray(res.data.data.list), 'Expected list array');
    assert(typeof res.data.data.total === 'number', 'Expected total number');
  });

  await test('Get review detail - wait for completion', async () => {
    await new Promise((resolve) => setTimeout(resolve, 4000));
    const res = await request('GET', `/api/reviews/${taskId}`, null, {
      Authorization: `Bearer ${authToken}`,
    });
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(res.data.data.task, 'Expected task in response');
    assert(res.data.data.results, 'Expected results in response');
  });

  await test('Get review - not found', async () => {
    const res = await request('GET', '/api/reviews/99999', null, {
      Authorization: `Bearer ${authToken}`,
    });
    assert(res.status === 404, `Expected 404, got ${res.status}`);
  });

  console.log('\n=== Config API Tests ===');

  await test('Get AI config - success', async () => {
    const res = await request('GET', '/api/config/ai', null, {
      Authorization: `Bearer ${authToken}`,
    });
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(res.data.data.endpoint, 'Expected endpoint');
    assert(res.data.data.modelName, 'Expected modelName');
  });

  await test('Update AI config - success', async () => {
    const res = await request('PUT', '/api/config/ai', {
      endpoint: 'https://api.example.com/v1',
      modelName: 'gpt-4',
      apiKey: 'sk-test1234567890',
    }, { Authorization: `Bearer ${authToken}` });
    assert(res.status === 200, `Expected 200, got ${res.status}`);
  });

  await test('Update AI config - invalid URL', async () => {
    const res = await request('PUT', '/api/config/ai', {
      endpoint: 'not-a-url',
      modelName: 'gpt-4',
    }, { Authorization: `Bearer ${authToken}` });
    assert(res.status === 400, `Expected 400, got ${res.status}`);
  });

  await test('Reset AI config - success', async () => {
    const res = await request('POST', '/api/config/ai/reset', null, {
      Authorization: `Bearer ${authToken}`,
    });
    assert(res.status === 200, `Expected 200, got ${res.status}`);
  });

  console.log('\n=== Report Export Tests ===');

  await test('Export PDF - completed task', async () => {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const res = await request('GET', `/api/reviews/${taskId}/export/pdf`, null, {
      Authorization: `Bearer ${authToken}`,
    });
    assert(res.status === 200, `Expected 200, got ${res.status}`);
  });

  await test('Export Word - completed task', async () => {
    const res = await request('GET', `/api/reviews/${taskId}/export/word`, null, {
      Authorization: `Bearer ${authToken}`,
    });
    assert(res.status === 200, `Expected 200, got ${res.status}`);
  });

  console.log('\n=== Health Check ===');

  await test('Health check', async () => {
    const res = await request('GET', '/api/health');
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    assert(res.data.code === 0, 'Expected code 0');
  });

  fs.unlinkSync(testPdfPath);

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch((err) => {
  console.error('Test runner error:', err);
  process.exit(1);
});
