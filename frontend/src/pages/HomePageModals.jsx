import React from 'react';
import { ProjectModal } from '../components/modals/ProjectModal';
import { ConfirmModal } from '../components/modals/ConfirmModal';
import { useAppStore } from '../lib/state';
import { api } from '../lib/api';

/**
 * 首页（HomePage）自己的弹窗集合：新建/编辑项目、删除项目确认。
 * @param onProjectSelected 项目创建/保存后打开其工作台（路由层提供）
 */
export function HomePageModals({ onProjectSelected }) {
  const modals = useAppStore((s) => s.modals);
  const closeModal = useAppStore((s) => s.closeModal);
  const loadConfig = useAppStore((s) => s.loadConfig);
  const showToast = useAppStore((s) => s.showToast);
  const getCurrentProjectId = useAppStore((s) => s.getCurrentProjectId);
  const setCurrentProjectId = useAppStore((s) => s.setCurrentProjectId);

  const projectModal = modals.project;
  const initialEdit = projectModal && typeof projectModal === 'object' ? projectModal.initialEdit : null;
  const deleteTarget = modals.deleteProject && typeof modals.deleteProject === 'object'
    ? modals.deleteProject.project
    : null;

  const confirmDeleteProject = async () => {
    if (!deleteTarget) return;
    try {
      const currentId = getCurrentProjectId();
      const res = await api.deleteProject(deleteTarget.id);
      if (res.error) throw new Error(res.error);
      if (currentId === deleteTarget.id) setCurrentProjectId(null);
      showToast('项目已删除');
      await loadConfig();
    } catch (e) {
      showToast('删除失败: ' + (e.message || '未知错误'));
    }
  };

  return (
    <>
      <ProjectModal
        isOpen={!!projectModal}
        initialEdit={initialEdit}
        onClose={() => { closeModal('project'); loadConfig(); }}
        onProjectSelected={onProjectSelected}
      />
      <ConfirmModal
        isOpen={!!deleteTarget}
        title="删除项目"
        message={<>确定删除项目「<b>{deleteTarget?.name}</b>」？</>}
        hint="所有相关数据将被删除，操作不可撤销。"
        confirmText="删除"
        danger
        onConfirm={confirmDeleteProject}
        onClose={() => closeModal('deleteProject')}
      />
    </>
  );
}
