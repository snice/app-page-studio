import { useEffect } from 'react';
import { useAppStore } from '../../lib/state';
import JSZip from 'jszip';
import {
  flattenLayers, unionBBox, layerMarkTargets, collectDrawableLayers,
  nextSliceColor, exportSlice,
} from '../../lib/psdUtils';

/**
 * 把 PSD 切图操作的 window 事件（合并/单层标记/导出/框选）转成 store 写入。
 * 这些事件来自 PSDCanvas / LayerPanel / SlicesPanel 的 dispatchEvent。
 */
export function usePsdSliceEvents() {
  const showToast = useAppStore((s) => s.showToast);
  const addPsdMarkedSlice = useAppStore((s) => s.addPsdMarkedSlice);
  const clearPsdCheckedLayers = useAppStore((s) => s.clearPsdCheckedLayers);
  const setPsdSelectedSliceId = useAppStore((s) => s.setPsdSelectedSliceId);

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
}
