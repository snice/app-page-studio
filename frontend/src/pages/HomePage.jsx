import React from 'react';
import { Icon } from '../components/common/Icon';
import { useTheme } from '../hooks/useTheme';
import { useAppStore } from '../lib/state';
import { HomePageModals } from './HomePageModals';

function formatProjectDate(value) {
  if (!value) return '暂无更新';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '暂无更新';
  return date.toLocaleDateString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function ProjectCard({ project, isCurrent, isLoading, onOpenProject, onOpenDesignSystem, onEditProject, onDeleteProject }) {
  const handleKeyDown = (event) => {
    if (isLoading) return;
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    onOpenProject(project);
  };

  return (
    <article
      className={`project-card ${isCurrent ? 'is-current' : ''}`}
      role="button"
      tabIndex={0}
      aria-label={`打开项目 ${project.name}`}
      aria-disabled={isLoading}
      onClick={() => {
        if (!isLoading) onOpenProject(project);
      }}
      onKeyDown={handleKeyDown}
    >
      <div className="project-card-header">
        <div className="project-card-icon">
          <Icon name="folderOpen" size="lg" />
        </div>
        <div className="project-card-badges">
          {isCurrent && <span className="project-badge">最近打开</span>}
          {project.designSystem && <span className="project-badge muted">设计系统</span>}
        </div>
      </div>

      <div className="project-card-body">
        <h2>{project.name}</h2>
        <p>{project.description || '暂无描述'}</p>
      </div>

      <div className="project-card-meta">
        <span>
          <Icon name="clock" size="sm" />
          {formatProjectDate(project.updatedAt || project.createdAt)}
        </span>
      </div>

      <div className="project-card-footer">
        <span className="project-open-label">
          打开工作台
          <Icon name="arrowRight" size="sm" />
        </span>
        <div className="project-card-actions">
          <button
            type="button"
            className="project-card-action"
            title="设计系统"
            disabled={isLoading}
            onClick={(event) => {
              event.stopPropagation();
              onOpenDesignSystem(project.id);
            }}
          >
            <Icon name="palette" size="sm" />
          </button>
          <button
            type="button"
            className="project-card-action"
            title="编辑项目"
            disabled={isLoading}
            onClick={(event) => {
              event.stopPropagation();
              onEditProject(project);
            }}
          >
            <Icon name="edit" size="sm" />
          </button>
          <button
            type="button"
            className="project-card-action danger"
            title="删除项目"
            disabled={isLoading}
            onClick={(event) => {
              event.stopPropagation();
              onDeleteProject(project);
            }}
          >
            <Icon name="trash" size="sm" />
          </button>
        </div>
      </div>
    </article>
  );
}

export function HomePage({
  projects,
  currentProjectId,
  isLoading,
  onOpenProject,
}) {
  const { theme, toggleTheme } = useTheme();
  const showToast = useAppStore((s) => s.showToast);
  const openModal = useAppStore((s) => s.openModal);
  const openDesignSystem = useAppStore((s) => s.openDesignSystem);
  const projectCount = projects.length;

  const onCreateProject = () => openModal('project');
  const onEditProject = (project) => openModal('project', { initialEdit: project });
  const onDeleteProject = (project) => openModal('deleteProject', { project });
  const onOpenDesignSystem = (projectId) => openDesignSystem(projectId);

  return (
    <main className="home-page">
      <div className="home-shell">
        <header className="home-topbar">
          <div className="home-brand">
            <div className="logo-icon">
              <Icon name="appstudio" size="md" />
            </div>
            <span className="logo-wordmark">
              <span>App</span>
              <span>Studio</span>
            </span>
          </div>
          <div className="home-actions">
            <button
              type="button"
              className="btn btn-icon btn-secondary"
              title="切换主题"
              onClick={() => {
                toggleTheme();
                showToast(theme === 'light' ? '已切换到深色主题' : '已切换到浅色主题');
              }}
            >
              <Icon name={theme === 'light' ? 'sun' : 'moon'} size="md" />
            </button>
          </div>
        </header>

        <section className="home-overview">
          <div>
            <div className="home-eyebrow">项目主页</div>
            <h1>项目列表</h1>
          </div>
          <div className="home-stats">
            <div className="home-stat">
              <span>{projectCount}</span>
              <label>项目</label>
            </div>
          </div>
        </section>

        {projectCount === 0 ? (
          <section className="home-empty">
            <div className="home-empty-icon">
              <Icon name="folder" size="xl" />
            </div>
            <h2>暂无项目</h2>
            <button type="button" className="btn btn-primary" onClick={onCreateProject}>
              <Icon name="plus" />
              新建项目
            </button>
          </section>
        ) : (
          <section className="project-grid" aria-label="项目列表">
            {projects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                isCurrent={project.id === currentProjectId}
                isLoading={isLoading}
                onOpenProject={onOpenProject}
                onOpenDesignSystem={onOpenDesignSystem}
                onEditProject={onEditProject}
                onDeleteProject={onDeleteProject}
              />
            ))}
            <button
              type="button"
              className="project-card project-card-new"
              onClick={onCreateProject}
              disabled={isLoading}
              aria-label="新建项目"
            >
              <span className="project-card-new-icon">
                <Icon name="plus" size="xl" />
              </span>
              <span className="project-card-new-label">新建项目</span>
            </button>
          </section>
        )}
      </div>

      <HomePageModals onProjectSelected={onOpenProject} />
    </main>
  );
}
