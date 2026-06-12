import { useState, useRef } from 'react';
import { useAppStore } from '../../../lib/state';
import { api } from '../../../lib/api';

/** Tab 图标上传组件（拖拽/点击上传） */
export function TabIconUploader({ label, value, placeholder, onChange, readOnly = false }) {
  const projectId = useAppStore.getState().getCurrentProjectId();
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);

  const handleUpload = async (file) => {
    if (readOnly) return;
    if (!file) return;
    try {
      const res = await api.uploadAsset(file);
      if (res.error) throw new Error(res.error);
      const assetPath = res.file?.path || '';
      onChange(assetPath || null);
    } catch (e) {
      console.error('上传失败:', e);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    if (readOnly) return;
    setDragOver(false);
    const file = Array.from(e.dataTransfer?.files || []).find(f => f.type.startsWith('image/'));
    handleUpload(file);
  };

  const handleFileSelect = (e) => {
    const file = e.target?.files?.[0];
    if (e.target) e.target.value = '';
    handleUpload(file);
  };

  return (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <div
        className={`asset-dropzone ${dragOver ? 'is-dragover' : ''} ${readOnly ? 'is-disabled' : ''}`}
        onDragOver={(e) => {
          if (readOnly) return;
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => {
          if (!readOnly) fileInputRef.current?.click();
        }}
        title={readOnly ? '当前为只读' : undefined}
      >
        {value
          ? <img className="asset-preview" src={`/html/${projectId}/${value}`} alt="icon" />
          : <div className="asset-placeholder">拖拽/点击上传切图</div>
        }
      </div>
      <input
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        ref={fileInputRef}
        onChange={handleFileSelect}
        disabled={readOnly}
      />
      <input
        className="form-input"
        value={value || ''}
        placeholder={placeholder}
        readOnly
        style={{ marginTop: 6 }}
      />
    </div>
  );
}
