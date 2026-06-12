import { readJson, getSessionHeaders, getStoredEditorName } from './_http';

export const projectsApi = {
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

  async getProjectMembers(id) {
    const res = await fetch(`/api/projects/${id}/members`);
    return readJson(res);
  },

  async addProjectMember(id, userId, role) {
    const res = await fetch(`/api/projects/${id}/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, role }),
    });
    return readJson(res);
  },

  async updateProjectMember(id, userId, role) {
    const res = await fetch(`/api/projects/${id}/members/${userId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    });
    return readJson(res);
  },

  async deleteProjectMember(id, userId) {
    const res = await fetch(`/api/projects/${id}/members/${userId}`, { method: 'DELETE' });
    return readJson(res);
  },
};
