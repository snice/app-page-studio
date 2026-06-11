import React, { useState } from 'react';
import { Icon } from '../common/Icon';
import { useAppStore } from '../../lib/state';
import { api } from '../../lib/api';

// ==================== Design System Drawer ====================
export function DesignSystemDrawer({ isOpen, onClose }) {
  const editingDesignSystem = useAppStore((s) => s.editingDesignSystem);
  const setEditingDesignSystem = useAppStore((s) => s.setEditingDesignSystem);
  const editingDesignProjectId = useAppStore((s) => s.editingDesignProjectId);
  const showToast = useAppStore((s) => s.showToast);
  const currentProject = useAppStore((s) => s.getCurrentProject());

  const [ds, setDs] = useState({ colors: [], spacing: {}, radius: {} });
  const [jsonText, setJsonText] = useState('');

  React.useEffect(() => {
    if (isOpen && editingDesignSystem) {
      const rawColors = editingDesignSystem.colors || [];
      const colors = Array.isArray(rawColors)
        ? rawColors
        : Object.entries(rawColors).map(([name, value]) => ({ name, value }));
      setDs({
        colors,
        spacing: editingDesignSystem.spacing || {},
        radius: editingDesignSystem.radius || {},
      });
      setJsonText(JSON.stringify(editingDesignSystem, null, 2));
    }
  }, [isOpen, editingDesignSystem]);

  if (!isOpen) return null;

  const addColor = () => {
    setDs({ ...ds, colors: [...ds.colors, { name: '', value: '#6366f1' }] });
  };

  const removeColor = (idx) => {
    const colors = [...ds.colors];
    colors.splice(idx, 1);
    setDs({ ...ds, colors });
  };

  const updateColor = (idx, field, val) => {
    const colors = [...ds.colors];
    colors[idx] = { ...colors[idx], [field]: val };
    setDs({ ...ds, colors });
  };

  const updateSpacing = (key, val) => {
    setDs({ ...ds, spacing: { ...ds.spacing, [key]: Number(val) } });
  };

  const updateRadius = (key, val) => {
    setDs({ ...ds, radius: { ...ds.radius, [key]: Number(val) } });
  };

  const parseJson = () => {
    try {
      const parsed = JSON.parse(jsonText);
      setDs({
        colors: parsed.colors || [],
        spacing: parsed.spacing || {},
        radius: parsed.radius || {},
      });
      showToast('JSON 解析成功');
    } catch {
      showToast('JSON 格式错误');
    }
  };

  const handleSave = async () => {
    const dsData = {
      colors: Object.fromEntries(ds.colors.filter(c => c.name).map(c => [c.name, c.value])),
      spacing: ds.spacing,
      radius: ds.radius,
    };
    if (editingDesignProjectId) {
      const res = await api.updateProject(editingDesignProjectId, currentProject?.name || '', currentProject?.description || '', dsData);
      if (res.error) {
        showToast(res.error);
        return;
      }
      showToast('设计系统已保存');
    }
    onClose();
  };

  return (
    <div className={`drawer-overlay ${isOpen ? 'active' : ''}`}>
      <div className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-header">
          <span className="drawer-title"><Icon name="palette" size="md" /> 设计系统配置</span>
          <button className="modal-close" onClick={onClose}><Icon name="x" /></button>
        </div>
        <div className="drawer-body">
          <div className="design-section">
            <div className="design-section-header">
              <span className="design-section-title"><Icon name="folder" size="sm" /> 项目</span>
            </div>
            <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 8 }}>{currentProject?.name || '-'}</div>
          </div>

          <div className="design-section">
            <div className="design-section-header">
              <span className="design-section-title"><Icon name="palette" size="sm" /> 颜色</span>
              <button className="btn btn-sm btn-secondary" onClick={addColor}><Icon name="plus" size="sm" /> 添加</button>
            </div>
            <div className="design-colors-grid">
              {ds.colors.map((c, idx) => (
                <div className="design-color-item" key={idx}>
                  <input type="color" className="design-color-picker" value={c.value}
                    onChange={(e) => updateColor(idx, 'value', e.target.value)} />
                  <div className="design-color-info">
                    <input className="design-color-name-input" placeholder="颜色名称" value={c.name}
                      onChange={(e) => updateColor(idx, 'name', e.target.value)} />
                    <input className="design-color-value-input" placeholder="#000000" value={c.value}
                      onChange={(e) => updateColor(idx, 'value', e.target.value)} />
                  </div>
                  <div className="design-color-actions">
                    <button className="btn btn-sm btn-icon" onClick={() => removeColor(idx)}>
                      <Icon name="trash" size="sm" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="design-section">
            <div className="design-section-header">
              <span className="design-section-title"><Icon name="package" size="sm" /> 间距</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {['xs', 'sm', 'md', 'lg', 'xl'].map((k) => (
                <div key={k}>
                  <label className="form-label">{k}</label>
                  <input type="number" className="form-input" placeholder={k}
                    value={ds.spacing[k] || ''} onChange={(e) => updateSpacing(k, e.target.value)} />
                </div>
              ))}
            </div>
          </div>

          <div className="design-section">
            <div className="design-section-header">
              <span className="design-section-title"><Icon name="package" size="sm" /> 圆角</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {['sm', 'md', 'lg', 'xl'].map((k) => (
                <div key={k}>
                  <label className="form-label">{k}</label>
                  <input type="number" className="form-input" placeholder={k}
                    value={ds.radius[k] || ''} onChange={(e) => updateRadius(k, e.target.value)} />
                </div>
              ))}
            </div>
          </div>

          <div className="design-section">
            <div className="design-section-header">
              <span className="design-section-title"><Icon name="file" size="sm" /> 原始 JSON</span>
            </div>
            <textarea className="form-textarea" style={{ minHeight: 120, fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}
              value={jsonText} onChange={(e) => setJsonText(e.target.value)} />
            <button className="btn btn-sm btn-secondary" style={{ marginTop: 8 }} onClick={parseJson}>解析 JSON</button>
          </div>
        </div>
        <div className="drawer-footer">
          <button className="btn btn-secondary" onClick={onClose}>取消</button>
          <button className="btn btn-primary" onClick={handleSave}><Icon name="save" size="sm" /> 保存</button>
        </div>
      </div>
    </div>
  );
}
