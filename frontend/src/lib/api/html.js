import { readJson, getProjectId, getSessionHeaders } from './_http';

export const htmlApi = {
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

  async deleteFiles(payload) {
    const res = await fetch('/api/delete-files', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getSessionHeaders() },
      body: JSON.stringify(payload),
    });
    return readJson(res);
  },
};
