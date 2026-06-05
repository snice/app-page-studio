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

// ==================== 选择器动作菜单 ====================
function PickerActionMenu({ menu, onAction, onClose }) {
  useEffect(() => {
    if (!menu) return;
    const handler = () => onClose();
    const timer = setTimeout(() => document.addEventListener('click', handler), 10);
    return () => { clearTimeout(timer); document.removeEventListener('click', handler); };
  }, [menu, onClose]);

  if (!menu) return null;
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
      {[
        { key: 'interaction', icon: 'target', label: '添加交互' },
        { key: 'image', icon: 'image', label: '切图标记' },
        { key: 'function', icon: 'info', label: '功能描述' },
      ].map(({ key, icon, label }) => (
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
    const allFiles = [...htmlFiles, ...imageFiles];
    setHtmlFiles(allFiles);
    syncFilesToConfig();
    showToast(`扫描完成，共 ${allFiles.length} 个文件（${htmlFiles.length} HTML + ${imageFiles.length} 设计图）`);
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
    }
  }, []);

  // ==================== Header 回调 ====================
  const handleSaveConfig = async () => {
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
      const blob = await api.downloadDesignZip({ pagesConfig });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'design.zip'; a.click();
      URL.revokeObjectURL(url);
      showToast('设计稿已下载');
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
    await loadPages();
    await scanHtmlFiles();
    await registerSession();
  };

  const handleFileSelected = (path) => {
    setCurrentFile(path);
  };

  // ==================== Picker 切换 ====================
  const handleTogglePicker = useCallback(() => {
    const state = useAppStore.getState();
    const iframe = iframeRef.current;
    const willActivate = !state.isPickerActive;

    // 如果取色器激活，先关闭
    if (willActivate && state.isColorPickerActive) {
      state.setIsColorPickerActive(false);
      if (iframe) ColorPickerModule.disable(iframe);
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

    state.setIsColorPickerActive(willActivate);
    if (iframe) {
      if (willActivate) {
        ColorPickerModule.enable(iframe, handleColorPicked);
      } else {
        ColorPickerModule.disable(iframe);
      }
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
        <PreviewPanel
          onTogglePicker={handleTogglePicker}
          onToggleColorPicker={handleToggleColorPicker}
          iframeRef={iframeRef}
          onIframeLoad={handleIframeLoad}
        />
        <ConfigPanel iframeRef={iframeRef} />
      </div>

      <Toast />

      <PickerActionMenu menu={pickerMenu} onAction={handlePickerAction} onClose={() => setPickerMenu(null)} />

      <ProjectModal isOpen={projectModalOpen} onClose={() => setProjectModalOpen(false)} onProjectSelected={handleProjectSelected} />
      <ImageUploadModal isOpen={imageUploadOpen} onClose={() => setImageUploadOpen(false)} />
      <GroupModal isOpen={groupModalOpen} onClose={() => setGroupModalOpen(false)} />
      <DeleteConfirmModal isOpen={deleteModalOpen} onClose={() => setDeleteModalOpen(false)} count={0} onConfirm={() => {}} />
      <PromptModal isOpen={promptModalOpen} onClose={() => setPromptModalOpen(false)} />
      <DesignSystemDrawer isOpen={designDrawerOpen} onClose={() => setDesignDrawerOpen(false)} />
    </>
  );
}
