/**
 * MCP Client & Alexa+ Simulation Service
 * Interacts directly with the Streamable HTTP MCP server and REST endpoints.
 */

export interface McpRpcFrame {
  id: string | number;
  timestamp: number;
  direction: 'outgoing' | 'incoming';
  payload: any;
}

export const JUDGE_DEMO_KEY = 'judge-alexa-plus-demo-key-2026-v1';

export class SimulationApiClient {
  private apiKey: string;
  private rpcLogListeners: Array<(frame: McpRpcFrame) => void> = [];

  constructor(apiKey: string = JUDGE_DEMO_KEY) {
    this.apiKey = apiKey;
  }

  setApiKey(key: string): void {
    this.apiKey = key;
  }

  getApiKey(): string {
    return this.apiKey;
  }

  onRpcFrame(callback: (frame: McpRpcFrame) => void): () => void {
    this.rpcLogListeners.push(callback);
    return () => {
      this.rpcLogListeners = this.rpcLogListeners.filter((cb) => cb !== callback);
    };
  }

  private emitFrame(direction: 'outgoing' | 'incoming', id: string | number, payload: any): void {
    const frame: McpRpcFrame = {
      id,
      timestamp: Date.now(),
      direction,
      payload,
    };
    this.rpcLogListeners.forEach((cb) => cb(frame));
  }

  private sessionId: string | null = null;

  async ensureSession(): Promise<string> {
    if (this.sessionId) return this.sessionId;

    const rpcId = `init_${Date.now()}`;
    const rpcRequest = {
      jsonrpc: '2.0',
      id: rpcId,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'alexa-plus-sim-client', version: '1.0.0' },
      },
    };

    this.emitFrame('outgoing', rpcId, rpcRequest);

    const res = await fetch('/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(rpcRequest),
    });

    const newSessionId = res.headers.get('mcp-session-id');
    if (newSessionId) {
      this.sessionId = newSessionId;
    }

    const text = await res.text();
    const dataLine = text.split('\n').find((l) => l.startsWith('data: '));
    const jsonStr = dataLine ? dataLine.replace(/^data:\s*/, '') : text;
    try {
      const parsed = JSON.parse(jsonStr);
      this.emitFrame('incoming', rpcId, parsed);
    } catch {
      this.emitFrame('incoming', rpcId, { raw: text });
    }

    return this.sessionId || '';
  }

  /**
   * Calls a tool directly through the official Streamable HTTP MCP endpoint (/mcp).
   * Exercising the MCP JSON-RPC 2.0 protocol over HTTP POST with session management.
   */
  async callMcpTool(toolName: string, args: Record<string, unknown>): Promise<any> {
    const sessionId = await this.ensureSession();
    const rpcId = `req_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const rpcRequest = {
      jsonrpc: '2.0',
      id: rpcId,
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: args,
      },
    };

    this.emitFrame('outgoing', rpcId, rpcRequest);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
      Authorization: `Bearer ${this.apiKey}`,
    };
    if (sessionId) {
      headers['mcp-session-id'] = sessionId;
    }

    const response = await fetch('/mcp', {
      method: 'POST',
      headers,
      body: JSON.stringify(rpcRequest),
    });

    if (!response.ok) {
      const errText = await response.text();
      const errorObj = { status: response.status, error: errText };
      this.emitFrame('incoming', rpcId, errorObj);
      throw new Error(`MCP Error HTTP ${response.status}: ${errText}`);
    }

    const text = await response.text();
    const dataLine = text.split('\n').find((l) => l.startsWith('data: '));
    const jsonStr = dataLine ? dataLine.replace(/^data:\s*/, '') : text;

    let rpcResponse: any = {};
    try {
      rpcResponse = JSON.parse(jsonStr);
    } catch {
      rpcResponse = { raw: text };
    }

    this.emitFrame('incoming', rpcId, rpcResponse);

    if (rpcResponse.error) {
      throw new Error(`MCP JSON-RPC Error: ${rpcResponse.error.message || JSON.stringify(rpcResponse.error)}`);
    }

    return rpcResponse.result || rpcResponse;
  }

  /**
   * Lists tools via MCP tools/list JSON-RPC call.
   */
  async listMcpTools(): Promise<any> {
    const rpcId = `req_${Date.now()}_tools_list`;
    const rpcRequest = {
      jsonrpc: '2.0',
      id: rpcId,
      method: 'tools/list',
      params: {},
    };

    this.emitFrame('outgoing', rpcId, rpcRequest);

    const response = await fetch('/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(rpcRequest),
    });

    const rpcResponse = await response.json();
    this.emitFrame('incoming', rpcId, rpcResponse);
    return rpcResponse.result?.tools || [];
  }

  // REST Simulation Endpoints

  async getTrips(): Promise<any[]> {
    const res = await fetch('/api/trips', {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.trips || [];
  }

  async getTrip(tripId: string): Promise<any> {
    const url = `/api/trips/${encodeURIComponent(tripId)}`;
    const headers: Record<string, string> = { Authorization: `Bearer ${this.apiKey}` };
    const res = await fetch(url, { headers });
    
    const text = await res.text();
    
    if (!res.ok) {
        console.error(`[API Client Error] Trip fetch failed (${res.status}): ${text}`);
        throw new Error(`HTTP ${res.status}: ${text}`);
    }
    
    try {
        return JSON.parse(text);
    } catch (e) {
        console.error(`[API Client Error] Failed to parse JSON: ${text}`);
        throw new Error(`Failed to parse JSON response: ${text.substring(0, 100)}...`);
    }
  }

  async setScenario(tripId: string, event: string): Promise<any> {
    const res = await fetch(`/api/trips/${encodeURIComponent(tripId)}/scenario`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ event }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  async triggerTick(tripId: string): Promise<any> {
    const res = await fetch(`/api/trips/${encodeURIComponent(tripId)}/tick`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  async approveAction(tripId: string, actionId: string, decision: 'approved' | 'rejected', notes?: string): Promise<any> {
    const res = await fetch(`/api/trips/${encodeURIComponent(tripId)}/actions/${encodeURIComponent(actionId)}/approve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ decision, notes }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  async getRerouteOptions(tripId: string): Promise<any> {
    const res = await fetch(`/api/trips/${encodeURIComponent(tripId)}/reroutes`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  async voiceTurn(query: string, tripId?: string, actionId?: string, engine?: 'auto' | 'rule' | 'gemini', origin?: { lat: number, lng: number }): Promise<any> {
    const res = await fetch('/api/alexa/voice-turn', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ query, tripId, actionId, engine, origin }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  async getAuditLog(tripId?: string): Promise<any> {
    const url = tripId ? `/api/audit-log?tripId=${encodeURIComponent(tripId)}` : '/api/audit-log';
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }
}

/**
 * Web Speech API text-to-speech helper
 */
export function speakAlexaResponse(text: string): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      resolve();
      return;
    }
    // Cancel any previous speech
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.05;
    utterance.pitch = 1.0;
    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();

    window.speechSynthesis.speak(utterance);
  });
}

export const simulationApi = new SimulationApiClient();
