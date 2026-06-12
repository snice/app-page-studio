import { readJson } from './_http';

export const authApi = {
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
};
