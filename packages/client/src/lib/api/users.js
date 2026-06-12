import { readJson } from './_http';

export const usersApi = {
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
