/**
 * Convoy Watch — Transient Toast Notification
 * Accessible status alert with smooth enter/leave transitions and ARIA live announcement.
 */

import React, { useEffect } from 'react';

export type ToastVariant = 'info' | 'success' | 'warning' | 'error';

interface ToastProps {
  message: string;
  variant?: ToastVariant;
  durationMs?: number;
  onDismiss: () => void;
}

export const Toast: React.FC<ToastProps> = ({
  message,
  variant = 'info',
  durationMs = 4000,
  onDismiss,
}) => {
  useEffect(() => {
    if (durationMs > 0) {
      const timer = setTimeout(onDismiss, durationMs);
      return () => clearTimeout(timer);
    }
  }, [durationMs, onDismiss]);

  const variantStyles = {
    info: 'bg-[var(--surface-elevated)] border-[var(--border-default)] text-[var(--text-primary)]',
    success: 'bg-[var(--status-normal-subtle)] border-[var(--status-normal)]/40 text-[var(--status-normal)]',
    warning: 'bg-[var(--status-moderate-subtle)] border-[var(--status-moderate)]/40 text-[var(--status-moderate)]',
    error: 'bg-[var(--status-critical-subtle)] border-[var(--status-critical)]/40 text-[var(--status-critical)]',
  }[variant];

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-[var(--radius-md)] border shadow-[var(--shadow-lg)] text-xs sm:text-sm font-medium animate-in slide-in-from-bottom-2 duration-200 ${variantStyles}`}
    >
      <span>{message}</span>
      <button
        type="button"
        onClick={onDismiss}
        className="p-1 rounded hover:bg-black/10 transition text-current opacity-70 hover:opacity-100"
        aria-label="Dismiss message"
      >
        ✕
      </button>
    </div>
  );
};
