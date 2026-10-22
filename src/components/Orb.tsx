/**
 * Convoy Watch — Signature Voice Orb
 * Living smart-display centerpiece with organic breathing, listening ripples, thinking pulse,
 * and spoken amplitude response.
 */

import React from 'react';

export type OrbState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'error';

interface OrbProps {
  state: OrbState;
  size?: 'sm' | 'md' | 'lg';
  caption?: string;
  onClick?: () => void;
  interactive?: boolean;
}

export const Orb: React.FC<OrbProps> = ({
  state,
  size = 'md',
  caption,
  onClick,
  interactive = true,
}) => {
  // Dimensions
  const dims = {
    sm: { container: 'w-20 h-20', core: 'w-14 h-14', ripple: 'w-20 h-20' },
    md: { container: 'w-36 h-36 sm:w-44 sm:h-44', core: 'w-24 h-24 sm:w-32 sm:h-32', ripple: 'w-36 h-36 sm:w-44 sm:h-44' },
    lg: { container: 'w-48 h-48 sm:w-56 sm:h-56', core: 'w-32 h-32 sm:w-40 sm:h-40', ripple: 'w-48 h-48 sm:w-56 sm:h-56' },
  }[size];

  // Colors & Glow by State
  const stateStyles = {
    idle: {
      gradient: 'from-[#d97736] via-[#b8591f] to-[#7c3412]',
      glow: 'shadow-[0_0_50px_rgba(217,119,54,0.35)]',
      border: 'border-[#ea8a47]/40',
      label: 'Alexa+ Ready',
    },
    listening: {
      gradient: 'from-[#e05638] via-[#d44a3a] to-[#991b1b]',
      glow: 'shadow-[0_0_70px_rgba(224,86,56,0.6)]',
      border: 'border-[#f87171]',
      label: 'Listening...',
    },
    thinking: {
      gradient: 'from-[#1b8a82] via-[#0f766e] to-[#134e4a]',
      glow: 'shadow-[0_0_60px_rgba(27,138,130,0.5)]',
      border: 'border-[#2dd4bf]/50',
      label: 'Thinking...',
    },
    speaking: {
      gradient: 'from-[#d97736] via-[#ea8a47] to-[#1b8a82]',
      glow: 'shadow-[0_0_65px_rgba(217,119,54,0.55)]',
      border: 'border-[#fed7aa]/60',
      label: 'Speaking...',
    },
    error: {
      gradient: 'from-[#991b1b] via-[#7f1d1d] to-[#450a0a]',
      glow: 'shadow-[0_0_40px_rgba(153,27,27,0.4)]',
      border: 'border-red-400/50',
      label: 'Needs Attention',
    },
  }[state];

  return (
    <div className="flex flex-col items-center justify-center select-none">
      <div
        onClick={interactive ? onClick : undefined}
        className={`relative flex items-center justify-center ${dims.container} ${
          interactive ? 'cursor-pointer active:scale-95' : ''
        } transition-transform duration-300`}
        role={interactive ? 'button' : 'img'}
        aria-label={`Alexa+ Voice Orb, currently ${stateStyles.label}`}
        tabIndex={interactive ? 0 : undefined}
        onKeyDown={(e) => {
          if (interactive && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            onClick?.();
          }
        }}
      >
        {/* Outermost Ripples (Active on Listening / Speaking) */}
        {state === 'listening' && (
          <>
            <span className="absolute inset-0 rounded-full bg-[#e05638]/20 animate-ping duration-1000" />
            <span className="absolute -inset-3 rounded-full border border-[#e05638]/40 animate-pulse" />
          </>
        )}

        {state === 'thinking' && (
          <span className="absolute -inset-2 rounded-full border-2 border-dashed border-[#1b8a82]/50 animate-spin duration-3000" />
        )}

        {state === 'speaking' && (
          <>
            <span className="absolute -inset-2 rounded-full bg-[#d97736]/15 animate-pulse duration-700" />
            <span className="absolute -inset-4 rounded-full border border-[#d97736]/30 animate-pulse duration-1000" />
          </>
        )}

        {/* Ambient Halo Glow */}
        <div
          className={`absolute inset-2 rounded-full blur-xl opacity-70 transition-all duration-700 ${stateStyles.glow}`}
          style={{ background: 'radial-gradient(circle, var(--accent) 0%, transparent 70%)' }}
        />

        {/* Core Living Orb Sphere */}
        <div
          className={`relative ${dims.core} rounded-full bg-gradient-to-tr ${stateStyles.gradient} ${stateStyles.glow} border ${stateStyles.border} transition-all duration-500 flex items-center justify-center overflow-hidden`}
        >
          {/* Internal Fluid Specular Highlights */}
          <div className="absolute top-1 left-2 w-3/4 h-1/2 rounded-full bg-white/20 blur-sm pointer-events-none" />
          <div className="absolute bottom-1 right-2 w-1/2 h-1/3 rounded-full bg-black/40 blur-md pointer-events-none" />

          {/* Voice Amplitude Simulation Waveforms when speaking */}
          {state === 'speaking' && (
            <div className="flex items-center gap-1 z-10">
              <span className="w-1 bg-white/90 rounded-full h-3 animate-pulse duration-300" />
              <span className="w-1.5 bg-white rounded-full h-6 animate-pulse duration-500" />
              <span className="w-1 bg-white/90 rounded-full h-4 animate-pulse duration-400" />
              <span className="w-1 bg-white/70 rounded-full h-2 animate-pulse duration-600" />
            </div>
          )}

          {/* Microphone Glyph when listening */}
          {state === 'listening' && (
            <svg
              className="w-7 h-7 sm:w-8 sm:h-8 text-white animate-pulse"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="22" strokeLinecap="round" />
            </svg>
          )}

          {/* Thinking Rotating Dots */}
          {state === 'thinking' && (
            <div className="flex items-center gap-1.5 z-10">
              <span className="w-2 h-2 rounded-full bg-white animate-bounce duration-600" />
              <span className="w-2 h-2 rounded-full bg-white/80 animate-bounce duration-600 delay-150" />
              <span className="w-2 h-2 rounded-full bg-white/60 animate-bounce duration-600 delay-300" />
            </div>
          )}

          {/* Error Indicator */}
          {state === 'error' && (
            <span className="text-white text-xl font-bold font-mono">!</span>
          )}
        </div>
      </div>

      {/* Spoken / Caption Feedback Under Orb */}
      {caption && (
        <p className="mt-3 text-center text-sm sm:text-base font-medium max-w-md px-4 leading-relaxed transition-opacity duration-300 text-[var(--text-secondary)]">
          {caption}
        </p>
      )}
    </div>
  );
};
