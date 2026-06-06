import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { flattenLayers } from '../../lib/psdUtils';

/**
 * PSD 预览画布组件
 * 渲染 PSD 合成图，支持图层选中高亮、切图标记叠加、缩放平移
 */
export function PSDCanvas({
  psdData,
  selectedLayer,
  slices = [],
  selectedSlice = null,
  showSlices = true,
  hiddenLayerIds = new Set(),
  onSelectLayer,
  onClickSlice,
  cropMode = false,
  onCropDone,
}) {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const compositeRef = useRef(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragging = useRef(false);
  const didDrag = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });
  const cropStart = useRef(null);
  const [cropRect, setCropRect] = useState(null);

  // 收集所有叶子图层用于 hit-test
  const leafLayers = useMemo(() => {
    const all = flattenLayers(psdData.layers);
    return all.filter(l => l.canvas && l.width > 0 && l.height > 0 && !l.children?.length).reverse();
  }, [psdData]);

  // 像素级 hit-test
  const hitTestLayer = useCallback((docX, docY) => {
    for (const l of leafLayers) {
      if (hiddenLayerIds.has(l.id) || !l.visible) continue;
      const lx = docX - l.left;
      const ly = docY - l.top;
      if (lx < 0 || ly < 0 || lx >= l.width || ly >= l.height) continue;
      try {
        const px = Math.floor(lx);
        const py = Math.floor(ly);
        const d = l.canvas.getContext('2d').getImageData(px, py, 1, 1).data;
        if (d[3] > 10) return l;
      } catch { continue; }
    }
    return null;
  }, [leafLayers, hiddenLayerIds]);

  // 屏幕坐标转文档坐标
  const screenToDoc = useCallback((clientX, clientY) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return {
      x: (clientX - rect.left - offset.x) / scale,
      y: (clientY - rect.top - offset.y) / scale,
    };
  }, [offset, scale]);

  // 有隐藏图层时重新合成
  useEffect(() => {
    if (hiddenLayerIds.size === 0) {
      compositeRef.current = null;
      return;
    }

    function compositeGroup(layers, w, h) {
      const cvs = document.createElement('canvas');
      cvs.width = w;
      cvs.height = h;
      const ctx = cvs.getContext('2d');
      for (const layer of layers) {
        if (!layer.visible || hiddenLayerIds.has(layer.id)) continue;
        if (layer.children) {
          const groupCvs = compositeGroup(layer.children, w, h);
          ctx.globalAlpha = layer.opacity;
          ctx.drawImage(groupCvs, 0, 0);
          ctx.globalAlpha = 1;
        } else if (layer.canvas) {
          ctx.globalAlpha = layer.opacity;
          ctx.drawImage(layer.canvas, layer.left, layer.top);
          ctx.globalAlpha = 1;
        }
      }
      return cvs;
    }

    const tmp = document.createElement('canvas');
    tmp.width = psdData.width;
    tmp.height = psdData.height;
    const ctx = tmp.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, psdData.width, psdData.height);
    const layerResult = compositeGroup(psdData.layers, psdData.width, psdData.height);
    ctx.drawImage(layerResult, 0, 0);
    compositeRef.current = tmp;
  }, [psdData, hiddenLayerIds]);

  // 初始缩放适配
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const fitScale = Math.min((el.clientWidth - 20) / psdData.width, (el.clientHeight - 20) / psdData.height, 1);
    setScale(fitScale);
    setOffset({
      x: (el.clientWidth - psdData.width * fitScale) / 2,
      y: (el.clientHeight - psdData.height * fitScale) / 2,
    });
  }, [psdData]);

  // 渲染画布
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 棋盘格背景
    const tile = 12;
    for (let x = 0; x < canvas.width; x += tile)
      for (let y = 0; y < canvas.height; y += tile) {
        ctx.fillStyle = (Math.floor(x / tile) + Math.floor(y / tile)) % 2 === 0 ? '#2a2a3e' : '#22222e';
        ctx.fillRect(x, y, tile, tile);
      }

    ctx.save();
    ctx.translate(offset.x, offset.y);
    ctx.scale(scale, scale);

    // 绘制 PSD 合成图
    ctx.drawImage(compositeRef.current ?? psdData.canvas, 0, 0);

    // 选中图层高亮
    if (selectedLayer && selectedLayer.width > 0 && selectedLayer.height > 0) {
      ctx.strokeStyle = '#4fc3f7';
      ctx.lineWidth = 2 / scale;
      ctx.setLineDash([6 / scale, 3 / scale]);
      ctx.strokeRect(selectedLayer.left, selectedLayer.top, selectedLayer.width, selectedLayer.height);
      ctx.setLineDash([]);
    }

    // 切图标记叠加
    if (showSlices) {
      for (const slice of slices) {
        const isActive = selectedSlice?.id === slice.id;

        ctx.fillStyle = slice.color + (isActive ? '44' : '18');
        ctx.fillRect(slice.left, slice.top, slice.width, slice.height);

        ctx.strokeStyle = slice.color;
        ctx.lineWidth = (isActive ? 2.5 : 1.5) / scale;
        ctx.setLineDash([]);
        if (isActive) { ctx.shadowColor = slice.color; ctx.shadowBlur = 8 / scale; }
        ctx.strokeRect(slice.left, slice.top, slice.width, slice.height);
        ctx.shadowBlur = 0;

        // 名称标签
        const fontSize = Math.max(11 / scale, 7);
        ctx.font = `bold ${fontSize}px sans-serif`;
        const labelW = ctx.measureText(slice.name).width + 8 / scale;
        const labelH = fontSize + 4 / scale;
        ctx.fillStyle = isActive ? slice.color + 'ee' : slice.color + '99';
        ctx.fillRect(slice.left, slice.top, labelW, labelH + 2 / scale);
        ctx.fillStyle = '#fff';
        ctx.fillText(slice.name, slice.left + 4 / scale, slice.top + fontSize + 1 / scale);

        // 激活时显示尺寸
        if (isActive) {
          const sizeText = `${slice.width} x ${slice.height}`;
          ctx.font = `${fontSize * 0.9}px monospace`;
          const sw = ctx.measureText(sizeText).width;
          ctx.fillStyle = slice.color + 'cc';
          ctx.fillRect(slice.left + slice.width - sw - 8 / scale, slice.top + slice.height - labelH - 2 / scale, sw + 8 / scale, labelH + 2 / scale);
          ctx.fillStyle = '#fff';
          ctx.fillText(sizeText, slice.left + slice.width - sw - 4 / scale, slice.top + slice.height - 3 / scale);
        }
      }
    }

    // 框选裁剪矩形绘制
    if (cropRect) {
      const left = Math.min(cropRect.x1, cropRect.x2);
      const top = Math.min(cropRect.y1, cropRect.y2);
      const w = Math.abs(cropRect.x2 - cropRect.x1);
      const h = Math.abs(cropRect.y2 - cropRect.y1);
      ctx.fillStyle = 'rgba(14, 165, 233, 0.12)';
      ctx.fillRect(left, top, w, h);
      ctx.strokeStyle = '#0ea5e9';
      ctx.lineWidth = 2 / scale;
      ctx.setLineDash([6 / scale, 4 / scale]);
      ctx.strokeRect(left, top, w, h);
      ctx.setLineDash([]);
      // 尺寸标签
      const fontSize = Math.max(11 / scale, 7);
      ctx.font = `${fontSize}px monospace`;
      const sizeText = `${Math.round(w)} × ${Math.round(h)}`;
      const sw = ctx.measureText(sizeText).width;
      ctx.fillStyle = 'rgba(14, 165, 233, 0.85)';
      ctx.fillRect(left + w - sw - 10 / scale, top + h + 2 / scale, sw + 10 / scale, fontSize + 6 / scale);
      ctx.fillStyle = '#fff';
      ctx.fillText(sizeText, left + w - sw - 5 / scale, top + h + fontSize + 1 / scale);
    }

    ctx.restore();
  }, [psdData, selectedLayer, slices, selectedSlice, showSlices, hiddenLayerIds, scale, offset, cropRect]);

  // 滚轮缩放（必须用原生 addEventListener 设置 passive: false）
  const onWheel = useCallback((e) => {
    e.preventDefault();
    setScale(s => Math.min(Math.max(s * (e.deltaY < 0 ? 1.1 : 0.9), 0.05), 8));
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, [onWheel]);

  const onMouseDown = (e) => {
    if (cropMode) {
      const doc = screenToDoc(e.clientX, e.clientY);
      cropStart.current = doc;
      setCropRect({ x1: doc.x, y1: doc.y, x2: doc.x, y2: doc.y });
      return;
    }
    dragging.current = true;
    didDrag.current = false;
    lastPos.current = { x: e.clientX, y: e.clientY };
  };

  const onMouseMove = (e) => {
    if (cropMode && cropStart.current) {
      const doc = screenToDoc(e.clientX, e.clientY);
      setCropRect(prev => prev ? { ...prev, x2: doc.x, y2: doc.y } : null);
      return;
    }
    if (!dragging.current) return;
    const dx = e.clientX - lastPos.current.x;
    const dy = e.clientY - lastPos.current.y;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) didDrag.current = true;
    setOffset(o => ({ x: o.x + dx, y: o.y + dy }));
    lastPos.current = { x: e.clientX, y: e.clientY };
  };

  const onMouseUp = (e) => {
    if (cropMode && cropRect) {
      cropStart.current = null;
      const left = Math.round(Math.max(0, Math.min(cropRect.x1, cropRect.x2)));
      const top = Math.round(Math.max(0, Math.min(cropRect.y1, cropRect.y2)));
      const right = Math.round(Math.min(psdData.width, Math.max(cropRect.x1, cropRect.x2)));
      const bottom = Math.round(Math.min(psdData.height, Math.max(cropRect.y1, cropRect.y2)));
      const w = right - left;
      const h = bottom - top;
      setCropRect(null);
      if (w > 2 && h > 2) {
        onCropDone?.({ left, top, width: w, height: h });
      }
      return;
    }
    if (cropMode) {
      cropStart.current = null;
      setCropRect(null);
      return;
    }
    dragging.current = false;
    if (!didDrag.current) {
      const doc = screenToDoc(e.clientX, e.clientY);
      // 优先检测切图标记点击
      if (showSlices) {
        for (let i = slices.length - 1; i >= 0; i--) {
          const s = slices[i];
          if (doc.x >= s.left && doc.x <= s.left + s.width && doc.y >= s.top && doc.y <= s.top + s.height) {
            onClickSlice?.(s.id);
            return;
          }
        }
      }
      // 否则选中图层
      const layer = hitTestLayer(doc.x, doc.y);
      onSelectLayer?.(layer);
    }
  };

  return (
    <div ref={containerRef} className="psd-canvas-container">
      <canvas
        ref={canvasRef}
        className={`psd-canvas ${cropMode ? 'is-crop-mode' : ''}`}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={() => { dragging.current = false; cropStart.current = null; if (cropMode) setCropRect(null); }}
      />
      <div className="psd-canvas-zoom">{Math.round(scale * 100)}%</div>
      {selectedSlice && (
        <div className="psd-canvas-info">
          <span className="psd-canvas-info-dot" style={{ background: selectedSlice.color }} />
          <span>{selectedSlice.name}</span>
          <span className="psd-canvas-info-size">{selectedSlice.width} x {selectedSlice.height}</span>
        </div>
      )}
    </div>
  );
}
