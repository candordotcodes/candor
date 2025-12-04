import { randomUUID } from "node:crypto";
import type { EventStore, SessionData } from "../storage/index.js";

export class SessionManager {
  private active = new Map<string, SessionData>();
  private store: EventStore;
  constructor(store: EventStore) { this.store = store; }
  async startSession(agentId?: string): Promise<SessionData> {
    const s = await this.store.createSession({ id: randomUUID(), agentId, startedAt: new Date() });
    this.active.set(s.id, s);
    return s;
  }
  async endSession(id: string): Promise<void> {
    const s = this.active.get(id);
    if (!s) return;
    await this.store.endSession(id, s.totalCostEstimate);
    this.active.delete(id);
  }
  getSession(id: string) { return this.active.get(id); }
  getActiveSessions() { return Array.from(this.active.values()); }
}
