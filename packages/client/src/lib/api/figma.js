import { readJson, getSessionHeaders } from './_http';

export const figmaApi = {
  async listFigmaImportTokens() {
    const res = await fetch(`/api/figma/tokens?_=${Date.now()}`, {
      cache: 'no-store',
      headers: getSessionHeaders(),
    });
    return readJson(res);
  },

  async createFigmaImportToken(ttlMinutes = 720) {
    const res = await fetch('/api/figma/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getSessionHeaders() },
      body: JSON.stringify({ ttlMinutes }),
    });
    return readJson(res);
  },

  async deleteFigmaImportToken(tokenId) {
    const res = await fetch(`/api/figma/tokens/${tokenId}`, {
      method: 'DELETE',
      headers: getSessionHeaders(),
    });
    return readJson(res);
  },
};
