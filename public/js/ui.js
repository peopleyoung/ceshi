function showToast(message, type = 'success') {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr.replace(' ', 'T'));
  return d.toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function renderHeader(activePage) {
  const user = getUser();
  const navLinks = [
    { href: '/dashboard.html', label: '审核任务', key: 'dashboard' },
    { href: '/upload.html', label: '上传文件', key: 'upload' },
    { href: '/settings.html', label: '系统配置', key: 'settings' },
  ];

  const header = document.getElementById('app-header');
  header.innerHTML = `
    <div class="logo">
      <div class="logo-icon">审</div>
      标书审核平台
    </div>
    <nav>
      ${navLinks.map(l => `
        <a href="${l.href}" class="${activePage === l.key ? 'active' : ''}">${l.label}</a>
      `).join('')}
    </nav>
    <div class="user-menu">
      <span class="username"></span>
      <button class="btn-logout">退出</button>
    </div>
  `;

  header.querySelector('.username').textContent = user?.username || '';
  header.querySelector('.btn-logout').addEventListener('click', logout);
}

const STATUS_LABELS = {
  pending: '等待中',
  parsing: '文件解析中',
  reviewing: 'AI 审核中',
  completed: '已完成',
  failed: '失败',
};

function statusBadge(status) {
  return `<span class="badge badge-${status}">${STATUS_LABELS[status] || status}</span>`;
}

const CONCLUSION_LABELS = {
  met: '满足',
  not_met: '不满足',
  insufficient: '信息不足',
  triggered: '触发废标',
  not_triggered: '未触发',
  valid: '有效',
  expired: '已过期',
  not_stated: '未载明',
};

function conclusionBadge(conclusion) {
  return `<span class="badge badge-${conclusion}">${CONCLUSION_LABELS[conclusion] || conclusion}</span>`;
}

async function downloadFile(url, filename) {
  const token = localStorage.getItem('token');
  const res = await fetch(url, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: '下载失败' }));
    throw new Error(err.message || '下载失败');
  }
  const blob = await res.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
