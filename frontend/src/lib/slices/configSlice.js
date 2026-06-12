/**
 * 项目配置：projects 列表、当前项目 id、loadConfig
 */
import { api } from '../api';
import { getProjectIdFromHash } from '../routeUtils';

const STORAGE_KEY_CURRENT_PROJECT = 'appPageStudio_currentProjectId';

export function createConfigSlice(set, get) {
  return {
    config: { currentProject: null, projects: [] },

    setConfig(newConfig) {
      set((s) => ({ config: { ...s.config, ...newConfig } }));
    },

    getCurrentProjectId() {
      const routeProjectId = getProjectIdFromHash();
      if (routeProjectId) return routeProjectId;
      const stored = localStorage.getItem(STORAGE_KEY_CURRENT_PROJECT);
      return stored ? parseInt(stored, 10) : null;
    },

    setCurrentProjectId(projectId) {
      if (projectId) localStorage.setItem(STORAGE_KEY_CURRENT_PROJECT, String(projectId));
      else localStorage.removeItem(STORAGE_KEY_CURRENT_PROJECT);
      set((s) => ({ config: { ...s.config, currentProject: projectId } }));
    },

    getCurrentProject() {
      const state = get();
      const projectId = state.getCurrentProjectId();
      if (!projectId) return null;
      return state.config.projects.find((p) => p.id === projectId) || null;
    },

    async loadConfig() {
      try {
        const res = await api.getConfig();
        const nextProjects = res.projects || [];
        const storedId = get().getCurrentProjectId();
        const hasStoredProject = storedId && nextProjects.some((p) => p.id === storedId);
        if (storedId && !hasStoredProject) get().setCurrentProjectId(null);
        get().setConfig({ projects: nextProjects, currentProject: hasStoredProject ? storedId : null });
        return nextProjects;
      } catch (e) {
        console.error('loadConfig error:', e);
        return [];
      }
    },
  };
}
