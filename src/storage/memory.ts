import { randomUUID } from "node:crypto";
import type { EventStore, SessionData, EventData } from "./index.js";

export class MemoryStore implements EventStore {
  private sessions = new Map<string, SessionData>();
  private events = new Map<string, EventData[]>();

  async createSession(data: Omit<SessionData, "totalCostEstimate">): Promise<SessionData> {
    const s: SessionData = { ...data, totalCostEstimate: 0 };
    this.sessions.set(s.id, s);
    this.events.set(s.id, []);
    return s;
  }
  async endSession(id: string, cost: number): Promise<void> {
    const s = this.sessions.get(id);
    if (s) { s.endedAt = new Date(); s.totalCostEstimate = cost; }
  }
  async createEvent(data: Omit<EventData, "id">): Promise<EventData> {
    const e: EventData = { ...data, id: randomUUID() };
    (this.events.get(data.sessionId) || []).push(e);
    return e;
  }
}
