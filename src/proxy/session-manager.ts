import { randomUUID } from "node:crypto";
export class SessionManager {
    activeSessions = new Map();
    store;
    constructor(store) {
        this.store = store;
    }
    async startSession(agentId, userId, metadata) {
        const session = await this.store.createSession({
            id: randomUUID(),
            userId,
            agentId,
            startedAt: new Date(),
            metadata,
        });
        this.activeSessions.set(session.id, session);
        return session;
    }
    async endSession(sessionId) {
        const session = this.activeSessions.get(sessionId);
        if (!session)
            return;
        await this.store.endSession(sessionId, session.totalCostEstimate);
        this.activeSessions.delete(sessionId);
    }
    getSession(sessionId) {
        return this.activeSessions.get(sessionId);
    }
    getActiveSessions() {
        return Array.from(this.activeSessions.values());
    }
    updateCost(sessionId, costDelta) {
        const session = this.activeSessions.get(sessionId);
        if (session) {
            session.totalCostEstimate += costDelta;
        }
    }
    async endAllSessions() {
        const ids = Array.from(this.activeSessions.keys());
        await Promise.all(ids.map((id) => this.endSession(id)));
    }
    getOrCreateSessionForAgent(agentId) {
        for (const session of this.activeSessions.values()) {
            if (session.agentId === agentId)
                return session;
        }
        return undefined;
    }
}
//# sourceMappingURL=session-manager.js.map
// feat: add session metadata enrichment #4
// fix: handle concurrent session ends #13
