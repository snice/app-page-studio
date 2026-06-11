import React from 'react';
import { ImageUploadModal } from '../components/modals/ImageUploadModal';
import { GroupModal } from '../components/modals/GroupModal';
import { DeleteConfirmModal } from '../components/modals/DeleteConfirmModal';
import { PromptModal } from '../components/modals/PromptModal';
import { MindMapOverlay } from '../components/mindmap/MindMapOverlay';
import { useAppStore } from '../lib/state';

/**
 * 工作台（DashboardPage）自己的弹窗集合。
 * 打开/关闭统一通过 store 的 modals 接口，谁的弹窗谁渲染。
 */
export function DashboardModals({ onDeleteFiles, mindMapOpen, onCloseMindMap }) {
  const modals = useAppStore((s) => s.modals);
  const closeModal = useAppStore((s) => s.closeModal);
  const scanHtmlFiles = useAppStore((s) => s.scanHtmlFiles);
  const selectedFilesCount = useAppStore((s) => s.selectedFiles.size);

  return (
    <>
      <ImageUploadModal
        isOpen={!!modals.imageUpload}
        onClose={() => closeModal('imageUpload')}
        onSuccess={scanHtmlFiles}
      />
      <GroupModal isOpen={!!modals.group} onClose={() => closeModal('group')} />
      <DeleteConfirmModal
        isOpen={!!modals.deleteFiles}
        onClose={() => closeModal('deleteFiles')}
        count={selectedFilesCount}
        onConfirm={onDeleteFiles}
      />
      <PromptModal isOpen={!!modals.prompt} onClose={() => closeModal('prompt')} />
      {mindMapOpen && <MindMapOverlay onClose={onCloseMindMap} />}
    </>
  );
}
