import React, { useState } from 'react';
import { Icon } from '../common/Icon';

const FORMAT_OPTIONS = ['png', 'jpg', 'svg', 'webp'];

const FORMAT_COLORS = {
  png: '#4a90d9',
  jpg: '#e6a817',
  svg: '#9b59b6',
  webp: '#27ae60',
};

export function SlicesPanel({
  slices,
  selectedId,
  onSelect,
  onUpdate,
  onDelete,
  onExportOne,
  onExportAll,
  showSlices,
  onToggleShow,
}) {
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState(null);
  const [checkedIds, setCheckedIds] = useState(new Set());

  const startEdit = (slice, e) => {
    e.stopPropagation();
    setEditingId(slice.id);
    setDraft({ ...slice });
  };
  const saveEdit = () => {
    if (draft) onUpdate(draft.id, draft);
    setEditingId(null);
    setDraft(null);
  };
  const cancelEdit = () => {
    setEditingId(null);
    setDraft(null);
  };

  const toggleCheck = (id, e) => {
    e.stopPropagation();
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleCheckAll = () => {
    if (checkedIds.size === slices.length) {
      setCheckedIds(new Set());
    } else {
      setCheckedIds(new Set(slices.map((s) => s.id)));
    }
  };

  const allChecked = slices.length > 0 && checkedIds.size === slices.length;

  return (
    <div className="slices-panel">
      {/* Header */}
      <div className="slices-panel-header">
        <Icon name="scissors" size="sm" />
        <span className="slices-panel-title">切图标记</span>
        {slices.length > 0 && (
          <span className="slices-count">{slices.length}</span>
        )}
      </div>

      {/* Toolbar */}
      {slices.length > 0 && (
        <div className="slices-panel-toolbar">
          <div className="slices-panel-toolbar-row">
            <button className="slices-toolbar-btn" onClick={toggleCheckAll}>
              {allChecked ? '取消全选' : '全选'}
            </button>
            <span className="slices-toolbar-info">
              已选 {checkedIds.size} / {slices.length}
            </span>
          </div>
          <div className="slices-panel-toolbar-row">
            <button
              className="slices-toolbar-btn slices-toolbar-icon-btn"
              onClick={onToggleShow}
              title={showSlices ? '隐藏标注' : '显示标注'}
            >
              <Icon name={showSlices ? 'eye' : 'eyeOff'} size="sm" />
            </button>
            <button
              className="slices-toolbar-btn slices-export-all-btn"
              onClick={onExportAll}
              disabled={slices.length === 0}
            >
              <Icon name="download" size="sm" />
              <span>导出全部</span>
            </button>
          </div>
        </div>
      )}

      {/* Slice list */}
      <div className="slices-panel-list">
        {slices.length === 0 && (
          <div className="slices-panel-empty">
            <Icon name="fileEmpty" size="xl" />
            <p>
              选中图层后点击「标记切图」<br />
              或在图层面板合并图层为切图
            </p>
          </div>
        )}

        {slices.map((slice) => {
          const isSelected = selectedId === slice.id;
          const isEditing = editingId === slice.id;
          const isChecked = checkedIds.has(slice.id);

          return (
            <div key={slice.id} className="slice-item-wrapper">
              {/* Row */}
              <div
                className={`slice-item ${isSelected ? 'selected' : ''}`}
                onClick={() => !isEditing && onSelect(isSelected ? null : slice.id)}
              >
                {/* Checkbox */}
                <span
                  className="slice-item-check"
                  onClick={(e) => toggleCheck(slice.id, e)}
                >
                  <span className={`slice-check-box ${isChecked ? 'checked' : ''}`}>
                    {isChecked && '✓'}
                  </span>
                </span>

                {/* Color dot */}
                <span
                  className="slice-item-color"
                  style={{ background: slice.color }}
                />

                {/* Info */}
                <div className="slice-item-info">
                  <div className="slice-item-name-row">
                    <span className="slice-item-name">{slice.name}</span>
                    <span
                      className="slice-item-format"
                      style={{ background: FORMAT_COLORS[slice.exportAs] || '#666' }}
                    >
                      {(slice.exportAs || 'png').toUpperCase()}
                    </span>
                  </div>
                  <span className="slice-item-size">
                    {slice.width} × {slice.height}
                  </span>
                </div>

                {/* Actions (hover) */}
                <div className="slice-item-actions">
                  <button
                    className="slice-action-btn"
                    onClick={(e) => { e.stopPropagation(); onExportOne(slice); }}
                    title="导出"
                  >
                    <Icon name="download" size="sm" />
                  </button>
                  <button
                    className="slice-action-btn"
                    onClick={(e) => startEdit(slice, e)}
                    title="编辑"
                  >
                    <Icon name="edit" size="sm" />
                  </button>
                  <button
                    className="slice-action-btn slice-action-delete"
                    onClick={(e) => { e.stopPropagation(); onDelete(slice.id); }}
                    title="删除"
                  >
                    <Icon name="trash" size="sm" />
                  </button>
                </div>
              </div>

              {/* Inline editor */}
              {isEditing && draft && (
                <div className="slice-item-editor" onClick={(e) => e.stopPropagation()}>
                  <div className="slice-editor-field">
                    <label>名称</label>
                    <input
                      type="text"
                      value={draft.name}
                      onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                    />
                  </div>
                  <div className="slice-editor-grid">
                    {[
                      { key: 'left', label: 'X' },
                      { key: 'top', label: 'Y' },
                      { key: 'width', label: '宽' },
                      { key: 'height', label: '高' },
                    ].map(({ key, label }) => (
                      <div key={key} className="slice-editor-field">
                        <label>{label}</label>
                        <input
                          type="number"
                          value={draft[key] ?? 0}
                          onChange={(e) => setDraft({ ...draft, [key]: Number(e.target.value) })}
                        />
                      </div>
                    ))}
                  </div>
                  <div className="slice-editor-field">
                    <label>导出格式</label>
                    <select
                      value={draft.exportAs || 'png'}
                      onChange={(e) => setDraft({ ...draft, exportAs: e.target.value })}
                    >
                      {FORMAT_OPTIONS.map((f) => (
                        <option key={f} value={f}>{f.toUpperCase()}</option>
                      ))}
                    </select>
                  </div>
                  <div className="slice-editor-actions">
                    <button className="slice-editor-btn primary" onClick={saveEdit}>
                      <Icon name="check" size="sm" /> 保存
                    </button>
                    <button className="slice-editor-btn" onClick={cancelEdit}>
                      <Icon name="x" size="sm" /> 取消
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      {slices.length > 0 && (
        <div className="slices-panel-footer">
          <span>{slices.length} 个切图标记</span>
        </div>
      )}
    </div>
  );
}
