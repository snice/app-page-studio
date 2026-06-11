import React, { useState, useRef } from 'react';
import { ComboBox } from '@heroui/react/combo-box';
import { Input } from '@heroui/react/input';
import { ListBox } from '@heroui/react/list-box';
import { Icon } from '../common/Icon';
import { useAppStore } from '../../lib/state';
import { highlightElement } from '../../lib/picker';
import { api } from '../../lib/api';
import { LayerPanel } from '../psd/LayerPanel';
import { SlicesPanel } from '../psd/SlicesPanel';

const UNGROUPED_KEY = '__ungrouped__';

/** 格式化区域标签 - 显示 device 坐标 */
function formatRegionLabel(item) {
  if (item.selector && item.selector !== '区域') return item.selector;
  if (item.region) {
    const r = item.region.device || item.region.image || item.region;
    if (r && r.x !== undefined) return `区域 [${r.x}, ${r.y}, ${r.width}, ${r.height}]`;
  }
  return '(未选择)';
}

/** 在图片上高亮区域 */
function highlightImageRegion(region) {
  const screen = document.querySelector('.phone-screen');
  const img = document.querySelector('.design-image');
  if (!screen || !img) return;
  if (!region || !region.image) return;

  const rect = img.getBoundingClientRect();
  const imageW = img.naturalWidth || rect.width;
  const imageH = img.naturalHeight || rect.height;
  if (!imageW || !imageH) return;
  const scale = Math.min(rect.width / imageW, rect.height / imageH);
  const drawW = imageW * scale;
  const drawH = imageH * scale;
  const offsetX = (rect.width - drawW) / 2;
  const offsetY = (rect.height - drawH) / 2;

  const imgR = region.image;
  const x = imgR.x * scale + offsetX;
  const y = imgR.y * scale + offsetY;
  const w = imgR.width * scale;
  const h = imgR.height * scale;

  // 移除旧的高亮
  screen.querySelectorAll('.image-region-highlight').forEach(el => el.remove());

  const highlight = document.createElement('div');
  highlight.className = 'image-region-highlight';
  highlight.style.left = `${x}px`;
  highlight.style.top = `${y}px`;
  highlight.style.width = `${w}px`;
  highlight.style.height = `${h}px`;
  screen.appendChild(highlight);

  // 自动滚动到高亮位置（如果不在可视区）
  const screenRect = screen.getBoundingClientRect();
  const highlightTop = y;
  const highlightBottom = y + h;
  const scrollTop = screen.scrollTop;
  const screenH = screen.clientHeight;

  if (highlightTop < scrollTop) {
    // 高亮在可视区上方，滚动到顶部
    screen.scrollTo({ top: Math.max(0, highlightTop - 20), behavior: 'smooth' });
  } else if (highlightBottom > scrollTop + screenH) {
    // 高亮在可视区下方，滚动到底部
    screen.scrollTo({ top: highlightBottom - screenH + 20, behavior: 'smooth' });
  }

  setTimeout(() => highlight.remove(), 3000);
}

/** 高亮交互项（区域或元素） */
function highlightItem(item, iframeRef) {
  if (item.region) {
    highlightImageRegion(item.region);
  } else if (item.selector && item.selector !== '区域') {
    highlightElement(iframeRef?.current, item.selector);
  }
}

/** 交互列表渲染 */
function InteractionList({ iframeRef }) {
  const currentFile = useAppStore((s) => s.currentFile);
  const removeInteraction = useAppStore((s) => s.removeInteraction);
  const updateInteraction = useAppStore((s) => s.updateInteraction);
  const interactions = currentFile?.interactions || [];

  const handleHighlight = (item) => {
    highlightItem(item, iframeRef);
  };

  if (interactions.length === 0) {
    return <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: 24, background: 'var(--bg)', borderRadius: 'var(--radius-md)', border: '1px dashed var(--border)' }}>暂无交互，使用"添加交互"按钮在预览中选择元素</div>;
  }

  return interactions.map((item, idx) => (
    <div className="interaction-item" key={idx}>
      <div className="interaction-header">
        <span
          className={`interaction-selector ${(item.selector || item.region) ? 'clickable' : ''}`}
          title={item.region ? `点击定位: 区域` : item.selector ? `点击定位: ${item.selector}` : '未指定'}
          onClick={() => handleHighlight(item)}
        >
          {formatRegionLabel(item)}
        </span>
        <span className="interaction-type">{item.eventType || 'tap'}</span>
        <button className="delete-btn" onClick={() => removeInteraction(idx)}>
          <Icon name="trash" size="sm" />
        </button>
      </div>
      <input
        className="form-input"
        placeholder="动作描述"
        value={item.action || ''}
        onChange={(e) => updateInteraction(idx, 'action', e.target.value)}
        style={{ marginTop: 8 }}
      />
    </div>
  ));
}

/** 切图标记列表 */
function ImageReplacementList({ iframeRef }) {
  const currentFile = useAppStore((s) => s.currentFile);
  const removeImageReplacement = useAppStore((s) => s.removeImageReplacement);
  const updateImageReplacement = useAppStore((s) => s.updateImageReplacement);
  const items = currentFile?.imageReplacements || [];
  const projectId = useAppStore.getState().getCurrentProjectId();
  const [dragOverIdx, setDragOverIdx] = useState(null);
  const fileInputRefs = useRef({});

  const handleUpload = async (index, file) => {
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
        <button className="delete-btn" onClick={() => removeImageReplacement(idx)}>
          <Icon name="x" size="sm" />
        </button>
      </div>
      <div className="asset-upload-row" style={{ marginTop: 8 }}>
        <div
          className={`asset-dropzone ${dragOverIdx === idx ? 'is-dragover' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDragOverIdx(idx); }}
          onDragLeave={() => setDragOverIdx(null)}
          onDrop={(e) => handleDrop(e, idx)}
          onClick={() => fileInputRefs.current[idx]?.click()}
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
        style={{ marginTop: 6 }}
      />
    </div>
  ));
}

/** 功能描述列表 */
function FunctionDescriptionList({ iframeRef }) {
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
        <button className="delete-btn" onClick={() => removeFunctionDescription(idx)}>
          <Icon name="x" size="sm" />
        </button>
      </div>
      <textarea
        className="form-input"
        style={{ marginTop: 8, minHeight: 60, resize: 'vertical' }}
        placeholder="功能描述（如：点击打开摄像头拍摄、扫码识别二维码等）"
        value={item.description || ''}
        onChange={(e) => updateFunctionDescription(idx, 'description', e.target.value)}
      />
    </div>
  ));
}

function PageGroupComboBox({ groups, value, disabled, onChange }) {
  const items = [
    { id: UNGROUPED_KEY, name: '未分组' },
    ...groups.map((group) => ({
      id: String(group.id),
      name: group.name || '未命名分组',
      description: group.description || '',
    })),
  ];
  const selectedKey = disabled ? null : value ? String(value) : UNGROUPED_KEY;

  return (
    <ComboBox
      aria-label="所属页面分组"
      className="page-group-combobox"
      fullWidth
      isDisabled={disabled}
      menuTrigger="focus"
      selectedKey={selectedKey}
      onSelectionChange={(key) => {
        if (disabled || key == null) return;
        const nextKey = String(key);
        onChange(nextKey === UNGROUPED_KEY ? null : nextKey);
      }}
    >
      <ComboBox.InputGroup className="page-group-combobox-input-group">
        <Input
          className="page-group-combobox-input"
          placeholder={disabled ? '请先选择页面文件' : '搜索或选择页面分组'}
        />
        <ComboBox.Trigger className="page-group-combobox-trigger" aria-label="打开页面分组列表">
          <Icon name="chevronDown" size="sm" />
        </ComboBox.Trigger>
      </ComboBox.InputGroup>
      <ComboBox.Popover className="page-group-combobox-popover" placement="bottom start">
        <ListBox className="page-group-combobox-list" items={items}>
          {(item) => (
            <ListBox.Item
              key={item.id}
              id={item.id}
              textValue={item.name}
              className="page-group-combobox-item"
            >
              <span className="page-group-combobox-item-content">
                <span className="page-group-combobox-item-title">{item.name}</span>
                {item.description && (
                  <span className="page-group-combobox-item-desc">{item.description}</span>
                )}
              </span>
              <ListBox.ItemIndicator className="page-group-combobox-item-indicator" />
            </ListBox.Item>
          )}
        </ListBox>
      </ComboBox.Popover>
    </ComboBox>
  );
}

/** Tab 图标上传组件（拖拽/点击上传） */
function TabIconUploader({ label, value, placeholder, onChange }) {
  const projectId = useAppStore.getState().getCurrentProjectId();
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);

  const handleUpload = async (file) => {
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
        className={`asset-dropzone ${dragOver ? 'is-dragover' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
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

/** TabBar 配置 */
function TabBarConfig() {
  const currentFile = useAppStore((s) => s.currentFile);
  const updateCurrentFile = useAppStore((s) => s.updateCurrentFile);
  const isTabbar = currentFile?.isTabbarPage || false;

  const handleToggle = (checked) => {
    updateCurrentFile({
      isTabbarPage: checked,
      tabIndex: checked ? (currentFile?.tabIndex || null) : null,
      tabName: checked ? (currentFile?.tabName || null) : null,
      tabIconDefault: checked ? (currentFile?.tabIconDefault || null) : null,
      tabIconSelected: checked ? (currentFile?.tabIconSelected || null) : null,
    });
  };

  const handleFieldChange = (field, value) => {
    updateCurrentFile({ [field]: value });
  };

  return (
    <div className="panel-section">
      <div className="panel-section-title">Tabbar 配置</div>
      <div className="form-group">
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={isTabbar}
            onChange={(e) => handleToggle(e.target.checked)}
          />
          <span>这是 Tabbar 页面</span>
        </label>
      </div>
      {isTabbar && (
        <>
          <div className="form-group">
            <label className="form-label">Tab 序号（从1开始）</label>
            <input type="number" className="form-input" min="1" max="10" placeholder="如：1"
              value={currentFile?.tabIndex || ''}
              onChange={(e) => handleFieldChange('tabIndex', e.target.value ? parseInt(e.target.value) : null)} />
          </div>
          <div className="form-group">
            <label className="form-label">Tab 名称</label>
            <input type="text" className="form-input" placeholder="如：首页"
              value={currentFile?.tabName || ''}
              onChange={(e) => handleFieldChange('tabName', e.target.value || null)} />
          </div>
          <TabIconUploader
            label="默认图标"
            value={currentFile?.tabIconDefault}
            placeholder="如：assets/tab_home.png"
            onChange={(v) => handleFieldChange('tabIconDefault', v)}
          />
          <TabIconUploader
            label="选中图标"
            value={currentFile?.tabIconSelected}
            placeholder="如：assets/tab_home_selected.png"
            onChange={(v) => handleFieldChange('tabIconSelected', v)}
          />
        </>
      )}
    </div>
  );
}

const DATA_SOURCE_TIMINGS = [
  { value: 'onInit', label: '页面初始化' },
  { value: 'onRefresh', label: '下拉刷新' },
  { value: 'onLoadMore', label: '上拉加载更多' },
  { value: 'onFocus', label: '页面获得焦点' },
  { value: 'manual', label: '手动触发' },
];

const DATA_SOURCE_METHODS = ['GET', 'POST', 'PUT', 'DELETE'];

/** 数据源列表 */
function DataSourceList() {
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
        <button className="delete-btn" onClick={() => removeDataSource(idx)} title="删除">
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
        />
      </div>
      <div className="form-group">
        <label className="form-label" style={{ fontSize: 11 }}>触发时机</label>
        <select
          className="form-select"
          value={item.timing || 'onInit'}
          onChange={(e) => updateDataSource(idx, 'timing', e.target.value)}
        >
          {DATA_SOURCE_TIMINGS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>
      <div className="form-row" style={{ display: 'flex', gap: 8 }}>
        <div className="form-group" style={{ flex: '0 0 80px' }}>
          <label className="form-label" style={{ fontSize: 11 }}>方法</label>
          <select
            className="form-select"
            value={item.method || 'GET'}
            onChange={(e) => updateDataSource(idx, 'method', e.target.value)}
          >
            {DATA_SOURCE_METHODS.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>
        <div className="form-group" style={{ flex: 1 }}>
          <label className="form-label" style={{ fontSize: 11 }}>API 路径</label>
          <input
            className="form-input"
            placeholder="/api/xxx"
            value={item.apiPath || ''}
            onChange={(e) => updateDataSource(idx, 'apiPath', e.target.value)}
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
          style={{ minHeight: 50, resize: 'vertical', fontFamily: 'var(--font-mono, monospace)' }}
        />
      </div>
    </div>
  ));
}

export function ConfigPanel({ iframeRef }) {
  const currentFile = useAppStore((s) => s.currentFile);
  const pagesConfig = useAppStore((s) => s.pagesConfig);
  const activePanelTab = useAppStore((s) => s.activePanelTab);
  const setActivePanelTab = useAppStore((s) => s.setActivePanelTab);
  const updateCurrentFile = useAppStore((s) => s.updateCurrentFile);
  const addDataSource = useAppStore((s) => s.addDataSource);

  // PSD state
  const psdMode = useAppStore((s) => s.psdMode);
  const psdData = useAppStore((s) => s.psdData);
  const psdSelectedLayer = useAppStore((s) => s.psdSelectedLayer);
  const setPsdSelectedLayer = useAppStore((s) => s.setPsdSelectedLayer);
  const psdCheckedLayerIds = useAppStore((s) => s.psdCheckedLayerIds);
  const togglePsdCheckedLayer = useAppStore((s) => s.togglePsdCheckedLayer);
  const clearPsdCheckedLayers = useAppStore((s) => s.clearPsdCheckedLayers);
  const psdHiddenLayerIds = useAppStore((s) => s.psdHiddenLayerIds);
  const togglePsdHiddenLayer = useAppStore((s) => s.togglePsdHiddenLayer);
  const psdMarkedSlices = useAppStore((s) => s.psdMarkedSlices);
  const addPsdMarkedSlice = useAppStore((s) => s.addPsdMarkedSlice);
  const psdSelectedSliceId = useAppStore((s) => s.psdSelectedSliceId);
  const setPsdSelectedSliceId = useAppStore((s) => s.setPsdSelectedSliceId);
  const updatePsdMarkedSlice = useAppStore((s) => s.updatePsdMarkedSlice);
  const removePsdMarkedSlice = useAppStore((s) => s.removePsdMarkedSlice);
  const psdShowSlices = useAppStore((s) => s.psdShowSlices);
  const setPsdShowSlices = useAppStore((s) => s.setPsdShowSlices);

  const isPsdFile = currentFile?.sourceType === 'psd';
  const isPsdLayers = isPsdFile && psdMode === 'layers';
  const groups = pagesConfig.pageGroups || [];

  const handleFileFieldChange = (field, value) => {
    updateCurrentFile({ [field]: value });
  };

  return (
    <aside className="panel">
      <div className="panel-tabs">
        {!isPsdLayers ? (
          /* 预览模式: 页面配置 + 数据管理 */
          <>
            <div className={`panel-tab ${activePanelTab === 'file' ? 'active' : ''}`} onClick={() => setActivePanelTab('file')}>页面配置</div>
            <div className={`panel-tab ${activePanelTab === 'analysis' ? 'active' : ''}`} onClick={() => setActivePanelTab('analysis')}>数据管理</div>
          </>
        ) : (
          /* 图层模式: 图层 + 切图 */
          <>
            <div className={`panel-tab ${activePanelTab === 'layers' ? 'active' : ''}`} onClick={() => setActivePanelTab('layers')}>
              <Icon name="layers" size="sm" />
              <span>图层</span>
            </div>
            <div className={`panel-tab ${activePanelTab === 'slices' ? 'active' : ''}`} onClick={() => setActivePanelTab('slices')}>
              <Icon name="scissors" size="sm" />
              <span>切图</span>
              {psdMarkedSlices.length > 0 && <span className="panel-tab-badge">{psdMarkedSlices.length}</span>}
            </div>
          </>
        )}
      </div>

      {activePanelTab === 'file' && (
        <div className="panel-content">
          <div className="panel-section">
            <div className="panel-section-title">基本信息</div>
            <div className="form-group">
              <label className="checkbox-label" title="同一分组中作为入口/默认呈现的状态，无需填写状态名称">
                <input
                  type="checkbox"
                  checked={!!currentFile?.isPrimaryState}
                  onChange={(e) => useAppStore.getState().setPrimaryState(e.target.checked)}
                />
                <span>主状态（分组的默认/入口状态，无需状态名称）</span>
              </label>
            </div>
            {!currentFile?.isPrimaryState && (
              <div className="form-group">
                <label className="form-label">状态名称</label>
                <input type="text" className="form-input" placeholder="如：加载中、空数据、错误"
                  value={currentFile?.stateName || ''}
                  onChange={(e) => handleFileFieldChange('stateName', e.target.value)} />
              </div>
            )}
            <div className="form-group">
              <label className="form-label">状态描述</label>
              <textarea className="form-textarea" placeholder="描述此状态的显示场景"
                value={currentFile?.description || ''}
                onChange={(e) => handleFileFieldChange('description', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">开发状态</label>
              <div className="dev-status-radio-group">
                {['pending', 'developing', 'completed'].map((status) => (
                  <label className="radio-label" key={status}>
                    <input type="radio" name="devStatus" value={status}
                      checked={currentFile?.devStatus === status}
                      onChange={(e) => handleFileFieldChange('devStatus', e.target.value)} />
                    <span className={`dev-status-badge ${status}`}>
                      {status === 'pending' ? '待开发' : status === 'developing' ? '开发中' : '已完成'}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          {currentFile?.sourceType === 'image' && (
            <div className="panel-section">
              <div className="panel-section-title">设计图模式</div>
              <div className="form-group">
                <label className="form-label">设计图路径</label>
                <input type="text" className="form-input" readOnly value={currentFile?.imagePath || ''} />
              </div>
            </div>
          )}

          <div className="panel-section">
            <div className="panel-section-title">所属页面分组</div>
            <PageGroupComboBox
              groups={groups}
              value={currentFile?.groupId}
              disabled={!currentFile}
              onChange={(groupId) => handleFileFieldChange('groupId', groupId)}
            />
          </div>

          <TabBarConfig />

          <div className="panel-section">
            <div className="panel-section-title">交互行为</div>
            <InteractionList iframeRef={iframeRef} />
          </div>

          <div className="panel-section">
            <div className="panel-section-title">切图标记</div>
            <ImageReplacementList iframeRef={iframeRef} />
          </div>

          <div className="panel-section">
            <div className="panel-section-title">功能描述</div>
            <FunctionDescriptionList iframeRef={iframeRef} />
          </div>
        </div>
      )}

      {activePanelTab === 'analysis' && (
        <div className="panel-content">
          <div className="panel-section">
            <div className="panel-section-title">
              数据加载配置
              <button className="btn-icon" onClick={() => addDataSource({ name: '', timing: 'onInit', method: 'GET', apiPath: '', requestSample: '', responseSample: '' })} title="添加数据源">
                <Icon name="plus" size="sm" />
              </button>
            </div>
            <DataSourceList />
          </div>
        </div>
      )}

      {activePanelTab === 'layers' && isPsdLayers && psdData && (
        <div className="panel-content" style={{ padding: 0, flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <LayerPanel
            layers={psdData.layers}
            selected={psdSelectedLayer}
            onSelect={setPsdSelectedLayer}
            checkedIds={psdCheckedLayerIds}
            onCheck={togglePsdCheckedLayer}
            onClearChecked={clearPsdCheckedLayers}
            hiddenLayerIds={psdHiddenLayerIds}
            onToggleVisibility={togglePsdHiddenLayer}
            manualSliceLayerIds={new Set(psdMarkedSlices.flatMap(s => s.layerIds))}
            slices={psdMarkedSlices}
            onMergeSlice={() => {
              window.dispatchEvent(new CustomEvent('psd-merge-slice'));
            }}
            onMarkSingle={(layer) => {
              window.dispatchEvent(new CustomEvent('psd-mark-single', { detail: { layer } }));
            }}
            onUnmarkSlice={(sliceId) => {
              removePsdMarkedSlice(sliceId);
            }}
          />
        </div>
      )}

      {activePanelTab === 'slices' && isPsdLayers && (
        <div className="panel-content" style={{ padding: 0, flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <SlicesPanel
            slices={psdMarkedSlices}
            selectedId={psdSelectedSliceId}
            onSelect={setPsdSelectedSliceId}
            onUpdate={(id, updates) => updatePsdMarkedSlice(id, updates)}
            onDelete={removePsdMarkedSlice}
            onExportOne={(slice) => {
              window.dispatchEvent(new CustomEvent('psd-export-slice', { detail: { slice } }));
            }}
            onExportAll={() => {
              window.dispatchEvent(new CustomEvent('psd-export-all-slices'));
            }}
            showSlices={psdShowSlices}
            onToggleShow={() => setPsdShowSlices(!psdShowSlices)}
          />
        </div>
      )}
    </aside>
  );
}
