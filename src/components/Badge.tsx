/**
 * Convoy Watch — Provenance & Data-Quality Badge
 * Displays data trustworthiness: Live, Cached, Derived, Baseline, Estimate, or Calm No-GPS.
 * Never uses color alone: always combines icon, label, and accessible tooltip details.
 */

import React, { useState } from 'react';

export type QualityType = 'live' | 'cached' | 'derived' | 'baseline' | 'estimate' | 'no-gps';

interface BadgeProps {
  type: QualityType;
  source?: string;
  ageSeconds?: number;
  confidence?: number;
  confidenceType?: string;
  lastSeenLocation?: string;
  interactive?: boolean;
}

export const Badge: React.FC<BadgeProps> = ({
  type,
  source = 'convoy-telemetry',
  ageSeconds = 0,
  confidence = 0.95,
  confidenceType = 'heuristic',
  lastSeenLocation = 'near Mukono',
  interactive = true,
}) => {
  const [open, setOpen] = useState(false);

  const config = {
    live: {
      label: 'Live Fix',
      icon: (
        <svg className="w-3.5 h-3.5 text-[var(--status-normal)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <circle cx="12" cy="12" r="3" fill="currentColor" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 2v2m0 16v2m10-10h-2M4 12H2m15.07-7.07l-1.41 1.41M6.34 17.66l-1.41 1.41m12.73 0l-1.41-1.41M6.34 6.34L4.93 4.93" />
        </svg>
      ),
      bg: 'bg-[var(--status-normal-subtle)]',
      border: 'border-[var(--status-normal)]/40',
      text: 'text-[var(--status-normal)]',
      desc: 'Real-time GPS satellite lock verified with high confidence.',
    },
    cached: {
      label: 'Cached (5s)',
      icon: (
        <svg className="w-3.5 h-3.5 text-[var(--accent-nile)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      bg: 'bg-[var(--accent-nile-subtle)]',
      border: 'border-[var(--accent-nile)]/40',
      text: 'text-[var(--accent-nile)]',
      desc: 'Single-flight coalesced corridor cache hit (under 5s age).',
    },
    derived: {
      label: 'Derived Forecast',
      icon: (
        <svg className="w-3.5 h-3.5 text-[var(--accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      ),
      bg: 'bg-[var(--accent-subtle)]',
      border: 'border-[var(--accent)]/40',
      text: 'text-[var(--accent)]',
      desc: 'Derived from corridor flow rates, weather radar, and vehicle speed.',
    },
    baseline: {
      label: 'Historical Baseline',
      icon: (
        <svg className="w-3.5 h-3.5 text-[var(--text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
        </svg>
      ),
      bg: 'bg-[var(--surface-elevated)]',
      border: 'border-[var(--border-default)]',
      text: 'text-[var(--text-secondary)]',
      desc: 'Standard Ugandan highway transit schedule baseline.',
    },
    estimate: {
      label: 'Estimated Route',
      icon: (
        <svg className="w-3.5 h-3.5 text-[var(--status-moderate)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      ),
      bg: 'bg-[var(--status-moderate-subtle)]',
      border: 'border-[var(--status-moderate)]/40',
      text: 'text-[var(--status-moderate)]',
      desc: 'Dead-reckoning projection along corridor trajectory.',
    },
    'no-gps': {
      label: 'No GPS Fix',
      icon: (
        <svg className="w-3.5 h-3.5 text-[var(--status-critical)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L12 12m0 0L6.343 6.343m5.657 5.657l-2.829 2.829m0 0A9 9 0 015.636 5.636" />
        </svg>
      ),
      bg: 'bg-[var(--status-critical-subtle)]',
      border: 'border-[var(--status-critical)]/40',
      text: 'text-[var(--status-critical)]',
      desc: `Calm satellite blind spot. Last seen ${Math.max(1, Math.round(ageSeconds / 60))} min ago ${lastSeenLocation}. Never fabricating coordinates.`,
    },
  }[type];

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={interactive ? () => setOpen(!open) : undefined}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[var(--radius-sm)] border text-xs font-medium ${config.bg} ${config.border} ${config.text} transition-colors ${
          interactive ? 'cursor-pointer hover:brightness-110 focus-visible:ring-2' : ''
        }`}
        aria-expanded={open}
        aria-label={`${config.label} quality indicator. Click for provenance details.`}
      >
        {config.icon}
        <span>{config.label}</span>
      </button>

      {/* Accessible Provenance Tooltip / Popover */}
      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div
            className="absolute left-0 top-full mt-1.5 z-50 w-64 p-3 bg-[var(--surface-elevated)] border border-[var(--border-default)] rounded-[var(--radius-md)] shadow-[var(--shadow-lg)] text-xs text-[var(--text-secondary)] space-y-2 animate-in fade-in zoom-in-95 duration-150"
            role="tooltip"
          >
            <div className="flex items-center justify-between pb-1.5 border-b border-[var(--border-subtle)]">
              <span className="font-semibold text-[var(--text-primary)]">{config.label}</span>
              <span className="font-mono text-[10px] uppercase text-[var(--text-muted)]">@convoy/mcp-provenance</span>
            </div>
            <p className="leading-relaxed text-[var(--text-secondary)]">{config.desc}</p>
            <div className="grid grid-cols-2 gap-2 pt-1 font-mono text-[11px] text-[var(--text-muted)]">
              <div>
                <span>Source:</span>{' '}
                <span className="text-[var(--text-primary)] uppercase">{source}</span>
              </div>
              <div>
                <span>Age:</span>{' '}
                <span className="text-[var(--text-primary)]">{ageSeconds}s</span>
              </div>
              <div className="col-span-2">
                <span>Confidence:</span>{' '}
                <span className="text-[var(--text-primary)]">{Math.round(confidence * 100)}% ({confidenceType})</span>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
