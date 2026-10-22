/**
 * Convoy Watch — Tactile Shimmer Skeleton Loader
 * Content-shaped loading state that prevents layout thrashing, with zero jarring spinners.
 */

import React from 'react';

interface SkeletonProps {
  className?: string;
  variant?: 'text' | 'card' | 'circle' | 'map';
}

export const Skeleton: React.FC<SkeletonProps> = ({
  className = '',
  variant = 'text',
}) => {
  const base = 'bg-[var(--surface-elevated)] animate-pulse rounded-[var(--radius-sm)]';

  if (variant === 'circle') {
    return <div className={`rounded-full ${base} ${className}`} />;
  }

  if (variant === 'card') {
    return (
      <div className={`p-5 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-card)] space-y-4 ${className}`}>
        <div className="flex items-center justify-between">
          <div className="h-4 w-32 bg-[var(--surface-elevated)] rounded" />
          <div className="h-4 w-16 bg-[var(--surface-elevated)] rounded" />
        </div>
        <div className="h-8 w-48 bg-[var(--surface-elevated)] rounded" />
        <div className="grid grid-cols-3 gap-2 pt-2">
          <div className="h-12 bg-[var(--surface-elevated)] rounded" />
          <div className="h-12 bg-[var(--surface-elevated)] rounded" />
          <div className="h-12 bg-[var(--surface-elevated)] rounded" />
        </div>
      </div>
    );
  }

  if (variant === 'map') {
    return (
      <div className={`h-64 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] ${base} flex items-center justify-center ${className}`}>
        <span className="text-xs font-mono text-[var(--text-muted)] animate-pulse">
          Loading Uganda Corridor Vector Projection...
        </span>
      </div>
    );
  }

  return <div className={`${base} h-4 ${className}`} />;
};
