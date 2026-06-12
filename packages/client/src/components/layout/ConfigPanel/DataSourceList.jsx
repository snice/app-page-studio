import { Icon } from '../../common/Icon';
import { AppSelect } from '../../common/AppSelect';
import { useAppStore } from '../../../lib/state';

const DATA_SOURCE_TIMINGS = [
  { value: 'onInit', label: '页面初始化' },
  { value: 'onRefresh', label: '下拉刷新' },
  { value: 'onLoadMore', label: '上拉加载更多' },
  { value: 'onFocus', label: '页面获得焦点' },
  { value: 'manual', label: '手动触发' },
];

const DATA_SOURCE_METHODS = ['GET', 'POST', 'PUT', 'DELETE'];

export function DataSourceList({ readOnly = false }) {
  const currentFile = useAppStore((s) => s.currentFile);
  const updateDataSource = useAppStore((s) => s.updateDataSource);
  const removeDataSource = useAppStore((s) => s.removeDataSource);
  const items = currentFile?.dataSources || [];

  if (items.length === 0) {
    return (
      <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: 24, background: 'var(--bg)', borderRadius: 'var(--radius-md)', border: '1px dashed var(--border)' }}>
        暂无数据源配置
        <span style={{ fontSize: 11, marginTop: 4, display: 'block' }}>点击 + 添加 HTTP API 数据加载</span>
      </div>
    );
  }

  return items.map((item, idx) => (
    <div className="data-source-item" key={idx}>
      <div className="data-source-header">
        <span className="data-source-name">{item.name || '未命名数据源'}</span>
        <button
          className="delete-btn"
          onClick={() => {
            if (!readOnly) removeDataSource(idx);
          }}
          disabled={readOnly}
          title={readOnly ? '当前为只读' : '删除'}
        >
          <Icon name="x" size="sm" />
        </button>
      </div>
      <div className="form-group" style={{ marginTop: 8 }}>
        <label className="form-label" style={{ fontSize: 11 }}>数据源名称</label>
        <input
          className="form-input"
          placeholder="如：用户列表、商品详情"
          value={item.name || ''}
          onChange={(e) => updateDataSource(idx, 'name', e.target.value)}
          readOnly={readOnly}
        />
      </div>
      <div className="form-group">
        <label className="form-label" style={{ fontSize: 11 }}>触发时机</label>
        <AppSelect
          ariaLabel="数据源触发时机"
          value={item.timing || 'onInit'}
          disabled={readOnly}
          options={DATA_SOURCE_TIMINGS}
          onValueChange={(value) => updateDataSource(idx, 'timing', value)}
        />
      </div>
      <div className="form-row" style={{ display: 'flex', gap: 8 }}>
        <div className="form-group" style={{ flex: '0 0 80px' }}>
          <label className="form-label" style={{ fontSize: 11 }}>方法</label>
          <AppSelect
            ariaLabel="数据源请求方法"
            value={item.method || 'GET'}
            disabled={readOnly}
            options={DATA_SOURCE_METHODS}
            onValueChange={(value) => updateDataSource(idx, 'method', value)}
          />
        </div>
        <div className="form-group" style={{ flex: 1 }}>
          <label className="form-label" style={{ fontSize: 11 }}>API 路径</label>
          <input
            className="form-input"
            placeholder="/api/xxx"
            value={item.apiPath || ''}
            onChange={(e) => updateDataSource(idx, 'apiPath', e.target.value)}
            readOnly={readOnly}
          />
        </div>
      </div>
      <div className="form-group">
        <label className="form-label" style={{ fontSize: 11 }}>请求样本</label>
        <textarea
          className="form-input"
          placeholder={'如：{ "page": 1, "size": 20 }'}
          value={item.requestSample || ''}
          onChange={(e) => updateDataSource(idx, 'requestSample', e.target.value)}
          readOnly={readOnly}
          style={{ minHeight: 50, resize: 'vertical', fontFamily: 'var(--font-mono, monospace)' }}
        />
      </div>
      <div className="form-group">
        <label className="form-label" style={{ fontSize: 11 }}>响应样本</label>
        <textarea
          className="form-input"
          placeholder={'如：{ "code": 0, "data": [...] }'}
          value={item.responseSample || ''}
          onChange={(e) => updateDataSource(idx, 'responseSample', e.target.value)}
          readOnly={readOnly}
          style={{ minHeight: 50, resize: 'vertical', fontFamily: 'var(--font-mono, monospace)' }}
        />
      </div>
    </div>
  ));
}
