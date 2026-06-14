import { useCallback, useEffect } from 'react';
import { useAppStore } from '../../lib/state';
import { useWebSocket } from '../useWebSocket';
import { Picker, ColorPickerModule } from '../../lib/picker';
import { api } from '../../lib/api';

/**
 * WebSocket 热更新：服务端 chokidar 监听到当前文件变更时，刷新 iframe。
 * 重载前禁用 picker，避免脏状态泄漏到新 document。
 */
export function useIframeHotReload({ iframeRef }) {
  const projectId = useAppStore((s) => s.getCurrentProjectId());
  const currentPath = useAppStore((s) => s.currentFile?.path || null);
  const currentGroupId = useAppStore((s) => s.currentFile?.groupId ?? null);

  const send = useWebSocket(useCallback(async (data) => {
    const state = useAppStore.getState();
    if (data.type === 'session') {
      state.setRealtimeSession(data);
      return;
    }
    if (data.type === 'presence:list') {
      state.setPresenceUsers(data.users || []);
      return;
    }
    if (data.type === 'files:changed') {
      if (data.actor?.sessionId && data.actor.sessionId === state.session.wsSessionId) return;
      state.scanHtmlFiles({ showResultToast: false });
      state.showToast(`${data.actor?.editorName || '其他用户'} 更新了文件列表`);
      return;
    }
    if (data.type === 'pages:file-saved') {
      if (data.savedBy?.sessionId && data.savedBy.sessionId === state.session.wsSessionId) return;
      const path = data.path || data.fileConfig?.path;
      if (!path || !data.fileConfig) return;
      if (state.currentFile?.path === path && state.dirtyFiles?.[path]) {
        state.showToast(`${data.savedBy?.editorName || '其他用户'} 已保存当前页，请处理后再保存`);
        return;
      }
      state.mergeRemoteFile(data.fileConfig, {
        fileHash: data.fileHash,
        revision: data.revision,
        updatedAt: data.updatedAt,
      });
      return;
    }
    if (data.type === 'pages:groups-saved') {
      if (data.savedBy?.sessionId && data.savedBy.sessionId === state.session.wsSessionId) return;
      if (state.dirtyGroups) {
        state.showToast(`${data.savedBy?.editorName || '其他用户'} 已保存页面分组，请处理后再保存`);
        return;
      }
      state.mergeRemoteGroups(data.pageGroups || [], data.assignments || [], {
        groupsHash: data.groupsHash,
        revision: data.revision,
        updatedAt: data.updatedAt,
      });
      return;
    }
    if (data.type === 'pages:full-saved') {
      if (data.savedBy?.sessionId && data.savedBy.sessionId === state.session.wsSessionId) return;
      const hasDirtyFiles = Object.keys(state.dirtyFiles || {}).length > 0;
      if (hasDirtyFiles || state.dirtyGroups) {
        state.showToast(`${data.savedBy?.editorName || '其他用户'} 已保存项目配置，请处理本地修改后再同步`);
        return;
      }
      const currentPath = state.currentFile?.path || null;
      try {
        const latest = await api.getPages();
        if (latest.error) throw new Error(latest.error);
        state.setPagesConfig(latest);
        await state.scanHtmlFiles({ showResultToast: false });
        if (currentPath) useAppStore.getState().setCurrentFile(currentPath);
        state.showToast(`${data.savedBy?.editorName || '其他用户'} 已保存项目配置，已同步最新版本`);
      } catch {
        state.showToast('项目配置已更新，请手动刷新');
      }
      return;
    }
    if (data.type !== 'html:changed' && data.type !== 'html-changed') return;
    const cf = useAppStore.getState().currentFile;
    const generatedPath = cf?.generatedHtmlPath || null;
    if (!cf) return;
    const dataFile = data.file || '';
    const isCurrentPath = data.path === cf.path || dataFile.includes(cf.path);
    const isCurrentIrPath = generatedPath && (data.path === generatedPath || dataFile.includes(generatedPath));
    if (!isCurrentPath && !isCurrentIrPath) return;
    if (!iframeRef.current) return;
    if (state.isPickerActive) Picker.disable(iframeRef.current);
    if (state.isColorPickerActive) ColorPickerModule.disable(iframeRef.current);
    try {
      iframeRef.current.contentWindow?.location.reload();
    } catch {
      const src = iframeRef.current.getAttribute('src');
      if (src) iframeRef.current.setAttribute('src', src);
    }
  }, [iframeRef]));

  useEffect(() => {
    if (!projectId) return;
    send({
      type: 'presence:update',
      projectId,
      pagePath: currentPath,
      groupId: currentGroupId,
      scope: currentPath ? 'file' : 'project',
    });
  }, [send, projectId, currentPath, currentGroupId]);
}
