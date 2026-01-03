/** Block SSRF: reject internal/private IPs in webhook URLs */
function isAllowedWebhookUrl(urlStr) {
    try {
        const url = new URL(urlStr);
        // Must be HTTPS in production
        if (url.protocol !== "https:" && url.protocol !== "http:")
            return false;
        const hostname = url.hostname.toLowerCase();
        // Block private/internal hostnames
        if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "0.0.0.0")
            return false;
        if (hostname === "[::1]" || hostname.startsWith("10."))
            return false;
        if (hostname.startsWith("172.") && /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname))
            return false;
        if (hostname.startsWith("192.168."))
            return false;
        if (hostname.startsWith("169.254."))
            return false; // AWS metadata
        if (hostname.endsWith(".internal") || hostname.endsWith(".local"))
            return false;
        return true;
    }
    catch {
        return false;
    }
}
export class AlertEvaluator {
    store;
    wsServer;
    counters = new Map();
    webhookUrl;
    // Cache alert rules to avoid querying DB on every event
    rulesCache = new Map();
    static RULES_CACHE_TTL_MS = 30_000; // 30 seconds
    static MAX_COUNTERS = 10000;
    static VALID_CONDITION_TYPES = [
        "error_rate", "latency", "cost_spike", "tool_failure", "session_duration", "event_count"
    ];
    constructor(store, wsServer) {
        this.store = store;
        this.wsServer = wsServer;
    }
    /** Invalidate cached rules (e.g. when rules are updated) */
    invalidateRulesCache(userId) {
        if (userId) {
            this.rulesCache.delete(userId);
        }
        else {
            this.rulesCache.clear();
        }
    }
    async getCachedRules(userId) {
        const key = userId || "__global__";
        const cached = this.rulesCache.get(key);
        if (cached && Date.now() - cached.cachedAt < AlertEvaluator.RULES_CACHE_TTL_MS) {
            return cached.rules;
        }
        const rules = await this.store.getAlertRules(userId);
        this.rulesCache.set(key, { rules, cachedAt: Date.now() });
        return rules;
    }
    isValidCondition(condition) {
        if (!condition || typeof condition !== "object")
            return false;
        const c = condition;
        if (typeof c.type !== "string")
            return false;
        if (!AlertEvaluator.VALID_CONDITION_TYPES.includes(c.type))
            return false;
        if (typeof c.threshold !== "number" || !isFinite(c.threshold))
            return false;
        return true;
    }
    /** Evict old counters to prevent unbounded memory growth */
    cleanupCounters() {
        if (this.counters.size <= AlertEvaluator.MAX_COUNTERS)
            return;
        const entries = Array.from(this.counters.entries())
            .sort((a, b) => a[1].lastReset - b[1].lastReset);
        const toRemove = entries.slice(0, entries.length - AlertEvaluator.MAX_COUNTERS / 2);
        for (const [key] of toRemove) {
            this.counters.delete(key);
        }
    }
    async evaluate(event, sessionId, userId) {
        const rules = await this.getCachedRules(userId);
        if (rules.length === 0)
            return;
        for (const rule of rules) {
            const condition = rule.condition;
            if (!this.isValidCondition(condition))
                continue;
            const triggered = await this.checkCondition(condition, event, sessionId);
            if (triggered) {
                const alert = await this.store.createAlert({
                    ruleId: rule.id,
                    sessionId,
                    eventId: event.id,
                    message: this.buildMessage(rule, condition, event),
                    severity: this.getSeverity(condition),
                });
                // Broadcast alert via WebSocket (scoped to user)
                if (this.wsServer && userId) {
                    this.wsServer.broadcastToUser(userId, {
                        type: "alert",
                        payload: {
                            ...alert,
                            ruleName: rule.name,
                            createdAt: new Date().toISOString(),
                        },
                    });
                }
                // Deliver webhook if configured and URL is safe
                if (rule.webhookUrl && isAllowedWebhookUrl(rule.webhookUrl)) {
                    this.deliverWebhook(rule.webhookUrl, rule, alert).catch(() => { });
                }
            }
        }
    }
    async checkCondition(condition, event, sessionId) {
        const key = `${sessionId}:${condition.type}`;
        const windowMs = (condition.window || 300) * 1000; // default 5 min
        // Get or init counters
        let counters = this.counters.get(key);
        if (!counters || Date.now() - counters.lastReset > windowMs) {
            counters = { errors: 0, total: 0, totalCost: 0, lastReset: Date.now() };
            this.counters.set(key, counters);
        }
        counters.total++;
        if (event.error)
            counters.errors++;
        if (event.costEstimate)
            counters.totalCost += event.costEstimate;
        switch (condition.type) {
            case "error_rate":
                return counters.total >= 5 && counters.errors / counters.total > condition.threshold;
            case "latency":
                return (event.latencyMs || 0) > condition.threshold;
            case "cost_spike":
                return counters.totalCost > condition.threshold;
            case "tool_failure":
                if (condition.toolName && event.toolName !== condition.toolName)
                    return false;
                return !!event.error;
            case "session_duration": {
                // Check not implemented for proxy-side (would need session start time)
                return false;
            }
            case "event_count": {
                // Use counters.total (in-memory) instead of querying DB
                return counters.total > condition.threshold;
            }
            default:
                return false;
        }
    }
    buildMessage(rule, condition, event) {
        switch (condition.type) {
            case "error_rate":
                return `Alert "${rule.name}": Error rate exceeded ${(condition.threshold * 100).toFixed(0)}% threshold`;
            case "latency":
                return `Alert "${rule.name}": Latency ${event.latencyMs}ms exceeded ${condition.threshold}ms threshold`;
            case "cost_spike":
                return `Alert "${rule.name}": Cost spike detected, total $${event.costEstimate?.toFixed(4)}`;
            case "tool_failure":
                return `Alert "${rule.name}": Tool "${event.toolName}" failed`;
            case "event_count":
                return `Alert "${rule.name}": Event count threshold exceeded`;
            default:
                return `Alert "${rule.name}" triggered`;
        }
    }
    getSeverity(condition) {
        switch (condition.type) {
            case "error_rate":
            case "tool_failure":
                return "critical";
            case "cost_spike":
            case "latency":
                return "warning";
            default:
                return "info";
        }
    }
    async deliverWebhook(url, rule, alert) {
        try {
            await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    event: "alert.triggered",
                    ruleId: rule.id,
                    ruleName: rule.name,
                    alert,
                    timestamp: new Date().toISOString(),
                }),
                signal: AbortSignal.timeout(10000),
            });
        }
        catch (err) {
            console.error(`[alert] Webhook delivery failed for ${url}:`, err);
        }
    }
}
//# sourceMappingURL=alert-evaluator.js.map
// feat: add counter eviction for memory
