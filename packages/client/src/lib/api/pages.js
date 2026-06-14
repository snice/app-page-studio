import { readJson, getProjectId, getSessionHeaders } from './_http';

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
    const res = await fetch(`/api/pages?projectId=${projectId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getSessionHeaders() },
      body: JSON.stringify({ pagesConfig, expectedRevision }),
    });
    return readJson(res);
  },

  async savePageFile(path, fileConfig, baseHash) {
    const projectId = getProjectId();
    if (!projectId) return { error: '请先选择项目' };
    const res = await fetch(`/api/pages/file?projectId=${projectId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...getSessionHeaders() },
      body: JSON.stringify({ path, fileConfig, baseHash }),
    });
    return readJson(res);
  },

  async savePageGroups(pageGroups, assignments, baseHash) {
    const projectId = getProjectId();
    if (!projectId) return { error: '请先选择项目' };
    const res = await fetch(`/api/pages/groups?projectId=${projectId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...getSessionHeaders() },
      body: JSON.stringify({ pageGroups, assignments, baseHash }),
    });
    return readJson(res);
  },
};
