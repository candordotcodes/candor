import { EventEmitter } from "node:events";
export class Interceptor extends EventEmitter {
    pendingRequests = new Map();
    parseMessage(raw, direction) {
        try {
            const parsed = JSON.parse(raw);
            if (parsed.jsonrpc !== "2.0")
                return null;
            const timestamp = new Date();
            const result = {
                raw,
                parsed,
                direction,
                timestamp,
            };
            if (direction === "request" && parsed.method && parsed.id !== undefined) {
                // Track outgoing request
                const toolName = this.extractToolName(parsed);
                this.pendingRequests.set(parsed.id, {
                    method: parsed.method,
                    toolName,
                    timestamp,
                });
                result.method = parsed.method;
                result.toolName = toolName;
            }
            else if (direction === "response" && parsed.id !== undefined) {
                // Match with pending request
                const pending = this.pendingRequests.get(parsed.id);
                if (pending) {
                    result.matchedRequestId = parsed.id;
                    result.method = pending.method;
                    result.toolName = pending.toolName;
                    result.latencyMs = timestamp.getTime() - pending.timestamp.getTime();
                    this.pendingRequests.delete(parsed.id);
                }
            }
            else if (direction === "request" && parsed.method) {
                // Notification (no id)
                result.method = parsed.method;
                result.toolName = this.extractToolName(parsed);
            }
            return result;
        }
        catch {
            return null;
        }
    }
    extractToolName(msg) {
        if (msg.method === "tools/call" && msg.params) {
            const params = msg.params;
            return params.name || undefined;
        }
        if (msg.method === "resources/read" && msg.params) {
            const params = msg.params;
            const uri = params.uri;
            return uri ? `resource:${uri}` : undefined;
        }
        return undefined;
    }
    getPendingCount() {
        return this.pendingRequests.size;
    }
    clearStale(maxAgeMs = 30000) {
        const now = Date.now();
        for (const [id, req] of this.pendingRequests) {
            if (now - req.timestamp.getTime() > maxAgeMs) {
                this.pendingRequests.delete(id);
            }
        }
    }
}
//# sourceMappingURL=interceptor.js.map
// perf: periodic stale cleanup interval
