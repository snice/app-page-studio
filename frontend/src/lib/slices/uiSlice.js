/**
 * 通用 UI 状态：toast、缩放、面板 tab、筛选、设计系统/分组/项目编辑、selectionToggle 等
 */

const STORAGE_KEY_ZOOM_LOCK = 'appPageStudio_zoomLock';
const STORAGE_KEY_ZOOM_BY_SOURCE_TYPE = 'appPageStudio_zoomBySourceType';

function loadZoomLock() {
  try { return localStorage.getItem(STORAGE_KEY_ZOOM_LOCK) === '1'; } catch { return false; }
}

function loadZoomBySourceType() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_ZOOM_BY_SOURCE_TYPE);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

export function createUiSlice(set, get) {
  return {
    // 分组颜色选项
    groupColors: ['#6366f1', '#8b5cf6', '#ec4899', '#ef4444', '#f59e0b', '#22c55e', '#14b8a6', '#3b82f6'],

    fileFilter: { searchText: '', devStatus: 'all' },

    // 缩放
    zoom: 100,
    zoomLockBySourceType: loadZoomLock(),
    zoomBySourceType: loadZoomBySourceType(),

    activePanelTab: 'file',

    // 设计系统/分组/项目编辑
    editingDesignSystem: null,
    editingDesignProjectId: null,
    editingGroupId: null,
    editingProjectId: null,

    // Toast
    toastMessage: '',
    toastVisible: false,

    showToast(message) {
      set({ toastMessage: message, toastVisible: true });
      setTimeout(() => set({ toastVisible: false }), 3000);
    },

    setZoom(zoom) {
      const clamped = Math.max(25, Math.min(200, zoom));
      set((s) => {
        const next = { zoom: clamped };
        const sourceType = s.currentFile?.sourceType;
        if (s.zoomLockBySourceType && sourceType) {
          const map = { ...s.zoomBySourceType, [sourceType]: clamped };
          next.zoomBySourceType = map;
          try { localStorage.setItem(STORAGE_KEY_ZOOM_BY_SOURCE_TYPE, JSON.stringify(map)); } catch {}
        }
        return next;
      });
    },
    applyZoomToAllSameSourceType(sourceType, zoom) {
      if (!sourceType) return;
      set((s) => ({
        pagesConfig: {
          ...s.pagesConfig,
          htmlFiles: s.pagesConfig.htmlFiles.map((f) =>
            f.sourceType === sourceType ? { ...f, zoom } : f
          ),
        },
      }));
    },
    toggleZoomLockBySourceType() {
      set((s) => {
        const enabled = !s.zoomLockBySourceType;
        try { localStorage.setItem(STORAGE_KEY_ZOOM_LOCK, enabled ? '1' : '0'); } catch {}
        const next = { zoomLockBySourceType: enabled };
        const sourceType = s.currentFile?.sourceType;
        if (enabled && sourceType) {
          const map = { ...s.zoomBySourceType, [sourceType]: s.zoom };
          next.zoomBySourceType = map;
          try { localStorage.setItem(STORAGE_KEY_ZOOM_BY_SOURCE_TYPE, JSON.stringify(map)); } catch {}
        }
        return next;
      });
    },

    setActivePanelTab(tab) { set({ activePanelTab: tab }); },
    setFileFilter(filter) { set((s) => ({ fileFilter: { ...s.fileFilter, ...filter } })); },
    setEditingDesignSystem(ds) { set({ editingDesignSystem: ds }); },
    setEditingDesignProjectId(id) { set({ editingDesignProjectId: id }); },
    setEditingGroupId(id) { set({ editingGroupId: id }); },
    setEditingProjectId(id) { set({ editingProjectId: id }); },
  };
}
