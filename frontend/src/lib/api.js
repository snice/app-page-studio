/**
 * API 请求封装模块
 */

import { getCurrentProjectId } from './routeUtils';

const STORAGE_KEY_SESSION_ID = 'appPageStudio_sessionId';
const STORAGE_KEY_EDITOR_NAME = 'appPageStudio_editorName';

function getStoredSessionId() {
  try {
    return sessionStorage.getItem(STORAGE_KEY_SESSION_ID) || '';
  } catch {
    return '';
  }
}

function getStoredEditorName() {
  try {
    return localStorage.getItem(STORAGE_KEY_EDITOR_NAME) || '';
  } catch {
    return '';
  }
}

function getSessionHeaders() {
  const sessionId = getStoredSessionId();
  return sessionId ? { 'X-Session-Id': sessionId } : {};
}

function notifyAuthExpired() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('aps-auth-expired'));
  }
}

async function readJson(res, options = {}) {
  const data = await res.json().catch(() => ({ error: '请求失败' }));
  if (!res.ok) data.status = res.status;
  if (!res.ok && res.status === 401 && !options.skipAuthEvent) notifyAuthExpired();
  return data;
}

const getProjectId = getCurrentProjectId;

export const api = {
  async getMe() {
    const res = await fetch('/api/auth/me');
    return readJson(res, { skipAuthEvent: true });
  },

  async login(username, password) {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    return readJson(res, { skipAuthEvent: true });
  },

  async logout() {
    const res = await fetch('/api/auth/logout', { method: 'POST' });
    return readJson(res);
  },

  async getConfig() {
    const res = await fetch('/api/config');
    return readJson(res);
  },

  async getPages() {
    const projectId = getProjectId();
    if (!projectId) {
      return {
        pagesConfig: { projectName: 'My App', targetPlatform: ['flutter'], designSystem: {}, sharedComponents: [], htmlFiles: [], pageGroups: [] },
        revision: 0,
      };
    }
    const res = await fetch(`/api/pages?projectId=${projectId}`);
    return readJson(res);
  },

  async savePages(pagesConfig, expectedRevision) {
    const projectId = getProjectId();
    if (!projectId) return { error: '请先选择项目' };
    const sessionId = getStoredSessionId();
    const editorName = getStoredEditorName();
    const res = await fetch(`/api/pages?projectId=${projectId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getSessionHeaders() },
      body: JSON.stringify({ pagesConfig, expectedRevision, sessionId, editorName }),
    });
    return readJson(res);
  },

  async getPagesHistory(limit = 30) {
    const projectId = getProjectId();
    if (!projectId) return { revisions: [], currentRevision: 0 };
    const res = await fetch(`/api/pages/history?projectId=${projectId}&limit=${limit}`);
    return readJson(res);
  },

  async restorePagesRevision(revision, expectedRevision) {
    const projectId = getProjectId();
    if (!projectId) return { error: '请先选择项目' };
    const sessionId = getStoredSessionId();
    const editorName = getStoredEditorName();
    const res = await fetch(`/api/pages/restore?projectId=${projectId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getSessionHeaders() },
      body: JSON.stringify({ revision, expectedRevision, sessionId, editorName }),
    });
    return readJson(res);
  },

  async scanHtmlFiles() {
    const projectId = getProjectId();
    if (!projectId) return { files: [], htmlPath: '' };
    const res = await fetch(`/api/scan-html?projectId=${projectId}`);
    return readJson(res);
  },

  async listDesignImages() {
    const projectId = getProjectId();
    if (!projectId) return { files: [] };
    const res = await fetch(`/api/list-images?projectId=${projectId}`);
    return readJson(res);
  },

  async uploadDesignImages(files) {
    const projectId = getProjectId();
    if (!projectId) return { error: '请先选择项目' };
    const formData = new FormData();
    for (const file of files) formData.append('images', file);
    const res = await fetch(`/api/upload-image?projectId=${projectId}`, { method: 'POST', headers: getSessionHeaders(), body: formData });
    return readJson(res);
  },

  async uploadAsset(file) {
    const projectId = getProjectId();
    if (!projectId) return { error: '请先选择项目' };
    const formData = new FormData();
    formData.append('asset', file);
    const res = await fetch(`/api/upload-asset?projectId=${projectId}`, { method: 'POST', headers: getSessionHeaders(), body: formData });
    return readJson(res);
  },

  async uploadHtmlZip(zipFile) {
    const projectId = getProjectId();
    if (!projectId) return { error: '请先选择项目' };
    const formData = new FormData();
    formData.append('htmlZip', zipFile);
    const res = await fetch(`/api/upload-html?projectId=${projectId}`, { method: 'POST', headers: getSessionHeaders(), body: formData });
    return readJson(res);
  },

  async uploadPsd(files) {
    const projectId = getProjectId();
    if (!projectId) return { error: '请先选择项目' };
    const formData = new FormData();
    for (const file of files) formData.append('psdFiles', file);
    const res = await fetch(`/api/upload-psd?projectId=${projectId}`, { method: 'POST', headers: getSessionHeaders(), body: formData });
    return readJson(res);
  },

  async analyzeHtml(path) {
    const projectId = getProjectId();
    const res = await fetch(`/api/analyze-html?projectId=${projectId}&path=${encodeURIComponent(path)}`);
    return readJson(res);
  },

  async generatePrompt(options) {
    const res = await fetch('/api/generate-prompt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options),
    });
    return readJson(res);
  },

  async downloadDesignZip(payload) {
    const res = await fetch('/api/download-design-zip', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: '下载失败' }));
      if (res.status === 401) notifyAuthExpired();
      throw new Error(data.error || '下载失败');
    }
    return res.blob();
  },

  async deleteFiles(payload) {
    const res = await fetch('/api/delete-files', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getSessionHeaders() },
      body: JSON.stringify(payload),
    });
    return readJson(res);
  },

  // ==================== 项目管理 ====================

  async getProjects() {
    const res = await fetch('/api/projects');
    return readJson(res);
  },

  async getProject(id) {
    const res = await fetch(`/api/projects/${id}`);
    return readJson(res);
  },

  async createProject(name, description, zipFile) {
    const formData = new FormData();
    formData.append('name', name);
    formData.append('description', description || '');
    if (zipFile) formData.append('htmlZip', zipFile);
    const res = await fetch('/api/projects', { method: 'POST', body: formData });
    return readJson(res);
  },

  async updateProject(id, name, description, designSystem = undefined) {
    const body = { name, description };
    if (designSystem !== undefined) body.designSystem = designSystem;
    const res = await fetch(`/api/projects/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...getSessionHeaders() },
      body: JSON.stringify({ ...body, editorName: getStoredEditorName() }),
    });
    return readJson(res);
  },

  async replaceProjectHtml(id, zipFile) {
    const formData = new FormData();
    formData.append('htmlZip', zipFile);
    const res = await fetch(`/api/projects/${id}/html`, { method: 'POST', headers: getSessionHeaders(), body: formData });
    return readJson(res);
  },

  async deleteProject(id) {
    const res = await fetch(`/api/projects/${id}`, { method: 'DELETE', headers: getSessionHeaders() });
    return readJson(res);
  },

  // ==================== 编辑会话 ====================

  async registerSession(projectId, sessionId, editorName) {
    const res = await fetch('/api/session/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, sessionId, editorName }),
    });
    return readJson(res);
  },

  async sessionHeartbeat(projectId, sessionId) {
    const res = await fetch('/api/session/heartbeat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, sessionId }),
    });
    return readJson(res);
  },

  async checkSession(projectId, sessionId) {
    const res = await fetch(`/api/session/check?projectId=${projectId}&sessionId=${encodeURIComponent(sessionId)}`);
    return readJson(res);
  },

  async releaseSession(projectId, sessionId) {
    const res = await fetch('/api/session/release', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, sessionId }),
    });
    return readJson(res);
  },

  async forceAcquireSession(projectId, sessionId, editorName) {
    const res = await fetch('/api/session/force-acquire', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, sessionId, editorName }),
    });
    return readJson(res);
  },

  // ==================== 用户管理 ====================

  async listUsers() {
    const res = await fetch('/api/auth/users');
    return readJson(res);
  },

  async createUser({ username, password, role }) {
    const res = await fetch('/api/auth/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, role }),
    });
    return readJson(res);
  },

  async updateUser(id, payload) {
    const res = await fetch(`/api/auth/users/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return readJson(res);
  },

  async deleteUser(id) {
    const res = await fetch(`/api/auth/users/${id}`, { method: 'DELETE' });
    return readJson(res);
  },
};
