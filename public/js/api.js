const API_BASE = '/api';

class ApiError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

async function request(path, options = {}) {
  const token = localStorage.getItem('token');
  const headers = { ...options.headers };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  if (!(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (res.headers.get('content-type')?.includes('application/json')) {
    const data = await res.json();
    if (!res.ok || data.code !== 0) {
      if (res.status === 401 || data.code === 401) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = '/';
        throw new ApiError(401, '登录已过期');
      }
      throw new ApiError(data.code || res.status, data.message || '请求失败');
    }
    return data.data;
  }

  if (!res.ok) {
    if (res.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/';
      throw new ApiError(401, '登录已过期');
    }
    throw new ApiError(res.status, '请求失败');
  }

  return res;
}

const api = {
  auth: {
    register(username, password) {
      return request('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });
    },
    login(username, password) {
      return request('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });
    },
    me() {
      return request('/auth/me').then(d => d.user);
    },
  },

  files: {
    upload(file) {
      const formData = new FormData();
      formData.append('file', file);
      return request('/files/upload', { method: 'POST', body: formData });
    },
  },

  reviews: {
    create({ tenderFileId, bidFileId, bidDeadline }) {
      return request('/reviews', {
        method: 'POST',
        body: JSON.stringify({ tenderFileId, bidFileId, bidDeadline }),
      });
    },
    list(page = 1, pageSize = 20) {
      return request(`/reviews?page=${page}&pageSize=${pageSize}`);
    },
    get(taskId) {
      return request(`/reviews/${taskId}`);
    },
    retry(taskId) {
      return request(`/reviews/${taskId}/retry`, { method: 'POST' });
    },
  },

  reports: {
    exportPdf(taskId) {
      return request(`/reviews/${taskId}/export/pdf`);
    },
    exportWord(taskId) {
      return request(`/reviews/${taskId}/export/word`);
    },
  },

  config: {
    getAi() {
      return request('/config/ai');
    },
    updateAi({ endpoint, modelName, apiKey }) {
      return request('/config/ai', {
        method: 'PUT',
        body: JSON.stringify({ endpoint, modelName, apiKey }),
      });
    },
    resetAi() {
      return request('/config/ai/reset', { method: 'POST' });
    },
  },
};

function requireAuth() {
  if (!localStorage.getItem('token')) {
    window.location.href = '/';
    return false;
  }
  return true;
}

function getUser() {
  try {
    return JSON.parse(localStorage.getItem('user'));
  } catch {
    return null;
  }
}

function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  window.location.href = '/';
}
