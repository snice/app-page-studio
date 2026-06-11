/**
 * API 请求封装模块
 */

function getProjectIdFromHash() {
  if (typeof window === 'undefined') return null;
  const rawHash = window.location.hash.startsWith('#')
    ? window.location.hash.slice(1)
    : window.location.hash;
  const [routePath, query = ''] = rawHash.split('?');
  if (routePath !== '/dashboard') return null;
  const pid = parseInt(new URLSearchParams(query).get('pid') || '', 10);
  return Number.isFinite(pid) && pid > 0 ? pid : null;
}

function getProjectId() {
  const routeProjectId = getProjectIdFromHash();
  if (routeProjectId) return routeProjectId;
  const stored = localStorage.getItem('appPageStudio_currentProjectId');
  return stored ? parseInt(stored, 10) : null;
}

export const api = {
  async getConfig() {
    const res = await fetch('/api/config');
    return res.json();
  },

  async getPages() {
    const projectId = getProjectId();
    if (!projectId) {
      return { projectName: 'My App', targetPlatform: ['flutter'], designSystem: {}, sharedComponents: [], htmlFiles: [], pageGroups: [] };
    }
    const res = await fetch(`/api/pages?projectId=${projectId}`);
    return res.json();
  },

  async savePages(pagesConfig) {
    const projectId = getProjectId();
    if (!projectId) return { error: '请先选择项目' };
    const res = await fetch(`/api/pages?projectId=${projectId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pagesConfig),
    });
    return res.json();
  },

  async scanHtmlFiles() {
    const projectId = getProjectId();
    if (!projectId) return { files: [], htmlPath: '' };
    const res = await fetch(`/api/scan-html?projectId=${projectId}`);
    return res.json();
  },

  async listDesignImages() {
    const projectId = getProjectId();
    if (!projectId) return { files: [] };
    const res = await fetch(`/api/list-images?projectId=${projectId}`);
    return res.json();
  },

  async uploadDesignImages(files) {
    const projectId = getProjectId();
    if (!projectId) return { error: '请先选择项目' };
    const formData = new FormData();
    for (const file of files) formData.append('images', file);
    const res = await fetch(`/api/upload-image?projectId=${projectId}`, { method: 'POST', body: formData });
    return res.json();
  },

  async uploadAsset(file) {
    const projectId = getProjectId();
    if (!projectId) return { error: '请先选择项目' };
    const formData = new FormData();
    formData.append('asset', file);
    const res = await fetch(`/api/upload-asset?projectId=${projectId}`, { method: 'POST', body: formData });
    return res.json();
  },

  async uploadHtmlZip(zipFile) {
    const projectId = getProjectId();
    if (!projectId) return { error: '请先选择项目' };
    const formData = new FormData();
    formData.append('htmlZip', zipFile);
    const res = await fetch(`/api/upload-html?projectId=${projectId}`, { method: 'POST', body: formData });
    return res.json();
  },

  async uploadPsd(files) {
    const projectId = getProjectId();
    if (!projectId) return { error: '请先选择项目' };
    const formData = new FormData();
    for (const file of files) formData.append('psdFiles', file);
    const res = await fetch(`/api/upload-psd?projectId=${projectId}`, { method: 'POST', body: formData });
    return res.json();
  },

  async analyzeHtml(path) {
    const projectId = getProjectId();
    const res = await fetch(`/api/analyze-html?projectId=${projectId}&path=${encodeURIComponent(path)}`);
    return res.json();
  },

  async generatePrompt(options) {
    const res = await fetch('/api/generate-prompt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options),
    });
    return res.json();
  },

  async downloadDesignZip(payload) {
    const res = await fetch('/api/download-design-zip', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: '下载失败' }));
      throw new Error(data.error || '下载失败');
    }
    return res.blob();
  },

  async deleteFiles(payload) {
    const res = await fetch('/api/delete-files', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return res.json();
  },

  // ==================== 项目管理 ====================

  async getProjects() {
    const res = await fetch('/api/projects');
    return res.json();
  },

  async getProject(id) {
    const res = await fetch(`/api/projects/${id}`);
    return res.json();
  },

  async createProject(name, description, zipFile) {
    const formData = new FormData();
    formData.append('name', name);
    formData.append('description', description || '');
    if (zipFile) formData.append('htmlZip', zipFile);
    const res = await fetch('/api/projects', { method: 'POST', body: formData });
    return res.json();
  },

  async updateProject(id, name, description, designSystem = undefined) {
    const body = { name, description };
    if (designSystem !== undefined) body.designSystem = designSystem;
    const res = await fetch(`/api/projects/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return res.json();
  },

  async replaceProjectHtml(id, zipFile) {
    const formData = new FormData();
    formData.append('htmlZip', zipFile);
    const res = await fetch(`/api/projects/${id}/html`, { method: 'POST', body: formData });
    return res.json();
  },

  async deleteProject(id) {
    const res = await fetch(`/api/projects/${id}`, { method: 'DELETE' });
    return res.json();
  },

  // ==================== 编辑会话 ====================

  async registerSession(projectId, sessionId, editorName) {
    const res = await fetch('/api/session/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, sessionId, editorName }),
    });
    return res.json();
  },

  async sessionHeartbeat(projectId, sessionId) {
    const res = await fetch('/api/session/heartbeat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, sessionId }),
    });
    return res.json();
  },

  async checkSession(projectId, sessionId) {
    const res = await fetch(`/api/session/check?projectId=${projectId}&sessionId=${encodeURIComponent(sessionId)}`);
    return res.json();
  },

  async releaseSession(projectId, sessionId) {
    const res = await fetch('/api/session/release', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, sessionId }),
    });
    return res.json();
  },

  async forceAcquireSession(projectId, sessionId, editorName) {
    const res = await fetch('/api/session/force-acquire', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, sessionId, editorName }),
    });
    return res.json();
  },
};
