import { create } from 'zustand';

const STORAGE_KEY_CURRENT_PROJECT = 'appPageStudio_currentProjectId';
const STORAGE_KEY_SESSION_ID = 'appPageStudio_sessionId';
const STORAGE_KEY_EDITOR_NAME = 'appPageStudio_editorName';
const STORAGE_KEY_ZOOM_LOCK = 'appPageStudio_zoomLock';
const STORAGE_KEY_ZOOM_BY_SOURCE_TYPE = 'appPageStudio_zoomBySourceType';

function generateSessionId() {
  return 'sess_' + Date.now() + '_' + Math.random().toString(36).substring(2, 11);
}

function loadZoomLock() {
  try { return localStorage.getItem(STORAGE_KEY_ZOOM_LOCK) === '1'; } catch { return false; }
}

function loadZoomBySourceType() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_ZOOM_BY_SOURCE_TYPE);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

export const useAppStore = create((set, get) => ({
  // 工具配置
  config: { currentProject: null, projects: [] },

  // 编辑会话
  session: {
    sessionId: null, editorName: null, isCurrentEditor: true,
    currentEditor: null, heartbeatTimer: null,
  },

  // 页面配置
  pagesConfig: {
    projectName: '', targetPlatform: ['flutter'], designSystem: {},
    sharedComponents: [], htmlFiles: [], pageGroups: [],
  },

  // HTML 文件列表
  htmlFiles: [],

  // 当前选中文件
  currentFile: null,

  // 多选文件集合
  selectedFiles: new Set(),

  // 选择器状态
  isPickerActive: false,
  isColorPickerActive: false,
  isImageRegionSelecting: false,

  // 取到的颜色列表
  pickedColors: [],

  // 设计系统编辑
  editingDesignSystem: null,
  editingDesignProjectId: null,

  // 编辑中的分组/项目
  editingGroupId: null,
  editingProjectId: null,

  // 分组颜色选项
  groupColors: ['#6366f1', '#8b5cf6', '#ec4899', '#ef4444', '#f59e0b', '#22c55e', '#14b8a6', '#3b82f6'],

  // 文件筛选
  fileFilter: { searchText: '', devStatus: 'all' },

  // Toast
  toastMessage: '',
  toastVisible: false,

  // 缩放
  zoom: 100,
  zoomLockBySourceType: loadZoomLock(),
  zoomBySourceType: loadZoomBySourceType(),

  // PSD 模式
  psdMode: 'preview', // 'preview' | 'layers'
  psdData: null,
  psdLoading: false,
  psdSelectedLayer: null,
  psdHiddenLayerIds: new Set(),
  psdCheckedLayerIds: new Set(),
  psdMarkedSlices: [],
  psdSelectedSliceId: null,
  psdShowSlices: true,

  // 面板 tab
  activePanelTab: 'file',

  // ==================== Actions ====================

  showToast(message) {
    set({ toastMessage: message, toastVisible: true });
    setTimeout(() => set({ toastVisible: false }), 3000);
  },

  setConfig(newConfig) {
    set((s) => ({ config: { ...s.config, ...newConfig } }));
  },

  getCurrentProjectId() {
    const stored = localStorage.getItem(STORAGE_KEY_CURRENT_PROJECT);
    return stored ? parseInt(stored, 10) : null;
  },

  setCurrentProjectId(projectId) {
    if (projectId) {
      localStorage.setItem(STORAGE_KEY_CURRENT_PROJECT, String(projectId));
    } else {
      localStorage.removeItem(STORAGE_KEY_CURRENT_PROJECT);
    }
    set((s) => ({ config: { ...s.config, currentProject: projectId } }));
  },

  getCurrentProject() {
    const state = get();
    const projectId = state.getCurrentProjectId();
    if (!projectId) return null;
    return state.config.projects.find((p) => p.id === projectId) || null;
  },

  setPagesConfig(newPagesConfig) {
    set({
      pagesConfig: {
        projectName: newPagesConfig.projectName || 'My App',
        targetPlatform: newPagesConfig.targetPlatform || ['flutter'],
        designSystem: newPagesConfig.designSystem || {},
        sharedComponents: newPagesConfig.sharedComponents || [],
        htmlFiles: newPagesConfig.htmlFiles || [],
        pageGroups: newPagesConfig.pageGroups || [],
      },
    });
  },

  syncFilesToConfig() {
    set((s) => {
      const existingFilesMap = new Map(
        (s.pagesConfig.htmlFiles || []).map((f) => [f.path, f])
      );
      const updatedFiles = [];
      for (const file of s.htmlFiles) {
        const existing = existingFilesMap.get(file.path);
        if (existing) {
          if (!existing.sourceType && file.sourceType) existing.sourceType = file.sourceType;
          if (file.sourceType === 'image' && !existing.imagePath) existing.imagePath = file.path;
          updatedFiles.push(existing);
        } else {
          updatedFiles.push({
            path: file.path, name: file.name,
            sourceType: file.sourceType || 'html',
            imagePath: file.sourceType === 'image' ? file.path : null,
            previewPath: file.sourceType === 'psd' ? file.previewPath : null,
            stateName: '', description: '', groupId: null,
            devStatus: 'pending', interactions: [],
          });
        }
      }
      return { pagesConfig: { ...s.pagesConfig, htmlFiles: updatedFiles } };
    });
  },

  setCurrentFile(path) {
    if (!path) { set({ currentFile: null }); return; }
    set((s) => {
      const file = s.pagesConfig.htmlFiles.find((f) => f.path === path);
      if (!file) return {};
      const next = { currentFile: file };
      if (s.zoomLockBySourceType && file.sourceType) {
        const saved = s.zoomBySourceType[file.sourceType];
        if (typeof saved === 'number') next.zoom = Math.max(25, Math.min(200, saved));
      }
      return next;
    });
  },

  updateCurrentFile(updates) {
    set((s) => {
      if (!s.currentFile) return {};
      Object.assign(s.currentFile, updates);
      return { pagesConfig: { ...s.pagesConfig } };
    });
  },

  toggleSelectedFile(path) {
    set((s) => {
      const newSet = new Set(s.selectedFiles);
      if (newSet.has(path)) newSet.delete(path); else newSet.add(path);
      return { selectedFiles: newSet };
    });
  },

  clearSelection() { set({ selectedFiles: new Set() }); },

  addGroup(group) {
    set((s) => ({
      pagesConfig: {
        ...s.pagesConfig,
        pageGroups: [...(s.pagesConfig.pageGroups || []), group],
      },
    }));
  },

  updateGroup(groupId, updates) {
    set((s) => ({
      pagesConfig: {
        ...s.pagesConfig,
        pageGroups: s.pagesConfig.pageGroups.map((g) =>
          g.id === groupId ? { ...g, ...updates } : g
        ),
      },
    }));
  },

  deleteGroup(groupId) {
    set((s) => ({
      pagesConfig: {
        ...s.pagesConfig,
        pageGroups: s.pagesConfig.pageGroups.filter((g) => g.id !== groupId),
        htmlFiles: s.pagesConfig.htmlFiles.map((f) =>
          f.groupId === groupId ? { ...f, groupId: null } : f
        ),
      },
    }));
  },

  assignSelectedFilesToGroup(groupId) {
    set((s) => {
      const htmlFiles = s.pagesConfig.htmlFiles.map((f) =>
        s.selectedFiles.has(f.path) ? { ...f, groupId } : f
      );
      return {
        pagesConfig: { ...s.pagesConfig, htmlFiles },
        selectedFiles: new Set(),
      };
    });
  },

  moveFileToGroup(filePaths, targetGroupId) {
    set((s) => ({
      pagesConfig: {
        ...s.pagesConfig,
        htmlFiles: s.pagesConfig.htmlFiles.map((f) =>
          filePaths.includes(f.path) ? { ...f, groupId: targetGroupId } : f
        ),
      },
    }));
  },

  addInteraction(interaction) {
    set((s) => {
      if (!s.currentFile) return {};
      if (!s.currentFile.interactions) s.currentFile.interactions = [];
      s.currentFile.interactions.push(interaction);
      return { pagesConfig: { ...s.pagesConfig } };
    });
  },

  updateInteraction(index, field, value) {
    set((s) => {
      if (!s.currentFile?.interactions) return {};
      s.currentFile.interactions[index][field] = value;
      return { pagesConfig: { ...s.pagesConfig } };
    });
  },

  removeInteraction(index) {
    set((s) => {
      if (!s.currentFile?.interactions) return {};
      s.currentFile.interactions.splice(index, 1);
      return { pagesConfig: { ...s.pagesConfig } };
    });
  },

  addImageReplacement(imageReplacement) {
    set((s) => {
      if (!s.currentFile) return {};
      if (!s.currentFile.imageReplacements) s.currentFile.imageReplacements = [];
      s.currentFile.imageReplacements.push(imageReplacement);
      return { pagesConfig: { ...s.pagesConfig } };
    });
  },

  updateImageReplacement(index, field, value) {
    set((s) => {
      if (!s.currentFile?.imageReplacements) return {};
      s.currentFile.imageReplacements[index][field] = value;
      return { pagesConfig: { ...s.pagesConfig } };
    });
  },

  removeImageReplacement(index) {
    set((s) => {
      if (!s.currentFile?.imageReplacements) return {};
      s.currentFile.imageReplacements.splice(index, 1);
      return { pagesConfig: { ...s.pagesConfig } };
    });
  },

  addFunctionDescription(fd) {
    set((s) => {
      if (!s.currentFile) return {};
      if (!s.currentFile.functionDescriptions) s.currentFile.functionDescriptions = [];
      s.currentFile.functionDescriptions.push(fd);
      return { pagesConfig: { ...s.pagesConfig } };
    });
  },

  updateFunctionDescription(index, field, value) {
    set((s) => {
      if (!s.currentFile?.functionDescriptions) return {};
      s.currentFile.functionDescriptions[index][field] = value;
      return { pagesConfig: { ...s.pagesConfig } };
    });
  },

  removeFunctionDescription(index) {
    set((s) => {
      if (!s.currentFile?.functionDescriptions) return {};
      s.currentFile.functionDescriptions.splice(index, 1);
      return { pagesConfig: { ...s.pagesConfig } };
    });
  },

  addDataSource(dataSource) {
    set((s) => {
      if (!s.currentFile) return {};
      if (!s.currentFile.dataSources) s.currentFile.dataSources = [];
      s.currentFile.dataSources.push(dataSource);
      return { pagesConfig: { ...s.pagesConfig } };
    });
  },

  updateDataSource(index, field, value) {
    set((s) => {
      if (!s.currentFile?.dataSources) return {};
      s.currentFile.dataSources[index][field] = value;
      return { pagesConfig: { ...s.pagesConfig } };
    });
  },

  removeDataSource(index) {
    set((s) => {
      if (!s.currentFile?.dataSources) return {};
      s.currentFile.dataSources.splice(index, 1);
      return { pagesConfig: { ...s.pagesConfig } };
    });
  },

  // ==================== Session ====================
  getSessionId() {
    const s = get().session;
    if (s.sessionId) return s.sessionId;
    let sessionId = sessionStorage.getItem(STORAGE_KEY_SESSION_ID);
    if (!sessionId) {
      sessionId = generateSessionId();
      sessionStorage.setItem(STORAGE_KEY_SESSION_ID, sessionId);
    }
    set((st) => ({ session: { ...st.session, sessionId } }));
    return sessionId;
  },

  getEditorName() {
    const s = get().session;
    if (s.editorName) return s.editorName;
    const name = localStorage.getItem(STORAGE_KEY_EDITOR_NAME);
    set((st) => ({ session: { ...st.session, editorName: name } }));
    return name;
  },

  setEditorName(name) {
    if (name) localStorage.setItem(STORAGE_KEY_EDITOR_NAME, name);
    else localStorage.removeItem(STORAGE_KEY_EDITOR_NAME);
    set((st) => ({ session: { ...st.session, editorName: name } }));
  },

  updateSessionStatus(status) {
    set((st) => ({
      session: {
        ...st.session,
        isCurrentEditor: status.isCurrentEditor,
        currentEditor: status.currentEditor,
      },
    }));
  },

  startHeartbeat(apiRef) {
    const st = get();
    st.stopHeartbeat();
    const timer = setInterval(() => {
      const projectId = get().getCurrentProjectId();
      if (projectId) {
        apiRef.sessionHeartbeat(projectId, get().getSessionId());
      }
    }, 2 * 60 * 1000);
    set((s) => ({ session: { ...s.session, heartbeatTimer: timer } }));
  },

  stopHeartbeat() {
    const timer = get().session.heartbeatTimer;
    if (timer) {
      clearInterval(timer);
      set((s) => ({ session: { ...s.session, heartbeatTimer: null } }));
    }
  },

  // ==================== UI State ====================
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
      // 开启时：以当前 zoom 作为该 sourceType 的初始锁定值
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
  setIsPickerActive(v) { set({ isPickerActive: v }); },
  setIsColorPickerActive(v) { set({ isColorPickerActive: v }); },
  setIsImageRegionSelecting(v) { set({ isImageRegionSelecting: v }); },
  setPickedColors(colors) { set({ pickedColors: colors }); },
  setEditingDesignSystem(ds) { set({ editingDesignSystem: ds }); },
  setEditingDesignProjectId(id) { set({ editingDesignProjectId: id }); },
  setEditingGroupId(id) { set({ editingGroupId: id }); },
  setEditingProjectId(id) { set({ editingProjectId: id }); },
  setHtmlFiles(files) { set({ htmlFiles: files }); },

  // ==================== PSD Actions ====================

  setPsdMode(mode) { set({ psdMode: mode }); },
  setPsdData(data) { set({ psdData: data }); },
  setPsdLoading(v) { set({ psdLoading: v }); },
  setPsdSelectedLayer(layer) { set({ psdSelectedLayer: layer, psdSelectedSliceId: null }); },
  setPsdHiddenLayerIds(ids) { set({ psdHiddenLayerIds: ids }); },
  togglePsdHiddenLayer(id) {
    set((s) => {
      const n = new Set(s.psdHiddenLayerIds);
      n.has(id) ? n.delete(id) : n.add(id);
      return { psdHiddenLayerIds: n };
    });
  },
  setPsdCheckedLayerIds(ids) { set({ psdCheckedLayerIds: ids }); },
  togglePsdCheckedLayer(id, checked) {
    set((s) => {
      const n = new Set(s.psdCheckedLayerIds);
      checked ? n.add(id) : n.delete(id);
      return { psdCheckedLayerIds: n };
    });
  },
  clearPsdCheckedLayers() { set({ psdCheckedLayerIds: new Set() }); },
  setPsdMarkedSlices(slices) { set({ psdMarkedSlices: slices }); },
  addPsdMarkedSlice(slice) {
    set((s) => ({ psdMarkedSlices: [...s.psdMarkedSlices, slice] }));
  },
  removePsdMarkedSlice(id) {
    set((s) => ({
      psdMarkedSlices: s.psdMarkedSlices.filter(x => x.id !== id),
      psdSelectedSliceId: s.psdSelectedSliceId === id ? null : s.psdSelectedSliceId,
    }));
  },
  updatePsdMarkedSlice(id, updates) {
    set((s) => ({
      psdMarkedSlices: s.psdMarkedSlices.map(x => x.id === id ? { ...x, ...updates } : x),
    }));
  },
  setPsdSelectedSliceId(id) { set({ psdSelectedSliceId: id, psdSelectedLayer: null }); },
  setPsdShowSlices(v) { set({ psdShowSlices: v }); },
  resetPsdState() {
    set({
      psdMode: 'preview',
      psdData: null,
      psdLoading: false,
      psdSelectedLayer: null,
      psdHiddenLayerIds: new Set(),
      psdCheckedLayerIds: new Set(),
      psdMarkedSlices: [],
      psdSelectedSliceId: null,
      psdShowSlices: true,
    });
  },
}));
