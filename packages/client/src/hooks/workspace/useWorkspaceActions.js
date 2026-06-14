import { useCallback } from 'react';
import { useAppStore } from '../../lib/state';
import { api } from '../../lib/api';
import { Picker } from '../../lib/picker';
import { exportSlice, parsePSD } from '../../lib/psdUtils';

function buildGroupAssignments(pagesConfig) {
  return (pagesConfig.htmlFiles || []).map((file) => ({
    path: file.path,
    groupId: file.groupId ?? null,
    isPrimaryState: !!file.isPrimaryState,
  }));
}

/**
 * 工作台业务动作：选择文件、保存、下载配置/设计稿、删除。
 * 与 picker / PSD 切片事件无关，所以单独抽出。
 */
export function useWorkspaceActions({ iframeRef, setPickerMenu, requestConfirm }) {
  const showToast = useAppStore((s) => s.showToast);
  const setPagesConfig = useAppStore((s) => s.setPagesConfig);
  const setPagesMeta = useAppStore((s) => s.setPagesMeta);
  const setHtmlFiles = useAppStore((s) => s.setHtmlFiles);
  const setCurrentFile = useAppStore((s) => s.setCurrentFile);
  const setIsImageRegionSelecting = useAppStore((s) => s.setIsImageRegionSelecting);
  const resetPsdState = useAppStore((s) => s.resetPsdState);

  const handleFileSelected = useCallback((path) => {
    const state = useAppStore.getState();
    if (state.isPickerActive) {
      state.setIsPickerActive(false);
      if (iframeRef.current) Picker.disable(iframeRef.current);
      setPickerMenu?.(null);
    }
    if (state.isImageRegionSelecting) setIsImageRegionSelecting(false);
    resetPsdState();
    setCurrentFile(path);
    const file = state.pagesConfig.htmlFiles.find(f => f.path === path);
    useAppStore.getState().setZoom(file?.zoom || 100);
    if (file?.sourceType === 'psd' && file.psdSlices?.length > 0) {
      useAppStore.getState().setPsdMarkedSlices(file.psdSlices);
    }
  }, [iframeRef, setPickerMenu, resetPsdState, setCurrentFile, setIsImageRegionSelecting]);

  const handleSaveConflict = useCallback(async (res) => {
    const shouldReload = await requestConfirm?.({
      title: '保存冲突',
      message: res.error || '配置已被其他编辑者更新。',
      hint: '加载最新版本会替换当前工作台内容；取消后本地修改仍保留。',
      confirmText: '加载最新',
    });
    if (shouldReload && res.latest?.pagesConfig) {
      const currentPath = useAppStore.getState().currentFile?.path;
      setPagesConfig(res.latest);
      await useAppStore.getState().scanHtmlFiles({ showResultToast: false });
      if (currentPath) useAppStore.getState().setCurrentFile(currentPath);
      showToast('已加载最新配置');
    } else {
      showToast('保存被拒绝，本地修改仍保留');
    }
  }, [requestConfirm, setPagesConfig, showToast]);

  const prepareCurrentFileForSave = useCallback((applyZoomLock = false) => {
    const state = useAppStore.getState();
    if (!state.currentFile) return null;
    const updates = { zoom: state.zoom };
    if (state.currentFile.sourceType === 'psd') updates.psdSlices = state.psdMarkedSlices;
    state.updateCurrentFile(updates);
    const nextState = useAppStore.getState();
    if (applyZoomLock && nextState.zoomLockBySourceType && nextState.currentFile?.sourceType) {
      nextState.applyZoomToAllSameSourceType(nextState.currentFile.sourceType, nextState.zoom);
    }
    return useAppStore.getState().currentFile;
  }, []);

  const handleSaveGroups = useCallback(async ({ silent = false } = {}) => {
    const state = useAppStore.getState();
    if (state.session?.isCurrentEditor === false) {
      showToast('当前为只读，不能保存页面分组');
      return false;
    }
    const baseHash = state.pagesEntityHashes.groups || null;
    const res = await api.savePageGroups(
      state.pagesConfig.pageGroups || [],
      buildGroupAssignments(state.pagesConfig),
      baseHash
    );
    if (res.conflict) {
      await handleSaveConflict(res);
      return false;
    }
    if (res.error) { showToast(res.error); return false; }
    setPagesMeta(res);
    useAppStore.getState().clearDirtyGroups();
    if (!silent) showToast('页面分组已保存');
    return true;
  }, [handleSaveConflict, setPagesMeta, showToast]);

  const handleSaveCurrentPage = useCallback(async () => {
    const state = useAppStore.getState();
    if (state.session?.isCurrentEditor === false) {
      showToast('当前为只读，不能保存配置');
      return;
    }
    if (!state.currentFile) {
      showToast('请先选择页面');
      return;
    }
    if (state.dirtyGroups) {
      const groupsSaved = await handleSaveGroups({ silent: true });
      if (!groupsSaved) return;
    }

    const currentFile = prepareCurrentFileForSave(false);
    const latestState = useAppStore.getState();
    const file = latestState.pagesConfig.htmlFiles.find((item) => item.path === currentFile.path);
    if (!file) {
      showToast('当前页面不存在');
      return;
    }
    const baseHash = latestState.pagesEntityHashes.files?.[file.path] || null;
    const res = await api.savePageFile(file.path, file, baseHash);
    if (res.conflict) {
      await handleSaveConflict(res);
      return;
    }
    if (res.error) { showToast(res.error); return; }
    setPagesMeta(res);
    useAppStore.getState().clearDirtyFile(file.path);
    showToast(state.dirtyGroups ? '当前页和页面分组已保存' : '当前页已保存');
  }, [handleSaveConflict, handleSaveGroups, prepareCurrentFileForSave, setPagesMeta, showToast]);

  const handleSaveAllConfig = useCallback(async () => {
    const state = useAppStore.getState();
    if (state.session?.isCurrentEditor === false) {
      showToast('当前为只读，不能保存配置');
      return;
    }
    if (state.dirtyGroups && Object.keys(state.dirtyFiles || {}).length === 0) {
      await handleSaveGroups();
      return;
    }
    prepareCurrentFileForSave(true);
    const latestState = useAppStore.getState();
    const res = await api.savePages(latestState.pagesConfig, latestState.pagesMeta.revision);
    if (res.conflict) {
      await handleSaveConflict(res);
      return;
    }
    if (res.error) { showToast(res.error); return; }
    setPagesMeta(res);
    useAppStore.getState().clearAllDirty();
    showToast('配置已保存');
  }, [handleSaveConflict, handleSaveGroups, prepareCurrentFileForSave, setPagesMeta, showToast]);

  const handleDownloadConfig = useCallback(() => {
    const blob = new Blob([JSON.stringify(useAppStore.getState().pagesConfig, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'pages-config.json'; a.click();
    URL.revokeObjectURL(url);
  }, []);

  const handleDownloadDesigns = useCallback(async () => {
    try {
      const state = useAppStore.getState();
      const projectId = state.getCurrentProjectId();
      if (!projectId) { showToast('请先选择项目'); return; }
      const selectedPaths = Array.from(state.selectedFiles);
      if (selectedPaths.length === 0) { showToast('请先在左侧选中要下载的页面'); return; }
      const pc = state.pagesConfig;
      const files = selectedPaths.map(p => {
        const f = (pc.htmlFiles || []).find(hf => hf.path === p);
        return {
          path: p,
          sourceType: f?.sourceType || (f?.imagePath ? 'image' : 'html'),
          previewPath: f?.previewPath || null,
          generatedHtmlPath: f?.generatedHtmlPath || null,
        };
      });

      const psdSliceExports = {};
      for (const file of files) {
        if (file.sourceType !== 'psd') continue;
        const fileConfig = (pc.htmlFiles || []).find(hf => hf.path === file.path);
        const slices = fileConfig?.psdSlices;
        if (!slices || slices.length === 0) continue;

        let psdData = null;
        if (state.psdData && state.currentFile?.path === file.path) {
          psdData = state.psdData;
        } else {
          try {
            const psdUrl = `/html/${projectId}/${file.path}`;
            const resp = await fetch(psdUrl);
            if (resp.ok) {
              const buffer = await resp.arrayBuffer();
              psdData = await parsePSD(buffer);
              if (file.previewPath) {
                const previewUrl = `/html/${projectId}/${file.previewPath}`;
                const img = await new Promise((resolve, reject) => {
                  const i = new Image(); i.crossOrigin = 'anonymous';
                  i.onload = () => resolve(i); i.onerror = reject; i.src = previewUrl;
                });
                const c = document.createElement('canvas');
                c.width = img.naturalWidth; c.height = img.naturalHeight;
                c.getContext('2d').drawImage(img, 0, 0);
                psdData.previewCanvas = c;
              }
            }
          } catch (e) {
            console.warn('加载 PSD 失败:', file.path, e);
          }
        }
        if (!psdData) continue;

        const exported = [];
        for (const slice of slices) {
          try {
            const { dataUrl, ext } = exportSlice(psdData, slice, 'png');
            const base64 = dataUrl.split(',')[1];
            if (base64) exported.push({ name: slice.name, ext, data: base64 });
          } catch (e) {
            console.warn('导出切图失败:', slice.name, e);
          }
        }
        if (exported.length > 0) psdSliceExports[file.path] = exported;
      }

      const blob = await api.downloadDesignZip({ projectId, files, psdSliceExports });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'design.zip'; a.click();
      URL.revokeObjectURL(url);
      showToast(`已下载 ${files.length} 个设计稿`);
    } catch (e) {
      showToast(e.message || '下载失败');
    }
  }, [showToast]);

  const handleDeleteFiles = useCallback(async () => {
    const state = useAppStore.getState();
    if (state.session?.isCurrentEditor === false) {
      showToast('当前为只读，不能删除页面');
      return;
    }
    const projectId = state.getCurrentProjectId();
    if (!projectId) { showToast('请先选择项目'); return; }
    const selectedPaths = Array.from(state.selectedFiles);
    if (selectedPaths.length === 0) return;

    const files = selectedPaths
      .map(path => state.pagesConfig.htmlFiles.find(f => f.path === path))
      .filter(Boolean)
      .map(f => ({
        path: f.path,
        sourceType: f.sourceType || (f.imagePath ? 'image' : 'html'),
        generatedHtmlPath: f.generatedHtmlPath || null,
      }));

    try {
      const res = await api.deleteFiles({ projectId, files });
      if (res.error) throw new Error(res.error);
    } catch (e) {
      showToast('删除失败: ' + e.message);
      return;
    }

    const selectedSet = new Set(selectedPaths);
    const newHtmlFiles = (state.pagesConfig.htmlFiles || []).filter(f => !selectedSet.has(f.path));
    setPagesConfig({ ...state.pagesConfig, htmlFiles: newHtmlFiles });
    setHtmlFiles(newHtmlFiles);
    if (state.currentFile && selectedSet.has(state.currentFile.path)) setCurrentFile(null);
    state.clearSelection();
    showToast('已删除选中页面');
  }, [setPagesConfig, setHtmlFiles, setCurrentFile, showToast]);

  return {
    handleFileSelected,
    handleSaveCurrentPage,
    handleSaveGroups,
    handleSaveAllConfig,
    handleDownloadConfig,
    handleDownloadDesigns,
    handleDeleteFiles,
  };
}
