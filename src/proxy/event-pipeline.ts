const MAX_QUEUE_SIZE = 10000;
const DEFAULT_COST_RATES = {
    inputPer1kTokens: 0.003,
    outputPer1kTokens: 0.015,
};
export class EventPipeline {
    store;
    alertEvaluator;
    wsServer;
    config;
    costRates = DEFAULT_COST_RATES;
    queue = [];
    processing = false;
    // In-memory event count cache to avoid per-event DB queries
    sessionEventCounts = new Map();
    constructor(store, alertEvaluator, wsServer, config) {
        this.store = store;
        this.alertEvaluator = alertEvaluator;
        this.wsServer = wsServer;
        this.config = config;
    }
    /** Update cost rates (e.g. from user's CostRate configuration) */
    setCostRates(rates) {
        this.costRates = rates;
    }
    /** Reset event count cache for a session (e.g. when session ends) */
    clearSessionCount(sessionId) {
        this.sessionEventCounts.delete(sessionId);
    }
    async process(message, sessionId, userId) {
        // Prevent unbounded queue growth
        if (this.queue.length >= MAX_QUEUE_SIZE) {
            if (this.config.verbose) {
                console.warn("[pipeline] Queue full, dropping event");
            }
            return;
        }
        this.queue.push({ message, sessionId, userId });
        if (!this.processing) {
            this.processing = true;
            while (this.queue.length > 0) {
                const item = this.queue.shift();
                try {
                    await this.processItem(item.message, item.sessionId, item.userId);
                }
                catch (err) {
                    if (this.config.verbose) {
                        console.error("[pipeline] Error processing event:", err);
                    }
                }
            }
            this.processing = false;
        }
    }
    async processItem(message, sessionId, userId) {
        // Check event limit using in-memory cache
        const currentCount = this.sessionEventCounts.get(sessionId) || 0;
        if (currentCount >= this.config.maxEventsPerSession) {
            if (this.config.verbose) {
                console.warn(`[pipeline] Session ${sessionId} reached max events (${this.config.maxEventsPerSession})`);
            }
            return;
        }
        // Enrich: estimate tokens and cost
        const tokenEstimate = this.estimateTokens(message);
        const costEstimate = this.estimateCost(tokenEstimate, message.direction);
        // Store
        const event = await this.store.createEvent({
            sessionId,
            timestamp: message.timestamp,
            direction: message.direction,
            method: message.method,
            toolName: message.toolName,
            params: message.parsed.params,
            result: message.parsed.result,
            error: message.parsed.error,
            latencyMs: message.latencyMs,
            tokenEstimate,
            costEstimate,
        });
        // Update in-memory count
        this.sessionEventCounts.set(sessionId, currentCount + 1);
        // Update session cost
        if (costEstimate > 0) {
            await this.store.updateSessionCost(sessionId, costEstimate);
        }
        // Stream to WebSocket clients (scoped to user if known)
        if (this.wsServer && userId) {
            this.wsServer.broadcastToUser(userId, {
                type: "event",
                payload: event,
            });
        }
        // Evaluate alert rules
        await this.alertEvaluator.evaluate(event, sessionId, userId);
        if (this.config.verbose) {
            const dir = message.direction === "request" ? "->" : "<-";
            const tool = message.toolName || message.method || "unknown";
            const latency = message.latencyMs ? ` (${message.latencyMs}ms)` : "";
            console.log(`  ${dir} ${tool}${latency}`);
        }
    }
    estimateTokens(message) {
        const text = message.raw || "";
        return Math.ceil(text.length / 4);
    }
    estimateCost(tokens, direction) {
        const rate = direction === "request"
            ? this.costRates.inputPer1kTokens
            : this.costRates.outputPer1kTokens;
        return (tokens / 1000) * rate;
    }
}
//# sourceMappingURL=event-pipeline.js.map
// fix: missing toolName in verbose log
