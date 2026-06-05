import React from 'react';
import { useAppStore } from '../../lib/state';

export function Toast() {
  const toastMessage = useAppStore((s) => s.toastMessage);
  const toastVisible = useAppStore((s) => s.toastVisible);

  return (
    <div className={`toast ${toastVisible ? 'show' : ''}`}>
      {toastMessage}
    </div>
  );
}
