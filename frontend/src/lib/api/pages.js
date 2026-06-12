import { readJson, getProjectId, getSessionHeaders, getStoredSessionId, getStoredEditorName } from './_http';

export const pagesApi = {
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
};
