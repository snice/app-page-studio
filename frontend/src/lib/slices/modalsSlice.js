/**
 * 统一弹窗状态：{ [name]: props }，存在即为打开。
 * 含 openDesignSystem 这个跨域便捷动作。
 */
export function createModalsSlice(set, get) {
  return {
    modals: {},

    openModal(name, props = true) {
      set((s) => ({ modals: { ...s.modals, [name]: props } }));
    },
    closeModal(name) {
      set((s) => {
        if (!(name in s.modals)) return {};
        const next = { ...s.modals };
        delete next[name];
        return { modals: next };
      });
    },
    openDesignSystem(projectId) {
      const state = get();
      const pid = projectId || state.getCurrentProjectId();
      if (!pid) { state.showToast('请先选择项目'); return; }
      const project = state.config.projects?.find((p) => p.id === pid) || state.getCurrentProject();
      set((s) => ({
        editingDesignSystem: project?.designSystem || { colors: [], spacing: {}, radius: {} },
        editingDesignProjectId: pid,
        modals: { ...s.modals, designSystem: true },
      }));
    },
  };
}
