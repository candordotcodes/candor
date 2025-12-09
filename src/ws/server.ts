import { WebSocketServer, WebSocket } from "ws";

interface Client { ws: WebSocket; subscriptions: Set<string>; alive: boolean; }

export class WSServer {
  private wss: WebSocketServer | null = null;
  private clients = new Set<Client>();
  private hb: ReturnType<typeof setInterval> | null = null;
  start(port: number) {
    this.wss = new WebSocketServer({ port });
    this.wss.on("connection", (ws) => {
      const c: Client = { ws, subscriptions: new Set(), alive: true };
      this.clients.add(c);
      ws.on("pong", () => { c.alive = true; });
      ws.on("close", () => this.clients.delete(c));
    });
    this.hb = setInterval(() => {
      for (const c of this.clients) {
        if (!c.alive) { c.ws.terminate(); this.clients.delete(c); continue; }
        c.alive = false; c.ws.ping();
      }
    }, 30000);
  }
  broadcast(msg: { type: string; payload?: unknown }) {
    const d = JSON.stringify(msg);
    for (const c of this.clients) if (c.ws.readyState === WebSocket.OPEN) c.ws.send(d);
  }
  getClientCount() { return this.clients.size; }
  stop() { if (this.hb) clearInterval(this.hb); for (const c of this.clients) c.ws.close(); this.clients.clear(); this.wss?.close(); }
}
