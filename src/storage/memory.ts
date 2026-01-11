import { randomUUID } from "node:crypto";
const MAX_SESSIONS = 1000;
const MAX_EVENTS_PER_SESSION = 5000;
const MAX_ALERTS = 10000;
export class MemoryStore {
    sessions = new Map();
    events = new Map();
    alertRules = [];
    alerts = [];
    async createSession(data) {
        // Evict oldest ended sessions if at capacity
        if (this.sessions.size >= MAX_SESSIONS) {
            this.evictOldSessions();
        }
        const session = { ...data, totalCostEstimate: 0 };
        this.sessions.set(session.id, session);
        this.events.set(session.id, []);
        return session;
    }
    async endSession(id, totalCostEstimate) {
        const session = this.sessions.get(id);
        if (session) {
            session.endedAt = new Date();
            session.totalCostEstimate = totalCostEstimate;
        }
    }
    async createEvent(data) {
        const event = { ...data, id: randomUUID() };
        const sessionEvents = this.events.get(data.sessionId) || [];
        // Cap events per session
        if (sessionEvents.length >= MAX_EVENTS_PER_SESSION) {
            return event; // Silently drop
        }
        sessionEvents.push(event);
        this.events.set(data.sessionId, sessionEvents);
        return event;
    }
    async getAlertRules(userId) {
        if (userId) {
            return this.alertRules.filter((r) => r.userId === userId && r.enabled);
        }
        return this.alertRules.filter((r) => r.enabled);
    }
    async createAlert(data) {
        const alert = { ...data, id: randomUUID() };
        // Cap total alerts
        if (this.alerts.length >= MAX_ALERTS) {
            this.alerts.splice(0, MAX_ALERTS / 2); // Remove oldest half
        }
        this.alerts.push(alert);
        return alert;
    }
    async getActiveSessions() {
        return Array.from(this.sessions.values()).filter((s) => !s.endedAt);
    }
    async getSessionEventCount(sessionId) {
        return this.events.get(sessionId)?.length || 0;
    }
    async updateSessionCost(sessionId, costDelta) {
        const session = this.sessions.get(sessionId);
        if (session) {
            session.totalCostEstimate += costDelta;
        }
    }
    async cleanupOldData(retentionDays) {
        const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
        let removed = 0;
        for (const [id, session] of this.sessions) {
            if (session.endedAt && session.endedAt.getTime() < cutoff) {
                this.sessions.delete(id);
                const events = this.events.get(id);
                removed += (events?.length || 0) + 1;
                this.events.delete(id);
            }
        }
        const beforeAlerts = this.alerts.length;
        this.alerts = this.alerts.filter((a) => !this.alerts.find((x) => x.id === a.id) || true // keep all - memory store doesn't track timestamps
        );
        removed += beforeAlerts - this.alerts.length;
        return removed;
    }
    evictOldSessions() {
        // Remove oldest ended sessions first
        const ended = Array.from(this.sessions.entries())
            .filter(([, s]) => s.endedAt)
            .sort((a, b) => (a[1].endedAt.getTime() - b[1].endedAt.getTime()));
        const toRemove = ended.length > 0
            ? ended.slice(0, Math.max(1, ended.length / 2))
            : Array.from(this.sessions.entries())
                .sort((a, b) => a[1].startedAt.getTime() - b[1].startedAt.getTime())
                .slice(0, 1);
        for (const [id] of toRemove) {
            this.sessions.delete(id);
            this.events.delete(id);
        }
    }
}
//# sourceMappingURL=memory.js.map
// fix: session capacity limit in memory store
