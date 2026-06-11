import React, { useEffect, useRef, useState } from 'react';
import { Icon } from '../common/Icon';
import { ModalOverlay } from './ModalOverlay';

export function EditorNameModal({
  isOpen,
  title = '协作编辑标识',
  message = '请输入你的名称，用于多人协作时标识当前编辑者。',
  initialValue = '',
  onClose,
  onSubmit,
}) {
  const [name, setName] = useState(initialValue);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;
    setName(initialValue || '');
    const timer = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(timer);
  }, [isOpen, initialValue]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    onSubmit?.(trimmed);
  };

  return (
    <ModalOverlay isOpen={isOpen} onClose={onClose}>
      <form className="modal" onSubmit={handleSubmit}>
        <div className="modal-header">
          <span className="modal-title">{title}</span>
          <button type="button" className="modal-close" onClick={onClose}><Icon name="x" /></button>
        </div>
        <div className="modal-body">
          <p className="modal-copy">{message}</p>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">名称</label>
            <input
              ref={inputRef}
              type="text"
              className="form-input"
              value={name}
              maxLength={40}
              autoComplete="name"
              placeholder="例如：张三"
              onChange={(e) => setName(e.target.value)}
            />
          </div>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>取消</button>
          <button type="submit" className="btn btn-primary" disabled={!name.trim()}>继续</button>
        </div>
      </form>
    </ModalOverlay>
  );
}
