/**
 * 路由/会话相关的通用工具，避免在 App / state / api 多处重复实现。
 */

const STORAGE_KEY_CURRENT_PROJECT = 'appPageStudio_currentProjectId';

export function getProjectIdFromHash(hash) {
  if (typeof window === 'undefined' && hash === undefined) return null;
  const raw = hash !== undefined ? hash : window.location.hash;
  const rawHash = raw.startsWith('#') ? raw.slice(1) : raw;
  const [routePath, query = ''] = rawHash.split('?');
  if (routePath !== '/dashboard') return null;
  const pid = Number.parseInt(new URLSearchParams(query).get('pid') || '', 10);
  return Number.isFinite(pid) && pid > 0 ? pid : null;
}

export function getProjectIdFromStorage() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY_CURRENT_PROJECT);
    const id = Number.parseInt(stored || '', 10);
    return Number.isFinite(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
}

export function getCurrentProjectId() {
  return getProjectIdFromHash() || getProjectIdFromStorage();
}

export function getDashboardHash(projectId) {
  return `#/dashboard?pid=${encodeURIComponent(projectId)}`;
}
