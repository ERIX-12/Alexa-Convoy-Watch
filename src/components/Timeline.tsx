/**
 * Convoy Watch — Agent Event Timeline
 * Displays autonomous watcher loop decisions, risk assessments, and human approval events in chronological order.
 */

import React from 'react';

export interface TimelineEvent {
  id: string | number;
  timestamp: number;
  type: 'forecast' | 'risk_detected' | 'action_drafted' | 'approved' | 'rejected' | 'rerouted' | 'gps_lost' | 'general';
  title: string;
  detail: string;
  actor?: string;
  hash?: string;
}

interface TimelineProps {
  events: TimelineEvent[];
  maxEvents?: number;
}

export const Timeline: React.FC<TimelineProps> = ({ events, maxEvents = 6 }) => {
  const displayEvents = events.slice(0, maxEvents);

  if (displayEvents.length === 0) {
    return (
      <div className="py-6 text-center text-xs text-[var(--text-muted)] italic">
        No events logged in the active watch cycle yet.
      </div>
    );
  }

  const getEventIcon = (type: TimelineEvent['type']) => {
    switch (type) {
      case 'forecast':
        return (
          <div className="w-5 h-5 rounded-full bg-[var(--accent-nile-subtle)] border border-[var(--accent-nile)]/50 flex items-center justify-center text-[var(--accent-nile)]">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 00-9.78 2.096A4.001 4.001 0 003 15z" />
            </svg>
          </div>
        );
      case 'risk_detected':
        return (
          <div className="w-5 h-5 rounded-full bg-[var(--status-moderate-subtle)] border border-[var(--status-moderate)]/50 flex items-center justify-center text-[var(--status-moderate)]">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
        );
      case 'approved':
        return (
          <div className="w-5 h-5 rounded-full bg-[var(--status-normal-subtle)] border border-[var(--status-normal)]/50 flex items-center justify-center text-[var(--status-normal)]">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
            </svg>
          </div>
        );
      case 'rejected':
      case 'gps_lost':
        return (
          <div className="w-5 h-5 rounded-full bg-[var(--status-critical-subtle)] border border-[var(--status-critical)]/50 flex items-center justify-center text-[var(--status-critical)]">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
        );
      case 'action_drafted':
      case 'rerouted':
      default:
        return (
          <div className="w-5 h-5 rounded-full bg-[var(--accent-subtle)] border border-[var(--accent)]/50 flex items-center justify-center text-[var(--accent)]">
            <div className="w-1.5 h-1.5 rounded-full bg-current" />
          </div>
        );
    }
  };

  return (
    <div className="relative pl-6 space-y-4 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-px before:bg-[var(--border-subtle)]">
      {displayEvents.map((evt, idx) => (
        <div key={`${evt.id}-${evt.timestamp}`} className="relative group">
          {/* Node Icon on Vertical Line */}
          <div className="absolute -left-6 top-0.5">{getEventIcon(evt.type)}</div>

          <div>
            <div className="flex items-center justify-between text-xs text-[var(--text-muted)] font-mono">
              <span className="font-semibold text-[var(--text-primary)]">{evt.title}</span>
              <span className="tabular-numbers">
                {new Date(evt.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            </div>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5 leading-relaxed">
              {evt.detail}
            </p>
            {evt.hash && (
              <span className="inline-block mt-1 text-[10px] font-mono text-[var(--text-muted)] truncate max-w-full">
                SHA-256: {evt.hash.slice(0, 14)}...
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};
