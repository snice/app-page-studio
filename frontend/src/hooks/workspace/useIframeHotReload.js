import { useCallback } from 'react';
import { useAppStore } from '../../lib/state';
import { useWebSocket } from '../useWebSocket';
import { Picker, ColorPickerModule } from '../../lib/picker';

/**
 * WebSocket 热更新：服务端 chokidar 监听到当前文件变更时，刷新 iframe。
 * 重载前禁用 picker，避免脏状态泄漏到新 document。
 */
export function useIframeHotReload({ iframeRef }) {
  useWebSocket(useCallback((data) => {
    const cf = useAppStore.getState().currentFile;
    if (!cf || !data.file || !data.file.includes(cf.path)) return;
    if (!iframeRef.current) return;
    const state = useAppStore.getState();
    if (state.isPickerActive) Picker.disable(iframeRef.current);
    if (state.isColorPickerActive) ColorPickerModule.disable(iframeRef.current);
    iframeRef.current.src = iframeRef.current.src;
  }, [iframeRef]));
}
