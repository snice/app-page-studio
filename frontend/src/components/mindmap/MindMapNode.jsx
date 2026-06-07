import React, { useState, useRef, useEffect } from 'react';
import { Icon } from '../common/Icon';
import { useAppStore } from '../../lib/state';

/**
 * MindMapNode - Renders a single node in the mind map.
 * type: 'project' | 'group' | 'file'
 * direction: 'vertical' | 'horizontal'
 */
export function MindMapNode({ node, direction, onToggleCollapse, onNodeSelect }) {
  const { id, type, label, x, y } = node;
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [showTooltip, setShowTooltip] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef(null);
  const tooltipTimer = useRef(null);

  const setCurrentFile = useAppStore((s) => s.setCurrentFile);
  const updateCurrentFile = useAppStore((s) => s.updateCurrentFile);
  const updateGroup = useAppStore((s) => s.updateGroup);
  const moveFileToGroup = useAppStore((s) => s.moveFileToGroup);
  const currentFile = useAppStore((s) => s.currentFile);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleDoubleClick = (e) => {
    e.stopPropagation();
    if (type === 'project') return;
    setEditValue(label);
    setIsEditing(true);
  };

  const commitEdit = () => {
    setIsEditing(false);
    if (!editValue.trim()) return;

    if (type === 'file') {
      setCurrentFile(node.path);
      setTimeout(() => {
        updateCurrentFile({ stateName: editValue.trim() });
      }, 0);
    } else if (type === 'group' && node.groupId) {
      updateGroup(node.groupId, { name: editValue.trim() });
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); commitEdit(); }
    if (e.key === 'Escape') { setIsEditing(false); }
  };

  const handleClick = (e) => {
    e.stopPropagation();
    if (type === 'file') {
      setCurrentFile(node.path);
      onNodeSelect?.(node.path);
    } else if (type === 'group') {
      onToggleCollapse?.(node.groupId || '__ungrouped__');
    }
  };

  // Drag handlers for file nodes
  const handleDragStart = (e) => {
    if (type !== 'file') return;
    setIsDragging(true);
    e.dataTransfer.setData('text/plain', node.path);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragEnd = () => {
    setIsDragging(false);
  };

  // Drop handlers for group nodes
  const handleDragOver = (e) => {
    if (type !== 'group') return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    if (type !== 'group') return;
    const filePath = e.dataTransfer.getData('text/plain');
    if (!filePath) return;
    moveFileToGroup([filePath], node.groupId);
  };

  // Tooltip for description (only in horizontal mode; vertical shows inline)
  const handleMouseEnter = () => {
    if (type !== 'file' || !node.description) return;
    tooltipTimer.current = setTimeout(() => setShowTooltip(true), 800);
  };

  const handleMouseLeave = () => {
    clearTimeout(tooltipTimer.current);
    setShowTooltip(false);
  };

  const isActive = type === 'file' && currentFile?.path === node.path;
  const devStatusColors = { pending: '#f59e0b', developing: '#3b82f6', completed: '#22c55e' };

  // Position: classic (vertical) mode uses translateY(-50%) since y=center
  // horizontal groups mode uses y=top, no transform needed
  const isHorizontalGroups = direction === 'horizontal';
  const nodeStyle = {
    left: x,
    top: y,
    ...(isHorizontalGroups ? {} : { transform: 'translateY(-50%)' }),
  };

  // Show description inline for file nodes in horizontal groups mode
  const showDescription = type === 'file' && node.description && isHorizontalGroups;

  return (
    <div
      className={`mindmap-node is-${type} ${isActive ? 'active' : ''} ${isDragOver ? 'is-drop-target' : ''} ${isDragging ? 'is-dragging' : ''} ${showDescription ? 'has-description' : ''}`}
      style={nodeStyle}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      draggable={type === 'file'}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {type === 'project' && (
        <div className="mindmap-node-content">
          <Icon name="smartphone" size="md" />
          <span className="mindmap-node-label">{label}</span>
        </div>
      )}

      {type === 'group' && (
        <>
          <div className="group-color-bar" style={{ background: node.color }} />
          <div className="mindmap-node-content">
            <Icon name={node.isCollapsed ? 'chevronRight' : 'chevronDown'} size="sm" />
            <span className="mindmap-node-label">{label}</span>
            <span className="mindmap-node-badge">{node.fileCount}</span>
          </div>
        </>
      )}

      {type === 'file' && (
        <>
          <div className="mindmap-node-content">
            <span
              className="mindmap-status-dot"
              style={{ background: devStatusColors[node.devStatus] || devStatusColors.pending }}
            />
            <span className="mindmap-node-label">{label}</span>
            <span className={`mindmap-source-tag ${node.sourceType}`}>{node.sourceType === 'html' ? 'H' : node.sourceType === 'psd' ? 'P' : 'I'}</span>
          </div>
          {showDescription && (
            <div className="mindmap-node-desc">{node.description}</div>
          )}
        </>
      )}

      {isEditing && (
        <input
          ref={inputRef}
          className="mindmap-node-edit"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={handleKeyDown}
          onClick={(e) => e.stopPropagation()}
        />
      )}

      {showTooltip && node.description && (
        <div className="mindmap-tooltip">
          {node.description}
        </div>
      )}
    </div>
  );
}
