import React, { useState, useCallback, useEffect } from 'react';
import { HomePage } from './pages/HomePage';
import { DashboardPage } from './pages/DashboardPage';
import { Toast } from './components/common/Toast';
import { DesignSystemDrawer } from './components/modals/DesignSystemDrawer';
import { useAppStore } from './lib/state';
import { api } from './lib/api';

function getDashboardProjectIdFromHash(hash = window.location.hash) {
  const rawHash = hash.startsWith('#') ? hash.slice(1) : hash;
  const [routePath, query = ''] = rawHash.split('?');
  if (routePath !== '/dashboard') return null;
  const pid = Number.parseInt(new URLSearchParams(query).get('pid') || '', 10);
  return Number.isFinite(pid) && pid > 0 ? pid : null;
}

function getCurrentRoute() {
  const projectId = getDashboardProjectIdFromHash();
  return projectId ? { name: 'dashboard', projectId } : { name: 'home', projectId: null };
}

function getDashboardHash(projectId) {
  return `#/dashboard?pid=${encodeURIComponent(projectId)}`;
}

export default function App() {
  const showToast = useAppStore((s) => s.showToast);
  const setCurrentProjectId = useAppStore((s) => s.setCurrentProjectId);
  const getCurrentProjectId = useAppStore((s) => s.getCurrentProjectId);
  const setPagesConfig = useAppStore((s) => s.setPagesConfig);
  const loadConfig = useAppStore((s) => s.loadConfig);
  const scanHtmlFiles = useAppStore((s) => s.scanHtmlFiles);
  const getSessionId = useAppStore((s) => s.getSessionId);
  const getEditorName = useAppStore((s) => s.getEditorName);
  const setEditorName = useAppStore((s) => s.setEditorName);
  const startHeartbeat = useAppStore((s) => s.startHeartbeat);
  const updateSessionStatus = useAppStore((s) => s.updateSessionStatus);
  const modals = useAppStore((s) => s.modals);
  const closeModal = useAppStore((s) => s.closeModal);

  const [view, setView] = useState(() => getCurrentRoute().name === 'dashboard' ? 'workspace' : 'home');
  const [routeProjectId, setRouteProjectId] = useState(() => getCurrentRoute().projectId);
  const [workspaceLoading, setWorkspaceLoading] = useState(false);

  const projects = useAppStore((s) => s.config.projects || []);
  const storeCurrentProjectId = useAppStore((s) => s.config.currentProject);
  const currentProjectId = routeProjectId || storeCurrentProjectId || getCurrentProjectId();

  // ==================== 初始化 ====================
  const loadPages = useCallback(async (projectId = getCurrentProjectId()) => {
    if (!projectId) return;
    const res = await api.getPages();
    setPagesConfig(res);
  }, []);

  const registerSession = useCallback(async (projectId = getCurrentProjectId()) => {
    if (!projectId) return;
    let editorName = getEditorName();
    if (!editorName) {
      try {
        editorName = window.prompt('请输入你的名称（用于协作编辑标识）：', '');
      } catch (e) {
        // 某些沙盒环境（如部分预览/iframe sandbox）不支持 prompt()，跳过协作会话注册
        console.warn('prompt() unsupported, skip session register:', e?.message);
        return;
      }
      if (!editorName) return;
      setEditorName(editorName);
    }
    const sessionId = getSessionId();
    const res = await api.registerSession(projectId, sessionId, editorName);
    if (res.isCurrentEditor === false) {
      let take = false;
      try {
        take = window.confirm(`"${res.currentEditor}" 正在编辑此项目。是否接管编辑权？`);
      } catch (e) {
        console.warn('confirm() unsupported, default to not take editor:', e?.message);
      }
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

  /** 路由切换时重置工作台的全局状态（纯 store 层，iframe/picker 由工作台自身的副作用响应） */
  const resetWorkspaceUi = useCallback(() => {
    const state = useAppStore.getState();
    if (state.isPickerActive) state.setIsPickerActive(false);
    if (state.isColorPickerActive) state.setIsColorPickerActive(false);
    if (state.isImageRegionSelecting) state.setIsImageRegionSelecting(false);
    state.clearSelection();
    state.resetPsdState();
    state.setCurrentFile(null);
    state.setZoom(100);
    state.setFileFilter({ searchText: '', devStatus: 'all' });
    useAppStore.setState({ modals: {} });
  }, []);

  const showHome = useCallback(async ({ updateUrl = true } = {}) => {
    const state = useAppStore.getState();
    const projectId = state.getCurrentProjectId();
    const sessionId = state.session.sessionId;
    state.stopHeartbeat();

    resetWorkspaceUi();
    setRouteProjectId(null);
    setView('home');
    if (updateUrl) {
      window.history.pushState(null, '', '/');
    }
    await loadConfig();

    if (projectId && sessionId) {
      api.releaseSession(projectId, sessionId).catch((e) => {
        console.warn('release session failed:', e);
      });
    }
  }, [loadConfig, resetWorkspaceUi]);

  const loadProjectWorkspace = useCallback(async (projectOrId) => {
    const rawProjectId = typeof projectOrId === 'object' ? projectOrId?.id : projectOrId;
    const projectId = Number.parseInt(rawProjectId, 10);
    if (!Number.isFinite(projectId) || projectId <= 0) return;

    setWorkspaceLoading(true);
    setRouteProjectId(projectId);
    setCurrentProjectId(projectId);
    resetWorkspaceUi();
    setView('workspace');

    try {
      const nextProjects = await loadConfig();
      if (!nextProjects.some((project) => project.id === projectId)) {
        showToast('项目不存在');
        showHome();
        return;
      }
      await loadPages(projectId);
      await scanHtmlFiles({ showResultToast: false, projectId });
      await registerSession(projectId);
    } catch (e) {
      console.error('loadProjectWorkspace error:', e);
      showToast('打开项目失败: ' + (e.message || '未知错误'));
      showHome();
    } finally {
      setWorkspaceLoading(false);
    }
  }, [loadConfig, loadPages, registerSession, resetWorkspaceUi, scanHtmlFiles, setCurrentProjectId, showHome, showToast]);

  const openProjectWorkspace = useCallback((projectOrId) => {
    const rawProjectId = typeof projectOrId === 'object' ? projectOrId?.id : projectOrId;
    const projectId = Number.parseInt(rawProjectId, 10);
    if (!Number.isFinite(projectId) || projectId <= 0) return;
    const nextHash = getDashboardHash(projectId);
    if (window.location.hash === nextHash) {
      loadProjectWorkspace(projectId);
      return;
    }
    window.location.hash = `/dashboard?pid=${projectId}`;
  }, [loadProjectWorkspace]);

  const handleGoHome = useCallback(() => {
    showHome();
  }, [showHome]);

  useEffect(() => {
    const syncRoute = () => {
      const route = getCurrentRoute();
      if (route.name === 'dashboard') {
        loadProjectWorkspace(route.projectId);
      } else {
        showHome({ updateUrl: false });
      }
    };

    syncRoute();
    window.addEventListener('hashchange', syncRoute);
    window.addEventListener('popstate', syncRoute);
    return () => {
      window.removeEventListener('hashchange', syncRoute);
      window.removeEventListener('popstate', syncRoute);
    };
  }, [loadProjectWorkspace, showHome]);

  return (
    <>
      {view === 'home' ? (
        <HomePage
          projects={projects}
          currentProjectId={currentProjectId}
          isLoading={workspaceLoading}
          onOpenProject={openProjectWorkspace}
        />
      ) : (
        <DashboardPage
          workspaceLoading={workspaceLoading}
          onGoHome={handleGoHome}
          onSwitchProject={openProjectWorkspace}
        />
      )}

      <Toast />

      {/* 设计系统抽屉：首页与工作台共用，挂在顶层 */}
      <DesignSystemDrawer isOpen={!!modals.designSystem} onClose={() => closeModal('designSystem')} />
    </>
  );
}
