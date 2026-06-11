import { useState, useRef, useCallback, useEffect } from 'react';
import { useAppStore } from '../lib/state';
import { api } from '../lib/api';
import { Picker, ColorPickerModule } from '../lib/picker';
import { useWebSocket } from './useWebSocket';
import {
  flattenLayers, unionBBox, layerMarkTargets, collectDrawableLayers,
  nextSliceColor, exportSlice, parsePSD,
} from '../lib/psdUtils';
import JSZip from 'jszip';

/**
 * 工作台（DashboardPage）的全部交互逻辑：
 * iframe 引用、元素/取色选择器、PSD 切图、热更新、保存/下载等业务 handler。
 * 这些逻辑只属于工作台，从 App 下沉到此处，与页面就近管理。
 */
export function useWorkspaceController() {
  const showToast = useAppStore((s) => s.showToast);
  const pagesConfig = useAppStore((s) => s.pagesConfig);
  const currentFile = useAppStore((s) => s.currentFile);
  const currentProjectId = useAppStore((s) => s.config.currentProject);
  const isPickerActive = useAppStore((s) => s.isPickerActive);
  const isColorPickerActive = useAppStore((s) => s.isColorPickerActive);
  const setPagesConfig = useAppStore((s) => s.setPagesConfig);
  const setPagesMeta = useAppStore((s) => s.setPagesMeta);
  const setHtmlFiles = useAppStore((s) => s.setHtmlFiles);
  const setCurrentFile = useAppStore((s) => s.setCurrentFile);
  const setZoom = useAppStore((s) => s.setZoom);
  const setIsImageRegionSelecting = useAppStore((s) => s.setIsImageRegionSelecting);
  const resetPsdState = useAppStore((s) => s.resetPsdState);
  const addInteraction = useAppStore((s) => s.addInteraction);
  const addImageReplacement = useAppStore((s) => s.addImageReplacement);
  const addFunctionDescription = useAppStore((s) => s.addFunctionDescription);
  const setPickedColors = useAppStore((s) => s.setPickedColors);
  const addPsdMarkedSlice = useAppStore((s) => s.addPsdMarkedSlice);
  const clearPsdCheckedLayers = useAppStore((s) => s.clearPsdCheckedLayers);
  const setPsdSelectedSliceId = useAppStore((s) => s.setPsdSelectedSliceId);

  const iframeRef = useRef(null);

  // 选择器动作菜单 / 元素样式面板 / 思维导图（均为工作台局部 UI 状态）
  const [pickerMenu, setPickerMenu] = useState(null); // { x, y, selector, eventType }
  const [stylesPanelSelector, setStylesPanelSelector] = useState(null);
  const [mindMapOpen, setMindMapOpen] = useState(false);

  // ==================== PSD 切图事件处理 ====================
  useEffect(() => {
    const handleMergeSlice = () => {
      const state = useAppStore.getState();
      const { psdData, psdCheckedLayerIds } = state;
      if (!psdData || psdCheckedLayerIds.size === 0) return;

      const all = flattenLayers(psdData.layers);
      const picked = all.filter(l => psdCheckedLayerIds.has(l.id));
      const bbox = unionBBox(picked);
      if (bbox.width === 0 || bbox.height === 0) {
        showToast('所选图层没有有效尺寸');
        return;
      }
      const slice = {
        id: `slice-${Date.now()}`,
        name: picked.length === 1 ? picked[0].name : picked.map(l => l.name).join('+').slice(0, 30),
        layerIds: [...psdCheckedLayerIds],
        layerNames: picked.map(l => l.name),
        ...bbox,
        color: nextSliceColor(),
        exportAs: 'png',
        source: 'manual',
      };
      addPsdMarkedSlice(slice);
      clearPsdCheckedLayers();
      setPsdSelectedSliceId(slice.id);
      showToast(`已添加切图标记：${slice.name}`);
    };

    const handleMarkSingle = (e) => {
      const layer = e.detail?.layer;
      if (!layer) return;
      const state = useAppStore.getState();
      const { psdMarkedSlices } = state;

      const { bbox, layerIds } = layerMarkTargets(layer);
      const existing = psdMarkedSlices.find(s =>
        layerIds.every(id => s.layerIds.includes(id)) || s.layerIds.includes(layer.id),
      );
      if (existing) {
        setPsdSelectedSliceId(existing.id);
        showToast(`“${layer.name}”已标记为切图`);
        return;
      }
      if (bbox.width === 0 || bbox.height === 0) {
        showToast(`图层“${layer.name}”没有有效尺寸`);
        return;
      }
      const layerNames = layer.children?.length
        ? collectDrawableLayers(layer).map(l => l.name)
        : [layer.name];
      const slice = {
        id: `slice-${Date.now()}`,
        name: layer.name,
        layerIds,
        layerNames,
        ...bbox,
        color: nextSliceColor(),
        exportAs: 'png',
        source: 'manual',
      };
      addPsdMarkedSlice(slice);
      clearPsdCheckedLayers();
      setPsdSelectedSliceId(slice.id);
      showToast(`已添加切图标记：${slice.name}`);
    };

    const handleExportSlice = (e) => {
      const slice = e.detail?.slice;
      const state = useAppStore.getState();
      const { psdData } = state;
      if (!psdData || !slice) return;
      const { dataUrl, ext } = exportSlice(psdData, slice);
      const a = document.createElement('a');
      a.download = `${slice.name}.${ext}`;
      a.href = dataUrl;
      a.click();
    };

    const handleExportAllSlices = async () => {
      const state = useAppStore.getState();
      const { psdData, psdMarkedSlices } = state;
      if (!psdData || psdMarkedSlices.length === 0) return;
      const zip = new JSZip();
      const folder = zip.folder('slices');
      for (const slice of psdMarkedSlices) {
        const { dataUrl, ext } = exportSlice(psdData, slice);
        folder.file(`${slice.name}.${ext}`, dataUrl.split(',')[1], { base64: true });
      }
      const blob = await zip.generateAsync({ type: 'blob' });
      const a = document.createElement('a');
      a.download = `slices-${psdMarkedSlices.length}.zip`;
      a.href = URL.createObjectURL(blob);
      a.click();
      URL.revokeObjectURL(a.href);
    };

    const handleCropDone = (e) => {
      const rect = e.detail;
      if (!rect || rect.width < 3 || rect.height < 3) return;
      const slice = {
        id: `slice-${Date.now()}`,
        name: `框选 ${Math.round(rect.width)}×${Math.round(rect.height)}`,
        layerIds: [],
        layerNames: [],
        ...rect,
        color: nextSliceColor(),
        exportAs: 'png',
        source: 'crop',
      };
      addPsdMarkedSlice(slice);
      setPsdSelectedSliceId(slice.id);
      showToast(`已添加框选切图：${slice.name}`);
    };

    window.addEventListener('psd-merge-slice', handleMergeSlice);
    window.addEventListener('psd-mark-single', handleMarkSingle);
    window.addEventListener('psd-export-slice', handleExportSlice);
    window.addEventListener('psd-export-all-slices', handleExportAllSlices);
    window.addEventListener('psd-crop-done', handleCropDone);
    return () => {
      window.removeEventListener('psd-merge-slice', handleMergeSlice);
      window.removeEventListener('psd-mark-single', handleMarkSingle);
      window.removeEventListener('psd-export-slice', handleExportSlice);
      window.removeEventListener('psd-export-all-slices', handleExportAllSlices);
      window.removeEventListener('psd-crop-done', handleCropDone);
    };
  }, [addPsdMarkedSlice, clearPsdCheckedLayers, setPsdSelectedSliceId, showToast]);

  // ==================== Picker 回调 ====================
  /** 在 iframe 中点击元素时，显示动作菜单 */
  const handleElementClick = useCallback((selector, eventType, mouseEvent) => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const iframeRect = iframe.getBoundingClientRect();
    const zoom = iframeRect.width / iframe.offsetWidth || 1;
    const menuX = iframeRect.left + mouseEvent.clientX * zoom;
    const menuY = iframeRect.top + mouseEvent.clientY * zoom;
    setPickerMenu({ x: menuX, y: menuY, selector, eventType });
  }, []);

  /** 取色器选中颜色回调 */
  const handleColorPicked = useCallback((hex, copied = true) => {
    const state = useAppStore.getState();
    const colors = [...state.pickedColors];
    if (!colors.includes(hex)) colors.push(hex);
    setPickedColors(colors);
    showToast(copied ? `已复制: ${hex}` : `已取色: ${hex}（剪贴板写入失败，请手动复制）`);
  }, [setPickedColors, showToast]);

  /** 处理动作菜单选择 */
  const handlePickerAction = useCallback((action, selector, eventType) => {
    setPickerMenu(null);
    const iframe = iframeRef.current;
    if (iframe) {
      Picker.disable(iframe);
      useAppStore.getState().setIsPickerActive(false);
    }

    if (action === 'interaction') {
      addInteraction({ selector, eventType: eventType || 'tap', action: '' });
      showToast(`已添加交互: ${selector}`);
    } else if (action === 'image') {
      addImageReplacement({ selector, imagePath: '', description: '' });
      showToast(`已添加切图标记: ${selector}`);
    } else if (action === 'function') {
      addFunctionDescription({ selector, description: '' });
      showToast(`已添加功能描述: ${selector}`);
    } else if (action === 'styles') {
      setStylesPanelSelector(selector);
    }
  }, [addInteraction, addImageReplacement, addFunctionDescription, showToast]);

  // ==================== 图片区域动作 ====================
  const handleRegionAction = useCallback((action, region) => {
    if (action === 'interaction') {
      addInteraction({ selector: '区域', eventType: 'tap', action: '', region });
      showToast('已添加交互区域');
    } else if (action === 'image') {
      addImageReplacement({ selector: '区域', imagePath: '', description: '', region });
      showToast('已添加切图标记区域');
    } else if (action === 'function') {
      addFunctionDescription({ selector: '区域', description: '', region });
      showToast('已添加功能描述区域');
    }
  }, [addInteraction, addImageReplacement, addFunctionDescription, showToast]);

  // iframe load 时重新 setup picker（如果 picker 激活状态）
  const handleIframeLoad = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const state = useAppStore.getState();
    if (state.isPickerActive) {
      setTimeout(() => {
        Picker.enable(iframe, handleElementClick);
      }, 100);
    }
    if (state.isColorPickerActive) {
      setTimeout(() => {
        ColorPickerModule.disable();
        ColorPickerModule.enable(iframe, handleColorPicked);
      }, 100);
    }
  }, [handleElementClick, handleColorPicked]);

  // WebSocket 热更新
  useWebSocket(useCallback((data) => {
    const cf = useAppStore.getState().currentFile;
    if (cf && data.file && data.file.includes(cf.path)) {
      if (iframeRef.current) {
        const state = useAppStore.getState();
        if (state.isPickerActive) Picker.disable(iframeRef.current);
        if (state.isColorPickerActive) ColorPickerModule.disable(iframeRef.current);
        iframeRef.current.src = iframeRef.current.src;
      }
    }
  }, []));

  // 外部（路由切换等）将选择器标记关闭时，确保 iframe 解绑并关闭动作菜单
  useEffect(() => {
    if (!isPickerActive) {
      if (iframeRef.current) Picker.disable(iframeRef.current);
      setPickerMenu(null);
    }
  }, [isPickerActive]);
  useEffect(() => {
    if (!isColorPickerActive) ColorPickerModule.disable(iframeRef.current);
  }, [isColorPickerActive]);

  // 切换文件时关闭动作菜单与样式面板
  useEffect(() => {
    setPickerMenu(null);
    setStylesPanelSelector(null);
  }, [currentFile]);

  // 切换项目时关闭思维导图
  useEffect(() => {
    setMindMapOpen(false);
  }, [currentProjectId]);

  // ==================== Picker 切换 ====================
  const handleTogglePicker = useCallback(() => {
    const state = useAppStore.getState();
    const cf = state.currentFile;
    const isPsdLayers = cf?.sourceType === 'psd' && state.psdMode === 'layers';
    const isImage = (cf?.sourceType === 'image' || (cf?.sourceType === 'psd' && !isPsdLayers));

    // 非 HTML 文件：切换图片区域框选模式
    if (isImage) {
      const willSelect = !state.isImageRegionSelecting;
      if (willSelect) {
        if (state.isColorPickerActive) {
          state.setIsColorPickerActive(false);
          ColorPickerModule.disable(iframeRef.current);
        }
        if (state.isPickerActive) {
          state.setIsPickerActive(false);
          if (iframeRef.current) Picker.disable(iframeRef.current);
          setPickerMenu(null);
        }
      }
      setIsImageRegionSelecting(willSelect);
      return;
    }

    // HTML 文件：元素选择器模式
    const iframe = iframeRef.current;
    const willActivate = !state.isPickerActive;

    if (willActivate && state.isColorPickerActive) {
      state.setIsColorPickerActive(false);
      if (iframe) ColorPickerModule.disable(iframe);
    }
    if (willActivate && state.isImageRegionSelecting) {
      setIsImageRegionSelecting(false);
    }

    state.setIsPickerActive(willActivate);
    if (iframe) {
      if (willActivate) {
        Picker.enable(iframe, handleElementClick);
      } else {
        Picker.disable(iframe);
        setPickerMenu(null);
      }
    }
  }, [handleElementClick, setIsImageRegionSelecting]);

  const handleToggleColorPicker = useCallback(() => {
    const state = useAppStore.getState();
    const iframe = iframeRef.current;
    const willActivate = !state.isColorPickerActive;

    if (willActivate && state.isPickerActive) {
      state.setIsPickerActive(false);
      if (iframe) Picker.disable(iframe);
      setPickerMenu(null);
    }
    if (willActivate && state.isImageRegionSelecting) {
      setIsImageRegionSelecting(false);
    }

    state.setIsColorPickerActive(willActivate);
    if (willActivate) {
      if (iframe && iframe.contentDocument && iframe.contentDocument.body) {
        ColorPickerModule.enable(iframe, handleColorPicked);
      } else {
        const container = document.querySelector('.phone-screen');
        ColorPickerModule.enable(null, handleColorPicked, { container });
      }
    } else {
      ColorPickerModule.disable(iframe);
    }
  }, [handleColorPicked, setIsImageRegionSelecting]);

  // ==================== 文件选择 ====================
  const handleFileSelected = useCallback((path) => {
    const state = useAppStore.getState();
    if (state.isPickerActive) {
      state.setIsPickerActive(false);
      if (iframeRef.current) Picker.disable(iframeRef.current);
      setPickerMenu(null);
    }
    if (state.isImageRegionSelecting) {
      setIsImageRegionSelecting(false);
    }
    resetPsdState();
    setCurrentFile(path);
    const file = state.pagesConfig.htmlFiles.find(f => f.path === path);
    useAppStore.getState().setZoom(file?.zoom || 100);
    if (file?.sourceType === 'psd' && file.psdSlices?.length > 0) {
      useAppStore.getState().setPsdMarkedSlices(file.psdSlices);
    }
  }, [resetPsdState, setCurrentFile, setIsImageRegionSelecting]);

  // ==================== Header 业务 handler ====================
  const handleSaveConfig = useCallback(async () => {
    const state = useAppStore.getState();
    if (state.currentFile) {
      const updates = { zoom: state.zoom };
      if (state.currentFile.sourceType === 'psd') {
        updates.psdSlices = state.psdMarkedSlices;
      }
      state.updateCurrentFile(updates);
      if (state.zoomLockBySourceType && state.currentFile.sourceType) {
        state.applyZoomToAllSameSourceType(state.currentFile.sourceType, state.zoom);
      }
    }
    const latestState = useAppStore.getState();
    const res = await api.savePages(latestState.pagesConfig, latestState.pagesMeta.revision);
    if (res.conflict) {
      let shouldReload = false;
      try {
        shouldReload = window.confirm(`${res.error || '配置已被其他编辑者更新'}。是否加载最新版本？`);
      } catch (e) {
        console.warn('confirm() unsupported, keep local changes:', e?.message);
      }

      if (shouldReload && res.latest?.pagesConfig) {
        const currentPath = useAppStore.getState().currentFile?.path;
        setPagesConfig(res.latest);
        await useAppStore.getState().scanHtmlFiles({ showResultToast: false });
        if (currentPath) useAppStore.getState().setCurrentFile(currentPath);
        showToast('已加载最新配置');
      } else {
        showToast('保存被拒绝，本地修改仍保留');
      }
      return;
    }
    if (res.error) { showToast(res.error); return; }
    setPagesMeta(res);
    showToast('配置已保存');
  }, [setPagesConfig, setPagesMeta, showToast]);

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
        return { path: p, sourceType: f?.sourceType || (f?.imagePath ? 'image' : 'html'), previewPath: f?.previewPath || null };
      });

      // 导出 PSD 切图（base64）
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
            if (base64) {
              exported.push({ name: slice.name, ext, data: base64 });
            }
          } catch (e) {
            console.warn('导出切图失败:', slice.name, e);
          }
        }
        if (exported.length > 0) {
          psdSliceExports[file.path] = exported;
        }
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
    const projectId = state.getCurrentProjectId();
    if (!projectId) { showToast('请先选择项目'); return; }
    const selectedPaths = Array.from(state.selectedFiles);
    if (selectedPaths.length === 0) return;

    const files = selectedPaths
      .map(path => state.pagesConfig.htmlFiles.find(f => f.path === path))
      .filter(Boolean)
      .map(f => ({ path: f.path, sourceType: f.sourceType || (f.imagePath ? 'image' : 'html') }));

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

    if (state.currentFile && selectedSet.has(state.currentFile.path)) {
      setCurrentFile(null);
    }

    state.clearSelection();
    showToast('已删除选中页面');
  }, [setPagesConfig, setHtmlFiles, setCurrentFile, showToast]);

  return {
    iframeRef,
    pickerMenu,
    setPickerMenu,
    stylesPanelSelector,
    setStylesPanelSelector,
    mindMapOpen,
    setMindMapOpen,
    currentFile,
    pagesConfig,
    handleElementClick,
    handleColorPicked,
    handlePickerAction,
    handleRegionAction,
    handleIframeLoad,
    handleTogglePicker,
    handleToggleColorPicker,
    handleFileSelected,
    handleSaveConfig,
    handleDownloadConfig,
    handleDownloadDesigns,
    handleDeleteFiles,
  };
}
