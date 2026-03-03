/**
 * CandorClient — WebSocket client for real-time event streaming.
 *
 * Connects to the proxy's WebSocket endpoint and provides
 * filtered subscriptions for events, alerts, and session lifecycle.
 */
import { EventEmitter } from "node:events";
import type {
    CandorConfig,
    CandorEvent,
    CandorAlert,
    CandorSession,
    EventFilter,
    EventHandler,
    AlertHandler,
    SessionHandler,
} from "./types.js";

interface Subscription {
    id: number;
    filter: EventFilter;
    handler: EventHandler;
}

export class CandorClient extends EventEmitter {
    private ws: WebSocket | null = null;
    private config: Required<CandorConfig>;
    private subscriptions: Map<number, Subscription> = new Map();
    private alertHandlers: Set<AlertHandler> = new Set();
    private sessionStartHandlers: Set<SessionHandler> = new Set();
    private sessionEndHandlers: Set<SessionHandler> = new Set();
    private nextSubId = 1;
    private reconnectAttempts = 0;
    private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    private connected = false;
    private intentionalClose = false;

    constructor(config: CandorConfig = {}) {
        super();
        this.config = {
            baseUrl: config.baseUrl || "http://localhost:3100",
            wsUrl: config.wsUrl || "ws://localhost:3101",
            apiKey: config.apiKey || "",
            userId: config.userId || "",
            autoReconnect: config.autoReconnect !== false,
            maxReconnectAttempts: config.maxReconnectAttempts || 10,
        };
    }

    /** Connect to the proxy WebSocket */
    connect(): Promise<void> {
        return new Promise((resolve, reject) => {
            const url = this.config.apiKey
                ? `${this.config.wsUrl}?token=${this.config.apiKey}`
                : this.config.wsUrl;

            try {
                this.ws = new WebSocket(url);
            } catch (err) {
                reject(new Error(`Failed to create WebSocket: ${err}`));
                return;
            }

            this.ws.onopen = () => {
                this.connected = true;
                this.reconnectAttempts = 0;
                this.intentionalClose = false;

                // Subscribe with userId if provided
                if (this.config.userId) {
                    this.send({
                        type: "subscribe",
                        payload: { userId: this.config.userId },
                    });
                }

                this.emit("connected");
                resolve();
            };

            this.ws.onmessage = (ev: MessageEvent) => {
                try {
                    const msg = JSON.parse(typeof ev.data === "string" ? ev.data : ev.data.toString());
                    this.handleMessage(msg);
                } catch {
                    // Ignore malformed messages
                }
            };

            this.ws.onclose = () => {
                this.connected = false;
                this.emit("disconnected");
                if (!this.intentionalClose && this.config.autoReconnect) {
                    this.attemptReconnect();
                }
            };

            this.ws.onerror = (err) => {
                if (!this.connected) {
                    reject(new Error("WebSocket connection failed"));
                }
                this.emit("error", err);
            };
        });
    }

    /** Disconnect from the proxy */
    disconnect(): void {
        this.intentionalClose = true;
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.connected = false;
    }

    /** Whether the client is currently connected */
    isConnected(): boolean {
        return this.connected;
    }

    // ── Subscriptions ───────────────────────────────────

    /**
     * Subscribe to events matching a filter.
     * Returns a subscription ID that can be used to unsubscribe.
     */
    onEvent(filter: EventFilter | EventHandler, handler?: EventHandler): number {
        // Allow (handler) shorthand for subscribe-all
        if (typeof filter === "function") {
            handler = filter;
            filter = {};
        }
        if (!handler) throw new Error("Handler is required");

        const id = this.nextSubId++;
        this.subscriptions.set(id, { id, filter, handler });
        return id;
    }

    /** Subscribe to a specific tool's events */
    onTool(toolName: string, handler: EventHandler): number {
        return this.onEvent({ toolName }, handler);
    }

    /** Subscribe to events from a specific upstream */
    onUpstream(upstream: string, handler: EventHandler): number {
        return this.onEvent({ upstream }, handler);
    }

    /** Subscribe to error events only */
    onError(handler: EventHandler): number {
        return this.onEvent({ errorsOnly: true }, handler);
    }

    /** Subscribe to events exceeding a latency threshold */
    onSlowCall(minLatencyMs: number, handler: EventHandler): number {
        return this.onEvent({ minLatency: minLatencyMs }, handler);
    }

    /** Subscribe to alerts */
    onAlert(handler: AlertHandler): void {
        this.alertHandlers.add(handler);
    }

    /** Subscribe to session start events */
    onSessionStart(handler: SessionHandler): void {
        this.sessionStartHandlers.add(handler);
    }

    /** Subscribe to session end events */
    onSessionEnd(handler: SessionHandler): void {
        this.sessionEndHandlers.add(handler);
    }

    /** Remove an event subscription by ID */
    unsubscribe(subscriptionId: number): boolean {
        return this.subscriptions.delete(subscriptionId);
    }

    /** Remove all subscriptions and handlers */
    clearAll(): void {
        this.subscriptions.clear();
        this.alertHandlers.clear();
        this.sessionStartHandlers.clear();
        this.sessionEndHandlers.clear();
    }

    // ── Internals ───────────────────────────────────────

    private send(msg: Record<string, unknown>): void {
        if (this.ws && this.connected) {
            this.ws.send(JSON.stringify(msg));
        }
    }

    private handleMessage(msg: { type: string; payload?: Record<string, unknown> }): void {
        switch (msg.type) {
            case "event":
                this.dispatchEvent(msg.payload as unknown as CandorEvent);
                break;
            case "alert":
                this.dispatchAlert(msg.payload as unknown as CandorAlert);
                break;
            case "session_start":
                for (const h of this.sessionStartHandlers) {
                    h(msg.payload as unknown as CandorSession);
                }
                break;
            case "session_end":
                for (const h of this.sessionEndHandlers) {
                    h(msg.payload as unknown as CandorSession);
                }
                break;
            case "error":
                this.emit("error", new Error((msg.payload as { message?: string })?.message || "Unknown error"));
                break;
        }
    }

    private dispatchEvent(event: CandorEvent): void {
        for (const sub of this.subscriptions.values()) {
            if (this.matchesFilter(event, sub.filter)) {
                try {
                    sub.handler(event);
                } catch (err) {
                    this.emit("error", err);
                }
            }
        }
    }

    private dispatchAlert(alert: CandorAlert): void {
        for (const handler of this.alertHandlers) {
            try {
                handler(alert);
            } catch (err) {
                this.emit("error", err);
            }
        }
    }

    private matchesFilter(event: CandorEvent, filter: EventFilter): boolean {
        if (filter.sessionId && event.sessionId !== filter.sessionId) return false;
        if (filter.method && event.method !== filter.method) return false;
        if (filter.toolName && event.toolName !== filter.toolName) return false;
        if (filter.direction && event.direction !== filter.direction) return false;
        if (filter.errorsOnly && !event.error) return false;
        if (filter.minCost && (event.costEstimate || 0) < filter.minCost) return false;
        if (filter.minLatency && (event.latencyMs || 0) < filter.minLatency) return false;
        // upstream filter requires metadata from the session — skip for now
        return true;
    }

    private attemptReconnect(): void {
        if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
            this.emit("error", new Error(`Max reconnect attempts (${this.config.maxReconnectAttempts}) reached`));
            return;
        }
        const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
        this.reconnectAttempts++;
        this.emit("reconnecting", { attempt: this.reconnectAttempts, delay });

        this.reconnectTimer = setTimeout(() => {
            this.connect().catch(() => {
                // Reconnect failed — will retry via onclose
            });
        }, delay);
    }
}
