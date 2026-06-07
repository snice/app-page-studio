import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Icon } from '../common/Icon';
import { MindMapCanvas } from './MindMapCanvas';
import { useMindMapLayout } from './useMindMapLayout';

const MIN_ZOOM = 25;
const MAX_ZOOM = 200;

/**
 * MindMapOverlay - Full-screen mind map view.
 * Provides toolbar, zoom/pan controls, and renders the canvas.
 */
export function MindMapOverlay({ onClose }) {
  const [direction, setDirection] = useState('vertical'); // 'vertical' (上下=分组垂直堆叠) or 'horizontal' (左右=分组水平展开)
  const { nodes, connections, bounds, collapsedGroups, toggleGroup, expandAll, collapseAll } = useMindMapLayout(direction);

  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef({ x: 0, y: 0, tx: 0, ty: 0 });
  const wrapperRef = useRef(null);
  const hasInitialFit = useRef(false);
  const prevDirection = useRef(direction);

  // Fit to screen on mount and when direction changes
  useEffect(() => {
    const isFirst = !hasInitialFit.current;
    const dirChanged = prevDirection.current !== direction;
    prevDirection.current = direction;

    if (!wrapperRef.current) return;
    if (!isFirst && !dirChanged) return;

    hasInitialFit.current = true;
    const wrapper = wrapperRef.current;
    const wrapperRect = wrapper.getBoundingClientRect();
    const scaleX = wrapperRect.width / bounds.width;
    const scaleY = wrapperRect.height / bounds.height;
    const fitScale = Math.min(scaleX, scaleY, 1) * 0.85;
    const clampedScale = Math.max(MIN_ZOOM / 100, Math.min(MAX_ZOOM / 100, fitScale));

    const offsetX = (wrapperRect.width - bounds.width * clampedScale) / 2;
    const offsetY = (wrapperRect.height - bounds.height * clampedScale) / 2;

    setScale(clampedScale);
    setTranslate({ x: offsetX, y: offsetY });
  }, [bounds.width, bounds.height, direction]);

  // Zoom with mouse wheel
  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const rect = wrapper.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newScale = Math.max(MIN_ZOOM / 100, Math.min(MAX_ZOOM / 100, scale * delta));

    const newTx = mouseX - (mouseX - translate.x) * (newScale / scale);
    const newTy = mouseY - (mouseY - translate.y) * (newScale / scale);

    setScale(newScale);
    setTranslate({ x: newTx, y: newTy });
  }, [scale, translate]);

  // Pan with direct mouse drag (left button on empty canvas area)
  const handleMouseDown = useCallback((e) => {
    if (e.button === 1 || (e.button === 0 && !e.target.closest('.mindmap-node'))) {
      e.preventDefault();
      setIsPanning(true);
      panStart.current = { x: e.clientX, y: e.clientY, tx: translate.x, ty: translate.y };
    }
  }, [translate]);

  const handleMouseMove = useCallback((e) => {
    if (!isPanning) return;
    const dx = e.clientX - panStart.current.x;
    const dy = e.clientY - panStart.current.y;
    setTranslate({ x: panStart.current.tx + dx, y: panStart.current.ty + dy });
  }, [isPanning]);

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
  }, []);

  // Esc to close
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleZoomIn = () => setScale((s) => Math.min(MAX_ZOOM / 100, s * 1.2));
  const handleZoomOut = () => setScale((s) => Math.max(MIN_ZOOM / 100, s / 1.2));

  const fitToScreen = () => {
    if (!wrapperRef.current) return;
    const wrapper = wrapperRef.current;
    const rect = wrapper.getBoundingClientRect();
    const scaleX = rect.width / bounds.width;
    const scaleY = rect.height / bounds.height;
    const fitScale = Math.min(scaleX, scaleY, 1) * 0.85;
    const clampedScale = Math.max(MIN_ZOOM / 100, Math.min(MAX_ZOOM / 100, fitScale));
    const offsetX = (rect.width - bounds.width * clampedScale) / 2;
    const offsetY = (rect.height - bounds.height * clampedScale) / 2;
    setScale(clampedScale);
    setTranslate({ x: offsetX, y: offsetY });
  };

  const toggleDirection = () => {
    setDirection((d) => d === 'vertical' ? 'horizontal' : 'vertical');
  };

  const zoomPercent = Math.round(scale * 100);
  const isVertical = direction === 'vertical';

  return (
    <div className="mindmap-overlay">
      <div className="mindmap-toolbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon name="mindmap" size="md" />
          <span style={{ fontWeight: 600, fontSize: 14 }}>思维导图</span>
        </div>

        <div style={{ display: 'flex', gap: 4 }}>
          <button className="btn btn-sm btn-secondary" onClick={expandAll} title="全部展开">
            <Icon name="chevronDown" size="sm" /> 展开
          </button>
          <button className="btn btn-sm btn-secondary" onClick={collapseAll} title="全部折叠">
            <Icon name="chevronRight" size="sm" /> 折叠
          </button>
        </div>

        <div style={{ display: 'flex', gap: 4 }}>
          <button className="btn btn-sm btn-secondary" onClick={fitToScreen} title="适应屏幕">
            <Icon name="target" size="sm" /> 适应
          </button>
          <button
            className={`btn btn-sm btn-secondary ${isVertical ? '' : 'btn-primary'}`}
            onClick={toggleDirection}
            title={isVertical ? '当前: 上下布局，点击切换为左右' : '当前: 左右布局，点击切换为上下'}
          >
            <Icon name={isVertical ? 'arrowDown' : 'arrowRight'} size="sm" />
            {isVertical ? '上下' : '左右'}
          </button>
        </div>

        <div className="mindmap-zoom-control">
          <button className="btn btn-sm btn-icon btn-secondary" onClick={handleZoomOut} title="缩小">
            <Icon name="minus" size="sm" />
          </button>
          <span style={{ fontSize: 12, minWidth: 40, textAlign: 'center' }}>{zoomPercent}%</span>
          <button className="btn btn-sm btn-icon btn-secondary" onClick={handleZoomIn} title="放大">
            <Icon name="plus" size="sm" />
          </button>
          <input
            type="range"
            min={MIN_ZOOM}
            max={MAX_ZOOM}
            value={zoomPercent}
            onChange={(e) => setScale(parseInt(e.target.value) / 100)}
            style={{ width: 80, accentColor: 'var(--primary)' }}
          />
        </div>

        <div style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)' }}>
          双击编辑名称 · 拖拽文件到分组改变归属 · 拖拽画布平移
        </div>

        <button className="btn btn-sm btn-secondary" onClick={onClose} title="关闭 (Esc)">
          <Icon name="x" size="sm" /> 关闭
        </button>
      </div>

      <div
        ref={wrapperRef}
        className={`mindmap-canvas-wrapper ${isPanning ? 'is-panning' : ''}`}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <div
          className="mindmap-canvas"
          style={{
            transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})`,
            transformOrigin: '0 0',
          }}
        >
          <MindMapCanvas
            nodes={nodes}
            connections={connections}
            bounds={bounds}
            direction={direction}
            toggleGroup={toggleGroup}
            onClose={onClose}
          />
        </div>
      </div>
    </div>
  );
}
