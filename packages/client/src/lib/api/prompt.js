import { readJson, notifyAuthExpired } from './_http';

export const promptApi = {
  async getPromptPlatforms() {
    const res = await fetch('/api/prompt-platforms');
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
};
