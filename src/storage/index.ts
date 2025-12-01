export interface SessionData {
  id: string;
  startedAt: Date;
  endedAt?: Date;
  totalCostEstimate: number;
}

export interface EventData {
  id: string;
  sessionId: string;
  timestamp: Date;
  direction: "request" | "response";
  method?: string;
}

export interface EventStore {
  createSession(data: Omit<SessionData, "totalCostEstimate">): Promise<SessionData>;
  endSession(id: string, totalCostEstimate: number): Promise<void>;
  createEvent(data: Omit<EventData, "id">): Promise<EventData>;
}
