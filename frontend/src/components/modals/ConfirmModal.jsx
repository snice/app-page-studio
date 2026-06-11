import React from 'react';
import { Icon } from '../common/Icon';
import { ModalOverlay } from './ModalOverlay';

// ==================== 通用确认弹框 ====================
export function ConfirmModal({ isOpen, onClose, title = '确认操作', message, hint, confirmText = '确定', cancelText = '取消', danger = false, onConfirm }) {
  return (
    <ModalOverlay isOpen={isOpen} onClose={onClose}>
      <div className="modal">
        <div className="modal-header">
          <span className="modal-title">{title}</span>
          <button className="modal-close" onClick={onClose}><Icon name="x" /></button>
        </div>
        <div className="modal-body">
          <p style={{ margin: 0 }}>{message}</p>
          {hint && <p style={{ margin: '8px 0 0 0', color: 'var(--text-muted)', fontSize: 12 }}>{hint}</p>}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>{cancelText}</button>
          <button className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={() => { onConfirm?.(); onClose(); }}>{confirmText}</button>
        </div>
      </div>
    </ModalOverlay>
  );
}
