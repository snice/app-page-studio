import React, { useState, useRef, useEffect } from 'react';
import { Icon } from '../common/Icon';
import { useAppStore } from '../../lib/state';

export function MindMapNode({ node, direction, onToggleCollapse, onNodeSelect }) {
  const { id, type, label, x, y } = node;
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const nameRef = useRef(null);
  const editRef = useRef(null);

  const setCurrentFile = useAppStore((s) => s.setCurrentFile);
  const updateCurrentFile = useAppStore((s) => s.updateCurrentFile);
  const updateGroup = useAppStore((s) => s.updateGroup);
  const moveFileToGroup = useAppStore((s) => s.moveFileToGroup);
  const currentFile = useAppStore((s) => s.currentFile);
  const isCurrentEditor = useAppStore((s) => s.session.isCurrentEditor);

  const isHorizontalGroups = direction === 'horizontal';

  useEffect(() => {
    if (isEditing && nameRef.current) {
      nameRef.current.focus();
      nameRef.current.select();
    }
  }, [isEditing]);

  useEffect(() => {
    if (!isEditing) return;
    const handleClickOutside = (e) => {
      if (editRef.current && !editRef.current.contains(e.target)) {
        commitEdit();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isEditing, editName, editDesc]);

  const handleDoubleClick = (e) => {
    e.stopPropagation();
    if (type === 'project' || !isCurrentEditor) return;
    setEditName(label);
    setEditDesc(node.description || '');
    setIsEditing(true);
  };

  const commitEdit = () => {
    setIsEditing(false);
    if (!isCurrentEditor) return;
    if (!editName.trim()) return;

    if (type === 'file') {
      setCurrentFile(node.path);
      setTimeout(() => {
        updateCurrentFile({ stateName: editName.trim(), description: editDesc.trim() });
      }, 0);
    } else if (type === 'group' && node.groupId) {
      updateGroup(node.groupId, { name: editName.trim(), description: editDesc.trim() });
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') { setIsEditing(false); }
  };

  const handleNameKeyDown = (e) => {
    handleKeyDown(e);
    if (e.key === 'Enter') { e.preventDefault(); commitEdit(); }
  };

  const handleClick = (e) => {
    e.stopPropagation();
    if (isEditing) return;
    if (type === 'file') {
      setCurrentFile(node.path);
      onNodeSelect?.(node.path);
    } else if (type === 'group') {
      onToggleCollapse?.(node.groupId || '__ungrouped__');
    }
  };

  const handleDragStart = (e) => {
    if (type !== 'file' || !isCurrentEditor) return;
    setIsDragging(true);
    e.dataTransfer.setData('text/plain', node.path);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragEnd = () => setIsDragging(false);

  const handleDragOver = (e) => {
    if (type !== 'group' || !isCurrentEditor) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setIsDragOver(true);
  };

  const handleDragLeave = () => setIsDragOver(false);

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    if (type !== 'group' || !isCurrentEditor) return;
    const filePath = e.dataTransfer.getData('text/plain');
    if (!filePath) return;
    moveFileToGroup([filePath], node.groupId);
  };

  const isActive = type === 'file' && currentFile?.path === node.path;
  const devStatusColors = { pending: '#f59e0b', developing: '#3b82f6', completed: '#22c55e' };

  const nodeStyle = {
    left: x,
    top: y,
    ...(isHorizontalGroups ? {} : { transform: 'translateY(-50%)' }),
  };

  const showDescription = type === 'file' && node.description;

  return (
    <div
      className={`mindmap-node is-${type} ${isActive ? 'active' : ''} ${isDragOver ? 'is-drop-target' : ''} ${isDragging ? 'is-dragging' : ''} ${showDescription ? 'has-description' : ''}`}
      style={nodeStyle}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      draggable={type === 'file' && !isEditing && isCurrentEditor}
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

      {type === 'group' && !isEditing && (
        <>
          <div className="group-color-bar" style={{ background: node.color }} />
          <div className="mindmap-node-content">
            <Icon name={node.isCollapsed ? 'chevronRight' : 'chevronDown'} size="sm" />
            <span className="mindmap-node-label">{label}</span>
            <span className="mindmap-node-badge">{node.fileCount}</span>
          </div>
        </>
      )}

      {type === 'file' && !isEditing && (
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
        <div ref={editRef} className="mindmap-node-edit-form" onClick={(e) => e.stopPropagation()}>
          <input
            ref={nameRef}
            className="mindmap-node-edit"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onKeyDown={handleNameKeyDown}
            placeholder="名称"
          />
          {type === 'file' && (
            <textarea
              className="mindmap-node-edit mindmap-node-edit-desc"
              value={editDesc}
              onChange={(e) => setEditDesc(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="描述（可选）"
              rows={2}
            />
          )}
        </div>
      )}
    </div>
  );
}
