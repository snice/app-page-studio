import { Icon } from '../../common/Icon';
import { useAppStore } from '../../../lib/state';
import { formatRegionLabel, highlightItem } from './helpers';

export function InteractionList({ iframeRef, readOnly = false }) {
  const currentFile = useAppStore((s) => s.currentFile);
  const removeInteraction = useAppStore((s) => s.removeInteraction);
  const updateInteraction = useAppStore((s) => s.updateInteraction);
  const interactions = currentFile?.interactions || [];

  if (interactions.length === 0) {
    return <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: 24, background: 'var(--bg)', borderRadius: 'var(--radius-md)', border: '1px dashed var(--border)' }}>暂无交互，使用"添加交互"按钮在预览中选择元素</div>;
  }

  return interactions.map((item, idx) => (
    <div className="interaction-item" key={idx}>
      <div className="interaction-header">
        <span
          className={`interaction-selector ${(item.selector || item.region) ? 'clickable' : ''}`}
          title={item.region ? `点击定位: 区域` : item.selector ? `点击定位: ${item.selector}` : '未指定'}
          onClick={() => highlightItem(item, iframeRef)}
        >
          {formatRegionLabel(item)}
        </span>
        <span className="interaction-type">{item.eventType || 'tap'}</span>
        <button
          className="delete-btn"
          onClick={() => {
            if (!readOnly) removeInteraction(idx);
          }}
          disabled={readOnly}
          title={readOnly ? '当前为只读' : '删除'}
        >
          <Icon name="trash" size="sm" />
        </button>
      </div>
      <input
        className="form-input"
        placeholder="动作描述"
        value={item.action || ''}
        onChange={(e) => updateInteraction(idx, 'action', e.target.value)}
        readOnly={readOnly}
        style={{ marginTop: 8 }}
      />
    </div>
  ));
}
