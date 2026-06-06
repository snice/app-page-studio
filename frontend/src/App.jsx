import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Header } from './components/layout/Header';
import { Sidebar } from './components/layout/Sidebar';
import { PreviewPanel } from './components/layout/PreviewPanel';
import { ConfigPanel } from './components/layout/ConfigPanel';
import { Toast } from './components/common/Toast';
import { Icon } from './components/common/Icon';
import { ProjectModal, ImageUploadModal, GroupModal, DeleteConfirmModal, PromptModal, DesignSystemDrawer } from './components/modals/Modals';
import { useAppStore } from './lib/state';
import { api } from './lib/api';
import { Picker, ColorPickerModule } from './lib/picker';
import { useWebSocket } from './hooks/useWebSocket';
import { ElementStylesPanel } from './components/picker/ElementStylesPanel';
import { flattenLayers, unionBBox, layerMarkTargets, collectDrawableLayers, nextSliceColor, exportSlice, parsePSD } from './lib/psdUtils';
import JSZip from 'jszip';

// ==================== 选择器动作菜单 ====================
function PickerActionMenu({ menu, isHtml, onAction, onClose }) {
  useEffect(() => {
    if (!menu) return;
    const handler = () => onClose();
    const timer = setTimeout(() => document.addEventListener('click', handler), 10);
    return () => { clearTimeout(timer); document.removeEventListener('click', handler); };
  }, [menu, onClose]);

  if (!menu) return null;

  const items = [
    { key: 'interaction', icon: 'target', label: '添加交互' },
    { key: 'image', icon: 'image', label: '切图标记' },
    { key: 'function', icon: 'info', label: '功能描述' },
    ...(isHtml ? [{ key: 'styles', icon: 'code', label: '查看样式' }] : []),
  ];

  return (
    <div
      className="picker-action-menu"
      style={{
        position: 'fixed', left: menu.x, top: menu.y, zIndex: 10001,
        background: 'var(--bg-secondary)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)', boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        padding: 4, minWidth: 140,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {items.map(({ key, icon, label }) => (
        <div
          key={key}
          className="picker-menu-item"
          style={{ padding: '8px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, borderRadius: 4 }}
          onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
          onMouseLeave={(e) => e.currentTarget.style.background = ''}
          onClick={() => onAction(key, menu.selector, menu.eventType)}
        >
          <Icon name={icon} size="sm" />
          <span>{label}</span>
        </div>
      ))}
    </div>
  );
}

export default function App() {
  const showToast = useAppStore((s) => s.showToast);
  const setCurrentProjectId = useAppStore((s) => s.setCurrentProjectId);
  const getCurrentProjectId = useAppStore((s) => s.getCurrentProjectId);
  const setPagesConfig = useAppStore((s) => s.setPagesConfig);
  const setHtmlFiles = useAppStore((s) => s.setHtmlFiles);
  const syncFilesToConfig = useAppStore((s) => s.syncFilesToConfig);
  const setCurrentFile = useAppStore((s) => s.setCurrentFile);
  const setConfig = useAppStore((s) => s.setConfig);
  const pagesConfig = useAppStore((s) => s.pagesConfig);
  const setEditingDesignSystem = useAppStore((s) => s.setEditingDesignSystem);
  const setEditingDesignProjectId = useAppStore((s) => s.setEditingDesignProjectId);
  const getSessionId = useAppStore((s) => s.getSessionId);
  const getEditorName = useAppStore((s) => s.getEditorName);
  const setEditorName = useAppStore((s) => s.setEditorName);
  const startHeartbeat = useAppStore((s) => s.startHeartbeat);
  const updateSessionStatus = useAppStore((s) => s.updateSessionStatus);
  const addInteraction = useAppStore((s) => s.addInteraction);
  const addImageReplacement = useAppStore((s) => s.addImageReplacement);
  const addFunctionDescription = useAppStore((s) => s.addFunctionDescription);
  const setPickedColors = useAppStore((s) => s.setPickedColors);
  const setZoom = useAppStore((s) => s.setZoom);
  const setIsImageRegionSelecting = useAppStore((s) => s.setIsImageRegionSelecting);
  const resetPsdState = useAppStore((s) => s.resetPsdState);
  const addPsdMarkedSlice = useAppStore((s) => s.addPsdMarkedSlice);
  const clearPsdCheckedLayers = useAppStore((s) => s.clearPsdCheckedLayers);
  const setPsdSelectedSliceId = useAppStore((s) => s.setPsdSelectedSliceId);

  const iframeRef = useRef(null);

  // Modal states
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [imageUploadOpen, setImageUploadOpen] = useState(false);
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [promptModalOpen, setPromptModalOpen] = useState(false);
  const [designDrawerOpen, setDesignDrawerOpen] = useState(false);

  // Picker action menu state
  const [pickerMenu, setPickerMenu] = useState(null); // { x, y, selector, eventType }

  // Element styles panel state
  const [stylesPanelSelector, setStylesPanelSelector] = useState(null);

  const currentFile = useAppStore((s) => s.currentFile);
  const selectedFilesCount = useAppStore((s) => s.selectedFiles.size);
  const clearSelection = useAppStore((s) => s.clearSelection);

  // ==================== 初始化 ====================
  const loadConfig = useCallback(async () => {
    try {
      const res = await api.getConfig();
      if (res.projects) setConfig({ projects: res.projects });
    } catch (e) {
      console.error('loadConfig error:', e);
    }
  }, []);

  const loadPages = useCallback(async () => {
    const projectId = getCurrentProjectId();
    if (!projectId) return;
    const res = await api.getPages();
    setPagesConfig(res);
  }, []);

  const scanHtmlFiles = useCallback(async () => {
    const projectId = getCurrentProjectId();
    if (!projectId) { showToast('请先选择项目'); return; }
    const [htmlData, imageData] = await Promise.all([
      api.scanHtmlFiles(),
      api.listDesignImages(),
    ]);
    const htmlFiles = (htmlData.files || []).map(f => ({ ...f, sourceType: 'html' }));
    const imageFiles = (imageData.files || []).map(f => ({ ...f, sourceType: 'image' }));
    const psdFiles = (htmlData.psdFiles || []).map(f => ({ ...f, sourceType: 'psd' }));
    const allFiles = [...htmlFiles, ...imageFiles, ...psdFiles];
    setHtmlFiles(allFiles);
    syncFilesToConfig();
    showToast(`扫描完成，共 ${allFiles.length} 个文件`);
  }, []);

  const registerSession = useCallback(async () => {
    const projectId = getCurrentProjectId();
    if (!projectId) return;
    let editorName = getEditorName();
    if (!editorName) {
      editorName = prompt('请输入你的名称（用于协作编辑标识）：', '');
      if (!editorName) return;
      setEditorName(editorName);
    }
    const sessionId = getSessionId();
    const res = await api.registerSession(projectId, sessionId, editorName);
    if (res.isCurrentEditor === false) {
      const take = confirm(`"${res.currentEditor}" 正在编辑此项目。是否接管编辑权？`);
      if (take) {
        const forceRes = await api.forceAcquireSession(projectId, sessionId, editorName);
        updateSessionStatus(forceRes);
      } else {
        updateSessionStatus(res);
      }
    } else {
      updateSessionStatus(res);
    }
    startHeartbeat(api);
  }, []);

  // 初始化
  useEffect(() => {
    const init = async () => {
      await loadConfig();
      const projectId = getCurrentProjectId();
      if (projectId) {
        await loadPages();
        await scanHtmlFiles();
        await registerSession();
      }
    };
    init();
  }, []);

  // ==================== PSD 切图事件处理 ====================
  useEffect(() => {
    const handleMergeSlice = () => {
      const state = useAppStore.getState();
      const { psdData, psdCheckedLayerIds, psdMarkedSlices } = state;
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

  // iframe load 时重新 setup picker（如果 picker 激活状态）
  const handleIframeLoad = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const state = useAppStore.getState();
    // 如果 picker 处于激活状态，重新绑定
    if (state.isPickerActive) {
      // 延迟一点确保 iframe 加载完成
      setTimeout(() => {
        Picker.enable(iframe, handleElementClick);
      }, 100);
    }
    if (state.isColorPickerActive) {
      setTimeout(() => {
        // 如果之前绑定在主文档，切换到 iframe
        ColorPickerModule.disable();
        ColorPickerModule.enable(iframe, handleColorPicked);
      }, 100);
    }
  }, []);

  // WebSocket 热更新
  useWebSocket(useCallback((data) => {
    const currentFile = useAppStore.getState().currentFile;
    if (currentFile && data.file && data.file.includes(currentFile.path)) {
      if (iframeRef.current) {
        // 先禁用 picker
        const state = useAppStore.getState();
        if (state.isPickerActive) Picker.disable(iframeRef.current);
        if (state.isColorPickerActive) ColorPickerModule.disable(iframeRef.current);
        iframeRef.current.src = iframeRef.current.src;
        // iframe onLoad 回调会重新绑定
      }
    }
  }, []));
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
  const handleColorPicked = useCallback((hex) => {
    const state = useAppStore.getState();
    const colors = [...state.pickedColors];
    if (!colors.includes(hex)) colors.push(hex);
    setPickedColors(colors);
    showToast(`已复制: ${hex}`);
  }, []);

  /** 处理动作菜单选择 */
  const handlePickerAction = useCallback((action, selector, eventType) => {
    setPickerMenu(null);
    // 关闭 picker
    const iframe = iframeRef.current;
    if (iframe) {
      Picker.disable(iframe);
      useAppStore.getState().setIsPickerActive(false);
    }

    if (action === 'interaction') {
      addInteraction({ selector: selector, eventType: eventType || 'tap', action: '' });
      showToast(`已添加交互: ${selector}`);
    } else if (action === 'image') {
      addImageReplacement({ selector: selector, imagePath: '', description: '' });
      showToast(`已添加切图标记: ${selector}`);
    } else if (action === 'function') {
      addFunctionDescription({ selector: selector, description: '' });
      showToast(`已添加功能描述: ${selector}`);
    } else if (action === 'styles') {
      setStylesPanelSelector(selector);
    }
  }, []);

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
  }, []);

  // ==================== Header 回调 ====================
  const handleSaveConfig = async () => {
    // 保存 PSD 切图信息到当前文件配置
    const state = useAppStore.getState();
    if (state.currentFile?.sourceType === 'psd') {
      state.updateCurrentFile({ psdSlices: state.psdMarkedSlices });
    }
    const res = await api.savePages(pagesConfig);
    if (res.error) { showToast(res.error); return; }
    showToast('配置已保存');
  };

  const handleDownloadConfig = () => {
    const blob = new Blob([JSON.stringify(pagesConfig, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'pages-config.json'; a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadDesigns = async () => {
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

        // 获取 PSD 数据：优先用已加载的，否则加载
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
              // 加载预览 PNG 作为裁剪源
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

        // 导出每个切图
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
  };

  const handleOpenDesignSystem = () => {
    const projectId = getCurrentProjectId();
    if (!projectId) { showToast('请先选择项目'); return; }
    const project = useAppStore.getState().getCurrentProject();
    setEditingDesignSystem(project?.designSystem || { colors: [], spacing: {}, radius: {} });
    setEditingDesignProjectId(projectId);
    setDesignDrawerOpen(true);
  };

  const handleProjectSelected = async () => {
    setCurrentFile(null);
    setZoom(100);
    await loadPages();
    await scanHtmlFiles();
    await registerSession();
  };

  const handleFileSelected = (path) => {
    // 切换文件时清理选择器状态
    const state = useAppStore.getState();
    if (state.isPickerActive) {
      state.setIsPickerActive(false);
      if (iframeRef.current) Picker.disable(iframeRef.current);
      setPickerMenu(null);
    }
    if (state.isImageRegionSelecting) {
      setIsImageRegionSelecting(false);
    }
    // 切换文件时重置 PSD 状态
    resetPsdState();
    setCurrentFile(path);
    // 恢复 PSD 切图标记信息
    const file = state.pagesConfig.htmlFiles.find(f => f.path === path);
    if (file?.sourceType === 'psd' && file.psdSlices?.length > 0) {
      useAppStore.getState().setPsdMarkedSlices(file.psdSlices);
    }
  };

  const handleDeleteFiles = async () => {
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
  };

  // ==================== Picker 切换 ====================
  const handleTogglePicker = useCallback(() => {
    const state = useAppStore.getState();
    const currentFile = state.currentFile;
    // PSD 图层模式下不使用区域框选
    const isPsdLayers = currentFile?.sourceType === 'psd' && state.psdMode === 'layers';
    const isImage = (currentFile?.sourceType === 'image' || (currentFile?.sourceType === 'psd' && !isPsdLayers));

    // 非 HTML 文件：切换图片区域框选模式
    if (isImage) {
      const willSelect = !state.isImageRegionSelecting;
      // 关闭其他模式
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

    // 如果取色器激活，先关闭
    if (willActivate && state.isColorPickerActive) {
      state.setIsColorPickerActive(false);
      if (iframe) ColorPickerModule.disable(iframe);
    }
    // 如果图片区域选择激活，先关闭
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
  }, [handleElementClick]);

  const handleToggleColorPicker = useCallback(() => {
    const state = useAppStore.getState();
    const iframe = iframeRef.current;
    const willActivate = !state.isColorPickerActive;

    // 如果 picker 激活，先关闭
    if (willActivate && state.isPickerActive) {
      state.setIsPickerActive(false);
      if (iframe) Picker.disable(iframe);
      setPickerMenu(null);
    }
    // 如果图片区域选择激活，先关闭
    if (willActivate && state.isImageRegionSelecting) {
      setIsImageRegionSelecting(false);
    }

    state.setIsColorPickerActive(willActivate);
    if (willActivate) {
      // 有 iframe 且已加载时绑定 iframe，否则绑定主文档（图片/psd 模式等）
      if (iframe && iframe.contentDocument && iframe.contentDocument.body) {
        ColorPickerModule.enable(iframe, handleColorPicked);
      } else {
        // 限制取色器仅在预览区域内工作
        const container = document.querySelector('.phone-screen');
        ColorPickerModule.enable(null, handleColorPicked, { container });
      }
    } else {
      // 禁用时：优先用已绑定的目标，兼容 iframe 和主文档模式
      ColorPickerModule.disable(iframe);
    }
  }, [handleColorPicked]);

  return (
    <>
      <div className="app">
        <Header
          onShowProjectSelector={() => setProjectModalOpen(true)}
          onOpenDesignSystem={handleOpenDesignSystem}
          onDownloadDesigns={handleDownloadDesigns}
          onScanHtml={scanHtmlFiles}
          onOpenImageUpload={() => setImageUploadOpen(true)}
          onSaveConfig={handleSaveConfig}
          onDownloadConfig={handleDownloadConfig}
          onShowPromptModal={() => setPromptModalOpen(true)}
        />
        <Sidebar
          onCreateGroup={() => setGroupModalOpen(true)}
          onFileSelected={handleFileSelected}
        />
        {selectedFilesCount > 0 && (
          <div className="selection-toolbar-float">
            <div className="selection-toolbar-top">
              已选择 <span className="selection-count">{selectedFilesCount}</span> 个文件
            </div>
            <div className="selection-toolbar-actions">
              <button className="btn btn-sm" style={{ background: '#000', color: '#fff' }} onClick={() => setGroupModalOpen(true)}>创建分组</button>
              <button className="btn btn-sm btn-secondary" onClick={() => setDeleteModalOpen(true)}>
                <Icon name="trash" size="sm" /> 删除
              </button>
              <button className="btn btn-sm btn-secondary" onClick={clearSelection}>取消</button>
            </div>
          </div>
        )}
        <PreviewPanel
          onTogglePicker={handleTogglePicker}
          onToggleColorPicker={handleToggleColorPicker}
          iframeRef={iframeRef}
          onIframeLoad={handleIframeLoad}
          onRegionAction={handleRegionAction}
        />
        <ConfigPanel iframeRef={iframeRef} />
      </div>

      <Toast />

      <PickerActionMenu menu={pickerMenu} isHtml={currentFile?.sourceType === 'html'} onAction={handlePickerAction} onClose={() => setPickerMenu(null)} />
      {stylesPanelSelector && (
        <ElementStylesPanel
          selector={stylesPanelSelector}
          iframeRef={iframeRef}
          onClose={() => setStylesPanelSelector(null)}
        />
      )}

      <ProjectModal isOpen={projectModalOpen} onClose={() => setProjectModalOpen(false)} onProjectSelected={handleProjectSelected} onOpenDesignSystem={(projectId) => { const p = useAppStore.getState().config.projects?.find(pr => pr.id === projectId); setEditingDesignSystem(p?.designSystem || { colors: [], spacing: {}, radius: {} }); setEditingDesignProjectId(projectId); setDesignDrawerOpen(true); }} />
      <ImageUploadModal isOpen={imageUploadOpen} onClose={() => setImageUploadOpen(false)} onSuccess={scanHtmlFiles} />
      <GroupModal isOpen={groupModalOpen} onClose={() => setGroupModalOpen(false)} />
      <DeleteConfirmModal isOpen={deleteModalOpen} onClose={() => setDeleteModalOpen(false)} count={selectedFilesCount} onConfirm={handleDeleteFiles} />
      <PromptModal isOpen={promptModalOpen} onClose={() => setPromptModalOpen(false)} />
      <DesignSystemDrawer isOpen={designDrawerOpen} onClose={() => setDesignDrawerOpen(false)} />
    </>
  );
}
