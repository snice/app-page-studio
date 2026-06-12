import React, { useState, useCallback, useEffect, useRef, lazy, Suspense } from 'react';
import { Routes, Route, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { LoginPage } from './pages/LoginPage';
import { Toast } from './components/common/Toast';
import { Icon } from './components/common/Icon';
import { DesignSystemDrawer } from './components/modals/DesignSystemDrawer';
import { ConfirmModal } from './components/modals/ConfirmModal';
import { EditorNameModal } from './components/modals/EditorNameModal';
import { UserManagementModal } from './components/modals/UserManagementModal';
import { useAppStore } from './lib/state';
import { api } from './lib/api';

const HomePage = lazy(() => import('./pages/HomePage').then((m) => ({ default: m.HomePage })));
const DashboardPage = lazy(() => import('./pages/DashboardPage').then((m) => ({ default: m.DashboardPage })));

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
  const stopHeartbeat = useAppStore((s) => s.stopHeartbeat);
  const updateSessionStatus = useAppStore((s) => s.updateSessionStatus);
  const modals = useAppStore((s) => s.modals);
  const closeModal = useAppStore((s) => s.closeModal);

  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const routeProjectId = (() => {
    if (location.pathname !== '/dashboard') return null;
    const pid = Number.parseInt(searchParams.get('pid') || '', 10);
    return Number.isFinite(pid) && pid > 0 ? pid : null;
  })();
  const view = location.pathname === '/dashboard' ? 'workspace' : 'home';

  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [editorNameRequest, setEditorNameRequest] = useState(null);
  const [confirmRequest, setConfirmRequest] = useState(null);
  const [authState, setAuthState] = useState({ status: 'loading', user: null });
  const [userManagementOpen, setUserManagementOpen] = useState(false);

  const projects = useAppStore((s) => s.config.projects || []);
  const storeCurrentProjectId = useAppStore((s) => s.config.currentProject);
  const currentProjectId = routeProjectId || storeCurrentProjectId || getCurrentProjectId();

  const requestEditorName = useCallback((options = {}) => new Promise((resolve) => {
    setEditorNameRequest({ ...options, resolve });
  }), []);

  const resolveEditorNameRequest = useCallback((value) => {
    setEditorNameRequest((request) => {
      request?.resolve(value);
      return null;
    });
  }, []);

  const requestConfirm = useCallback((options = {}) => new Promise((resolve) => {
    setConfirmRequest({ ...options, resolve });
  }), []);

  const resolveConfirmRequest = useCallback((value) => {
    setConfirmRequest((request) => {
      request?.resolve(value);
      return null;
    });
  }, []);

  // ==================== 初始化 ====================
  const loadPages = useCallback(async (projectId = getCurrentProjectId()) => {
    if (!projectId) return;
    const res = await api.getPages();
    setPagesConfig(res);
  }, []);

  const registerSession = useCallback(async (projectId = getCurrentProjectId()) => {
    if (!projectId) return;
    // 编辑者身份直接取登录用户名（服务端也以 session 中的用户名为准）
    const editorName = authState.user?.username || '';
    if (editorName && getEditorName() !== editorName) setEditorName(editorName);
    const sessionId = getSessionId();
    const res = await api.registerSession(projectId, sessionId, editorName);
    if (res.isCurrentEditor === false) {
      const take = await requestConfirm({
        title: '接管编辑权',
        message: <>“<b>{res.currentEditor}</b>” 正在编辑此项目。是否接管编辑权？</>,
        hint: '接管后对方会变为只读状态。',
        confirmText: '接管编辑',
      });
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
  }, [authState.user, getCurrentProjectId, getEditorName, getSessionId, requestConfirm, setEditorName, startHeartbeat, updateSessionStatus]);

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

  const releaseCurrentSession = useCallback(async () => {
    const state = useAppStore.getState();
    const projectId = state.getCurrentProjectId();
    const sessionId = state.session.sessionId;
    state.stopHeartbeat();
    resetWorkspaceUi();
    await loadConfig();
    if (projectId && sessionId) {
      api.releaseSession(projectId, sessionId).catch((e) => {
        console.warn('release session failed:', e);
      });
    }
  }, [loadConfig, resetWorkspaceUi]);

  const loadProjectWorkspace = useCallback(async (projectId) => {
    setWorkspaceLoading(true);
    setCurrentProjectId(projectId);
    resetWorkspaceUi();

    try {
      const nextProjects = await loadConfig();
      if (!nextProjects.some((project) => project.id === projectId)) {
        showToast('项目不存在');
        navigate('/', { replace: true });
        return;
      }
      await loadPages(projectId);
      await scanHtmlFiles({ showResultToast: false, projectId });
      await registerSession(projectId);
    } catch (e) {
      console.error('loadProjectWorkspace error:', e);
      showToast('打开项目失败: ' + (e.message || '未知错误'));
      navigate('/', { replace: true });
    } finally {
      setWorkspaceLoading(false);
    }
  }, [loadConfig, loadPages, navigate, registerSession, resetWorkspaceUi, scanHtmlFiles, setCurrentProjectId, showToast]);

  const openProjectWorkspace = useCallback((projectOrId) => {
    const rawProjectId = typeof projectOrId === 'object' ? projectOrId?.id : projectOrId;
    const projectId = Number.parseInt(rawProjectId, 10);
    if (!Number.isFinite(projectId) || projectId <= 0) return;
    navigate(`/dashboard?pid=${projectId}`);
  }, [navigate]);

  const handleGoHome = useCallback(() => {
    navigate('/');
  }, [navigate]);

  // 鉴权初始化：从 /api/auth/me 读取登录态
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await api.getMe();
      if (cancelled) return;
      if (res && res.user) setAuthState({ status: 'authed', user: res.user });
      else setAuthState({ status: 'anon', user: null });
    })();
    return () => { cancelled = true; };
  }, []);

  const handleLoggedIn = useCallback((user) => {
    setAuthState({ status: 'authed', user });
  }, []);

  const handleLogout = useCallback(async () => {
    stopHeartbeat();
    await api.logout().catch(() => {});
    navigate('/', { replace: true });
    setAuthState({ status: 'anon', user: null });
  }, [navigate, stopHeartbeat]);

  useEffect(() => {
    const handleExpired = () => {
      stopHeartbeat();
      setUserManagementOpen(false);
      setAuthState({ status: 'anon', user: null });
      navigate('/', { replace: true });
    };
    window.addEventListener('aps-auth-expired', handleExpired);
    return () => window.removeEventListener('aps-auth-expired', handleExpired);
  }, [navigate, stopHeartbeat]);

  // 路由驱动副作用：进入 /dashboard 时加载项目，回到首页时释放会话
  // 仅在已登录后启用
  const lastLoadedProjectIdRef = useRef(null);
  useEffect(() => {
    if (authState.status !== 'authed') return;
    if (view === 'workspace' && routeProjectId) {
      if (lastLoadedProjectIdRef.current !== routeProjectId) {
        lastLoadedProjectIdRef.current = routeProjectId;
        loadProjectWorkspace(routeProjectId);
      }
    } else if (view === 'home') {
      if (lastLoadedProjectIdRef.current !== null) {
        lastLoadedProjectIdRef.current = null;
        releaseCurrentSession();
      } else {
        loadConfig();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, routeProjectId, authState.status]);

  if (authState.status === 'loading') {
    return <div style={{ padding: 48, textAlign: 'center', color: '#888' }}>加载中…</div>;
  }
  if (authState.status === 'anon') {
    return <LoginPage onLoggedIn={handleLoggedIn} />;
  }

  return (
    <>
      <Suspense fallback={<div style={{ padding: 48, textAlign: 'center', color: '#888' }}>加载中...</div>}>
        <Routes>
          <Route
            path="/"
            element={
              <HomePage
                projects={projects}
                currentProjectId={currentProjectId}
                isLoading={workspaceLoading}
                onOpenProject={openProjectWorkspace}
              />
            }
          />
          <Route
            path="/dashboard"
            element={
              <DashboardPage
                workspaceLoading={workspaceLoading}
                onGoHome={handleGoHome}
                onSwitchProject={openProjectWorkspace}
                onRequestEditorName={requestEditorName}
                onRequestConfirm={requestConfirm}
              />
            }
          />
          <Route
            path="*"
            element={
              <HomePage
                projects={projects}
                currentProjectId={currentProjectId}
                isLoading={workspaceLoading}
                onOpenProject={openProjectWorkspace}
              />
            }
          />
        </Routes>
      </Suspense>

      <div className="app-user-bar">
        <span title={`role: ${authState.user?.role}`}>
          <Icon name="user" size="sm" />
          {authState.user?.username}
        </span>
        {authState.user?.role === 'admin' && (
          <button
            className="btn btn-secondary"
            type="button"
            title="用户管理"
            onClick={() => setUserManagementOpen(true)}
          >
            <Icon name="users" size="sm" />
          </button>
        )}
        <button className="btn btn-secondary" type="button" title="退出" onClick={handleLogout}>
          <Icon name="logOut" size="sm" />
        </button>
      </div>
      <Toast />

      {/* 设计系统抽屉：首页与工作台共用，挂在顶层 */}
      <DesignSystemDrawer isOpen={!!modals.designSystem} onClose={() => closeModal('designSystem')} />
      <EditorNameModal
        isOpen={!!editorNameRequest}
        title={editorNameRequest?.title || '协作编辑标识'}
        message={editorNameRequest?.message}
        initialValue={getEditorName() || ''}
        onClose={() => resolveEditorNameRequest(null)}
        onSubmit={(name) => resolveEditorNameRequest(name)}
      />
      <ConfirmModal
        isOpen={!!confirmRequest}
        title={confirmRequest?.title}
        message={confirmRequest?.message}
        hint={confirmRequest?.hint}
        confirmText={confirmRequest?.confirmText}
        cancelText={confirmRequest?.cancelText}
        danger={confirmRequest?.danger}
        onClose={() => resolveConfirmRequest(false)}
        onConfirm={() => resolveConfirmRequest(true)}
      />
      <UserManagementModal
        isOpen={userManagementOpen}
        onClose={() => setUserManagementOpen(false)}
        currentUser={authState.user}
      />
    </>
  );
}
