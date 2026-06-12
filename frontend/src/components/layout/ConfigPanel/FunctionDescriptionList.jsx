import { Icon } from '../../common/Icon';
import { useAppStore } from '../../../lib/state';
import { formatRegionLabel, highlightItem } from './helpers';

export function FunctionDescriptionList({ iframeRef, readOnly = false }) {
  const currentFile = useAppStore((s) => s.currentFile);
  const removeFunctionDescription = useAppStore((s) => s.removeFunctionDescription);
  const updateFunctionDescription = useAppStore((s) => s.updateFunctionDescription);
  const items = currentFile?.functionDescriptions || [];

  if (items.length === 0) {
    return <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: 24, background: 'var(--bg)', borderRadius: 'var(--radius-md)', border: '1px dashed var(--border)' }}>暂无功能描述</div>;
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
        <span className="interaction-type" style={{ background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)' }}>功能</span>
        <button
          className="delete-btn"
          onClick={() => {
            if (!readOnly) removeFunctionDescription(idx);
          }}
          disabled={readOnly}
          title={readOnly ? '当前为只读' : '删除'}
        >
          <Icon name="x" size="sm" />
        </button>
      </div>
      <textarea
        className="form-input"
        style={{ marginTop: 8, minHeight: 60, resize: 'vertical' }}
        placeholder="功能描述（如：点击打开摄像头拍摄、扫码识别二维码等）"
        value={item.description || ''}
        onChange={(e) => updateFunctionDescription(idx, 'description', e.target.value)}
        readOnly={readOnly}
      />
    </div>
  ));
}
