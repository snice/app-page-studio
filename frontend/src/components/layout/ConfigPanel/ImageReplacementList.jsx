import { useState, useRef } from 'react';
import { Icon } from '../../common/Icon';
import { useAppStore } from '../../../lib/state';
import { api } from '../../../lib/api';
import { formatRegionLabel, highlightItem } from './helpers';

export function ImageReplacementList({ iframeRef, readOnly = false }) {
  const currentFile = useAppStore((s) => s.currentFile);
  const removeImageReplacement = useAppStore((s) => s.removeImageReplacement);
  const updateImageReplacement = useAppStore((s) => s.updateImageReplacement);
  const items = currentFile?.imageReplacements || [];
  const projectId = useAppStore.getState().getCurrentProjectId();
  const [dragOverIdx, setDragOverIdx] = useState(null);
  const fileInputRefs = useRef({});

  const handleUpload = async (index, file) => {
    if (readOnly) return;
    if (!file) return;
    try {
      const res = await api.uploadAsset(file);
      if (res.error) throw new Error(res.error);
      const assetPath = res.file?.path || '';
      updateImageReplacement(index, 'imagePath', assetPath);
    } catch (e) {
      console.error('上传失败:', e);
    }
  };

  const handleDrop = (e, idx) => {
    e.preventDefault();
    if (readOnly) return;
    setDragOverIdx(null);
    const file = Array.from(e.dataTransfer?.files || []).find(f => f.type.startsWith('image/'));
    handleUpload(idx, file);
  };

  const handleFileSelect = (idx, e) => {
    const file = e.target?.files?.[0];
    if (e.target) e.target.value = '';
    handleUpload(idx, file);
  };

  if (items.length === 0) {
    return <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: 24, background: 'var(--bg)', borderRadius: 'var(--radius-md)', border: '1px dashed var(--border)' }}>暂无切图标记</div>;
  }

  return items.map((item, idx) => (
    <div className="interaction-item" key={idx}>
      <div className="interaction-header">
        <span
          className={`interaction-selector ${(item.selector || item.region) ? 'clickable' : ''}`}
          title={item.region ? `点击定位: 区域` : item.selector ? `点击定位: ${item.selector}` : '未指定'}
          onClick={() => highlightItem(item, iframeRef)}
        >
          {formatRegionLabel(item)}
        </span>
        <span className="interaction-type" style={{ background: 'linear-gradient(135deg, #8b5cf6 0%, #a855f7 100%)' }}>切图</span>
        <button
          className="delete-btn"
          onClick={() => {
            if (!readOnly) removeImageReplacement(idx);
          }}
          disabled={readOnly}
          title={readOnly ? '当前为只读' : '删除'}
        >
          <Icon name="x" size="sm" />
        </button>
      </div>
      <div className="asset-upload-row" style={{ marginTop: 8 }}>
        <div
          className={`asset-dropzone ${dragOverIdx === idx ? 'is-dragover' : ''} ${readOnly ? 'is-disabled' : ''}`}
          onDragOver={(e) => {
            if (readOnly) return;
            e.preventDefault();
            setDragOverIdx(idx);
          }}
          onDragLeave={() => setDragOverIdx(null)}
          onDrop={(e) => handleDrop(e, idx)}
          onClick={() => {
            if (!readOnly) fileInputRefs.current[idx]?.click();
          }}
          title={readOnly ? '当前为只读' : undefined}
        >
          {item.imagePath
            ? <img className="asset-preview" src={`/html/${projectId}/${item.imagePath}`} alt="asset" />
            : <div className="asset-placeholder">拖拽/点击上传切图</div>
          }
        </div>
        <input
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          ref={(el) => (fileInputRefs.current[idx] = el)}
          onChange={(e) => handleFileSelect(idx, e)}
          disabled={readOnly}
        />
      </div>
      <input
        className="form-input"
        value={item.imagePath || ''}
        placeholder="切图路径（自动填充）"
        readOnly
        style={{ marginTop: 6 }}
      />
      <input
        className="form-input"
        value={item.description || ''}
        placeholder="切图描述（可选）"
        onChange={(e) => updateImageReplacement(idx, 'description', e.target.value)}
        readOnly={readOnly}
        style={{ marginTop: 6 }}
      />
    </div>
  ));
}
