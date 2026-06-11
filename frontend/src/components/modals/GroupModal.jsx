import React, { useState } from 'react';
import { Icon } from '../common/Icon';
import { useAppStore } from '../../lib/state';
import { ModalOverlay } from './ModalOverlay';

// ==================== Group Modal ====================
export function GroupModal({ isOpen, onClose }) {
  const groupColors = useAppStore((s) => s.groupColors);
  const addGroup = useAppStore((s) => s.addGroup);
  const updateGroup = useAppStore((s) => s.updateGroup);
  const editingGroupId = useAppStore((s) => s.editingGroupId);
  const setEditingGroupId = useAppStore((s) => s.setEditingGroupId);
  const pagesConfig = useAppStore((s) => s.pagesConfig);
  const selectedFiles = useAppStore((s) => s.selectedFiles);
  const assignSelectedFilesToGroup = useAppStore((s) => s.assignSelectedFilesToGroup);
  const showToast = useAppStore((s) => s.showToast);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [route, setRoute] = useState('');
  const [color, setColor] = useState(groupColors[0]);
  const [srcFlutter, setSrcFlutter] = useState('');
  const [srcRN, setSrcRN] = useState('');
  const [srcUniapp, setSrcUniapp] = useState('');

  React.useEffect(() => {
    if (isOpen && editingGroupId) {
      const group = (pagesConfig.pageGroups || []).find(g => g.id === editingGroupId);
      if (group) {
        setName(group.name || ''); setDescription(group.description || '');
        setRoute(group.route || ''); setColor(group.color || groupColors[0]);
        setSrcFlutter(group.sourcePaths?.flutter || '');
        setSrcRN(group.sourcePaths?.reactNative || '');
        setSrcUniapp(group.sourcePaths?.uniapp || '');
      }
    } else if (isOpen) {
      setName(''); setDescription(''); setRoute(''); setColor(groupColors[0]);
      setSrcFlutter(''); setSrcRN(''); setSrcUniapp('');
    }
  }, [isOpen, editingGroupId]);

  const handleConfirm = () => {
    if (!name.trim()) { showToast('请输入分组名称'); return; }
    const groupData = {
      name, description, route, color,
      sourcePaths: { flutter: srcFlutter, reactNative: srcRN, uniapp: srcUniapp },
    };

    if (editingGroupId) {
      updateGroup(editingGroupId, groupData);
      showToast('分组已更新');
    } else {
      const id = 'group_' + Date.now();
      addGroup({ id, ...groupData });
      if (selectedFiles.size > 0) assignSelectedFilesToGroup(id);
      showToast('分组已创建');
    }
    setEditingGroupId(null);
    onClose();
  };

  return (
    <ModalOverlay isOpen={isOpen} onClose={() => { setEditingGroupId(null); onClose(); }}>
      <div className="modal">
        <div className="modal-header">
          <span className="modal-title">{editingGroupId ? '编辑页面分组' : '创建页面分组'}</span>
          <button className="modal-close" onClick={() => { setEditingGroupId(null); onClose(); }}><Icon name="x" /></button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">分组名称</label>
            <input className="form-input" placeholder="如：首页、登录页" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">页面描述</label>
            <textarea className="form-textarea" placeholder="描述此页面的功能" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">App 路由</label>
            <input className="form-input" placeholder="如：/home" value={route} onChange={(e) => setRoute(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">源码路径</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', width: 80 }}>Flutter</span>
                <input className="form-input" placeholder="lib/pages/home_page.dart" style={{ flex: 1 }} value={srcFlutter} onChange={(e) => setSrcFlutter(e.target.value)} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', width: 80 }}>React Native</span>
                <input className="form-input" placeholder="app/home.tsx" style={{ flex: 1 }} value={srcRN} onChange={(e) => setSrcRN(e.target.value)} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', width: 80 }}>UniApp</span>
                <input className="form-input" placeholder="pages/home/home.vue" style={{ flex: 1 }} value={srcUniapp} onChange={(e) => setSrcUniapp(e.target.value)} />
              </div>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">标记颜色</label>
            <div className="color-picker-row">
              {groupColors.map((c) => (
                <div key={c} className={`color-option ${color === c ? 'selected' : ''}`}
                  style={{ background: c }} onClick={() => setColor(c)} />
              ))}
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={() => { setEditingGroupId(null); onClose(); }}>取消</button>
          <button className="btn btn-primary" onClick={handleConfirm}>{editingGroupId ? '更新' : '创建'}</button>
        </div>
      </div>
    </ModalOverlay>
  );
}
