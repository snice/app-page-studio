import React from 'react';

// ==================== 通用 Modal Wrapper ====================
export function ModalOverlay({ isOpen, onClose, children }) {
  if (!isOpen) return null;
  return (
    <div className="modal-overlay active">
      <div>
        {children}
      </div>
    </div>
  );
}
