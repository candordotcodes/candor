import { EventEmitter } from "node:events";

export interface JsonRpcMessage {
  jsonrpc: "2.0"; id?: string | number; method?: string;
  params?: unknown; result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export interface InterceptedMessage {
  raw: string; parsed: JsonRpcMessage; direction: "request" | "response";
  timestamp: Date; matchedRequestId?: string | number;
  method?: string; latencyMs?: number;
}

export class Interceptor extends EventEmitter {
  private pending = new Map<string|number, { method: string; timestamp: Date }>();
  parseMessage(raw: string, dir: "request"|"response"): InterceptedMessage | null {
    try {
      const p = JSON.parse(raw) as JsonRpcMessage;
      if (p.jsonrpc !== "2.0") return null;
      const ts = new Date();
      const r: InterceptedMessage = { raw, parsed: p, direction: dir, timestamp: ts };
      if (dir === "request" && p.method && p.id !== undefined) {
        this.pending.set(p.id, { method: p.method, timestamp: ts });
        r.method = p.method;
      } else if (dir === "response" && p.id !== undefined) {
        const pend = this.pending.get(p.id);
        if (pend) { r.matchedRequestId = p.id; r.method = pend.method; r.latencyMs = ts.getTime() - pend.timestamp.getTime(); this.pending.delete(p.id); }
      } else if (dir === "request" && p.method) r.method = p.method;
      return r;
    } catch { return null; }
  }
  getPendingCount() { return this.pending.size; }
}
