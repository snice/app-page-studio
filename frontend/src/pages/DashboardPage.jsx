import React from 'react';
import { Header } from '../components/layout/Header';
import { Sidebar } from '../components/layout/Sidebar';
import { PreviewPanel } from '../components/layout/PreviewPanel';
import { ConfigPanel } from '../components/layout/ConfigPanel';
import { Icon } from '../components/common/Icon';

export function DashboardPage({
  workspaceLoading,
  selectedFilesCount,
  clearSelection,
  mindMapOpen,
  iframeRef,
  onGoHome,
  onShowProjectSelector,
  onOpenDesignSystem,
  onDownloadDesigns,
  onScanHtml,
  onOpenImageUpload,
  onSaveConfig,
  onDownloadConfig,
  onShowPromptModal,
  onCreateGroup,
  onFileSelected,
  onToggleMindMap,
  onDeleteSelected,
  onTogglePicker,
  onToggleColorPicker,
  onIframeLoad,
  onRegionAction,
}) {
  return (
    <div className="app">
      <Header
        onGoHome={onGoHome}
        onShowProjectSelector={onShowProjectSelector}
        onOpenDesignSystem={onOpenDesignSystem}
        onDownloadDesigns={onDownloadDesigns}
        onScanHtml={onScanHtml}
        onOpenImageUpload={onOpenImageUpload}
        onSaveConfig={onSaveConfig}
        onDownloadConfig={onDownloadConfig}
        onShowPromptModal={onShowPromptModal}
      />
      <Sidebar
        onCreateGroup={onCreateGroup}
        onFileSelected={onFileSelected}
        onToggleMindMap={onToggleMindMap}
        mindMapOpen={mindMapOpen}
      />
      {selectedFilesCount > 0 && (
        <div className="selection-toolbar-float">
          <div className="selection-toolbar-top">
            已选择 <span className="selection-count">{selectedFilesCount}</span> 个文件
          </div>
          <div className="selection-toolbar-actions">
            <button className="btn btn-sm" style={{ background: '#000', color: '#fff' }} onClick={onCreateGroup}>创建分组</button>
            <button className="btn btn-sm btn-secondary" onClick={onDeleteSelected}>
              <Icon name="trash" size="sm" /> 删除
            </button>
            <button className="btn btn-sm btn-secondary" onClick={clearSelection}>取消</button>
          </div>
        </div>
      )}
      <PreviewPanel
        onTogglePicker={onTogglePicker}
        onToggleColorPicker={onToggleColorPicker}
        iframeRef={iframeRef}
        onIframeLoad={onIframeLoad}
        onRegionAction={onRegionAction}
      />
      <ConfigPanel iframeRef={iframeRef} />
      {workspaceLoading && (
        <div className="workspace-loading">
          <Icon name="refresh" size="lg" />
          正在打开项目
        </div>
      )}
    </div>
  );
}
