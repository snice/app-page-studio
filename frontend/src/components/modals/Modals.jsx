import React, { useState, useRef, useEffect } from 'react';
import { Icon } from '../common/Icon';
import { useAppStore } from '../../lib/state';
import { api } from '../../lib/api';
import { copyText } from '../../lib/clipboard';

// ==================== 通用 Modal Wrapper ====================
function ModalOverlay({ isOpen, onClose, children }) {
  if (!isOpen) return null;
  return (
    <div className="modal-overlay active">
      <div>
        {children}
      </div>
    </div>
  );
}

// ==================== Project Modal ====================
export function ProjectModal({ isOpen, onClose, onProjectSelected, onOpenDesignSystem }) {
  const [projects, setProjects] = useState([]);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newDesignSystem, setNewDesignSystem] = useState('');
  const zipRef = useRef(null);
  const replaceZipRef = useRef(null);
  const [zipFileName, setZipFileName] = useState('未选择文件');
  const [editingId, setEditingId] = useState(null);
  const showToast = useAppStore((s) => s.showToast);
  const setConfig = useAppStore((s) => s.setConfig);
  const setCurrentProjectId = useAppStore((s) => s.setCurrentProjectId);
  const getCurrentProjectId = useAppStore((s) => s.getCurrentProjectId);

  const loadProjects = async () => {
    const res = await api.getProjects();
    setProjects(res.projects || []);
    setConfig({ projects: res.projects || [] });
  };

  React.useEffect(() => {
    if (isOpen) {
      loadProjects();
      resetForm();
    }
  }, [isOpen]);

  const resetForm = () => {
    setNewName(''); setNewDesc(''); setNewDesignSystem(''); setZipFileName('未选择文件');
    setEditingId(null);
    if (zipRef.current) zipRef.current.value = '';
  };

  const handleCreateOrUpdate = async () => {
    if (!newName.trim()) { showToast('请输入项目名称'); return; }
    let designSystem;
    if (newDesignSystem.trim()) {
      try { designSystem = JSON.parse(newDesignSystem); }
      catch { showToast('设计系统 JSON 格式错误'); return; }
    }
    const zipFile = zipRef.current?.files?.[0];

    try {
      if (editingId) {
        await api.updateProject(editingId, newName, newDesc, designSystem);
        showToast('项目已更新');
      } else {
        const result = await api.createProject(newName, newDesc, zipFile);
        if (result.project?.id) {
          setCurrentProjectId(result.project.id);
          if (designSystem) {
            await api.updateProject(result.project.id, newName, newDesc, designSystem);
          }
        }
        showToast('项目创建成功');
        onProjectSelected?.();
        onClose();
      }
      resetForm();
      loadProjects();
    } catch (e) {
      showToast('操作失败: ' + e.message);
    }
  };

  const switchToProject = (project) => {
    setCurrentProjectId(project.id);
    showToast(`已切换到项目: ${project.name}`);
    onProjectSelected?.();
    onClose();
  };

  const handleEdit = (e, p) => {
    e.stopPropagation();
    setEditingId(p.id);
    setNewName(p.name);
    setNewDesc(p.description || '');
    setNewDesignSystem(p.designSystem ? JSON.stringify(p.designSystem, null, 2) : '');
    setZipFileName('无需重新上传');
  };

  const handleReplaceHtml = (e, projectId) => {
    e.stopPropagation();
    replaceZipRef.current?.setAttribute('data-project-id', projectId);
    replaceZipRef.current?.click();
  };

  const handleReplaceZipChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const projectId = parseInt(e.target.getAttribute('data-project-id'));
    e.target.value = '';
    try {
      showToast('正在上传...');
      await api.replaceProjectHtml(projectId, file);
      showToast('HTML 已替换');
      if (projectId === getCurrentProjectId()) {
        onProjectSelected?.();
      }
    } catch (err) {
      showToast('替换失败: ' + err.message);
    }
  };

  const handleOpenDesignSystem = (e, p) => {
    e.stopPropagation();
    onOpenDesignSystem?.(p.id);
  };

  const handleDelete = async (e, id) => {
    e.stopPropagation();
    let ok = false;
    try { ok = window.confirm('确定删除此项目？所有相关数据将被删除。'); } catch { ok = false; }
    if (!ok) return;
    try {
      const currentId = getCurrentProjectId();
      await api.deleteProject(id);
      if (currentId === id) setCurrentProjectId(null);
      showToast('项目已删除');
      loadProjects();
    } catch (err) {
      showToast('删除失败: ' + err.message);
    }
  };

  const currentProjectId = getCurrentProjectId();

  return (
    <ModalOverlay isOpen={isOpen} onClose={onClose}>
      <div className="modal wide">
        <div className="modal-header">
          <span className="modal-title">项目管理</span>
          <button className="modal-close" onClick={onClose}><Icon name="x" /></button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">项目列表</label>
            <div className="browser-list" style={{ maxHeight: 280, marginBottom: 16 }}>
              {projects.length === 0 ? (
                <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>暂无项目，请创建新项目</div>
              ) : projects.map((p) => (
                <div className={`browser-item ${p.id === currentProjectId ? 'selected' : ''}`} key={p.id} onClick={() => switchToProject(p)}>
                  <span className="browser-icon"><Icon name="folder" size="lg" /></span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="browser-name">{p.name}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{p.description || '无描述'}</div>
                  </div>
                  <div className="project-actions" style={{ display: 'flex', gap: 4 }}>
                    <button className="btn btn-icon btn-sm" title="设计系统" onClick={(e) => handleOpenDesignSystem(e, p)}>
                      <Icon name="palette" size="sm" />
                    </button>
                    <button className="btn btn-icon btn-sm" title="编辑" onClick={(e) => handleEdit(e, p)}>
                      <Icon name="edit" size="sm" />
                    </button>
                    <button className="btn btn-icon btn-sm" title="替换 HTML" onClick={(e) => handleReplaceHtml(e, p.id)}>
                      <Icon name="upload" size="sm" />
                    </button>
                    <button className="btn btn-icon btn-sm" title="删除" onClick={(e) => handleDelete(e, p.id)}>
                      <Icon name="trash" size="sm" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <input type="file" ref={replaceZipRef} accept=".zip" style={{ display: 'none' }} onChange={handleReplaceZipChange} />
          <div className="form-group" style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
            <label className="form-label">{editingId ? '编辑项目' : '创建新项目'}</label>
            <input type="text" className="form-input" placeholder="项目名称" style={{ marginBottom: 8 }}
              value={newName} onChange={(e) => setNewName(e.target.value)} />
            <textarea className="form-textarea" placeholder="项目描述（可选）" style={{ marginBottom: 8, minHeight: 60 }}
              value={newDesc} onChange={(e) => setNewDesc(e.target.value)} />
            <div className="form-group">
              <label className="form-label">设计系统（JSON 格式，可选）</label>
              <textarea className="form-textarea" placeholder='{"colors": {"primary": "#6366f1"}}'
                style={{ minHeight: 80, fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}
                value={newDesignSystem} onChange={(e) => setNewDesignSystem(e.target.value)} />
            </div>
            <input type="file" ref={zipRef} accept=".zip" style={{ display: 'none' }}
              onChange={(e) => setZipFileName(e.target.files?.[0]?.name || '未选择文件')} />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>关闭</button>
          <button className="btn btn-primary" onClick={handleCreateOrUpdate}>{editingId ? '保存' : '创建'}</button>
        </div>
      </div>
    </ModalOverlay>
  );
}

// ==================== Image Upload Modal ====================
export function ImageUploadModal({ isOpen, onClose, onSuccess }) {
  const imgRef = useRef(null);
  const psdRef = useRef(null);
  const zipRef = useRef(null);
  const showToast = useAppStore((s) => s.showToast);
  const [dragover, setDragover] = useState('');
  const dropzoneRef = useRef(null);
  const psdDropzoneRef = useRef(null);

  const handleImages = async (files) => {
    if (!files?.length) return;
    const res = await api.uploadDesignImages(Array.from(files));
    if (res.error) { showToast(res.error); return; }
    showToast(`已上传 ${res.count || files.length} 张设计图`);
    onSuccess?.();
    onClose();
  };

  const handleZip = async (file) => {
    if (!file) return;
    const res = await api.uploadHtmlZip(file);
    if (res.error) { showToast(res.error); return; }
    showToast('HTML ZIP 已上传');
    onSuccess?.();
    onClose();
  };

  const handlePsd = async (files) => {
    if (!files?.length) return;
    showToast('正在上传 PSD...');
    const res = await api.uploadPsd(Array.from(files));
    if (res.error) { showToast(res.error); return; }
    showToast('PSD 已上传');
    onSuccess?.();
    onClose();
  };

  const handleDrop = (type, e) => {
    e.preventDefault(); setDragover('');
    const files = e.dataTransfer?.files;
    if (type === 'image') handleImages(files);
    else if (type === 'zip') handleZip(files?.[0]);
    else if (type === 'psd') {
      const psdFiles = Array.from(files || []).filter(f =>
        f.name.toLowerCase().endsWith('.psd') || f.name.toLowerCase().endsWith('.zip')
      );
      handlePsd(psdFiles);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    const imgEl = dropzoneRef.current;
    const psdEl = psdDropzoneRef.current;
    const onPasteImage = (e) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const imageFiles = [];
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) imageFiles.push(file);
        }
      }
      if (imageFiles.length > 0) {
        e.preventDefault();
        handleImages(imageFiles);
      }
    };
    const onPastePsd = (e) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const files = [];
      for (const item of items) {
        const file = item.getAsFile();
        if (file && (file.name.toLowerCase().endsWith('.psd') || file.name.toLowerCase().endsWith('.zip'))) {
          files.push(file);
        }
      }
      if (files.length > 0) {
        e.preventDefault();
        handlePsd(files);
      }
    };
    imgEl?.addEventListener('paste', onPasteImage);
    psdEl?.addEventListener('paste', onPastePsd);
    return () => {
      imgEl?.removeEventListener('paste', onPasteImage);
      psdEl?.removeEventListener('paste', onPastePsd);
    };
  }, [isOpen]);

  return (
    <ModalOverlay isOpen={isOpen} onClose={onClose}>
      <div className="modal">
        <div className="modal-header">
          <span className="modal-title">上传设计图</span>
          <button className="modal-close" onClick={onClose}><Icon name="x" /></button>
        </div>
        <div className="modal-body">
          <div className={`upload-dropzone ${dragover === 'img' ? 'is-dragover' : ''}`}
            ref={dropzoneRef} tabIndex={0}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}
            onDragOver={(e) => { e.preventDefault(); setDragover('img'); }}
            onDragLeave={() => setDragover('')}
            onDrop={(e) => handleDrop('image', e)}>
            <div className="upload-dropzone-icon"><Icon name="upload" size="lg" /></div>
            <div className="upload-dropzone-title">上传设计图</div>
            <div className="upload-dropzone-sub">拖拽图片到此处 / 点击此区域后粘贴（Ctrl/Cmd + V）</div>
            <button className="btn btn-sm btn-secondary" style={{ marginTop: 8 }}
              onClick={(e) => { e.stopPropagation(); imgRef.current?.click(); }}>
              <Icon name="upload" size="sm" /> 选择图片
            </button>
          </div>
          <input type="file" ref={imgRef} accept="image/*" multiple style={{ display: 'none' }}
            onChange={(e) => handleImages(e.target.files)} />

          <div className={`upload-dropzone ${dragover === 'psd' ? 'is-dragover' : ''}`}
            ref={psdDropzoneRef} tabIndex={0}
            style={{ marginTop: 12, display: 'flex', flexDirection: 'column', alignItems: 'center' }}
            onDragOver={(e) => { e.preventDefault(); setDragover('psd'); }}
            onDragLeave={() => setDragover('')}
            onDrop={(e) => handleDrop('psd', e)}>
            <div className="upload-dropzone-icon"><Icon name="layers" size="lg" /></div>
            <div className="upload-dropzone-title">上传 PSD 文件</div>
            <div className="upload-dropzone-sub">拖拽 .psd 或 ZIP 到此处 / 点击此区域后粘贴（Ctrl/Cmd + V）</div>
            <button className="btn btn-sm btn-secondary" style={{ marginTop: 8 }}
              onClick={(e) => { e.stopPropagation(); psdRef.current?.click(); }}>
              <Icon name="upload" size="sm" /> 选择 PSD
            </button>
          </div>
          <input type="file" ref={psdRef} accept=".psd,.zip" multiple style={{ display: 'none' }}
            onChange={(e) => handlePsd(e.target.files)} />

          <div className={`upload-dropzone ${dragover === 'zip' ? 'is-dragover' : ''}`}
            style={{ marginTop: 12 }}
            onClick={() => zipRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragover('zip'); }}
            onDragLeave={() => setDragover('')}
            onDrop={(e) => handleDrop('zip', e)}>
            <div className="upload-dropzone-icon"><Icon name="package" size="lg" /></div>
            <div className="upload-dropzone-title">上传 HTML ZIP</div>
            <div className="upload-dropzone-sub">点击选择 ZIP / 拖拽 ZIP 到此处</div>
          </div>
          <input type="file" ref={zipRef} accept=".zip" style={{ display: 'none' }}
            onChange={(e) => handleZip(e.target.files?.[0])} />

        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>关闭</button>
        </div>
      </div>
    </ModalOverlay>
  );
}

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

// ==================== Delete Confirm Modal ====================
export function DeleteConfirmModal({ isOpen, onClose, count, onConfirm }) {
  return (
    <ModalOverlay isOpen={isOpen} onClose={onClose}>
      <div className="modal">
        <div className="modal-header">
          <span className="modal-title">删除页面</span>
          <button className="modal-close" onClick={onClose}><Icon name="x" /></button>
        </div>
        <div className="modal-body">
          <p style={{ margin: '0 0 8px 0' }}>确定删除选中的 <b>{count}</b> 个页面吗？</p>
          <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 12 }}>将同时删除磁盘文件，操作不可撤销。</p>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>取消</button>
          <button className="btn btn-primary" onClick={() => { onConfirm(); onClose(); }}>删除</button>
        </div>
      </div>
    </ModalOverlay>
  );
}

// ==================== Prompt Modal ====================
export function PromptModal({ isOpen, onClose }) {
  const pagesConfig = useAppStore((s) => s.pagesConfig);
  const currentFile = useAppStore((s) => s.currentFile);
  const selectedFiles = useAppStore((s) => s.selectedFiles);
  const showToast = useAppStore((s) => s.showToast);
  const [platform, setPlatform] = useState('flutter');
  const [filterMode, setFilterMode] = useState('status');
  const [statusFilters, setStatusFilters] = useState({ pending: false, developing: true, completed: false });
  const [promptText, setPromptText] = useState('点击"生成"按钮生成提示词');

  React.useEffect(() => {
    if (isOpen) setPromptText('点击"生成"按钮生成提示词');
  }, [isOpen]);

  const generate = async () => {
    const currentOnly = filterMode === 'current';
    const selectedOnly = filterMode === 'selected';

    if (currentOnly && !currentFile) {
      showToast('请先选择当前页面');
      return;
    }
    if (selectedOnly && (!selectedFiles || selectedFiles.size === 0)) {
      showToast('请先在左侧文件列表勾选页面');
      return;
    }

    let pagesForPrompt = pagesConfig;
    if (currentOnly) {
      pagesForPrompt = {
        ...pagesConfig,
        htmlFiles: (pagesConfig.htmlFiles || []).filter(f => f.path === currentFile.path),
      };
    } else if (selectedOnly) {
      pagesForPrompt = {
        ...pagesConfig,
        htmlFiles: (pagesConfig.htmlFiles || []).filter(f => selectedFiles.has(f.path)),
      };
    }

    const project = useAppStore.getState().getCurrentProject();
    const designSystem = project?.designSystem || null;

    const activeFilters = Object.entries(statusFilters).filter(([_, v]) => v).map(([k]) => k);
    const useStatusFilter = filterMode === 'status';

    const res = await api.generatePrompt({
      pages: pagesForPrompt,
      targetPlatform: platform,
      designSystem,
      statusFilters: useStatusFilter ? (activeFilters.length > 0 ? activeFilters : null) : null,
    });
    if (res.error) { showToast(res.error); return; }
    setPromptText(res.prompt || '生成失败');
    showToast('提示词已生成');
  };

  const copy = async () => {
    const ok = await copyText(promptText);
    showToast(ok ? '已复制到剪贴板' : '复制失败，请手动选择文本复制');
  };

  const download = () => {
    const blob = new Blob([promptText], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'pages-prompt.md'; a.click();
    URL.revokeObjectURL(url);
  };

  const isStatusMode = filterMode === 'status';
  const selectedCount = selectedFiles?.size || 0;

  return (
    <ModalOverlay isOpen={isOpen} onClose={onClose}>
      <div className="modal wide">
        <div className="modal-header">
          <span className="modal-title">生成 AI 提示词</span>
          <button className="modal-close" onClick={onClose}><Icon name="x" /></button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">目标平台</label>
            <div className="dev-status-radio-group">
              <label className="radio-label">
                <input type="radio" name="platform" value="flutter" checked={platform === 'flutter'} onChange={(e) => setPlatform(e.target.value)} />
                <span>Flutter (Dart)</span>
              </label>
              <label className="radio-label">
                <input type="radio" name="platform" value="react-native" checked={platform === 'react-native'} onChange={(e) => setPlatform(e.target.value)} />
                <span>React Native (TypeScript)</span>
              </label>
              <label className="radio-label">
                <input type="radio" name="platform" value="uniapp" checked={platform === 'uniapp'} onChange={(e) => setPlatform(e.target.value)} />
                <span>UniApp (Vue)</span>
              </label>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">筛选页面</label>
            <div className="dev-status-radio-group">
              <label className="radio-label">
                <input type="radio" checked={filterMode === 'status'} onChange={() => setFilterMode('status')} />
                <span>开发状态</span>
              </label>
              <label className="radio-label">
                <input type="radio" checked={filterMode === 'current'} onChange={() => setFilterMode('current')} />
                <span>当前页</span>
              </label>
              <label className="radio-label">
                <input type="radio" checked={filterMode === 'selected'} onChange={() => setFilterMode('selected')} />
                <span>已选页面{selectedCount > 0 ? ` (${selectedCount})` : ''}</span>
              </label>
            </div>
          </div>
          <div className={`form-group${!isStatusMode ? ' is-disabled' : ''}`}>
            <label className="form-label">开发状态筛选</label>
            <div className="dev-status-filter">
              {['pending', 'developing', 'completed'].map((s) => (
                <label className="checkbox-label" key={s}>
                  <input type="checkbox" checked={statusFilters[s]} disabled={!isStatusMode}
                    onChange={(e) => setStatusFilters({ ...statusFilters, [s]: e.target.checked })} />
                  <span className={`dev-status-badge ${s}`}>
                    {s === 'pending' ? '待开发' : s === 'developing' ? '开发中' : '已完成'}
                  </span>
                </label>
              ))}
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">生成的提示词</label>
            <pre className="prompt-preview">{promptText}</pre>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={generate}><Icon name="refresh" /> 生成</button>
          <button className="btn btn-primary" onClick={copy}><Icon name="copy" /> 复制</button>
          <button className="btn btn-primary" onClick={download}><Icon name="download" /> 下载</button>
        </div>
      </div>
    </ModalOverlay>
  );
}

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
      await api.updateProject(editingDesignProjectId, currentProject?.name || '', currentProject?.description || '', dsData);
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
