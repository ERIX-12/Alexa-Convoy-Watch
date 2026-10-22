# UI Architecture: Convoy Watch

## Orb State Logic
The orb state is driven by the React state machine in `src/components/Orb.tsx`.

### States
- **Idle**: The orb breathes using a CSS animation (`scale` and `opacity` transition).
- **Listening**: Uses `navigator.mediaDevices.getUserMedia()` to get audio input. The `AnalyserNode` from the Web Audio API extracts frequency data to drive the ripple frequency animation.
- **Thinking**: Pulsing animation (CSS).
- **Speaking**: Timed or word-boundary animation simulation. `speechSynthesis` does not expose real-time audio-level data, so we sync the pulse frequency to the text-to-speech `onboundary` event or a 150ms interval simulation.

### Logic Separation
The orb component is purely presentational (`src/components/Orb.tsx`). It accepts a `state` prop. State management is centralized in `src/App.tsx`, where speech events are bridged to the orb state.
