/**
 * CandorQuery — HTTP query client for historical data.
 *
 * Fetches sessions, events, costs, and alerts from the proxy's REST API.
 */
import type {
    CandorConfig,
    CandorEvent,
    CandorSession,
    CandorAlert,
    AlertRule,
    AlertCondition,
    QueryOptions,
    CostSummary,
} from "./types.js";

export class CandorQuery {
    private baseUrl: string;
    private headers: Record<string, string>;

    constructor(config: CandorConfig = {}) {
        this.baseUrl = (config.baseUrl || "http://localhost:3100").replace(/\/$/, "");
        this.headers = {
            "Content-Type": "application/json",
        };
        if (config.apiKey) {
            this.headers["Authorization"] = `Bearer ${config.apiKey}`;
        }
        if (config.userId) {
            this.headers["X-User-Id"] = config.userId;
        }
    }

    // ── Sessions ────────────────────────────────────────

    /** Get all active sessions */
    async getActiveSessions(): Promise<CandorSession[]> {
        return this.get("/api/sessions?active=true");
    }

    /** Get a specific session by ID */
    async getSession(sessionId: string): Promise<CandorSession> {
        return this.get(`/api/sessions/${sessionId}`);
    }

    /** List sessions with optional filters */
    async listSessions(options: QueryOptions = {}): Promise<CandorSession[]> {
        const params = this.buildParams(options);
        return this.get(`/api/sessions?${params}`);
    }

    // ── Events ──────────────────────────────────────────

    /** Get events for a session */
    async getSessionEvents(sessionId: string, options: QueryOptions = {}): Promise<CandorEvent[]> {
        const params = this.buildParams(options);
        return this.get(`/api/sessions/${sessionId}/events?${params}`);
    }

    /** Query events across all sessions */
    async queryEvents(options: QueryOptions = {}): Promise<CandorEvent[]> {
        const params = this.buildParams(options);
        return this.get(`/api/events?${params}`);
    }

    // ── Cost ────────────────────────────────────────────

    /** Get cost summary for a time period */
    async getCostSummary(period: string = "24h"): Promise<CostSummary> {
        return this.get(`/api/cost?period=${encodeURIComponent(period)}`);
    }

    /** Get cost breakdown for a specific session */
    async getSessionCost(sessionId: string): Promise<CostSummary> {
        return this.get(`/api/cost/${sessionId}`);
    }

    // ── Alerts ──────────────────────────────────────────

    /** Get all alert rules */
    async getAlertRules(): Promise<AlertRule[]> {
        return this.get("/api/alerts/rules");
    }

    /** Create a new alert rule */
    async createAlertRule(rule: {
        name: string;
        condition: AlertCondition;
        webhookUrl?: string;
        enabled?: boolean;
    }): Promise<AlertRule> {
        return this.post("/api/alerts/rules", rule);
    }

    /** Update an existing alert rule */
    async updateAlertRule(ruleId: string, updates: Partial<AlertRule>): Promise<AlertRule> {
        return this.put(`/api/alerts/rules/${ruleId}`, updates);
    }

    /** Delete an alert rule */
    async deleteAlertRule(ruleId: string): Promise<void> {
        return this.del(`/api/alerts/rules/${ruleId}`);
    }

    /** Get fired alerts */
    async getAlerts(options: QueryOptions = {}): Promise<CandorAlert[]> {
        const params = this.buildParams(options);
        return this.get(`/api/alerts?${params}`);
    }

    // ── Compare ─────────────────────────────────────────

    /** Compare two sessions side by side */
    async compareSessions(sessionA: string, sessionB: string): Promise<{
        sessionA: CandorSession;
        sessionB: CandorSession;
        comparison: {
            costDiff: number;
            latencyDiff: number;
            eventCountDiff: number;
        };
    }> {
        return this.get(`/api/compare/${sessionA}/${sessionB}`);
    }

    // ── HTTP helpers ────────────────────────────────────

    private async get<T>(path: string): Promise<T> {
        const res = await fetch(`${this.baseUrl}${path}`, {
            method: "GET",
            headers: this.headers,
            signal: AbortSignal.timeout(10000),
        });
        if (!res.ok) {
            throw new Error(`Candor API error: ${res.status} ${res.statusText}`);
        }
        return res.json() as Promise<T>;
    }

    private async post<T>(path: string, body: unknown): Promise<T> {
        const res = await fetch(`${this.baseUrl}${path}`, {
            method: "POST",
            headers: this.headers,
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(10000),
        });
        if (!res.ok) {
            throw new Error(`Candor API error: ${res.status} ${res.statusText}`);
        }
        return res.json() as Promise<T>;
    }

    private async put<T>(path: string, body: unknown): Promise<T> {
        const res = await fetch(`${this.baseUrl}${path}`, {
            method: "PUT",
            headers: this.headers,
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(10000),
        });
        if (!res.ok) {
            throw new Error(`Candor API error: ${res.status} ${res.statusText}`);
        }
        return res.json() as Promise<T>;
    }

    private async del(path: string): Promise<void> {
        const res = await fetch(`${this.baseUrl}${path}`, {
            method: "DELETE",
            headers: this.headers,
            signal: AbortSignal.timeout(10000),
        });
        if (!res.ok) {
            throw new Error(`Candor API error: ${res.status} ${res.statusText}`);
        }
    }

    private buildParams(options: QueryOptions): string {
        const params = new URLSearchParams();
        if (options.sessionId) params.set("sessionId", options.sessionId);
        if (options.since) params.set("since", String(options.since));
        if (options.until) params.set("until", String(options.until));
        if (options.limit) params.set("limit", String(options.limit));
        if (options.offset) params.set("offset", String(options.offset));
        return params.toString();
    }
}
