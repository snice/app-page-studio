import React, { useEffect, useState } from 'react';
import { ModalOverlay } from './ModalOverlay';
import { Icon } from '../common/Icon';
import { useAppStore } from '../../lib/state';
import { api } from '../../lib/api';

function formatTime(value) {
  if (!value) return '-';
  return String(value).replace('T', ' ').slice(0, 19);
}

export function PageHistoryModal({ isOpen, onClose }) {
  const [loading, setLoading] = useState(false);
  const [revisions, setRevisions] = useState([]);
  const pagesMeta = useAppStore((s) => s.pagesMeta);
  const isCurrentEditor = useAppStore((s) => s.session.isCurrentEditor);
  const setPagesConfig = useAppStore((s) => s.setPagesConfig);
  const showToast = useAppStore((s) => s.showToast);
  const scanHtmlFiles = useAppStore((s) => s.scanHtmlFiles);

  useEffect(() => {
    if (!isOpen) return;
    let disposed = false;
    setLoading(true);
    api.getPagesHistory()
      .then((res) => {
        if (disposed) return;
        if (res.error) {
          showToast(res.error);
          return;
        }
        setRevisions(res.revisions || []);
      })
      .finally(() => {
        if (!disposed) setLoading(false);
      });
    return () => { disposed = true; };
  }, [isOpen, showToast]);

  const handleRestore = async (revision) => {
    let confirmed = false;
    try {
      confirmed = window.confirm(`恢复到版本 ${revision}？当前配置会作为新历史版本保留。`);
    } catch (e) {
      console.warn('confirm() unsupported:', e?.message);
    }
    if (!confirmed) return;

    const currentPath = useAppStore.getState().currentFile?.path;
    const res = await api.restorePagesRevision(revision, pagesMeta.revision);
    if (res.conflict) {
      let shouldReload = false;
      try {
        shouldReload = window.confirm(`${res.error || '配置已被其他编辑者更新'}。是否加载最新版本？`);
      } catch (e) {
        console.warn('confirm() unsupported:', e?.message);
      }
      if (shouldReload && res.latest?.pagesConfig) {
        setPagesConfig(res.latest);
        await scanHtmlFiles({ showResultToast: false });
        if (currentPath) useAppStore.getState().setCurrentFile(currentPath);
        showToast('已加载最新配置');
      }
      return;
    }
    if (res.error) {
      showToast(res.error);
      return;
    }

    setPagesConfig(res);
    await scanHtmlFiles({ showResultToast: false });
    if (currentPath) useAppStore.getState().setCurrentFile(currentPath);
    showToast(`已恢复到版本 ${revision}`);
    onClose();
  };

  return (
    <ModalOverlay isOpen={isOpen} onClose={onClose}>
      <div className="modal wide">
        <div className="modal-header">
          <span className="modal-title">历史版本</span>
          <button className="modal-close" onClick={onClose}><Icon name="x" /></button>
        </div>
        <div className="modal-body">
          <div className="history-current">
            <span>当前版本</span>
            <strong>#{pagesMeta.revision || 0}</strong>
          </div>
          {loading ? (
            <div className="history-empty">正在加载</div>
          ) : revisions.length === 0 ? (
            <div className="history-empty">暂无历史版本</div>
          ) : (
            <div className="history-list">
              {revisions.map((item) => (
                <div className="history-item" key={item.id || item.revision}>
                  <div className="history-item-main">
                    <div className="history-item-title">版本 #{item.revision}</div>
                    <div className="history-item-meta">
                      <span>{item.updated_by || '匿名用户'}</span>
                      <span>{formatTime(item.created_at)}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn btn-sm btn-secondary"
                    disabled={!isCurrentEditor}
                    title={isCurrentEditor ? '恢复此版本' : '当前为只读'}
                    onClick={() => handleRestore(item.revision)}
                  >
                    <Icon name="refresh" size="sm" />
                    恢复
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>关闭</button>
        </div>
      </div>
    </ModalOverlay>
  );
}
