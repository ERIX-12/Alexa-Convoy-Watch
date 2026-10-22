/**
 * Convoy Watch — Alexa+ Smart Display Experience
 * Designed for 16:10 smart displays (Echo Show 1280x800) & mobile touch viewports (360px+).
 * Earthen Ugandan aesthetic: savanna charcoal, laterite ochre, Nile teal.
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  simulationApi,
  speakAlexaResponse,
  type McpRpcFrame,
  JUDGE_DEMO_KEY,
} from './services/mcpClient.ts';
import { Orb, type OrbState } from './components/Orb.tsx';
import { Card } from './components/Card.tsx';
import { Badge, type QualityType } from './components/Badge.tsx';
import { APIProvider, Map, useMap, Marker } from '@vis.gl/react-google-maps';
import { Carousel, type RouteOption } from './components/Carousel.tsx';
import { ApprovalSheet, type PendingAction } from './components/ApprovalSheet.tsx';
import { Timeline, type TimelineEvent } from './components/Timeline.tsx';
import { Toast, type ToastVariant } from './components/Toast.tsx';
import { Skeleton } from './components/Skeleton.tsx';
import { EmptyState } from './components/EmptyState.tsx';
import { CorridorMap } from './components/CorridorMap.tsx';

interface TripData {
  tripId: string;
  origin?: { lat: number; lng: number };
  destination: string;
  destinationCoord?: { lat: number; lng: number };
  corridorId: string;
  corridorName: string;
  vehicleId: string;
  vehiclePlate: string;
  redactedPlate: string;
  priority: string;
  status: string;
  activeWatch: boolean;
  currentFix: {
    latitude: number;
    longitude: number;
    speedKmH: number;
    headingDegrees?: number;
    ageSeconds: number;
    isDeadReckoned: boolean;
    excludeFromAlerts: boolean;
  } | null;
  etaMinutes: number;
  delayRisk: number;
  delayRiskLevel: 'low' | 'moderate' | 'elevated' | 'critical';
  weatherCondition: string;
  corridorCondition: string;
  pendingActions: Array<PendingAction>;
  executedActions: Array<{
    actionId: string;
    type: string;
    title: string;
    decision: 'approved' | 'rejected';
    decisionBy: string;
    auditHash: string;
    timestamp: number;
    notes?: string;
  }>;
  provenance: {
    source: string;
    ageSeconds: number;
    confidence: number;
    confidenceType: string;
    spokenPhrase: string;
    hasFix: boolean;
  };
  version: number;
  updatedAt: number;
}

export default function App() {
  // Theme & Presenter State
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [presenterMode, setPresenterMode] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'glance' | 'watch' | 'routes' | 'timeline'>('glance');

  // Domain & Telemetry State
  const [apiKey] = useState<string>(JUDGE_DEMO_KEY);
  const [trip, setTrip] = useState<TripData | null>(null);
  const [inferredCorridorId, setInferredCorridorId] = useState<string | null>(null);
  const [reroutes, setReroutes] = useState<RouteOption[]>([]);
  const [auditRecords, setAuditRecords] = useState<any[]>([]);
  const [chainIntegrity, setChainIntegrity] = useState<{ valid: boolean; reason?: string }>({ valid: true });
  const [selectedWaypoints, setSelectedWaypoints] = useState<Array<{lat: number, lng: number}> | undefined>();
  const [rpcFrames, setRpcFrames] = useState<McpRpcFrame[]>([]);
  const [toast, setToast] = useState<{ message: string; variant: ToastVariant } | null>(null);

  // Voice & Interaction State
  const [orbState, setOrbState] = useState<OrbState>('idle');
  const [isListening, setIsListening] = useState<boolean>(false);
  const [transcriptPreview, setTranscriptPreview] = useState<string>('');
  const [spokenReply, setSpokenReply] = useState<string>(
    'Good morning, Dispatch. Convoy Watch is tracking heavy transport on the Jinja corridor.'
  );
  const [spokenReasoning, setSpokenReasoning] = useState<string>('Autonomous watch cycle active');
  const [nluPath, setNluPath] = useState<string>('gemini_nlu');
  const [enginePref, setEnginePref] = useState<'auto' | 'rule'>('auto');
  const [typedInput, setTypedInput] = useState<string>('');
  const [isExecuting, setIsExecuting] = useState<boolean>(false);
  const [audioFeedbackEnabled, setAudioFeedbackEnabled] = useState<boolean>(true);
  const [demoStep, setDemoStep] = useState<string | null>(null);

  // Human Authorization Modal State
  const [approvalSheetOpen, setApprovalSheetOpen] = useState<boolean>(false);
  const [confirmedReceipt, setConfirmedReceipt] = useState<boolean>(false);
  const [showInspector, setShowInspector] = useState<boolean>(false);

  const recognitionRef = useRef<any>(null);
  const handleVoiceTurnRef = useRef<(query: string) => Promise<void>>(async () => {});

  // Apply Theme Attribute
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Subscribe to raw MCP RPC frames
  useEffect(() => {
    const unsubscribe = simulationApi.onRpcFrame((frame) => {
      setRpcFrames((prev) => [frame, ...prev.slice(0, 49)]);
    });
    return unsubscribe;
  }, []);

  // Poll trip status & audit log every 3 seconds
  const fetchTripData = async () => {
    try {
      const data = await simulationApi.getTrip('TRIP-KLA-JINJA-01');
      if (data?.trip) {
        setTrip(data.trip);
      }
      const audit = await simulationApi.getAuditLog('TRIP-KLA-JINJA-01');
      if (audit?.records) {
        setAuditRecords(audit.records);
        setChainIntegrity(audit.chainIntegrity || { valid: true });
      }
    } catch (err: any) {
      if (err.message.includes('404')) {
        console.warn('[Telemetry] Trip TRIP-KLA-JINJA-01 not found, likely inactive.');
      } else {
        console.error('Failed to poll trip telemetry:', err);
      }
    }
  };

  useEffect(() => {
    // Initial Session Setup: Auto-reverse-geocode origin
    const initializeSession = async () => {
      if (!navigator.geolocation) {
        console.warn('[Session] Geolocation not supported');
        return;
      }
      try {
        const position = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000 });
        });
        const { latitude: lat, longitude: lng } = position.coords;
        console.log(`[Session] Initialized origin: ${lat}, ${lng}`);
        
        // Corridor prediction logic based on Kampala heuristics
        let corridor = 'UG-CORRIDOR-01';
        if (lat > 0.35 && lng > 32.55) corridor = 'UG-CORRIDOR-03';
        else if (lat < 0.31) corridor = 'UG-CORRIDOR-02';
        
        setInferredCorridorId(corridor);
        console.log(`[Session] Inferred corridor: ${corridor}`);
      } catch (e: any) {
        const errorMsg = e instanceof GeolocationPositionError 
          ? `Geolocation error ${e.code}: ${e.message}`
          : String(e);
        console.warn(`[Session] Failed to get initial location: ${errorMsg}`);
      }
    };

    initializeSession();
    fetchTripData();
    const interval = setInterval(fetchTripData, 3000);
    return () => clearInterval(interval);
  }, []); // Remove apiKey dependency to prevent unnecessary restarts

  // Load reroute options
  useEffect(() => {
    if (trip?.tripId) {
      simulationApi
        .getRerouteOptions(trip.tripId)
        .then((res) => {
          if (res?.options) {
            setReroutes(res.options);
          }
        })
        .catch(() => {});
    }
  }, [trip?.status, trip?.delayRisk]);

  // Auto-open approval sheet when a pending action is flagged
  useEffect(() => {
    if (trip?.pendingActions && trip.pendingActions.length > 0) {
      // If user isn't currently viewing approval, suggest it
      if (!confirmedReceipt) {
        setApprovalSheetOpen(true);
      }
    } else {
      setConfirmedReceipt(false);
    }
  }, [trip?.pendingActions?.length]);

  // Voice Interaction Engine
  const handleVoiceTurn = async (queryText: string) => {
    const cleanText = queryText.trim();
    if (!cleanText) return;

    setIsExecuting(true);
    setOrbState('thinking');
    setSpokenReasoning('Processing voice intent over MCP domain tools...');

    try {
      const pendingActionId = trip?.pendingActions?.[0]?.actionId;
      
      // Get current location
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 });
      }).catch(() => null);

      const origin = position ? { lat: position.coords.latitude, lng: position.coords.longitude } : undefined;
      
      const res = await simulationApi.voiceTurn(cleanText, trip?.tripId, pendingActionId, enginePref, origin);

      const phrase = res.spokenPhrase || 'Acknowledged.';
      setSpokenReply(phrase);
      setNluPath(res.nlu?.pathUsed || 'rule_fallback_nlu');
      setSpokenReasoning(res.nlu?.reasoning || 'Action processed');

      setOrbState('speaking');

      if (audioFeedbackEnabled && phrase) {
        await speakAlexaResponse(phrase);
      }

      await fetchTripData();
    } catch (err: any) {
      const errorMsg = `Command failed: ${err.message || String(err)}`;
      setSpokenReply(errorMsg);
      setOrbState('error');
      if (audioFeedbackEnabled) await speakAlexaResponse(errorMsg);
    } finally {
      setIsExecuting(false);
      setTypedInput('');
      setTranscriptPreview('');
      setTimeout(() => setOrbState('idle'), 1800);
    }
  };

  useEffect(() => {
    handleVoiceTurnRef.current = handleVoiceTurn;
  });

  const toggleListening = async () => {
    if (isListening && recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
      setIsListening(false);
      setOrbState('idle');
      return;
    }

    if (typeof window === 'undefined') return;

    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setToast({
        message: 'Speech recognition unavailable in this browser. Please use quick turn phrases or typed input.',
        variant: 'warning',
      });
      return;
    }

    // Explicit native browser microphone permission probe
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((t) => t.stop());
      } catch (permErr: any) {
        if (permErr.name === 'NotAllowedError' || permErr.name === 'PermissionDeniedError') {
          setToast({
            message: 'Microphone permission blocked. Please enable microphone permissions in your browser bar.',
            variant: 'error',
          });
          setOrbState('error');
          return;
        }
      }
    }

    try {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {}
      }

      const reco = new SpeechRecognition();
      reco.continuous = false;
      reco.interimResults = true;
      reco.lang = 'en-US';
      reco.maxAlternatives = 1;

      reco.onstart = () => {
        setIsListening(true);
        setOrbState('listening');
        setTranscriptPreview('Listening... Speak now.');
      };

      reco.onresult = (event: any) => {
        let interim = '';
        let final = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const text = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            final += text;
          } else {
            interim += text;
          }
        }
        const textVal = (final || interim).trim();
        if (textVal) {
          setTranscriptPreview(textVal);
          setTypedInput(textVal);
        }

        if (final.trim()) {
          reco.stop();
          setIsListening(false);
          handleVoiceTurnRef.current(final.trim());
        }
      };

      reco.onerror = (event: any) => {
        setIsListening(false);
        const errType = event.error;
        if (errType === 'no-speech') {
          setToast({ message: "No speech detected. Tap the orb and say 'Check status' or 'Approve'.", variant: 'info' });
        } else if (errType === 'not-allowed') {
          setToast({ message: 'Microphone access denied in browser.', variant: 'error' });
        }
        setOrbState('idle');
      };

      reco.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = reco;
      reco.start();
    } catch (err: any) {
      setIsListening(false);
      setOrbState('idle');
      setToast({ message: `Microphone activation error: ${err.message}`, variant: 'error' });
    }
  };

  // Human Approval Execution
  const handleApproveAction = async (notes?: string) => {
    if (!trip || !trip.pendingActions?.[0]) return;
    const action = trip.pendingActions[0];
    setIsExecuting(true);
    try {
      const res = await simulationApi.callMcpTool('approve_action', {
        tripId: trip.tripId,
        actionId: action.actionId,
        decision: 'approved',
        notes: notes || 'Supervisor authorized dispatch through Alexa+ Smart Display.',
      });

      setConfirmedReceipt(true);
      const reply = res?.spokenPhrase || `Action authorized. Dispatch sent to ${action.target}.`;
      setSpokenReply(reply);
      if (audioFeedbackEnabled) speakAlexaResponse(reply);

      setToast({ message: `Approved: ${action.title}`, variant: 'success' });
      await fetchTripData();

      // Close modal after brief confirmation moment
      setTimeout(() => {
        setApprovalSheetOpen(false);
        setConfirmedReceipt(false);
      }, 2200);
    } catch (err: any) {
      setToast({ message: `Approval error: ${err.message}`, variant: 'error' });
    } finally {
      setIsExecuting(false);
    }
  };

  const handleRejectAction = async () => {
    if (!trip || !trip.pendingActions?.[0]) return;
    const action = trip.pendingActions[0];
    setIsExecuting(true);
    try {
      await simulationApi.callMcpTool('approve_action', {
        tripId: trip.tripId,
        actionId: action.actionId,
        decision: 'rejected',
        notes: 'Supervisor declined dispatch.',
      });
      setToast({ message: `Declined: ${action.title}`, variant: 'info' });
      setApprovalSheetOpen(false);
      await fetchTripData();
    } catch (err: any) {
      setToast({ message: `Decline error: ${err.message}`, variant: 'error' });
    } finally {
      setIsExecuting(false);
    }
  };

  // Automated Scripted Scenario for Hackathon Demo / Screen Recording
  const runPresenterDemo = async () => {
    if (!trip) {
      setToast({ message: 'No active trip to run demo.', variant: 'error' });
      return;
    }
    setIsExecuting(true);
    setActiveTab('watch');

    const steps = [
      {
        name: 'Clear Corridor Flow',
        msg: 'Corridor Kampala-Jinja is optimal. Heavy transit moving at normal pace.',
        action: () => simulationApi.setScenario(trip.tripId, 'NORMAL'),
      },
      {
        name: 'Mabira Forest Bottleneck',
        msg: 'Congestion detected in Mabira Forest. Overturned timber transit. Speed down to 12 km/h.',
        action: () => simulationApi.setScenario(trip.tripId, 'SLOW_CORRIDOR'),
      },
      {
        name: 'Honest GPS Blind Spot',
        msg: 'Dense forest cutting satellite blackout. Reporting calm no-fix state without fabricating coordinates.',
        action: () => simulationApi.setScenario(trip.tripId, 'GPS_DROPOUT'),
      },
      {
        name: 'Risk Surge & Human Gate',
        msg: 'Delay risk critical at 76%. Autonomous watcher drafted Katosi bypass. Awaiting supervisor authorization.',
        action: () => simulationApi.setScenario(trip.tripId, 'SLOW_CORRIDOR'),
      },
    ];

    try {
      for (let i = 0; i < steps.length; i++) {
        setDemoStep(steps[i].name);
        setSpokenReply(steps[i].msg);
        setOrbState('speaking');
        if (audioFeedbackEnabled) {
          await speakAlexaResponse(steps[i].msg);
        }
        try {
          await steps[i].action();
          await fetchTripData();
        } catch (e) {
          console.error(`Demo step ${steps[i].name} failed:`, e);
          setToast({ message: `Demo step failed: ${steps[i].name}`, variant: 'error' });
          break; // Stop demo if step fails
        }
        await new Promise((r) => setTimeout(r, presenterMode ? 5500 : 4000));
      }
    } finally {
      setDemoStep(null);
      setIsExecuting(false);
      setOrbState('idle');
    }
  };

  // Convert raw audit records to Timeline events
  const timelineEvents: TimelineEvent[] = useMemo(() => {
    if (!auditRecords || auditRecords.length === 0) return [];
    return auditRecords.map((r) => {
      let type: TimelineEvent['type'] = 'general';
      if (r.eventType === 'WATCH_TICK') type = 'forecast';
      if (r.eventType === 'ACTION_PROPOSED') type = 'risk_detected';
      if (r.eventType === 'ACTION_APPROVED') type = 'approved';
      if (r.eventType === 'ACTION_REJECTED') type = 'rejected';

      return {
        id: r.sequence,
        timestamp: r.timestamp,
        type,
        title: r.eventType.replace('_', ' '),
        detail:
          r.payload?.actionType ||
          r.payload?.condition ||
          (r.payload?.delayRisk ? `Delay risk calculated at ${Math.round(r.payload.delayRisk * 100)}%` : 'Watcher loop recorded tick.'),
        actor: r.actor,
        hash: r.hash,
      };
    });
  }, [auditRecords]);

  // Compute Badge Quality Type
  const qualityType: QualityType = useMemo(() => {
    if (!trip?.currentFix) return 'no-gps';
    if (trip.provenance.source === 'gps_raw') return 'live';
    if (trip.provenance.source === 'cache_5s') return 'cached';
    if (trip.provenance.source === 'derived') return 'derived';
    return 'baseline';
  }, [trip?.currentFix, trip?.provenance?.source]);

  return (
    <div className={`min-h-screen bg-[var(--surface-ground)] text-[var(--text-primary)] flex flex-col font-sans transition-colors duration-300 ${
      presenterMode ? 'text-lg' : ''
    }`}>
      {/* Smart Display Top Navigation Bar (Echo Show 16:10 presence) */}
      <header className="border-b border-[var(--border-subtle)] bg-[var(--surface-overlay)] backdrop-blur sticky top-0 z-30 px-4 sm:px-8 py-3 flex items-center justify-between gap-4">
        {/* Brand Presence (Zero copyrighted logos; pure Alexa+ typographic identity) */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-[var(--radius-sm)] bg-[var(--accent)] text-white flex items-center justify-center font-bold text-sm tracking-tighter shadow-[var(--shadow-sm)]">
            CW
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase tracking-widest text-[var(--accent)] font-semibold">
                Alexa+
              </span>
              <span className="text-[var(--text-muted)]">/</span>
              <h1 className="text-sm sm:text-base font-semibold tracking-tight text-[var(--text-primary)]">
                Convoy Watch
              </h1>
            </div>
            <span className="text-[11px] text-[var(--text-muted)] hidden md:inline">
              Uganda Corridor Freight Intelligence · Smart Display
            </span>
          </div>
        </div>

        {/* Global Controls */}
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          {/* Sound Toggle */}
          <button
            type="button"
            onClick={() => setAudioFeedbackEnabled(!audioFeedbackEnabled)}
            className="p-2 min-h-[40px] rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-card)] hover:bg-[var(--surface-elevated)] text-[var(--text-secondary)] transition flex items-center gap-1.5 text-xs font-medium"
            title="Toggle Spoken Responses"
            aria-label={audioFeedbackEnabled ? 'Audio enabled' : 'Audio muted'}
          >
            {audioFeedbackEnabled ? (
              <>
                <span className="w-2 h-2 rounded-full bg-[var(--status-normal)] inline-block" />
                <span className="hidden sm:inline">Sound On</span>
              </>
            ) : (
              <>
                <span className="w-2 h-2 rounded-full bg-[var(--text-muted)] inline-block" />
                <span className="hidden sm:inline">Muted</span>
              </>
            )}
          </button>

          {/* Theme Toggle (Dark Savanna / Light Linen) */}
          <button
            type="button"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="p-2 min-h-[40px] rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-card)] hover:bg-[var(--surface-elevated)] text-[var(--text-secondary)] transition text-xs font-medium"
            title="Switch Theme"
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          >
            {theme === 'dark' ? '☀️ Light' : '🌙 Dark'}
          </button>

          {/* Presenter Mode Toggle (for Hackathon Judges) */}
          <button
            type="button"
            onClick={() => setPresenterMode(!presenterMode)}
            className={`px-3 py-1.5 min-h-[40px] rounded-[var(--radius-md)] border text-xs font-semibold transition ${
              presenterMode
                ? 'bg-[var(--accent)] text-white border-[var(--accent)] shadow-[var(--shadow-sm)]'
                : 'border-[var(--border-subtle)] bg-[var(--surface-card)] text-[var(--text-secondary)] hover:bg-[var(--surface-elevated)]'
            }`}
            title="Toggle Presenter Mode (Larger Display Type, Clean Layout)"
          >
            Presenter {presenterMode ? 'ON' : 'OFF'}
          </button>

          {/* Scripted Scenario Demo Run */}
          <button
            type="button"
            onClick={runPresenterDemo}
            disabled={isExecuting}
            className="px-3.5 py-1.5 min-h-[40px] rounded-[var(--radius-md)] text-xs font-semibold bg-[var(--surface-elevated)] hover:bg-[var(--surface-ground)] border border-[var(--border-default)] text-[var(--text-primary)] transition flex items-center gap-1.5 disabled:opacity-50"
          >
            <span className="w-2 h-2 rounded-full bg-[var(--accent)] inline-block" />
            <span>{demoStep ? demoStep : 'Run Demo'}</span>
          </button>

          {/* Debug Inspector Toggle (hidden in clean demo view) */}
          {!presenterMode && (
            <button
              type="button"
              onClick={() => setShowInspector(!showInspector)}
              className="p-2 min-h-[40px] rounded-[var(--radius-md)] text-xs border border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              title="View MCP JSON-RPC Stream"
            >
              MCP Logs ({rpcFrames.length})
            </button>
          )}
        </div>
      </header>

      {/* Mode View Tabs (Echo Show Clean Segmented Navigation) */}
      <div className="bg-[var(--surface-card)] border-b border-[var(--border-subtle)] px-4 sm:px-8 py-2">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-3 overflow-x-auto pb-1 sm:pb-0">
          <div className="flex items-center gap-1.5">
            {[
              { id: 'glance', label: 'Overview' },
              { id: 'watch', label: 'Trip Watch' },
              { id: 'routes', label: 'Alternative Routes' },
              { id: 'timeline', label: 'Agent Ledger' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-3.5 py-1.5 rounded-[var(--radius-md)] text-xs sm:text-sm font-medium transition min-h-[38px] ${
                  activeTab === tab.id
                    ? 'bg-[var(--surface-elevated)] text-[var(--text-primary)] border border-[var(--border-default)] font-semibold shadow-sm'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Provenance Badge & Backup Logic Chip */}
          <div className="flex items-center gap-2 shrink-0">
            {nluPath === 'rule_fallback_nlu' && (
              <span className="text-[11px] font-mono text-[var(--status-moderate)] bg-[var(--status-moderate-subtle)] px-2.5 py-0.5 rounded-[var(--radius-sm)] border border-[var(--status-moderate)]/30">
                Answered by backup logic
              </span>
            )}
            <Badge
              type={qualityType}
              source={trip?.provenance.source}
              ageSeconds={trip?.provenance.ageSeconds}
              confidence={trip?.provenance.confidence}
              confidenceType={trip?.provenance.confidenceType}
            />
          </div>
        </div>
      </div>

      {/* Main 16:10 Smart Display Canvas (Target 1280x800) */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-4 sm:p-8 flex flex-col justify-start">
        {/* VIEW 1: AMBIENT / GLANCE HOME */}
        {activeTab === 'glance' && (
          <div className="space-y-6 sm:space-y-8 animate-in fade-in duration-300">
            {/* Centerpiece Voice Orb Card */}
            <div className="p-6 sm:p-10 rounded-[var(--radius-xl)] bg-[var(--surface-card)] border border-[var(--border-subtle)] flex flex-col items-center justify-center text-center shadow-[var(--shadow-md)]">
              <Orb
                state={orbState}
                size={presenterMode ? 'lg' : 'md'}
                onClick={toggleListening}
                caption={
                  isListening
                    ? transcriptPreview || 'Listening... Speak your fleet command.'
                    : spokenReply
                }
              />

              {/* Spoken Turn Reasoning & Mode Tag */}
              <div className="mt-4 flex items-center gap-2 text-xs text-[var(--text-muted)] font-mono">
                <span>Reasoning:</span>
                <span className="text-[var(--text-secondary)] italic truncate max-w-sm">
                  {spokenReasoning}
                </span>
                <span>·</span>
                <button
                  type="button"
                  onClick={() => setEnginePref(enginePref === 'auto' ? 'rule' : 'auto')}
                  className="hover:underline text-[var(--accent)]"
                  title="Toggle NLU Engine"
                >
                  {enginePref === 'auto' ? 'Gemini NLU' : 'Instant Rule'}
                </button>
              </div>

              {/* Live Map View */}
              <div className="mt-8 w-full h-[400px] rounded-[var(--radius-lg)] overflow-hidden border border-[var(--border-subtle)]">
                  <Map
                    defaultCenter={{ lat: 0.3476, lng: 32.5825 }}
                    defaultZoom={8}
                    gestureHandling={'greedy'}
                    disableDefaultUI={true}
                    {...(import.meta.env.VITE_GOOGLE_MAPS_MAP_ID && import.meta.env.VITE_GOOGLE_MAPS_MAP_ID !== 'DEMO_MAP_ID' ? { mapId: import.meta.env.VITE_GOOGLE_MAPS_MAP_ID } : {})}
                    internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
                  >
                    {trip && trip.currentFix && (
                      <Marker position={{ lat: trip.currentFix.latitude, lng: trip.currentFix.longitude }} />
                    )}
                  </Map>
              </div>


              {/* Three Suggested Voice Action Cards */}
              <div className="mt-8 pt-6 border-t border-[var(--border-subtle)] w-full grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                  { query: 'Check trip status', label: 'Check Trip Status', sub: 'Nakawa to Jinja Port' },
                  { query: 'Show reroute options', label: 'Reroute Options', sub: 'Evaluate Katosi Bypass' },
                  { query: 'Approve delay alert', label: 'Approve Outbound Action', sub: 'Human Authorization Gate' },
                ].map((item, i) => (
                  <button
                    key={item.query}
                    type="button"
                    onClick={() => handleVoiceTurn(item.query)}
                    className="p-3.5 rounded-[var(--radius-lg)] bg-[var(--surface-elevated)] hover:bg-[var(--surface-ground)] border border-[var(--border-subtle)] hover:border-[var(--border-default)] text-left transition text-xs font-medium active:scale-98"
                  >
                    <span className="block font-semibold text-[var(--text-primary)]">
                      "{item.label}"
                    </span>
                    <span className="text-[var(--text-muted)] mt-0.5 block">{item.sub}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Quick Trip Telemetry Glance */}
            {trip ? (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Card
                  title={trip.destination}
                  kicker="Destination"
                  badge={<span className="text-xs font-mono text-[var(--accent)]">{trip.redactedPlate}</span>}
                >
                  <p className="text-sm text-[var(--text-secondary)] line-clamp-1">{trip.corridorName}</p>
                  <div className="mt-3 flex items-baseline gap-2 font-mono tabular-numbers">
                    <span className="text-2xl font-bold text-[var(--text-primary)]">{trip.etaMinutes}m</span>
                    <span className="text-xs text-[var(--text-muted)]">projected arrival</span>
                  </div>
                </Card>

                <Card title="Corridor Telemetry" kicker="Transit Conditions">
                  <div className="space-y-1.5 text-xs text-[var(--text-secondary)]">
                    <div className="flex justify-between">
                      <span className="text-[var(--text-muted)]">Speed:</span>
                      <span className="font-mono font-bold text-[var(--text-primary)]">
                        {trip.currentFix ? `${trip.currentFix.speedKmH} km/h` : '0 km/h'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[var(--text-muted)]">Condition:</span>
                      <span>{trip.corridorCondition}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[var(--text-muted)]">Weather:</span>
                      <span>{trip.weatherCondition}</span>
                    </div>
                  </div>
                </Card>

                <Card
                  title={`${Math.round(trip.delayRisk * 100)}% Risk`}
                  kicker="Proactive Delay Score"
                  variant={trip.delayRisk >= 0.65 ? 'critical' : 'default'}
                >
                  <div className="w-full bg-[var(--surface-elevated)] h-2.5 rounded-full overflow-hidden mt-1 mb-2">
                    <div
                      className="h-full transition-all duration-500 rounded-full"
                      style={{
                        width: `${Math.round(trip.delayRisk * 100)}%`,
                        backgroundColor:
                          trip.delayRisk >= 0.65
                            ? 'var(--status-critical)'
                            : trip.delayRisk >= 0.35
                            ? 'var(--status-moderate)'
                            : 'var(--status-normal)',
                      }}
                    />
                  </div>
                  <span className="text-xs text-[var(--text-secondary)]">
                    {trip.delayRisk >= 0.65
                      ? 'Critical delay forecast. Human authorization pending.'
                      : 'Arterial flow within normal variance.'}
                  </span>
                </Card>
              </div>
            ) : (
              <Skeleton variant="card" />
            )}
          </div>
        )}

        {/* VIEW 2: FULL TRIP WATCH VIEW */}
        {activeTab === 'watch' && (
          <div className="space-y-6 animate-in fade-in duration-300">
            {trip ? (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Left: Vector Map & Vehicle Card (7 cols) */}
                <div className="lg:col-span-7 space-y-4">
                  <CorridorMap
                    currentFix={trip.currentFix}
                    corridorId={trip.corridorId}
                    corridorName={trip.corridorName}
                    destination={trip.destination}
                    vehiclePlate={trip.redactedPlate}
                    delayRisk={trip.delayRisk}
                    waypoints={selectedWaypoints}
                  />

                  {/* Vehicle Identity & Highway Metrics */}
                  <Card title={trip.destination} kicker="Active Trip Details">
                    <div className="grid grid-cols-3 gap-3 text-center my-2 font-mono tabular-numbers">
                      <div className="p-3 bg-[var(--surface-elevated)] rounded-[var(--radius-md)]">
                        <span className="text-[11px] text-[var(--text-muted)] block">ETA</span>
                        <span className="text-xl font-bold text-[var(--text-primary)]">{trip.etaMinutes}m</span>
                      </div>
                      <div className="p-3 bg-[var(--surface-elevated)] rounded-[var(--radius-md)]">
                        <span className="text-[11px] text-[var(--text-muted)] block">Speed</span>
                        <span className="text-xl font-bold text-[var(--accent)]">
                          {trip.currentFix ? `${trip.currentFix.speedKmH}` : '0'} km/h
                        </span>
                      </div>
                      <div className="p-3 bg-[var(--surface-elevated)] rounded-[var(--radius-md)]">
                        <span className="text-[11px] text-[var(--text-muted)] block">Risk</span>
                        <span
                          className={`text-xl font-bold ${
                            trip.delayRisk >= 0.65
                              ? 'text-[var(--status-critical)]'
                              : 'text-[var(--status-normal)]'
                          }`}
                        >
                          {Math.round(trip.delayRisk * 100)}%
                        </span>
                      </div>
                    </div>
                  </Card>
                </div>

                {/* Right: Agent Lifecycle Timeline (5 cols) */}
                <div className="lg:col-span-5 space-y-4">
                  <Card
                    title="Watcher Agent Event Ledger"
                    kicker="Autonomous Cycles"
                    badge={
                      <span className="text-xs font-mono text-[var(--status-normal)]">
                        CAS v#{trip.version}
                      </span>
                    }
                  >
                    <Timeline events={timelineEvents} maxEvents={5} />
                  </Card>

                  {/* Human Approval Status Card */}
                  {trip.pendingActions && trip.pendingActions.length > 0 ? (
                    <Card
                      title="Outbound Action Held"
                      kicker="Approval Gate Required"
                      variant="critical"
                      action={
                        <button
                          type="button"
                          onClick={() => setApprovalSheetOpen(true)}
                          className="px-3 py-1.5 rounded-[var(--radius-md)] text-xs font-semibold bg-[var(--status-critical)] text-white shadow-sm"
                        >
                          Review & Sign
                        </button>
                      }
                    >
                      <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                        {trip.pendingActions[0].title}. Target: {trip.pendingActions[0].target}.
                      </p>
                    </Card>
                  ) : (
                    <Card title="Gated & Guarded" kicker="Approval Gate Status">
                      <p className="text-xs text-[var(--text-secondary)]">
                        No pending actions. All outbound dispatches held until authorized.
                      </p>
                    </Card>
                  )}
                </div>
              </div>
            ) : (
              <Skeleton variant="card" />
            )}
          </div>
        )}

        {/* VIEW 3: ALTERNATIVE REROUTES CAROUSEL */}
        {activeTab === 'routes' && (
          <div className="space-y-6 animate-in fade-in duration-300">
            <Carousel
              options={reroutes}
              onSelectRoute={(r) => {
                setSelectedWaypoints(r.waypoints);
                setToast({ message: `Route selected: ${r.name}`, variant: 'info' });
              }}
            />
          </div>
        )}

        {/* VIEW 4: AGENT LEDGER / AUDIT TRAIL */}
        {activeTab === 'timeline' && (
          <div className="space-y-4 animate-in fade-in duration-300">
            <Card
              title="Cryptographic Hash-Chained Audit Ledger"
              kicker="SHA-256 Tamper Evident Log"
              badge={
                <span
                  className={`text-xs font-mono font-semibold px-2 py-0.5 rounded-[var(--radius-sm)] ${
                    chainIntegrity.valid
                      ? 'bg-[var(--status-normal-subtle)] text-[var(--status-normal)]'
                      : 'bg-[var(--status-critical-subtle)] text-[var(--status-critical)]'
                  }`}
                >
                  {chainIntegrity.valid ? 'CHAIN VALID' : 'TAMPER DETECTED'}
                </span>
              }
            >
              <Timeline events={timelineEvents} maxEvents={12} />
            </Card>
          </div>
        )}
      </main>

      {/* Human Approval Bottom Sheet Modal */}
      <ApprovalSheet
        action={trip?.pendingActions?.[0] || null}
        isOpen={approvalSheetOpen}
        isExecuting={isExecuting}
        onApprove={handleApproveAction}
        onReject={handleRejectAction}
        onClose={() => setApprovalSheetOpen(false)}
        confirmedReceipt={confirmedReceipt}
      />

      {/* Toast Notifications */}
      {toast && (
        <Toast
          message={toast.message}
          variant={toast.variant}
          onDismiss={() => setToast(null)}
        />
      )}

      {/* MCP Protocol Inspector Slide-Out Drawer (when toggled) */}
      {showInspector && !presenterMode && (
        <aside className="fixed inset-x-0 bottom-0 sm:inset-x-auto sm:right-0 sm:bottom-0 w-full sm:w-[500px] h-[75vh] sm:h-[480px] bg-[var(--surface-elevated)] border-t sm:border-l border-[var(--border-default)] z-40 shadow-[var(--shadow-sheet)] flex flex-col animate-in slide-in-from-bottom duration-200">
          <div className="p-3 bg-[var(--surface-card)] border-b border-[var(--border-subtle)] flex items-center justify-between">
            <span className="text-xs font-semibold font-mono text-[var(--text-primary)]">
              Streamable HTTP MCP Inspector
            </span>
            <button
              type="button"
              onClick={() => setShowInspector(false)}
              className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] p-1"
            >
              ✕
            </button>
          </div>
          <div className="flex-1 p-3 overflow-y-auto space-y-2 font-mono text-xs">
            {rpcFrames.map((frame, idx) => (
              <div
                key={`${frame.id}-${frame.timestamp}`}
                className="p-2 rounded-[var(--radius-sm)] bg-[var(--surface-ground)] border border-[var(--border-subtle)]"
              >
                <div className="flex items-center justify-between text-[10px] text-[var(--text-muted)] mb-1">
                  <span className="uppercase font-semibold">
                    {frame.direction === 'outgoing' ? '→ Client Request' : '← MCP Response'}
                  </span>
                  <span>{new Date(frame.timestamp).toLocaleTimeString()}</span>
                </div>
                <pre className="text-[11px] overflow-x-auto text-[var(--text-secondary)]">
                  {JSON.stringify(frame.payload, null, 2)}
                </pre>
              </div>
            ))}
          </div>
        </aside>
      )}

      {/* Footer */}
      <footer className="border-t border-[var(--border-subtle)] bg-[var(--surface-ground)] px-4 sm:px-8 py-3 text-xs text-[var(--text-muted)] flex flex-col sm:flex-row items-center justify-between gap-2 text-center sm:text-left">
        <div>
          <span>Convoy Watch · Alexa+ Smart Display Fleet Intelligence</span>
          <span className="mx-2 hidden sm:inline">·</span>
          <span className="text-[var(--text-secondary)]">Uganda Freight Corridors</span>
        </div>
        <div className="flex items-center gap-3">
          <span>Target: Echo Show (1280x800)</span>
          <span>·</span>
          <span>MCP 2025-11-25</span>
        </div>
      </footer>
    </div>
  );
}


/**
 * Renders the route between origin and destination using the Maps JS SDK Route service.
 */

