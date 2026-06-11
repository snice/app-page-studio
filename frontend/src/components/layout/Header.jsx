import React, { useState, useRef, useEffect } from 'react';
import { Icon } from '../common/Icon';
import { useTheme } from '../../hooks/useTheme';
import { useAppStore } from '../../lib/state';

export function Header({ onGoHome, onSwitchProject, onOpenDesignSystem, onDownloadDesigns, onScanHtml, onOpenImageUpload, onSaveConfig, onDownloadConfig, onShowPromptModal }) {
  const { theme, toggleTheme } = useTheme();
  const currentProject = useAppStore((s) => s.getCurrentProject());
  const projects = useAppStore((s) => s.config.projects);
  const showToast = useAppStore((s) => s.showToast);

  const projectDisplay = currentProject ? currentProject.name : '未选择';

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

      <button className="btn btn-icon btn-secondary" onClick={onOpenDesignSystem} title="设计系统配置">
        <Icon name="palette" size="md" />
      </button>

      <button className="btn btn-secondary" onClick={onDownloadDesigns}>
        <Icon name="download" />
        下载设计稿
      </button>

      <div className="header-actions">
        <button className="btn btn-icon btn-secondary" onClick={() => { toggleTheme(); showToast(theme === 'light' ? '已切换到深色主题' : '已切换到浅色主题'); }} title="切换主题">
          <Icon name={theme === 'light' ? 'sun' : 'moon'} size="md" />
        </button>
        <button className="btn btn-secondary" onClick={onScanHtml}>
          <Icon name="refresh" />
          刷新
        </button>
        <button className="btn btn-secondary" onClick={onOpenImageUpload}>
          <Icon name="image" />
          上传设计图
        </button>
        <button className="btn btn-secondary" onClick={onSaveConfig}>
          <Icon name="save" />
          保存
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
