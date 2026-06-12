/**
 * PSD 切图状态：模式、图层、选中、已标记切片。
 */
export function createPsdSlice(set, get) {
  const canEditPages = () => get().session?.isCurrentEditor !== false;

  return {
    psdMode: 'preview', // 'preview' | 'layers'
    psdData: null,
    psdLoading: false,
    psdSelectedLayer: null,
    psdHiddenLayerIds: new Set(),
    psdCheckedLayerIds: new Set(),
    psdMarkedSlices: [],
    psdSelectedSliceId: null,
    psdShowSlices: true,

    setPsdMode(mode) { set({ psdMode: mode }); },
    setPsdData(data) { set({ psdData: data }); },
    setPsdLoading(v) { set({ psdLoading: v }); },
    setPsdSelectedLayer(layer) { set({ psdSelectedLayer: layer, psdSelectedSliceId: null }); },
    setPsdHiddenLayerIds(ids) { set({ psdHiddenLayerIds: ids }); },
    togglePsdHiddenLayer(id) {
      set((s) => {
        const n = new Set(s.psdHiddenLayerIds);
        n.has(id) ? n.delete(id) : n.add(id);
        return { psdHiddenLayerIds: n };
      });
    },
    setPsdCheckedLayerIds(ids) { set({ psdCheckedLayerIds: ids }); },
    togglePsdCheckedLayer(id, checked) {
      set((s) => {
        const n = new Set(s.psdCheckedLayerIds);
        checked ? n.add(id) : n.delete(id);
        return { psdCheckedLayerIds: n };
      });
    },
    clearPsdCheckedLayers() { set({ psdCheckedLayerIds: new Set() }); },
    setPsdMarkedSlices(slices) { set({ psdMarkedSlices: slices }); },
    addPsdMarkedSlice(slice) {
      if (!canEditPages()) return;
      set((s) => ({
        psdMarkedSlices: [...s.psdMarkedSlices, slice],
        ...(s.currentFile?.sourceType === 'psd' ? {
          dirtyFiles: { ...s.dirtyFiles, [s.currentFile.path]: true },
        } : {}),
      }));
    },
    removePsdMarkedSlice(id) {
      if (!canEditPages()) return;
      set((s) => ({
        psdMarkedSlices: s.psdMarkedSlices.filter(x => x.id !== id),
        psdSelectedSliceId: s.psdSelectedSliceId === id ? null : s.psdSelectedSliceId,
        ...(s.currentFile?.sourceType === 'psd' ? {
          dirtyFiles: { ...s.dirtyFiles, [s.currentFile.path]: true },
        } : {}),
      }));
    },
    updatePsdMarkedSlice(id, updates) {
      if (!canEditPages()) return;
      set((s) => ({
        psdMarkedSlices: s.psdMarkedSlices.map(x => x.id === id ? { ...x, ...updates } : x),
        ...(s.currentFile?.sourceType === 'psd' ? {
          dirtyFiles: { ...s.dirtyFiles, [s.currentFile.path]: true },
        } : {}),
      }));
    },
    setPsdSelectedSliceId(id) { set({ psdSelectedSliceId: id, psdSelectedLayer: null }); },
    setPsdShowSlices(v) { set({ psdShowSlices: v }); },
    resetPsdState() {
      set({
        psdMode: 'preview',
        psdData: null,
        psdLoading: false,
        psdSelectedLayer: null,
        psdHiddenLayerIds: new Set(),
        psdCheckedLayerIds: new Set(),
        psdMarkedSlices: [],
        psdSelectedSliceId: null,
        psdShowSlices: true,
      });
    },
  };
}
