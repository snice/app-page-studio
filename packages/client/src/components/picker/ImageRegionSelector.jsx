import { useRef, useState, useCallback, useEffect } from 'react';
import { Icon } from '../common/Icon';
import { useAppStore } from '../../lib/state';

// ==================== 工具函数 ====================

function getImageLayout(img) {
  if (!img) return null;
  const rect = img.getBoundingClientRect();
  const imageW = img.naturalWidth || rect.width;
  const imageH = img.naturalHeight || rect.height;
  if (!imageW || !imageH) return null;
  const scale = Math.min(rect.width / imageW, rect.height / imageH);
  const drawW = imageW * scale;
  const drawH = imageH * scale;
  const offsetX = (rect.width - drawW) / 2;
  const offsetY = (rect.height - drawH) / 2;
  return { rect, imageW, imageH, scale, drawW, drawH, offsetX, offsetY };
}

function getClampedPoint(layout, clientX, clientY) {
  const localX = clientX - layout.rect.left;
  const localY = clientY - layout.rect.top;
  const clampX = Math.max(layout.offsetX, Math.min(localX, layout.offsetX + layout.drawW));
  const clampY = Math.max(layout.offsetY, Math.min(localY, layout.offsetY + layout.drawH));
  return { screenX: clampX, screenY: clampY };
}

function constrainSquarePoint(layout, start, end) {
  const dx = end.screenX - start.screenX;
  const dy = end.screenY - start.screenY;
  const dirX = dx < 0 ? -1 : 1;
  const dirY = dy < 0 ? -1 : 1;
  const maxX = dirX > 0
    ? layout.offsetX + layout.drawW - start.screenX
    : start.screenX - layout.offsetX;
  const maxY = dirY > 0
    ? layout.offsetY + layout.drawH - start.screenY
    : start.screenY - layout.offsetY;
  const side = Math.min(Math.max(Math.abs(dx), Math.abs(dy)), maxX, maxY);
  return {
    screenX: start.screenX + dirX * side,
    screenY: start.screenY + dirY * side,
  };
}

function buildRegionFromPoints(layout, start, end, deviceW, deviceH, options = {}) {
  const effectiveEnd = options.square ? constrainSquarePoint(layout, start, end) : end;
  const x1 = Math.min(start.screenX, effectiveEnd.screenX);
  const y1 = Math.min(start.screenY, effectiveEnd.screenY);
  const x2 = Math.max(start.screenX, effectiveEnd.screenX);
  const y2 = Math.max(start.screenY, effectiveEnd.screenY);
  const width = x2 - x1;
  const height = y2 - y1;
  if (width < 2 || height < 2) return null;

  const imgX = Math.round((x1 - layout.offsetX) / layout.scale);
  const imgY = Math.round((y1 - layout.offsetY) / layout.scale);
  const imgW = Math.round(width / layout.scale);
  const imgH = Math.round(height / layout.scale);

  const devX = Math.round(imgX * deviceW / layout.imageW);
  const devY = Math.round(imgY * deviceH / layout.imageH);
  const devW = Math.round(imgW * deviceW / layout.imageW);
  const devH = Math.round(imgH * deviceH / layout.imageH);

  return {
    device: { x: devX, y: devY, width: devW, height: devH, unit: 'px', base: { width: deviceW, height: deviceH } },
    image: { x: imgX, y: imgY, width: imgW, height: imgH, unit: 'px', base: { width: layout.imageW, height: layout.imageH } },
  };
}

function applyRegionBoxStyle(region, layout) {
  if (!region || !region.image) return {};
  const imgR = region.image;
  return {
    left: imgR.x * layout.scale + layout.offsetX,
    top: imgR.y * layout.scale + layout.offsetY,
    width: imgR.width * layout.scale,
    height: imgR.height * layout.scale,
  };
}

// ==================== 获取已有区域 ====================

function getImageRegions(currentFile) {
  const regions = [];
  const interactions = currentFile?.interactions || [];
  interactions.forEach((item, index) => {
    if (item.region) regions.push({ type: 'interaction', index, region: item.region });
  });
  const functions = currentFile?.functionDescriptions || [];
  functions.forEach((item, index) => {
    if (item.region) regions.push({ type: 'function', index, region: item.region });
  });
  const images = currentFile?.imageReplacements || [];
  images.forEach((item, index) => {
    if (item.region) regions.push({ type: 'image', index, region: item.region });
  });
  return regions;
}

// ==================== 组件 ====================

/**
 * 图片区域选择器
 * 直接在 img 元素上绑定鼠标事件（参照 app.js setupImageRegionPicker）
 * 选择矩形和区域覆盖层渲染在 img 的父容器（phone-screen）内
 */
export function ImageRegionSelector({
  imgRef,
  deviceWidth,
  deviceHeight,
  onRegionAction,
  onRegionSelected,
  overlayRegions = null,
  squareSelection = false,
}) {
  const currentFile = useAppStore((s) => s.currentFile);
  const isImageRegionSelecting = useAppStore((s) => s.isImageRegionSelecting);

  const [selectionRect, setSelectionRect] = useState(null);
  const [pendingRegion, setPendingRegion] = useState(null);
  const [, setRenderTick] = useState(0);

  const dragRef = useRef(null);
  const selectionRef = useRef(null);

  // ==================== 绑定鼠标事件到 img ====================

  useEffect(() => {
    const img = imgRef?.current;
    if (!img || !isImageRegionSelecting) return;

    const onMouseDown = (e) => {
      e.preventDefault();
      const layout = getImageLayout(img);
      if (!layout) return;
      const start = getClampedPoint(layout, e.clientX, e.clientY);
      selectionRef.current = { layout, start, end: start };
      setSelectionRect({ left: start.screenX, top: start.screenY, width: 0, height: 0 });
      setPendingRegion(null);
    };

    const onDragStart = (e) => e.preventDefault();

    img.addEventListener('mousedown', onMouseDown);
    img.addEventListener('dragstart', onDragStart);
    return () => {
      img.removeEventListener('mousedown', onMouseDown);
      img.removeEventListener('dragstart', onDragStart);
    };
  }, [isImageRegionSelecting, imgRef]);

  // document 级别的 mousemove / mouseup
  useEffect(() => {
    const onMouseMove = (e) => {
      // 框选
      if (selectionRef.current) {
        const sel = selectionRef.current;
        const rawEnd = getClampedPoint(sel.layout, e.clientX, e.clientY);
        const end = squareSelection ? constrainSquarePoint(sel.layout, sel.start, rawEnd) : rawEnd;
        sel.end = end;
        setSelectionRect({
          left: Math.min(sel.start.screenX, end.screenX),
          top: Math.min(sel.start.screenY, end.screenY),
          width: Math.abs(end.screenX - sel.start.screenX),
          height: Math.abs(end.screenY - sel.start.screenY),
        });
        return;
      }
      // 拖拽已有区域
      if (dragRef.current) {
        const ds = dragRef.current;
        const { regionInfo, mode, handle, layout, startClient, startRegion } = ds;
        const region = regionInfo.region;
        if (!region || !region.image) return;

        const dx = (e.clientX - startClient.x) / layout.scale;
        const dy = (e.clientY - startClient.y) / layout.scale;
        let x = startRegion.x, y = startRegion.y, w = startRegion.width, h = startRegion.height;
        const minSize = 4;

        if (mode === 'move') { x += dx; y += dy; }
        else if (mode === 'resize') {
          if (squareSelection) {
            const startSide = Math.max(startRegion.width, startRegion.height);
            const anchorRight = startRegion.x + startSide;
            const anchorBottom = startRegion.y + startSide;
            let side = startSide;
            let maxSide = startSide;

            if (handle === 'se') {
              side = startSide + Math.max(dx, dy);
              maxSide = Math.min(layout.imageW - startRegion.x, layout.imageH - startRegion.y);
              x = startRegion.x;
              y = startRegion.y;
            } else if (handle === 'sw') {
              side = startSide + Math.max(-dx, dy);
              maxSide = Math.min(anchorRight, layout.imageH - startRegion.y);
              x = anchorRight - side;
              y = startRegion.y;
            } else if (handle === 'ne') {
              side = startSide + Math.max(dx, -dy);
              maxSide = Math.min(layout.imageW - startRegion.x, anchorBottom);
              x = startRegion.x;
              y = anchorBottom - side;
            } else if (handle === 'nw') {
              side = startSide + Math.max(-dx, -dy);
              maxSide = Math.min(anchorRight, anchorBottom);
              x = anchorRight - side;
              y = anchorBottom - side;
            }

            side = Math.max(minSize, Math.min(side, maxSide));
            w = side;
            h = side;
            if (handle === 'sw' || handle === 'nw') x = anchorRight - side;
            if (handle === 'ne' || handle === 'nw') y = anchorBottom - side;
          } else {
            if (handle.includes('e')) w += dx;
            if (handle.includes('s')) h += dy;
            if (handle.includes('w')) { x += dx; w -= dx; }
            if (handle.includes('n')) { y += dy; h -= dy; }
          }
        }

        w = Math.max(minSize, w); h = Math.max(minSize, h);
        x = Math.max(0, Math.min(x, layout.imageW - w));
        y = Math.max(0, Math.min(y, layout.imageH - h));

        region.image = { ...region.image, x: Math.round(x), y: Math.round(y), width: Math.round(w), height: Math.round(h) };
        const devBase = region.device?.base || { width: layout.rect.width, height: layout.rect.height };
        const imgBase = region.image?.base || { width: layout.imageW, height: layout.imageH };
        region.device = {
          ...region.device,
          x: Math.round(region.image.x * devBase.width / imgBase.width),
          y: Math.round(region.image.y * devBase.height / imgBase.height),
          width: Math.round(region.image.width * devBase.width / imgBase.width),
          height: Math.round(region.image.height * devBase.height / imgBase.height),
          unit: 'px', base: devBase,
        };
        setRenderTick(t => t + 1);
      }
    };

    const onMouseUp = (e) => {
      if (selectionRef.current) {
        const sel = selectionRef.current;
        selectionRef.current = null;
        const rawEnd = getClampedPoint(sel.layout, e.clientX, e.clientY);
        const end = squareSelection ? constrainSquarePoint(sel.layout, sel.start, rawEnd) : rawEnd;
        const region = buildRegionFromPoints(sel.layout, sel.start, end, deviceWidth, deviceHeight, { square: squareSelection });
        if (!region) { setSelectionRect(null); return; }
        if (typeof onRegionSelected === 'function') {
          onRegionSelected(region);
          setSelectionRect(null);
          setPendingRegion(null);
          return;
        }
        setPendingRegion({ region, menuX: e.clientX + 8, menuY: e.clientY + 8 });
        return;
      }
      if (dragRef.current) {
        dragRef.current = null;
      }
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, [deviceWidth, deviceHeight, onRegionSelected, squareSelection]);

  // ==================== 拖拽已有区域 ====================

  const startRegionDrag = useCallback((e, regionInfo, mode, handle) => {
    if (!isImageRegionSelecting) return;
    e.preventDefault();
    e.stopPropagation();
    const img = imgRef?.current;
    if (!img) return;
    const layout = getImageLayout(img);
    if (!layout) return;
    const region = regionInfo.region;
    if (!region || !region.image) return;

    dragRef.current = {
      regionInfo, mode, handle, layout,
      startClient: { x: e.clientX, y: e.clientY },
      startRegion: { ...region.image },
    };
  }, [isImageRegionSelecting, imgRef]);

  // ==================== 区域动作菜单 ====================

  const handleAction = useCallback((action) => {
    if (!pendingRegion) return;
    onRegionAction(action, pendingRegion.region);
    setPendingRegion(null);
    setSelectionRect(null);
  }, [pendingRegion, onRegionAction]);

  // 点击其他地方关闭菜单
  useEffect(() => {
    if (!pendingRegion) return;
    const timer = setTimeout(() => {
      const handler = (e) => {
        if (e.target.closest?.('.region-action-menu')) return;
        setPendingRegion(null);
        setSelectionRect(null);
        document.removeEventListener('click', handler);
      };
      document.addEventListener('click', handler);
    }, 10);
    return () => clearTimeout(timer);
  }, [pendingRegion]);

  if (!isImageRegionSelecting) return null;

  const img = imgRef?.current;
  const layout = img ? getImageLayout(img) : null;
  const regions = Array.isArray(overlayRegions) ? overlayRegions : getImageRegions(currentFile);

  return (
    <>
      {/* 框选矩形 */}
      {selectionRect && (
        <div
          className="image-selection-rect"
          style={{
            left: selectionRect.left,
            top: selectionRect.top,
            width: selectionRect.width,
            height: selectionRect.height,
          }}
        />
      )}

      {/* 已有区域覆盖层 */}
      {layout && regions.map((item) => {
        const boxStyle = applyRegionBoxStyle(item.region, layout);
        return (
        <div
          key={item.id || `${item.type}-${item.index}`}
            className={`image-region-box ${item.type}`}
            data-type={item.type}
            data-index={item.index}
            style={{ position: 'absolute', ...boxStyle }}
            onMouseDown={(e) => {
              if (e.target.classList.contains('image-region-handle')) return;
              startRegionDrag(e, item, 'move', null);
            }}
          >
            {['nw', 'ne', 'se', 'sw'].map((h) => (
              <div
                key={h}
                className={`image-region-handle handle-${h}`}
                onMouseDown={(e) => startRegionDrag(e, item, 'resize', h)}
              />
            ))}
          </div>
        );
      })}

      {/* 动作菜单 */}
      {pendingRegion && (
        <div
          className="region-action-menu picker-action-menu"
          style={{
            position: 'fixed',
            top: pendingRegion.menuY,
            left: pendingRegion.menuX,
            zIndex: 9999,
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            padding: 4,
            minWidth: 160,
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
              onClick={() => handleAction(key)}
            >
              <Icon name={icon} size="sm" />
              <span>{label}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
