import React, { useEffect } from 'react';
import { Header } from '../components/layout/Header';
import { Sidebar } from '../components/layout/Sidebar';
import { PreviewPanel } from '../components/layout/PreviewPanel';
import { ConfigPanel } from '../components/layout/ConfigPanel';
import { Icon } from '../components/common/Icon';
import { ElementStylesPanel } from '../components/picker/ElementStylesPanel';
import { DashboardModals } from './DashboardModals';
import { useWorkspaceController } from '../hooks/useWorkspaceController';
import { useAppStore } from '../lib/state';
import { api } from '../lib/api';

// ==================== 选择器动作菜单 ====================
function PickerActionMenu({ menu, isHtml, onAction, onClose }) {
  useEffect(() => {
    if (!menu) return;
    const handler = () => onClose();
    const timer = setTimeout(() => document.addEventListener('click', handler), 10);
    return () => { clearTimeout(timer); document.removeEventListener('click', handler); };
  }, [menu, onClose]);

  if (!menu) return null;

  const items = [
    { key: 'interaction', icon: 'target', label: '添加交互' },
    { key: 'image', icon: 'image', label: '切图标记' },
    { key: 'function', icon: 'info', label: '功能描述' },
    ...(isHtml ? [{ key: 'styles', icon: 'code', label: '查看样式' }] : []),
  ];

  return (
    <div
      className="picker-action-menu"
      style={{
        position: 'fixed', left: menu.x, top: menu.y, zIndex: 10001,
        background: 'var(--bg-secondary)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)', boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        padding: 4, minWidth: 140,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {items.map(({ key, icon, label }) => (
        <div
          key={key}
          className="picker-menu-item"
          style={{ padding: '8px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, borderRadius: 4 }}
          onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
          onMouseLeave={(e) => e.currentTarget.style.background = ''}
          onClick={() => onAction(key, menu.selector, menu.eventType)}
        >
          <Icon name={icon} size="sm" />
          <span>{label}</span>
        </div>
      ))}
    </div>
  );
}

function EditWarningBanner() {
  const session = useAppStore((s) => s.session);
  const showToast = useAppStore((s) => s.showToast);

  if (session.isCurrentEditor) return null;

  const handleForceAcquire = async () => {
    const state = useAppStore.getState();
    const projectId = state.getCurrentProjectId();
    if (!projectId) return;

    let editorName = state.getEditorName();
    if (!editorName) {
      try {
        editorName = window.prompt('请输入你的名称（用于协作编辑标识）：', '');
      } catch (e) {
        console.warn('prompt() unsupported:', e?.message);
      }
      if (!editorName) return;
      state.setEditorName(editorName);
    }

    const res = await api.forceAcquireSession(projectId, state.getSessionId(), editorName);
    if (res.error) {
      showToast(res.error);
      return;
    }
    state.updateSessionStatus(res);
    state.startHeartbeat(api);
    showToast('已接管编辑权');
  };

  return (
    <div className="edit-warning show">
      <div className="edit-warning-content">
        <Icon name="alert" size="md" />
        <div className="edit-warning-text">
          <strong>{session.currentEditor || '其他用户'}</strong> 正在编辑此项目，当前为只读状态
        </div>
        <button type="button" className="btn btn-sm" onClick={handleForceAcquire}>
          接管编辑
        </button>
      </div>
    </div>
  );
}

export function DashboardPage({ workspaceLoading, onGoHome, onSwitchProject }) {
  const ctrl = useWorkspaceController();
  const openModal = useAppStore((s) => s.openModal);
  const openDesignSystem = useAppStore((s) => s.openDesignSystem);
  const scanHtmlFiles = useAppStore((s) => s.scanHtmlFiles);
  const selectedFilesCount = useAppStore((s) => s.selectedFiles.size);
  const clearSelection = useAppStore((s) => s.clearSelection);

  return (
    <div className="app">
      <EditWarningBanner />
      <Header
        onGoHome={onGoHome}
        onSwitchProject={onSwitchProject}
        onOpenDesignSystem={() => openDesignSystem()}
        onDownloadDesigns={ctrl.handleDownloadDesigns}
        onScanHtml={scanHtmlFiles}
        onOpenImageUpload={() => openModal('imageUpload')}
        onSaveConfig={ctrl.handleSaveConfig}
        onDownloadConfig={ctrl.handleDownloadConfig}
        onShowPageHistory={() => openModal('pageHistory')}
        onShowPromptModal={() => openModal('prompt')}
      />
      <Sidebar
        onCreateGroup={() => openModal('group')}
        onFileSelected={ctrl.handleFileSelected}
        onToggleMindMap={() => ctrl.setMindMapOpen((v) => !v)}
        mindMapOpen={ctrl.mindMapOpen}
      />
      {selectedFilesCount > 0 && (
        <div className="selection-toolbar-float">
          <div className="selection-toolbar-top">
            已选择 <span className="selection-count">{selectedFilesCount}</span> 个文件
          </div>
          <div className="selection-toolbar-actions">
            <button className="btn btn-sm" style={{ background: '#000', color: '#fff' }} onClick={() => openModal('group')}>创建分组</button>
            <button className="btn btn-sm btn-secondary" onClick={() => openModal('deleteFiles')}>
              <Icon name="trash" size="sm" /> 删除
            </button>
            <button className="btn btn-sm btn-secondary" onClick={clearSelection}>取消</button>
          </div>
        </div>
      )}
      <PreviewPanel
        onTogglePicker={ctrl.handleTogglePicker}
        onToggleColorPicker={ctrl.handleToggleColorPicker}
        iframeRef={ctrl.iframeRef}
        onIframeLoad={ctrl.handleIframeLoad}
        onRegionAction={ctrl.handleRegionAction}
      />
      <ConfigPanel iframeRef={ctrl.iframeRef} />
      {workspaceLoading && (
        <div className="workspace-loading">
          <Icon name="refresh" size="lg" />
          正在打开项目
        </div>
      )}

      <PickerActionMenu
        menu={ctrl.pickerMenu}
        isHtml={ctrl.currentFile?.sourceType === 'html'}
        onAction={ctrl.handlePickerAction}
        onClose={() => ctrl.setPickerMenu(null)}
      />
      {ctrl.stylesPanelSelector && (
        <ElementStylesPanel
          selector={ctrl.stylesPanelSelector}
          iframeRef={ctrl.iframeRef}
          onClose={() => ctrl.setStylesPanelSelector(null)}
        />
      )}

      <DashboardModals
        onDeleteFiles={ctrl.handleDeleteFiles}
        mindMapOpen={ctrl.mindMapOpen}
        onCloseMindMap={() => ctrl.setMindMapOpen(false)}
      />
    </div>
  );
}
