/**
 * Convoy Watch — Reroute Alternatives Carousel
 * Swipeable and keyboard-navigable card carousel with snap scrolling, ETA deltas,
 * route comparisons, and visible focus indicators.
 */

import React, { useRef } from 'react';

export interface RouteOption {
  routeId: string;
  name: string;
  via: string;
  distanceKm: number;
  estimatedTimeMinutes: number;
  delaySavingsMinutes: number;
  riskScore: number;
  recommended: boolean;
  whyThisRoute?: string;
  waypoints?: Array<{lat: number, lng: number}>;
}

interface CarouselProps {
  options: RouteOption[];
  onSelectRoute?: (route: RouteOption) => void;
  selectedRouteId?: string;
}

export const Carousel: React.FC<CarouselProps> = ({
  options,
  onSelectRoute,
  selectedRouteId,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: 'left' | 'right') => {
    if (containerRef.current) {
      const offset = direction === 'left' ? -320 : 320;
      containerRef.current.scrollBy({ left: offset, behavior: 'smooth' });
    }
  };

  if (!options || options.length === 0) {
    return (
      <div className="p-6 text-center text-[var(--text-muted)] text-sm rounded-[var(--radius-md)] bg-[var(--surface-subtle)] border border-[var(--border-subtle)]">
        No active reroute options computed. Corridor is currently optimal.
      </div>
    );
  }

  return (
    <div className="relative group">
      {/* Scroll Controls (Desktop Smart Display) */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            Alternative Routes ({options.length})
          </span>
        </div>
        <div className="hidden sm:flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => scroll('left')}
            className="p-1.5 rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--surface-card)] hover:bg-[var(--surface-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition"
            aria-label="Previous route options"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => scroll('right')}
            className="p-1.5 rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--surface-card)] hover:bg-[var(--surface-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition"
            aria-label="Next route options"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>

      {/* Snap-Scrolling Route Container */}
      <div
        ref={containerRef}
        className="flex gap-4 overflow-x-auto snap-x snap-mandatory pb-3 pt-1 -mx-2 px-2 scroll-smooth focus-visible:ring-2 focus-visible:ring-[var(--accent)] outline-none"
        tabIndex={0}
        role="region"
        aria-label="Evaluated Reroute Alternatives Carousel"
      >
        {options.map((route) => {
          const isSelected = selectedRouteId === route.routeId;

          return (
            <div
              key={route.routeId}
              onClick={() => onSelectRoute?.(route)}
              className={`snap-start shrink-0 w-[280px] sm:w-[320px] rounded-[var(--radius-lg)] p-4 sm:p-5 border cursor-pointer transition-all duration-200 select-none ${
                route.recommended
                  ? 'bg-[var(--surface-elevated)] border-[var(--accent)] shadow-[var(--shadow-md)]'
                  : 'bg-[var(--surface-card)] border-[var(--border-subtle)] hover:border-[var(--border-default)] hover:bg-[var(--surface-elevated)]'
              } ${isSelected ? 'ring-2 ring-[var(--accent)]' : ''}`}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelectRoute?.(route);
                }
              }}
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <span className={`text-[11px] font-semibold tracking-wider uppercase font-mono ${
                  route.recommended ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'
                }`}>
                  {route.recommended ? '★ Recommended Bypass' : 'Alternative Spur'}
                </span>
                <span className="text-xs font-mono font-bold text-[var(--status-normal)] bg-[var(--status-normal-subtle)] px-2 py-0.5 rounded-[var(--radius-sm)] border border-[var(--status-normal)]/30">
                  Save {route.delaySavingsMinutes}m
                </span>
              </div>

              <h4 className="text-base font-semibold text-[var(--text-primary)] tracking-tight">
                {route.name}
              </h4>
              <p className="text-xs text-[var(--text-secondary)] mt-1 line-clamp-1">
                Via {route.via}
              </p>

              {/* "Why this route" human plain explanation */}
              <div className="mt-3 py-2 px-2.5 rounded-[var(--radius-sm)] bg-[var(--surface-ground)]/60 border border-[var(--border-subtle)] text-xs text-[var(--text-secondary)] italic">
                "{route.whyThisRoute || `Circumnavigates Mabira congestion, saving ${route.delaySavingsMinutes} mins of fuel and road time.`}"
              </div>

              {/* Metrics Strip */}
              <div className="mt-3 pt-2.5 border-t border-[var(--border-subtle)] flex items-center justify-between text-xs font-mono tabular-numbers text-[var(--text-muted)]">
                <span>{route.distanceKm} km</span>
                <span>·</span>
                <span>ETA ~{route.estimatedTimeMinutes}m</span>
                <span>·</span>
                <span className={route.riskScore < 0.4 ? 'text-[var(--status-normal)]' : 'text-[var(--status-moderate)]'}>
                  Risk {Math.round(route.riskScore * 100)}%
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
