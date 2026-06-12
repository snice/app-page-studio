import { Icon } from '../common/Icon';
import { useAppStore } from '../../lib/state';
import { LayerPanel } from '../psd/LayerPanel';
import { SlicesPanel } from '../psd/SlicesPanel';
import { InteractionList } from './ConfigPanel/InteractionList';
import { ImageReplacementList } from './ConfigPanel/ImageReplacementList';
import { FunctionDescriptionList } from './ConfigPanel/FunctionDescriptionList';
import { PageGroupComboBox } from './ConfigPanel/PageGroupComboBox';
import { TabBarConfig } from './ConfigPanel/TabBarConfig';
import { DataSourceList } from './ConfigPanel/DataSourceList';
import { highlightItems } from './ConfigPanel/helpers';

export function ConfigPanel({ iframeRef }) {
  const currentFile = useAppStore((s) => s.currentFile);
  const pagesConfig = useAppStore((s) => s.pagesConfig);
  const isCurrentEditor = useAppStore((s) => s.session.isCurrentEditor);
  const presenceUsers = useAppStore((s) => s.session.presenceUsers);
  const wsConnectionId = useAppStore((s) => s.session.wsConnectionId);
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
  const psdSelectedSliceId = useAppStore((s) => s.psdSelectedSliceId);
  const setPsdSelectedSliceId = useAppStore((s) => s.setPsdSelectedSliceId);
  const updatePsdMarkedSlice = useAppStore((s) => s.updatePsdMarkedSlice);
  const removePsdMarkedSlice = useAppStore((s) => s.removePsdMarkedSlice);
  const psdShowSlices = useAppStore((s) => s.psdShowSlices);
  const setPsdShowSlices = useAppStore((s) => s.setPsdShowSlices);

  const isPsdFile = currentFile?.sourceType === 'psd';
  const isPsdLayers = isPsdFile && psdMode === 'layers';
  const groups = pagesConfig.pageGroups || [];
  const readOnly = !isCurrentEditor;
  const currentPageCollaborators = (presenceUsers || []).filter((item) =>
    item.connectionId !== wsConnectionId && item.pagePath && item.pagePath === currentFile?.path
  );

  const handleFileFieldChange = (field, value) => {
    if (readOnly) return;
    updateCurrentFile({ [field]: value });
  };

  return (
    <aside className="panel">
      <div className="panel-tabs">
        {!isPsdLayers ? (
          <>
            <div className={`panel-tab ${activePanelTab === 'file' ? 'active' : ''}`} onClick={() => setActivePanelTab('file')}>页面配置</div>
            <div className={`panel-tab ${activePanelTab === 'analysis' ? 'active' : ''}`} onClick={() => setActivePanelTab('analysis')}>数据管理</div>
          </>
        ) : (
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
          {currentPageCollaborators.length > 0 && (
            <div className="panel-presence">
              <Icon name="users" size="sm" />
              <span>当前页协作者</span>
              <div className="panel-presence-users">
                {currentPageCollaborators.map((item) => (
                  <span className="panel-presence-user" key={item.connectionId || item.sessionId}>
                    {item.user?.username || '用户'}
                  </span>
                ))}
              </div>
            </div>
          )}
          <div className="panel-section">
            <div className="panel-section-title">基本信息</div>
            <div className="form-group">
              <label className="checkbox-label" title="同一分组中作为入口/默认呈现的状态，无需填写状态名称">
                <input
                  type="checkbox"
                  checked={!!currentFile?.isPrimaryState}
                  onChange={(e) => {
                    if (!readOnly) useAppStore.getState().setPrimaryState(e.target.checked);
                  }}
                  disabled={readOnly}
                />
                <span>主状态（分组的默认/入口状态，无需状态名称）</span>
              </label>
            </div>
            {!currentFile?.isPrimaryState && (
              <div className="form-group">
                <label className="form-label">状态名称</label>
                <input type="text" className="form-input" placeholder="如：加载中、空数据、错误"
                  value={currentFile?.stateName || ''}
                  onChange={(e) => handleFileFieldChange('stateName', e.target.value)}
                  readOnly={readOnly} />
              </div>
            )}
            <div className="form-group">
              <label className="form-label">状态描述</label>
              <textarea className="form-textarea" placeholder="描述此状态的显示场景"
                value={currentFile?.description || ''}
                onChange={(e) => handleFileFieldChange('description', e.target.value)}
                readOnly={readOnly} />
            </div>
            <div className="form-group">
              <label className="form-label">开发状态</label>
              <div className="dev-status-radio-group">
                {['pending', 'developing', 'completed'].map((status) => (
                  <label className="radio-label" key={status}>
                    <input type="radio" name="devStatus" value={status}
                      checked={currentFile?.devStatus === status}
                      onChange={(e) => handleFileFieldChange('devStatus', e.target.value)}
                      disabled={readOnly} />
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
              readOnly={readOnly}
              onChange={(groupId) => handleFileFieldChange('groupId', groupId)}
            />
          </div>

          <TabBarConfig readOnly={readOnly} />

          <div className="panel-section">
            <div className="panel-section-title">交互行为</div>
            <InteractionList iframeRef={iframeRef} readOnly={readOnly} />
          </div>

          <div className="panel-section">
            <div className="panel-section-title">
              切图标记
              {(currentFile?.imageReplacements?.length > 0) && (
                <button
                  className="btn-icon"
                  onClick={() => highlightItems(currentFile.imageReplacements, iframeRef)}
                  title="高亮所有切图标记"
                >
                  <Icon name="target" size="sm" />
                </button>
              )}
            </div>
            <ImageReplacementList iframeRef={iframeRef} readOnly={readOnly} />
          </div>

          <div className="panel-section">
            <div className="panel-section-title">
              功能描述
              {(currentFile?.functionDescriptions?.length > 0) && (
                <button
                  className="btn-icon"
                  onClick={() => highlightItems(currentFile.functionDescriptions, iframeRef)}
                  title="高亮所有功能描述"
                >
                  <Icon name="target" size="sm" />
                </button>
              )}
            </div>
            <FunctionDescriptionList iframeRef={iframeRef} readOnly={readOnly} />
          </div>
        </div>
      )}

      {activePanelTab === 'analysis' && (
        <div className="panel-content">
          <div className="panel-section">
            <div className="panel-section-title">
              数据加载配置
              <button
                className="btn-icon"
                onClick={() => {
                  if (!readOnly) addDataSource({ name: '', timing: 'onInit', method: 'GET', apiPath: '', requestSample: '', responseSample: '' });
                }}
                disabled={readOnly}
                title={readOnly ? '当前为只读' : '添加数据源'}
              >
                <Icon name="plus" size="sm" />
              </button>
            </div>
            <DataSourceList readOnly={readOnly} />
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
            readOnly={readOnly}
            onMergeSlice={() => {
              if (readOnly) return;
              window.dispatchEvent(new CustomEvent('psd-merge-slice'));
            }}
            onMarkSingle={(layer) => {
              if (readOnly) return;
              window.dispatchEvent(new CustomEvent('psd-mark-single', { detail: { layer } }));
            }}
            onUnmarkSlice={(sliceId) => {
              if (readOnly) return;
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
            readOnly={readOnly}
            onUpdate={(id, updates) => {
              if (!readOnly) updatePsdMarkedSlice(id, updates);
            }}
            onDelete={(id) => {
              if (!readOnly) removePsdMarkedSlice(id);
            }}
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
