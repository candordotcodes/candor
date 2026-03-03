/**
 * @candor/sdk — TypeScript SDK for the Candor MCP Observability Proxy.
 *
 * Subscribe to real-time events, query historical sessions,
 * and define programmatic alert rules.
 */

// ── Public types ────────────────────────────────────────
export type Direction = "request" | "response";
export type Severity = "info" | "warning" | "critical";
export type ConditionType = "error_rate" | "latency" | "cost_spike" | "tool_failure" | "event_count";

export interface CandorEvent {
    id: string;
    sessionId: string;
    timestamp: string;
    direction: Direction;
    method?: string;
    toolName?: string;
    params?: Record<string, unknown>;
    result?: Record<string, unknown>;
    error?: Record<string, unknown>;
    latencyMs?: number;
    tokenEstimate?: number;
    costEstimate?: number;
}

export interface CandorSession {
    id: string;
    userId?: string;
    agentId?: string;
    upstreamName?: string;
    startedAt: string;
    endedAt?: string;
    totalCostEstimate: number;
    eventCount?: number;
    metadata?: Record<string, unknown>;
}

export interface CandorAlert {
    id: string;
    ruleId: string;
    sessionId: string;
    eventId?: string;
    message: string;
    severity: Severity;
    timestamp: string;
}

export interface AlertRule {
    id: string;
    userId: string;
    name: string;
    condition: AlertCondition;
    webhookUrl?: string;
    enabled: boolean;
}

export interface AlertCondition {
    type: ConditionType;
    threshold?: number;
    windowMs?: number;
    toolName?: string;
}

// ── Subscription filters ────────────────────────────────
export interface EventFilter {
    sessionId?: string;
    upstream?: string;
    method?: string;
    toolName?: string;
    direction?: Direction;
    /** Only events with errors */
    errorsOnly?: boolean;
    /** Minimum cost to include */
    minCost?: number;
    /** Minimum latency (ms) to include */
    minLatency?: number;
}

export type EventHandler = (event: CandorEvent) => void;
export type AlertHandler = (alert: CandorAlert) => void;
export type SessionHandler = (session: CandorSession) => void;

// ── Query options ───────────────────────────────────────
export interface QueryOptions {
    /** Filter by session ID */
    sessionId?: string;
    /** Unix timestamp (ms) — start of range */
    since?: number;
    /** Unix timestamp (ms) — end of range */
    until?: number;
    /** Max results to return */
    limit?: number;
    /** Offset for pagination */
    offset?: number;
}

export interface CostSummary {
    totalCost: number;
    totalEvents: number;
    totalSessions: number;
    byUpstream: { name: string; cost: number; events: number }[];
    byTool: { name: string; cost: number; calls: number }[];
    bySession: { id: string; cost: number; events: number; agent?: string }[];
}

// ── SDK Configuration ───────────────────────────────────
export interface CandorConfig {
    /** Proxy HTTP base URL (default: http://localhost:3100) */
    baseUrl?: string;
    /** WebSocket URL (default: ws://localhost:3101) */
    wsUrl?: string;
    /** API key for authentication */
    apiKey?: string;
    /** User ID for scoped subscriptions */
    userId?: string;
    /** Auto-reconnect on disconnect (default: true) */
    autoReconnect?: boolean;
    /** Max reconnect attempts (default: 10) */
    maxReconnectAttempts?: number;
}
