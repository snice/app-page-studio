import { useRef } from 'react';
import { useAppStore } from '../lib/state';
import { usePsdSliceEvents } from './workspace/usePsdSliceEvents';
import { useIframePicker } from './workspace/useIframePicker';
import { useIframeHotReload } from './workspace/useIframeHotReload';
import { useWorkspaceActions } from './workspace/useWorkspaceActions';

/**
 * 工作台聚合 hook：把 PSD 切图事件、picker、热更新、业务动作组合在一起。
 * 保持原对外 API 不变，让 DashboardPage 等组件无需改动。
 */
export function useWorkspaceController({ requestConfirm } = {}) {
  const pagesConfig = useAppStore((s) => s.pagesConfig);
  const currentFile = useAppStore((s) => s.currentFile);
  const iframeRef = useRef(null);

  usePsdSliceEvents();
  useIframeHotReload({ iframeRef });

  const picker = useIframePicker({ iframeRef });
  const actions = useWorkspaceActions({
    iframeRef,
    setPickerMenu: picker.setPickerMenu,
    requestConfirm,
  });

  return {
    iframeRef,
    currentFile,
    pagesConfig,
    ...picker,
    ...actions,
  };
}
