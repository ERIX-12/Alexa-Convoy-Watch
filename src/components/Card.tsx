/**
 * Convoy Watch — Tactile Smart Display Card
 * Pure presentational card surface with earthen tokens, accessible focus, and consistent padding.
 */

import React from 'react';

interface CardProps {
  children: React.ReactNode;
  variant?: 'default' | 'elevated' | 'interactive' | 'accent' | 'critical';
  title?: string;
  kicker?: string;
  badge?: React.ReactNode;
  action?: React.ReactNode;
  footer?: React.ReactNode;
  onClick?: () => void;
  className?: string;
  role?: string;
  tabIndex?: number;
}

export const Card: React.FC<CardProps> = ({
  children,
  variant = 'default',
  title,
  kicker,
  badge,
  action,
  footer,
  onClick,
  className = '',
  role,
  tabIndex,
}) => {
  const isInteractive = variant === 'interactive' || !!onClick;

  const variantStyles = {
    default: 'bg-[var(--surface-card)] border-[var(--border-subtle)] text-[var(--text-primary)]',
    elevated: 'bg-[var(--surface-elevated)] border-[var(--border-default)] shadow-[var(--shadow-md)] text-[var(--text-primary)]',
    interactive:
      'bg-[var(--surface-card)] hover:bg-[var(--surface-elevated)] border-[var(--border-subtle)] hover:border-[var(--border-default)] text-[var(--text-primary)] cursor-pointer active:scale-[0.99] transition-all duration-200',
    accent:
      'bg-[var(--accent-subtle)] border-[var(--accent)]/40 text-[var(--text-primary)]',
    critical:
      'bg-[var(--status-critical-subtle)] border-[var(--status-critical)]/40 text-[var(--text-primary)]',
  }[variant];

  return (
    <div
      onClick={onClick}
      role={role || (isInteractive ? 'button' : undefined)}
      tabIndex={isInteractive ? tabIndex ?? 0 : undefined}
      onKeyDown={
        isInteractive && onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      className={`rounded-[var(--radius-lg)] border p-4 sm:p-5 transition-colors ${variantStyles} ${className}`}
    >
      {/* Header if kicker, title, badge or action provided */}
      {(kicker || title || badge || action) && (
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            {kicker && (
              <span className="block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-0.5">
                {kicker}
              </span>
            )}
            {title && (
              <h3 className="text-base sm:text-lg font-semibold tracking-tight text-[var(--text-primary)]">
                {title}
              </h3>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {badge}
            {action}
          </div>
        </div>
      )}

      {/* Card Body */}
      <div>{children}</div>

      {/* Footer */}
      {footer && (
        <div className="mt-4 pt-3 border-t border-[var(--border-subtle)] text-xs text-[var(--text-secondary)]">
          {footer}
        </div>
      )}
    </div>
  );
};
