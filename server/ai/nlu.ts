/**
 * NLU Routing Service for Alexa+ Voice Simulation
 * Primary Path: Gemini function calling over MCP tools.
 * Fallback Path: Deterministic rule-based intent parser.
 * Circuit breaker pattern ensuring zero downtime during quota/network interruptions.
 */

import { GoogleGenAI } from '@google/genai';
import { createProvenanceEnvelope, type ProvenanceEnvelope } from '@convoy/mcp-provenance';

export interface NluParseResult {
  toolName: 'start_trip_watch' | 'get_trip_status' | 'list_reroute_options' | 'approve_action' | 'stop_trip_watch' | 'unknown';
  args: Record<string, unknown>;
  confidence: number;
  pathUsed: 'gemini_nlu' | 'rule_fallback_nlu';
  rawQuery: string;
  reasoning: string;
  provenance: ProvenanceEnvelope;
}

export class CircuitBreaker {
  private failureCount = 0;
  private lastFailureTime = 0;
  private readonly threshold: number;
  private readonly resetTimeoutMs: number;

  constructor(threshold = 3, resetTimeoutMs = 15000) {
    this.threshold = threshold;
    this.resetTimeoutMs = resetTimeoutMs;
  }

  isOpen(): boolean {
    if (this.failureCount >= this.threshold) {
      if (Date.now() - this.lastFailureTime > this.resetTimeoutMs) {
        // Half-open: attempt recovery
        this.failureCount = Math.floor(this.threshold / 2);
        return false;
      }
      return true;
    }
    return false;
  }

  recordSuccess(): void {
    this.failureCount = 0;
  }

  recordFailure(): void {
    this.failureCount += 1;
    this.lastFailureTime = Date.now();
  }
}

export class NluService {
  private aiClient: GoogleGenAI | null = null;
  private circuitBreaker = new CircuitBreaker(2, 20000);

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey && apiKey !== 'MY_GEMINI_API_KEY' && apiKey.trim().length > 0) {
      this.aiClient = new GoogleGenAI({
        apiKey: apiKey.trim(),
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });
    }
  }

  /**
   * Main entry point to interpret user speech or typed command.
   */
  async parseIntent(
    query: string,
    context?: { defaultTripId?: string; pendingActionId?: string; engine?: 'auto' | 'rule' | 'gemini' }
  ): Promise<NluParseResult> {
    const cleanQuery = query.trim();

    // If circuit breaker is open or no Gemini API key configured, use deterministic fallback
    if (!this.aiClient || this.circuitBreaker.isOpen() || context?.engine === 'rule') {
      return this.parseRuleBased(cleanQuery, context, 'deterministic_rule_engine');
    }

    const abortController = new AbortController();
    const deadlineMs = 3000;
    const timeoutHandle = setTimeout(() => {
      abortController.abort();
    }, deadlineMs);

    try {
      const geminiResult = await this.parseWithGemini(cleanQuery, context, abortController.signal);
      clearTimeout(timeoutHandle);

      if (geminiResult) {
        this.circuitBreaker.recordSuccess();
        return geminiResult;
      }
    } catch (err: unknown) {
      clearTimeout(timeoutHandle);
      this.circuitBreaker.recordFailure();
      const isAborted = abortController.signal.aborted;
      const reason = isAborted
        ? `Gemini NLU deadline exceeded (${deadlineMs}ms)`
        : (err instanceof Error ? err.message : String(err));
      // Graceful degradation log
      console.log(`[NluService] Gemini call degraded to rule fallback parser: ${reason}`);
    }

    return this.parseRuleBased(cleanQuery, context, 'gemini_deadline_fallback');
  }

  private async parseWithGemini(
    query: string,
    context?: { defaultTripId?: string; pendingActionId?: string },
    abortSignal?: AbortSignal
  ): Promise<NluParseResult | null> {
    if (!this.aiClient) return null;

    const systemInstruction = `You are the expert, wise, and highly insightful Alexa+ NLU intent classifier for Convoy Watch fleet monitoring.
Your purpose is to accurately interpret user commands, understanding not just the literal intent, but the potential context and implications of those commands in a fleet monitoring scenario.

You have access to 5 MCP tools:
1. start_trip_watch(tripId, destination, corridorId, priority, vehicleId)
2. get_trip_status(tripId)
3. list_reroute_options(tripId)
4. approve_action(tripId, actionId, decision: 'approved' | 'rejected', notes)
5. stop_trip_watch(tripId, reason)

Default trip ID context: ${context?.defaultTripId || 'TRIP-KLA-JINJA-01'}
Pending action ID context: ${context?.pendingActionId || 'none'}

Output valid JSON only with keys:
"tool": "start_trip_watch" | "get_trip_status" | "list_reroute_options" | "approve_action" | "stop_trip_watch" | "unknown",
"args": object with extracted parameters,
"confidence": number between 0 and 1,
"reasoning": A wise, insightful, and comprehensive explanation of your interpretation, considering the likely user intent, context, and potential risks or benefits of the action.`;

    const response = await this.aiClient.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: [{ role: 'user', parts: [{ text: query }] }],
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        temperature: 0.1,
        abortSignal,
      },
    });

    const text = response.text?.trim();
    if (!text) return null;

    const parsed = JSON.parse(text);
    const tool = parsed.tool;
    const args = parsed.args || {};

    // Auto-fill defaults if model omitted context
    if (tool !== 'unknown' && !args.tripId && context?.defaultTripId) {
      args.tripId = context.defaultTripId;
    }
    if (tool === 'approve_action' && !args.actionId && context?.pendingActionId) {
      args.actionId = context.pendingActionId;
    }
    if (tool === 'start_trip_watch') {
      args.corridorId = args.corridorId || 'UG-CORRIDOR-01';
      args.destination = args.destination || 'Jinja Port Depot';
    }

    const provenance = createProvenanceEnvelope('derived', 0, parsed.confidence || 0.95, true, {
      spokenPhrase: 'Interpreted via Alexa+ Gemini model reasoning.',
    });

    return {
      toolName: tool,
      args,
      confidence: parsed.confidence || 0.95,
      pathUsed: 'gemini_nlu',
      rawQuery: query,
      reasoning: parsed.reasoning || 'Extracted via Gemini 3.8 Flash function schema',
      provenance,
    };
  }

  /**
   * Deterministic rule-based fallback parser.
   * Completely offline, instantaneous, zero external dependency.
   */
  public parseRuleBased(
    query: string,
    context?: { defaultTripId?: string; pendingActionId?: string },
    degradeReason?: string
  ): NluParseResult {
    const q = query.toLowerCase();
    const tripId = context?.defaultTripId || 'TRIP-KLA-JINJA-01';
    const actionId = context?.pendingActionId || 'ACT-DELAY-CURRENT';

    // 1. Approval / Rejection
    const isApproval =
      q.includes('approve') ||
      q.includes('authorize') ||
      q.includes('confirm') ||
      q.includes('proceed') ||
      q.includes('go ahead') ||
      q.includes('send alert') ||
      q.includes('accept') ||
      q.includes('dispatch') ||
      q.includes('do it') ||
      q.includes('yes proceed') ||
      q.includes('yes approve') ||
      q === 'yes' ||
      q === 'okay' ||
      q === 'ok';

    if (isApproval) {
      return {
        toolName: 'approve_action',
        args: {
          tripId,
          actionId,
          decision: 'approved',
          notes: 'Supervisor approved via Alexa+ voice command.',
        },
        confidence: 0.99,
        pathUsed: 'rule_fallback_nlu',
        rawQuery: query,
        reasoning: `Rule matched approval command: '${query}'. Reason: ${degradeReason || 'direct rule'}`,
        provenance: createProvenanceEnvelope('baseline', 0, 0.99, true, {
          spokenPhrase: 'Interpreted via deterministic rule parser.',
        }),
      };
    }

    const isRejection =
      q.includes('reject') ||
      q.includes('deny') ||
      q.includes('do not send') ||
      q.includes("don't send") ||
      q.includes('cancel action') ||
      q.includes('no discard') ||
      q.includes('decline') ||
      q.includes('disagree') ||
      q.includes('abort action') ||
      q === 'no';

    if (isRejection) {
      return {
        toolName: 'approve_action',
        args: {
          tripId,
          actionId,
          decision: 'rejected',
          notes: 'Supervisor rejected via Alexa+ voice command.',
        },
        confidence: 0.99,
        pathUsed: 'rule_fallback_nlu',
        rawQuery: query,
        reasoning: `Rule matched rejection command: '${query}'.`,
        provenance: createProvenanceEnvelope('baseline', 0, 0.99, true),
      };
    }

    // 2. Reroute Options
    if (
      q.includes('reroute') ||
      q.includes('alternate') ||
      q.includes('alternative') ||
      q.includes('detour') ||
      q.includes('bypass') ||
      q.includes('other route') ||
      q.includes('new route') ||
      q.includes('katosi') ||
      q.includes('avoid traffic') ||
      q.includes('avoid jam')
    ) {
      return {
        toolName: 'list_reroute_options',
        args: { tripId },
        confidence: 0.95,
        pathUsed: 'rule_fallback_nlu',
        rawQuery: query,
        reasoning: 'Rule matched reroute options inquiry.',
        provenance: createProvenanceEnvelope('baseline', 0, 0.95, true),
      };
    }

    // 3. Stop Watch
    if (
      q.includes('stop') ||
      q.includes('cancel watch') ||
      q.includes('cancel trip') ||
      q.includes('deactivate') ||
      q.includes('end trip') ||
      q.includes('finish') ||
      q.includes('terminate') ||
      q.includes('halt')
    ) {
      return {
        toolName: 'stop_trip_watch',
        args: { tripId, reason: 'Supervisor requested monitoring deactivation via voice.' },
        confidence: 0.95,
        pathUsed: 'rule_fallback_nlu',
        rawQuery: query,
        reasoning: 'Rule matched trip termination keywords.',
        provenance: createProvenanceEnvelope('baseline', 0, 0.95, true),
      };
    }

    // 4. Start Watch
    if (
      q.includes('start') ||
      q.includes('track') ||
      q.includes('begin') ||
      q.includes('monitor') ||
      q.includes('watch trip') ||
      q.includes('new trip')
    ) {
      return {
        toolName: 'start_trip_watch',
        args: {
          tripId,
          destination: 'Jinja Port Depot',
          corridorId: 'UG-CORRIDOR-01',
          priority: 'high',
          vehicleId: 'TRK-101',
        },
        confidence: 0.95,
        pathUsed: 'rule_fallback_nlu',
        rawQuery: query,
        reasoning: 'Rule matched start trip watch command.',
        provenance: createProvenanceEnvelope('baseline', 0, 0.95, true),
      };
    }

    // 5. Status / Telemetry (Default fallback)
    return {
      toolName: 'get_trip_status',
      args: { tripId },
      confidence: 0.88,
      pathUsed: 'rule_fallback_nlu',
      rawQuery: query,
      reasoning: 'Rule defaulted to trip telemetry and status check.',
      provenance: createProvenanceEnvelope('baseline', 0, 0.88, true),
    };
  }
}
