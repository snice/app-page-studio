import React, { useState, useRef, useEffect } from 'react';
import { Icon } from '../common/Icon';
import { isLayerMarked } from '../../lib/psdUtils';

/** 图层类型对应的 SVG 图标 path */
const TYPE_ICONS = {
  group:   { name: 'folder', color: 'var(--psd-icon-group, #facc15)' },
  text:    { name: 'type', color: 'var(--psd-icon-text, #93c5fd)' },
  shape:   { name: 'shape', color: 'var(--psd-icon-shape, #c4b5fd)' },
  image:   { name: 'image', color: 'var(--psd-icon-image, #86efac)' },
  unknown: { name: 'layers', color: 'var(--psd-icon-unknown, #a1a1aa)' },
};

/** 检查 parent 是否包含 targetId */
function containsLayer(parent, targetId) {
  if (!parent.children) return false;
  for (const child of parent.children) {
    if (child.id === targetId) return true;
    if (containsLayer(child, targetId)) return true;
  }
  return false;
}

/** 单个图层行 */
function LayerItem({
  layer, depth, selected, onSelect,
  checkedIds, onCheck, anyChecked,
  hiddenLayerIds, onToggleVisibility,
  manualSliceLayerIds, slices, onMarkSingle, onUnmarkSlice,
  readOnly = false,
}) {
  const [expanded, setExpanded] = useState(depth < 2);
  const isSelected = selected?.id === layer.id;
  const isChecked = checkedIds.has(layer.id);
  const isHidden = hiddenLayerIds.has(layer.id);
  const isInManual = isLayerMarked(layer, manualSliceLayerIds);
  const hasChildren = !!layer.children?.length;
  // Find the slice this layer belongs to (if any)
  const belongsToSlice = isInManual ? slices.find(s => s.layerIds.includes(layer.id)) : null;
  const isMergedSlice = belongsToSlice && belongsToSlice.layerIds.length > 1;
  const rowRef = useRef(null);

  const hasSelectedDescendant = hasChildren && selected != null && !isSelected
    && containsLayer(layer, selected.id);

  useEffect(() => {
    if (hasSelectedDescendant && !expanded) setExpanded(true);
  }, [hasSelectedDescendant]);

  useEffect(() => {
    if (isSelected && rowRef.current) {
      rowRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [isSelected]);

  const icon = TYPE_ICONS[layer.type] || TYPE_ICONS.unknown;

  return (
    <div>
      <div
        ref={rowRef}
        className={`psd-layer-row ${isSelected ? 'is-selected' : ''} ${isChecked ? 'is-checked' : ''} ${isHidden ? 'is-hidden' : ''}`}
        style={{ paddingLeft: `${8 + depth * 16}px` }}
        onClick={() => onSelect(layer)}
      >
        {/* Checkbox */}
        <span
          className={`psd-layer-checkbox ${anyChecked ? 'is-visible' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            if (!readOnly) onCheck(layer.id, !isChecked);
          }}
          title={readOnly ? '当前为只读' : undefined}
        >
          <span className={`psd-layer-checkbox-inner ${isChecked ? 'is-checked' : ''}`}>
            {isChecked && '✓'}
          </span>
        </span>

        {/* Expand toggle */}
        <span
          className={`psd-layer-expand ${hasChildren ? 'has-children' : ''}`}
          onClick={(e) => { e.stopPropagation(); if (hasChildren) setExpanded(v => !v); }}
        >
          {hasChildren && <Icon name={expanded ? 'chevronDown' : 'chevronRight'} size="sm" />}
        </span>

        {/* Type icon */}
        <span className="psd-layer-icon" style={{ color: icon.color }}>
          <Icon name={icon.name} size="md" />
        </span>

        {/* Name */}
        <span className="psd-layer-name">{layer.name}</span>

        {/* Visibility toggle */}
        <span
          className={`psd-layer-visibility ${isHidden ? 'is-hidden' : ''}`}
          onClick={(e) => { e.stopPropagation(); onToggleVisibility(layer.id); }}
          title={isHidden ? '显示图层' : '隐藏图层'}
        >
          <Icon name={isHidden ? 'eyeOff' : 'eye'} size="md" />
        </span>

        {/* Slice toggle button */}
        <button
          className={`psd-layer-mark-btn ${isInManual ? 'is-marked' : ''} ${isMergedSlice ? 'is-merged' : ''}`}
          title={readOnly ? '当前为只读' : isInManual ? (isMergedSlice ? '合并切图（不可单独取消）' : '取消切图') : '标记切图'}
          disabled={readOnly || isMergedSlice}
          onClick={(e) => {
            e.stopPropagation();
            if (readOnly) return;
            if (isInManual && !isMergedSlice && belongsToSlice) {
              onUnmarkSlice(belongsToSlice.id);
            } else if (!isInManual) {
              onMarkSingle(layer);
            }
          }}
        >
          <Icon name="scissors" />
        </button>
      </div>

      {expanded && layer.children?.map(child => (
        <LayerItem
          key={child.id}
          layer={child}
          depth={depth + 1}
          selected={selected}
          onSelect={onSelect}
          checkedIds={checkedIds}
          onCheck={onCheck}
          anyChecked={anyChecked}
          hiddenLayerIds={hiddenLayerIds}
          onToggleVisibility={onToggleVisibility}
          manualSliceLayerIds={manualSliceLayerIds}
          slices={slices}
          onMarkSingle={onMarkSingle}
          onUnmarkSlice={onUnmarkSlice}
          readOnly={readOnly}
        />
      ))}
    </div>
  );
}

/**
 * PSD 图层面板
 */
export function LayerPanel({
  layers,
  selected,
  onSelect,
  checkedIds,
  onCheck,
  onClearChecked,
  hiddenLayerIds,
  onToggleVisibility,
  manualSliceLayerIds = new Set(),
  slices = [],
  onMergeSlice,
  onMarkSingle,
  onUnmarkSlice,
  readOnly = false,
}) {
  const anyChecked = checkedIds.size > 0;
  const isSingle = checkedIds.size === 1;

  return (
    <div className="psd-layer-panel">
      {/* Header */}
      <div className="psd-layer-panel-header">
        <Icon name="layers" size="sm" />
        <span className="psd-layer-panel-title">图层</span>
        {anyChecked && (
          <span className="psd-layer-panel-count">{checkedIds.size} 已选</span>
        )}
      </div>

      {/* Layer tree */}
      <div className="psd-layer-panel-list">
        {layers.map(l => (
          <LayerItem
            key={l.id}
            layer={l}
            depth={0}
            selected={selected}
            onSelect={onSelect}
            checkedIds={checkedIds}
            onCheck={onCheck}
            anyChecked={anyChecked}
            hiddenLayerIds={hiddenLayerIds}
            onToggleVisibility={onToggleVisibility}
            manualSliceLayerIds={manualSliceLayerIds}
            slices={slices}
            onMarkSingle={onMarkSingle}
            onUnmarkSlice={onUnmarkSlice}
            readOnly={readOnly}
          />
        ))}
      </div>

      {/* Action bar */}
      {anyChecked && (
        <div className="psd-layer-panel-actions">
          <div className="psd-layer-panel-actions-header">
            <span>已选 {checkedIds.size} 个图层</span>
            <button className="psd-layer-panel-clear" onClick={onClearChecked} title="清除选择">✕</button>
          </div>
          <button
            className="psd-layer-panel-merge-btn"
            onClick={onMergeSlice}
            disabled={readOnly}
            title={readOnly ? '当前为只读' : undefined}
          >
            <Icon name="scissors" /> {isSingle ? '标记为切图' : `合并 ${checkedIds.size} 层为切图`}
          </button>
        </div>
      )}
    </div>
  );
}
