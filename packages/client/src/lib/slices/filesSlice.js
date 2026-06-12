/**
 * htmlFiles 列表 + 多选 + scanHtmlFiles。
 */
import { api } from '../api';

export function createFilesSlice(set, get) {
  return {
    htmlFiles: [],
    selectedFiles: new Set(),

    setHtmlFiles(files) { set({ htmlFiles: files }); },

    toggleSelectedFile(path) {
      set((s) => {
        const newSet = new Set(s.selectedFiles);
        if (newSet.has(path)) newSet.delete(path); else newSet.add(path);
        return { selectedFiles: newSet };
      });
    },
    clearSelection() { set({ selectedFiles: new Set() }); },

    async scanHtmlFiles({ showResultToast = true, projectId } = {}) {
      const state = get();
      const pid = projectId || state.getCurrentProjectId();
      if (!pid) { state.showToast('请先选择项目'); return; }
      const [htmlData, imageData] = await Promise.all([
        api.scanHtmlFiles(pid),
        api.listDesignImages(pid),
      ]);
      const htmlFiles = (htmlData.files || []).map((f) => ({ ...f, sourceType: 'html' }));
      const imageFiles = (imageData.files || []).map((f) => ({ ...f, sourceType: 'image' }));
      const psdFiles = (htmlData.psdFiles || []).map((f) => ({ ...f, sourceType: 'psd' }));
      const allFiles = [...htmlFiles, ...imageFiles, ...psdFiles];
      state.setHtmlFiles(allFiles);
      state.syncFilesToConfig();
      if (showResultToast) state.showToast(`扫描完成，共 ${allFiles.length} 个文件`);
    },
  };
}
