import React from 'react';
import { Icon } from '../common/Icon';
import { ModalOverlay } from './ModalOverlay';

// ==================== Delete Confirm Modal ====================
export function DeleteConfirmModal({ isOpen, onClose, count, onConfirm }) {
  return (
    <ModalOverlay isOpen={isOpen} onClose={onClose}>
      <div className="modal">
        <div className="modal-header">
          <span className="modal-title">删除页面</span>
          <button className="modal-close" onClick={onClose}><Icon name="x" /></button>
        </div>
        <div className="modal-body">
          <p style={{ margin: '0 0 8px 0' }}>确定删除选中的 <b>{count}</b> 个页面吗？</p>
          <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 12 }}>将同时删除磁盘文件，操作不可撤销。</p>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>取消</button>
          <button className="btn btn-primary" onClick={() => { onConfirm(); onClose(); }}>删除</button>
        </div>
      </div>
    </ModalOverlay>
  );
}
