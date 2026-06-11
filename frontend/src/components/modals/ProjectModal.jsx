import React, { useState, useRef } from 'react';
import { Icon } from '../common/Icon';
import { useAppStore } from '../../lib/state';
import { api } from '../../lib/api';
import { ModalOverlay } from './ModalOverlay';

// ==================== Project Modal（新建 / 编辑） ====================
export function ProjectModal({ isOpen, onClose, onProjectSelected, initialEdit }) {
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [zipFile, setZipFile] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const zipRef = useRef(null);
  const showToast = useAppStore((s) => s.showToast);
  const setCurrentProjectId = useAppStore((s) => s.setCurrentProjectId);

  const isEdit = !!initialEdit;

  React.useEffect(() => {
    if (!isOpen) return;
    setName(initialEdit?.name || '');
    setDesc(initialEdit?.description || '');
    setZipFile(null);
    setSubmitting(false);
    if (zipRef.current) zipRef.current.value = '';
  }, [isOpen, initialEdit]);

  const pickZip = (file) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.zip')) { showToast('请选择 ZIP 文件'); return; }
    setZipFile(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    pickZip(e.dataTransfer?.files?.[0]);
  };

  const handleSubmit = async () => {
    if (!name.trim()) { showToast('请输入项目名称'); return; }
    setSubmitting(true);
    try {
      if (isEdit) {
        const updateRes = await api.updateProject(initialEdit.id, name.trim(), desc.trim());
        if (updateRes.error) throw new Error(updateRes.error);
        if (zipFile) {
          showToast('正在更新设计稿...');
          const replaceRes = await api.replaceProjectHtml(initialEdit.id, zipFile);
          if (replaceRes.error) throw new Error(replaceRes.error);
        }
        showToast('项目已更新');
        onProjectSelected?.(initialEdit.id);
      } else {
        const result = await api.createProject(name.trim(), desc.trim(), zipFile);
        if (result.error) throw new Error(result.error);
        if (result.project?.id) setCurrentProjectId(result.project.id);
        showToast('项目创建成功');
        onProjectSelected?.(result.project?.id);
      }
      onClose();
    } catch (e) {
      showToast('操作失败: ' + (e.message || '未知错误'));
    } finally {
      setSubmitting(false);
    }
  };

  const zipHint = isEdit ? '更新设计稿（覆盖现有，可选）' : '初始化设计稿（可选）';

  return (
    <ModalOverlay isOpen={isOpen} onClose={onClose}>
      <div className="modal">
        <div className="modal-header">
          <span className="modal-title">{isEdit ? '编辑项目' : '新建项目'}</span>
          <button className="modal-close" onClick={onClose}><Icon name="x" /></button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">项目名称</label>
            <input type="text" className="form-input" placeholder="请输入项目名称"
              value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <div className="form-group">
            <label className="form-label">项目描述</label>
            <textarea className="form-textarea" placeholder="项目描述（可选）" style={{ minHeight: 60 }}
              value={desc} onChange={(e) => setDesc(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">{zipHint}</label>
            <div
              className={`upload-dropzone ${dragOver ? 'is-dragover' : ''}`}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => zipRef.current?.click()}
            >
              <div className="upload-dropzone-icon"><Icon name="package" size="lg" /></div>
              {zipFile ? (
                <>
                  <div className="upload-dropzone-title">{zipFile.name}</div>
                  <div className="upload-dropzone-sub">点击或拖拽可重新选择</div>
                </>
              ) : (
                <>
                  <div className="upload-dropzone-title">拖拽 ZIP 到此处</div>
                  <div className="upload-dropzone-sub">{isEdit ? '上传后将覆盖现有设计稿' : '点击选择或拖拽设计稿 ZIP'}</div>
                </>
              )}
              <button className="btn btn-sm btn-secondary" style={{ marginTop: 8 }}
                onClick={(e) => { e.stopPropagation(); zipRef.current?.click(); }}>
                <Icon name="upload" size="sm" /> 选择 ZIP
              </button>
            </div>
            <input type="file" ref={zipRef} accept=".zip" style={{ display: 'none' }}
              onChange={(e) => { pickZip(e.target.files?.[0]); e.target.value = ''; }} />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>取消</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={submitting}>
            {isEdit ? '保存' : '创建'}
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}
