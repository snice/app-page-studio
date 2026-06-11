import React, { useRef, useState, useEffect } from 'react';
import { Icon } from '../common/Icon';
import { useAppStore } from '../../lib/state';
import { api } from '../../lib/api';
import { ModalOverlay } from './ModalOverlay';

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
