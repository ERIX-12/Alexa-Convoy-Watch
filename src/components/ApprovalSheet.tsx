/**
 * Convoy Watch — Human Authorization Bottom Sheet
 * Smart-display modal/sheet requiring deliberate human confirmation before outbound actions are dispatched.
 * Clearly details what is sent, to whom, and why, sealed with cryptographic audit assurance.
 */

import React, { useState } from 'react';

export interface PendingAction {
  actionId: string;
  type: string;
  title: string;
  description: string;
  target: string;
  proposedPayload: Record<string, unknown>;
  riskScore: number;
}

interface ApprovalSheetProps {
  action: PendingAction | null;
  isOpen: boolean;
  isExecuting?: boolean;
  onApprove: (notes?: string) => void;
  onReject: () => void;
  onClose: () => void;
  confirmedReceipt?: boolean;
}

export const ApprovalSheet: React.FC<ApprovalSheetProps> = ({
  action,
  isOpen,
  isExecuting = false,
  onApprove,
  onReject,
  onClose,
  confirmedReceipt = false,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [customNote, setCustomNote] = useState('');

  if (!isOpen || !action) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="approval-title"
    >
      {/* Background dismissal backdrop */}
      <div className="absolute inset-0" onClick={onClose} aria-hidden="true" />

      {/* Main Bottom Sheet Container */}
      <div className="relative w-full max-w-xl bg-[var(--surface-elevated)] border-t sm:border border-[var(--border-default)] rounded-t-[var(--radius-xl)] sm:rounded-[var(--radius-xl)] shadow-[var(--shadow-sheet)] p-5 sm:p-6 z-10 animate-in slide-in-from-bottom duration-300">
        {/* Drag Pill on Mobile */}
        <div className="w-12 h-1 bg-[var(--border-default)] rounded-full mx-auto mb-4 sm:hidden" />

        {/* Confirmed State Moment */}
        {confirmedReceipt ? (
          <div className="py-8 text-center space-y-3 animate-in zoom-in-95 duration-200">
            <div className="w-14 h-14 mx-auto rounded-full bg-[var(--status-normal-subtle)] border border-[var(--status-normal)]/40 flex items-center justify-center text-[var(--status-normal)]">
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-[var(--text-primary)]">Dispatch Confirmed & Sealed</h3>
            <p className="text-sm text-[var(--text-secondary)] max-w-sm mx-auto">
              Supervisor authorization cryptographically signed to the immutable SHA-256 audit ledger.
            </p>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-[var(--status-moderate)] font-mono flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-[var(--status-moderate)] inline-block animate-pulse" />
                  Supervisor Authorization Required
                </span>
                <h2 id="approval-title" className="text-lg sm:text-xl font-bold text-[var(--text-primary)] mt-1">
                  {action.title}
                </h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-[var(--radius-sm)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-subtle)] transition"
                aria-label="Close approval sheet"
              >
                ✕
              </button>
            </div>

            {/* What will be sent & to whom */}
            <div className="space-y-3 p-4 rounded-[var(--radius-md)] bg-[var(--surface-card)] border border-[var(--border-subtle)] text-sm">
              <div>
                <span className="text-xs text-[var(--text-muted)] block">Target Recipient</span>
                <span className="font-semibold text-[var(--text-primary)]">{action.target}</span>
              </div>
              <div>
                <span className="text-xs text-[var(--text-muted)] block">Operational Reason</span>
                <p className="text-[var(--text-secondary)] leading-relaxed">{action.description}</p>
              </div>

              {/* Payload Highlights */}
              <div className="pt-2 border-t border-[var(--border-subtle)] flex items-center justify-between text-xs font-mono tabular-numbers text-[var(--text-muted)]">
                <span>Action ID: {action.actionId}</span>
                <span className="text-[var(--status-critical)] font-semibold">
                  Risk Level: {Math.round(action.riskScore * 100)}%
                </span>
              </div>
            </div>

            {/* Note Editor (if secondary Edit clicked) */}
            {isEditing && (
              <div className="mt-3 space-y-1.5">
                <label className="text-xs text-[var(--text-muted)]">Supervisor Dispatch Note</label>
                <input
                  type="text"
                  value={customNote}
                  onChange={(e) => setCustomNote(e.target.value)}
                  placeholder="e.g. Approved via voice command during Mabira bottleneck."
                  className="w-full px-3 py-2 rounded-[var(--radius-sm)] bg-[var(--surface-ground)] border border-[var(--border-default)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
                  autoFocus
                />
              </div>
            )}

            {/* Deliberate Action Buttons */}
            <div className="mt-5 pt-3 border-t border-[var(--border-subtle)] flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <button
                type="button"
                onClick={onReject}
                disabled={isExecuting}
                className="px-4 py-2.5 min-h-[44px] rounded-[var(--radius-md)] text-xs font-medium text-[var(--text-muted)] hover:text-[var(--status-critical)] hover:bg-[var(--status-critical-subtle)] transition disabled:opacity-50"
              >
                Decline & Discard
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsEditing(!isEditing)}
                  className="px-3.5 py-2.5 min-h-[44px] rounded-[var(--radius-md)] text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-card)] border border-[var(--border-subtle)] transition"
                >
                  {isEditing ? 'Hide Note' : 'Add Note'}
                </button>

                <button
                  type="button"
                  onClick={() => onApprove(customNote || undefined)}
                  disabled={isExecuting}
                  className="flex-1 sm:flex-none px-6 py-2.5 min-h-[44px] rounded-[var(--radius-md)] text-sm font-bold bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--text-inverse)] shadow-[var(--shadow-accent)] transition active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isExecuting ? 'Signing & Dispatching...' : 'Approve Dispatch'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
