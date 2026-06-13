import React, { useState, useRef, useEffect } from 'react';
import { Icon } from '../common/Icon';
import { useTheme } from '../../hooks/useTheme';
import { useAppStore } from '../../lib/state';

export function Header({ onGoHome, onSwitchProject, onOpenDesignSystem, onDownloadDesigns, onScanHtml, onOpenImageUpload, onOpenFigmaImport, onSaveCurrentPage, onSaveAllConfig, onDownloadConfig, onShowPageHistory, onShowPromptModal }) {
  const { theme, toggleTheme } = useTheme();
  const currentProject = useAppStore((s) => s.getCurrentProject());
  const projects = useAppStore((s) => s.config.projects);
  const isCurrentEditor = useAppStore((s) => s.session.isCurrentEditor);
  const presenceUsers = useAppStore((s) => s.session.presenceUsers);
  const showToast = useAppStore((s) => s.showToast);

  const projectDisplay = currentProject ? currentProject.name : '未选择';
  const onlineCount = new Set((presenceUsers || []).map((user) => user.sessionId || user.connectionId)).size;

  const [menuOpen, setMenuOpen] = useState(false);
  const switcherRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e) => {
      if (switcherRef.current && !switcherRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [menuOpen]);

  const handleSelect = (projectId) => {
    setMenuOpen(false);
    if (projectId === currentProject?.id) return;
    onSwitchProject?.(projectId);
  };

  return (
    <header className="header">
      <div className="logo">
        <div className="logo-icon">
          <Icon name="appstudio" size="md" />
        </div>
        <span className="logo-wordmark">
          <span>App</span>
          <span>Studio</span>
        </span>
      </div>

      <button type="button" className="btn btn-icon btn-secondary header-back-btn" onClick={onGoHome} title="返回项目主页">
        <Icon name="arrowLeft" size="md" />
      </button>

      <div className="project-switcher" ref={switcherRef}>
        <div
          className={`path-display ${menuOpen ? 'is-open' : ''}`}
          onClick={() => setMenuOpen((v) => !v)}
        >
          <span className="path-label">项目</span>
          <span className="path-value">{projectDisplay}</span>
          <span className="path-chevron">
            <Icon name="chevronDown" size="sm" />
          </span>
        </div>
        {menuOpen && (
          <div className="project-switcher-menu">
            {projects.length === 0 && (
              <div className="project-switcher-empty">暂无项目</div>
            )}
            {projects.map((project) => (
              <button
                key={project.id}
                type="button"
                className={`project-switcher-item ${project.id === currentProject?.id ? 'active' : ''}`}
                onClick={() => handleSelect(project.id)}
              >
                <span className="project-switcher-name">{project.name}</span>
                {project.id === currentProject?.id && (
                  <Icon name="check" size="sm" />
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      <button className="btn btn-icon btn-secondary" onClick={onOpenDesignSystem} title={isCurrentEditor ? '设计系统配置' : '当前为只读'} disabled={!isCurrentEditor}>
        <Icon name="palette" size="md" />
      </button>

      <button className="btn btn-secondary" onClick={onDownloadDesigns}>
        <Icon name="download" />
        下载设计稿
      </button>

      {onlineCount > 0 && (
        <div className="presence-pill" title="当前项目在线协作者">
          <Icon name="users" size="sm" />
          {onlineCount}
        </div>
      )}

      <div className="header-actions">
        <button className="btn btn-icon btn-secondary" onClick={() => { toggleTheme(); showToast(theme === 'light' ? '已切换到深色主题' : '已切换到浅色主题'); }} title="切换主题">
          <Icon name={theme === 'light' ? 'sun' : 'moon'} size="md" />
        </button>
        <button className="btn btn-secondary" onClick={() => onScanHtml?.()}>
          <Icon name="refresh" />
          刷新
        </button>
        <button className="btn btn-secondary" onClick={onOpenImageUpload} disabled={!isCurrentEditor} title={isCurrentEditor ? '上传设计图' : '当前为只读'}>
          <Icon name="image" />
          上传设计图
        </button>
        <button className="btn btn-secondary" onClick={onOpenFigmaImport} disabled={!isCurrentEditor} title={isCurrentEditor ? 'Figma 导入' : '当前为只读'}>
          <Icon name="layers" />
          Figma
        </button>
        <button className="btn btn-secondary" onClick={onSaveCurrentPage} disabled={!isCurrentEditor} title={isCurrentEditor ? '保存当前页' : '当前为只读'}>
          <Icon name="save" />
          保存当前页
        </button>
        <button className="btn btn-secondary" onClick={onSaveAllConfig} disabled={!isCurrentEditor} title={isCurrentEditor ? '保存全部配置' : '当前为只读'}>
          <Icon name="save" />
          保存全部
        </button>
        <button className="btn btn-secondary" onClick={onShowPageHistory}>
          <Icon name="clock" />
          历史版本
        </button>
        <button className="btn btn-secondary" onClick={onDownloadConfig}>
          <Icon name="download" />
          下载配置
        </button>
        <button className="btn btn-primary" onClick={onShowPromptModal}>
          <Icon name="sparkles" />
          生成提示词
        </button>
      </div>
    </header>
  );
}
