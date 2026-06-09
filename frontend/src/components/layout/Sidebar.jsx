import React, { useState, useMemo, useCallback, useEffect, useRef, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../common/Icon';
import { useAppStore } from '../../lib/state';

/** 内联删除确认气泡（portal 到 body，避免被祖先 overflow 裁剪） */
function InlineConfirm({ anchorRef, message, onConfirm, onCancel }) {
  const ref = useRef(null);
  const [pos, setPos] = useState({ top: 0, left: 0, ready: false });

  useLayoutEffect(() => {
    const el = anchorRef?.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const POPOVER_W = 240;
    // 默认放在按钮右下方，让箭头指向按钮
    let left = r.right - POPOVER_W;
    if (left < 8) left = 8;
    setPos({ top: r.bottom + 8, left, ready: true });
  }, [anchorRef]);

  useEffect(() => {
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onCancel();
    };
    // 延后绑定，避免触发它打开的那次点击立刻被识别为外部点击
    const t = setTimeout(() => document.addEventListener('mousedown', onDoc), 0);
    return () => { clearTimeout(t); document.removeEventListener('mousedown', onDoc); };
  }, [onCancel]);

  if (!pos.ready) return null;

  return createPortal(
    <div
      ref={ref}
      className="inline-confirm"
      style={{ top: pos.top, left: pos.left }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="inline-confirm-text">{message}</div>
      <div className="inline-confirm-actions">
        <button className="btn btn-sm" onClick={onCancel}>取消</button>
        <button className="btn btn-sm btn-danger" onClick={onConfirm}>删除</button>
      </div>
    </div>,
    document.body
  );
}

/** 高亮搜索匹配文本 */
function HighlightText({ text, highlight }) {
  if (!highlight || !text) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(highlight.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <span className="search-highlight">{text.slice(idx, idx + highlight.length)}</span>
      {text.slice(idx + highlight.length)}
    </>
  );
}

/** 分组删除按钮 + 内联确认气泡 */
function GroupDeleteButton({ isPending, groupName, onRequest, onCancel, onConfirm }) {
  const btnRef = useRef(null);
  return (
    <>
      <button
        ref={btnRef}
        className="btn btn-sm btn-icon"
        onClick={(e) => { e.stopPropagation(); onRequest(); }}
        title="删除"
      >
        <Icon name="trash" size="sm" />
      </button>
      {isPending && (
        <InlineConfirm
          anchorRef={btnRef}
          message={`确定删除分组「${groupName}」？组内文件将移至未分组。`}
          onCancel={onCancel}
          onConfirm={onConfirm}
        />
      )}
    </>
  );
}

/** 单个文件项 */
function FileItem({ file, isActive, isSelected, search, onSelect, onToggleSelect }) {
  const devStatus = file.devStatus || 'pending';
  const devStatusLabels = { pending: '待开发', developing: '开发中', completed: '已完成' };
  const sourceLabel = file.sourceType === 'html' ? 'HTML' : (file.sourceType === 'psd' ? 'PSD' : '设计图');

  return (
    <div
      className={`file-item ${isActive ? 'active' : ''} ${isSelected ? 'selected' : ''}`}
      onClick={() => onSelect(file.path)}
    >
      <div className="file-select" onClick={(e) => e.stopPropagation()}>
        <input
          type="checkbox"
          className="file-select-checkbox"
          checked={isSelected}
          onChange={() => onToggleSelect(file.path)}
        />
      </div>
      <span className="file-icon">
        <Icon name={file.sourceType === 'image' ? 'image' : 'file'} size="md" />
      </span>
      <div className="file-info">
        <div className="file-name">
          {file.isPrimaryState && <span className="primary-state-badge" title="主状态">主</span>}
          <HighlightText
            text={file.stateName || (file.isPrimaryState ? '主状态' : (file.name || file.path.split('/').pop()))}
            highlight={search}
          />
        </div>
        <div className="file-path">{file.path}</div>
      </div>
      <div className="file-tags">
        <span className={`dev-status-badge ${devStatus}`}>{devStatusLabels[devStatus]}</span>
        <span className={`file-source-tag ${file.sourceType === 'image' ? 'image' : ''}`}>{sourceLabel}</span>
      </div>
    </div>
  );
}

export function Sidebar({ onCreateGroup, onGroupSelected, onFileSelected, onToggleMindMap, mindMapOpen }) {
  const pagesConfig = useAppStore((s) => s.pagesConfig);
  const currentFile = useAppStore((s) => s.currentFile);
  const selectedFiles = useAppStore((s) => s.selectedFiles);
  const fileFilter = useAppStore((s) => s.fileFilter);
  const setFileFilter = useAppStore((s) => s.setFileFilter);
  const setCurrentFile = useAppStore((s) => s.setCurrentFile);
  const toggleSelectedFile = useAppStore((s) => s.toggleSelectedFile);
  const deleteGroup = useAppStore((s) => s.deleteGroup);
  const setEditingGroupId = useAppStore((s) => s.setEditingGroupId);

  const [collapsedGroups, setCollapsedGroups] = useState(new Set());
  const [pendingDeleteGroupId, setPendingDeleteGroupId] = useState(null);

  const search = fileFilter.searchText;
  const devStatusFilter = fileFilter.devStatus;

  /** 筛选文件 */
  const matchesFilter = useCallback((file) => {
    if (search) {
      const q = search.toLowerCase();
      const hit =
        file.path.toLowerCase().includes(q) ||
        (file.name || '').toLowerCase().includes(q) ||
        (file.stateName || '').toLowerCase().includes(q);
      if (!hit) return false;
    }
    if (devStatusFilter !== 'all' && file.devStatus !== devStatusFilter) return false;
    return true;
  }, [search, devStatusFilter]);

  /** 按分组组织文件 */
  const { groupedFiles, ungroupedFiles } = useMemo(() => {
    const groups = pagesConfig.pageGroups || [];
    const files = pagesConfig.htmlFiles || [];
    const grouped = {};
    const ungrouped = [];

    for (const file of files) {
      if (!matchesFilter(file)) continue;
      if (file.groupId) {
        if (!grouped[file.groupId]) grouped[file.groupId] = [];
        grouped[file.groupId].push(file);
      } else {
        ungrouped.push(file);
      }
    }

    return {
      groupedFiles: groups.map((g) => ({
        ...g,
        files: grouped[g.id] || [],
      })),
      ungroupedFiles: ungrouped,
    };
  }, [pagesConfig, matchesFilter]);

  const toggleGroup = (groupId) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId); else next.add(groupId);
      return next;
    });
  };

  const handleStatusFilter = (status) => {
    setFileFilter({ devStatus: status });
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <span className="sidebar-title">页面文件</span>
        <div style={{ display: 'flex', gap: 4 }}>
          <button
            className={`btn btn-sm btn-icon ${mindMapOpen ? 'btn-primary' : 'btn-secondary'}`}
            onClick={onToggleMindMap}
            title="思维导图视图"
          >
            <Icon name="mindmap" size="sm" />
          </button>
          <button className="btn btn-sm btn-secondary" onClick={onCreateGroup}>
            <Icon name="plus" size="sm" />
            新建页面分组
          </button>
        </div>
      </div>

      <div className="sidebar-filter">
        <div className="search-box">
          <Icon name="search" size="sm" />
          <input
            type="text"
            placeholder="搜索文件名..."
            value={search}
            onChange={(e) => setFileFilter({ searchText: e.target.value })}
          />
        </div>
        <div className="status-filter-bar">
          {['all', 'pending', 'developing', 'completed'].map((status) => (
            <button
              key={status}
              className={`status-filter-btn ${devStatusFilter === status ? 'active' : ''}`}
              onClick={() => handleStatusFilter(status)}
            >
              {status !== 'all' && <span className={`status-dot ${status}`} />}
              {status === 'all' ? '全部' : status === 'pending' ? '待开发' : status === 'developing' ? '开发中' : '已完成'}
            </button>
          ))}
        </div>
      </div>

      <div className="sidebar-content">
        {groupedFiles.filter(g => g.files.length > 0).map((group) => (
          <div className="file-group" key={group.id}>
            <div
              className={`file-group-header${pendingDeleteGroupId === group.id ? ' confirming' : ''}`}
              onClick={() => toggleGroup(group.id)}
            >
              <span className="group-color" style={{ color: group.color, background: group.color }} />
              <span className="group-name">{group.name}</span>
              <span className="group-count">{group.files.length}</span>
              <div className="group-actions">
                <button className="btn btn-sm btn-icon" onClick={(e) => { e.stopPropagation(); setEditingGroupId(group.id); onCreateGroup(); }} title="编辑">
                  <Icon name="edit" size="sm" />
                </button>
                <GroupDeleteButton
                  isPending={pendingDeleteGroupId === group.id}
                  groupName={group.name}
                  onRequest={() => setPendingDeleteGroupId(group.id)}
                  onCancel={() => setPendingDeleteGroupId(null)}
                  onConfirm={() => { deleteGroup(group.id); setPendingDeleteGroupId(null); }}
                />
              </div>
              <Icon name={collapsedGroups.has(group.id) ? 'chevronDown' : 'chevronUp'} size="sm" />
            </div>
            {!collapsedGroups.has(group.id) && (
              <div className="group-files">
                {group.files.map((file) => (
                  <FileItem
                    key={file.path}
                    file={file}
                    isActive={currentFile?.path === file.path}
                    isSelected={selectedFiles.has(file.path)}
                    search={search}
                    onSelect={onFileSelected}
                    onToggleSelect={toggleSelectedFile}
                  />
                ))}
              </div>
            )}
          </div>
        ))}

        {ungroupedFiles.length > 0 && (
          <div className="ungrouped-section">
            <div className="ungrouped-title">未分组</div>
            {ungroupedFiles.map((file) => (
              <FileItem
                key={file.path}
                file={file}
                isActive={currentFile?.path === file.path}
                isSelected={selectedFiles.has(file.path)}
                search={search}
                onSelect={onFileSelected}
                onToggleSelect={toggleSelectedFile}
              />
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
