import { PrismaClient } from "@prisma/client";
export class PostgresStore {
    prisma;
    constructor(databaseUrl) {
        this.prisma = new PrismaClient({
            datasources: databaseUrl ? { db: { url: databaseUrl } } : undefined,
            log: ["error"],
        });
    }
    async createSession(data) {
        const session = await this.prisma.session.create({
            data: {
                id: data.id,
                userId: data.userId,
                agentId: data.agentId,
                startedAt: data.startedAt,
                metadata: data.metadata ?? undefined,
            },
        });
        return {
            id: session.id,
            userId: session.userId ?? undefined,
            agentId: session.agentId ?? undefined,
            startedAt: session.startedAt,
            endedAt: session.endedAt ?? undefined,
            metadata: session.metadata,
            totalCostEstimate: session.totalCostEstimate,
        };
    }
    async endSession(id, totalCostEstimate) {
        await this.prisma.session.update({
            where: { id },
            data: { endedAt: new Date(), totalCostEstimate },
        });
    }
    async createEvent(data) {
        const event = await this.prisma.event.create({
            data: {
                sessionId: data.sessionId,
                timestamp: data.timestamp,
                direction: data.direction,
                method: data.method,
                toolName: data.toolName,
                params: data.params ?? undefined,
                result: data.result ?? undefined,
                error: data.error ?? undefined,
                latencyMs: data.latencyMs,
                tokenEstimate: data.tokenEstimate,
                costEstimate: data.costEstimate,
            },
        });
        return {
            id: event.id,
            sessionId: event.sessionId,
            timestamp: event.timestamp,
            direction: event.direction,
            method: event.method ?? undefined,
            toolName: event.toolName ?? undefined,
            params: event.params,
            result: event.result,
            error: event.error,
            latencyMs: event.latencyMs ?? undefined,
            tokenEstimate: event.tokenEstimate ?? undefined,
            costEstimate: event.costEstimate ?? undefined,
        };
    }
    async getAlertRules(userId) {
        const where = userId
            ? { userId, enabled: true }
            : { enabled: true };
        const rules = await this.prisma.alertRule.findMany({ where });
        return rules.map((r) => ({
            id: r.id,
            userId: r.userId,
            name: r.name,
            condition: r.condition,
            webhookUrl: r.webhookUrl ?? undefined,
            enabled: r.enabled,
        }));
    }
    async createAlert(data) {
        const alert = await this.prisma.alert.create({
            data: {
                ruleId: data.ruleId,
                sessionId: data.sessionId,
                eventId: data.eventId,
                message: data.message,
                severity: data.severity,
            },
        });
        return {
            id: alert.id,
            ruleId: alert.ruleId,
            sessionId: alert.sessionId,
            eventId: alert.eventId ?? undefined,
            message: alert.message,
            severity: alert.severity,
        };
    }
    async getActiveSessions() {
        const sessions = await this.prisma.session.findMany({
            where: { endedAt: null },
        });
        return sessions.map((s) => ({
            id: s.id,
            userId: s.userId ?? undefined,
            agentId: s.agentId ?? undefined,
            startedAt: s.startedAt,
            endedAt: s.endedAt ?? undefined,
            metadata: s.metadata,
            totalCostEstimate: s.totalCostEstimate,
        }));
    }
    async getSessionEventCount(sessionId) {
        return this.prisma.event.count({ where: { sessionId } });
    }
    async updateSessionCost(sessionId, costDelta) {
        await this.prisma.session.update({
            where: { id: sessionId },
            data: { totalCostEstimate: { increment: costDelta } },
        });
    }
    async cleanupOldData(retentionDays) {
        const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
        const events = await this.prisma.event.deleteMany({
            where: { timestamp: { lt: cutoff } },
        });
        const alerts = await this.prisma.alert.deleteMany({
            where: { createdAt: { lt: cutoff } },
        });
        const sessions = await this.prisma.session.deleteMany({
            where: { endedAt: { not: null, lt: cutoff } },
        });
        const nonces = await this.prisma.authNonce.deleteMany({
            where: { OR: [{ expiresAt: { lt: new Date() } }, { used: true }] },
        });
        return events.count + alerts.count + sessions.count + nonces.count;
    }
}
//# sourceMappingURL=postgres.js.map