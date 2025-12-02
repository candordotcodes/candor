import { EventEmitter } from "node:events";

export interface JsonRpcMessage {
  jsonrpc: "2.0";
  id?: string | number;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export interface InterceptedMessage {
  raw: string;
  parsed: JsonRpcMessage;
  direction: "request" | "response";
  timestamp: Date;
}

export class Interceptor extends EventEmitter {
  parseMessage(raw: string, direction: "request" | "response"): InterceptedMessage | null {
    try {
      const parsed = JSON.parse(raw) as JsonRpcMessage;
      if (parsed.jsonrpc !== "2.0") return null;
      return { raw, parsed, direction, timestamp: new Date() };
    } catch { return null; }
  }
}
