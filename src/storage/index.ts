export interface SessionData {
    id: string;
    userId?: string;
    agentId?: string;
    startedAt: Date;
    endedAt?: Date;
    metadata?: Record<string, unknown>;
    totalCostEstimate: number;
}
export interface EventData {
    id: string;
    sessionId: string;
    timestamp: Date;
    direction: "request" | "response";
    method?: string;
    toolName?: string;
    params?: Record<string, unknown>;
    result?: Record<string, unknown>;
    error?: Record<string, unknown>;
    latencyMs?: number;
    tokenEstimate?: number;
    costEstimate?: number;
}
export interface AlertRuleData {
    id: string;
    userId: string;
    name: string;
    condition: Record<string, unknown>;
    webhookUrl?: string;
    enabled: boolean;
}
export interface AlertData {
    id: string;
    ruleId: string;
    sessionId: string;
    eventId?: string;
    message: string;
    severity: "info" | "warning" | "critical";
}
export interface EventStore {
    createSession(data: Omit<SessionData, "totalCostEstimate">): Promise<SessionData>;
    endSession(id: string, totalCostEstimate: number): Promise<void>;
    createEvent(data: Omit<EventData, "id">): Promise<EventData>;
    getAlertRules(userId?: string): Promise<AlertRuleData[]>;
    createAlert(data: Omit<AlertData, "id">): Promise<AlertData>;
    getActiveSessions(): Promise<SessionData[]>;
    getSessionEventCount(sessionId: string): Promise<number>;
    updateSessionCost(sessionId: string, costDelta: number): Promise<void>;
    cleanupOldData(retentionDays: number): Promise<number>;
}
//# sourceMappingURL=index.d.ts.map
// feat: add data retention to storage
