import { createServer } from "node:http";
import type { CandorConfig } from "../config/loader.js";
import { MemoryStore } from "../storage/memory.js";
import { SessionManager } from "./session-manager.js";
import { Interceptor } from "./interceptor.js";

export class CandorProxy {
  private config: CandorConfig;
  private store = new MemoryStore();
  private sessions: SessionManager;
  private interceptor = new Interceptor();
  private http: ReturnType<typeof createServer> | null = null;

  constructor(config: CandorConfig) {
    this.config = config;
    this.sessions = new SessionManager(this.store);
  }
  async start() {
    return new Promise<void>((resolve) => {
      this.http = createServer((req, res) => {
        if (req.url === "/health") { res.writeHead(200); res.end(JSON.stringify({status:"ok"})); return; }
        res.writeHead(404); res.end();
      });
      this.http.listen(this.config.port, resolve);
    });
  }
  async stop() { this.http?.close(); }
}
