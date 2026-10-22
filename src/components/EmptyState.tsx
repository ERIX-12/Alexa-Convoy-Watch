/**
 * Convoy Watch — Contextual Empty State
 * Friendly smart-display empty state with warm illustration and actionable spoken suggestion chips.
 */

import React from 'react';

interface EmptyStateProps {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  suggestions?: string[];
  onSuggestionClick?: (phrase: string) => void;
  icon?: React.ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  description,
  actionLabel,
  onAction,
  suggestions = [],
  onSuggestionClick,
  icon,
}) => {
  return (
    <div className="flex flex-col items-center justify-center p-8 sm:p-12 text-center rounded-[var(--radius-xl)] bg-[var(--surface-card)] border border-[var(--border-subtle)]">
      {/* Visual Glyph */}
      <div className="w-16 h-16 rounded-full bg-[var(--surface-elevated)] border border-[var(--border-default)] flex items-center justify-center text-[var(--accent)] mb-4">
        {icon || (
          <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
          </svg>
        )}
      </div>

      <h3 className="text-lg sm:text-xl font-bold text-[var(--text-primary)] tracking-tight">
        {title}
      </h3>
      <p className="text-sm text-[var(--text-secondary)] max-w-md mt-1 leading-relaxed">
        {description}
      </p>

      {/* Primary Action Button */}
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="mt-5 px-5 py-2.5 rounded-[var(--radius-md)] text-sm font-semibold bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white shadow-[var(--shadow-accent)] transition active:scale-95"
        >
          {actionLabel}
        </button>
      )}

      {/* Suggested Spoken Phrases to Tap */}
      {suggestions.length > 0 && (
        <div className="mt-6 pt-5 border-t border-[var(--border-subtle)] w-full max-w-sm">
          <span className="text-xs uppercase tracking-wider text-[var(--text-muted)] font-mono block mb-2.5">
            Or try asking:
          </span>
          <div className="flex flex-col gap-2">
            {suggestions.map((phrase, i) => (
              <button
                key={phrase}
                type="button"
                onClick={() => onSuggestionClick?.(phrase)}
                className="px-3.5 py-2 rounded-[var(--radius-md)] bg-[var(--surface-elevated)] hover:bg-[var(--surface-ground)] border border-[var(--border-default)] text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition text-left flex items-center justify-between"
              >
                <span>"{phrase}"</span>
                <span className="text-[var(--accent)]">→</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
