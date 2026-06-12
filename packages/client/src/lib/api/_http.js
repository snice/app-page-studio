import { getCurrentProjectId } from '../routeUtils';

const STORAGE_KEY_SESSION_ID = 'appPageStudio_sessionId';
const STORAGE_KEY_EDITOR_NAME = 'appPageStudio_editorName';

export function getStoredSessionId() {
  try {
    return sessionStorage.getItem(STORAGE_KEY_SESSION_ID) || '';
  } catch {
    return '';
  }
}

export function getStoredEditorName() {
  try {
    return localStorage.getItem(STORAGE_KEY_EDITOR_NAME) || '';
  } catch {
    return '';
  }
}

export function getSessionHeaders() {
  const sessionId = getStoredSessionId();
  return sessionId ? { 'X-Session-Id': sessionId } : {};
}

export function notifyAuthExpired() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('aps-auth-expired'));
  }
}

export async function readJson(res, options = {}) {
  const data = await res.json().catch(() => ({ error: '请求失败' }));
  if (!res.ok) data.status = res.status;
  if (!res.ok && res.status === 401 && !options.skipAuthEvent) notifyAuthExpired();
  return data;
}

export { getCurrentProjectId as getProjectId };
