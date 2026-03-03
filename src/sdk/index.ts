/**
 * @candor/sdk
 *
 * TypeScript SDK for the Candor MCP Observability Proxy.
 * Provides real-time event subscriptions and historical data queries.
 *
 * Usage:
 *
 * ```ts
 * import { Candor } from "@candor/sdk";
 *
 * const candor = new Candor({ apiKey: "your-key" });
 *
 * // Real-time events
 * await candor.connect();
 * candor.onTool("readFile", (event) => console.log(event));
 * candor.onAlert((alert) => console.log(alert));
 *
 * // Historical queries
 * const sessions = await candor.query.listSessions({ limit: 10 });
 * const cost = await candor.query.getCostSummary("24h");
 * ```
 */

import { CandorClient } from "./client.js";
import { CandorQuery } from "./query.js";
import type { CandorConfig, EventFilter, EventHandler, AlertHandler, SessionHandler } from "./types.js";

export class Candor {
    /** Real-time WebSocket client */
    readonly client: CandorClient;
    /** Historical data query API */
    readonly query: CandorQuery;

    private config: CandorConfig;

    constructor(config: CandorConfig = {}) {
        this.config = config;
        this.client = new CandorClient(config);
        this.query = new CandorQuery(config);
    }

    // ── Connection ──────────────────────────────────────

    /** Connect to the proxy WebSocket for real-time events */
    async connect(): Promise<void> {
        return this.client.connect();
    }

    /** Disconnect from the proxy */
    disconnect(): void {
        this.client.disconnect();
    }

    /** Whether the client is connected */
    get connected(): boolean {
        return this.client.isConnected();
    }

    // ── Subscription shortcuts ──────────────────────────

    /** Subscribe to events matching a filter */
    onEvent(filter: EventFilter | EventHandler, handler?: EventHandler): number {
        return this.client.onEvent(filter, handler);
    }

    /** Subscribe to a specific tool's events */
    onTool(toolName: string, handler: EventHandler): number {
        return this.client.onTool(toolName, handler);
    }

    /** Subscribe to events from a specific upstream */
    onUpstream(upstream: string, handler: EventHandler): number {
        return this.client.onUpstream(upstream, handler);
    }

    /** Subscribe to error events only */
    onError(handler: EventHandler): number {
        return this.client.onError(handler);
    }

    /** Subscribe to calls exceeding a latency threshold */
    onSlowCall(minLatencyMs: number, handler: EventHandler): number {
        return this.client.onSlowCall(minLatencyMs, handler);
    }

    /** Subscribe to alerts */
    onAlert(handler: AlertHandler): void {
        this.client.onAlert(handler);
    }

    /** Subscribe to session start events */
    onSessionStart(handler: SessionHandler): void {
        this.client.onSessionStart(handler);
    }

    /** Subscribe to session end events */
    onSessionEnd(handler: SessionHandler): void {
        this.client.onSessionEnd(handler);
    }

    /** Remove a subscription by ID */
    unsubscribe(id: number): boolean {
        return this.client.unsubscribe(id);
    }

    /** Remove all subscriptions */
    clearAll(): void {
        this.client.clearAll();
    }

    // ── Lifecycle events ────────────────────────────────

    /** Listen to client lifecycle events (connected, disconnected, reconnecting, error) */
    on(event: string, handler: (...args: unknown[]) => void): this {
        this.client.on(event, handler);
        return this;
    }
}

// ── Re-exports ──────────────────────────────────────────
export { CandorClient } from "./client.js";
export { CandorQuery } from "./query.js";
export * from "./types.js";

// Default export
export default Candor;
