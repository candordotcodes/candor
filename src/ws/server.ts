import { WebSocketServer, WebSocket } from "ws";
export class WSServer {
    wss = null;
    clients = new Set();
    heartbeatInterval = null;
    apiKey;
    /** Start standalone on a port (for development with separate ports) */
    start(port, apiKey) {
        this.apiKey = apiKey;
        this.wss = new WebSocketServer({ port });
        this.setupListeners();
    }
    /** Attach to an existing HTTP server (for Railway single-port deployment) */
    attachToServer(server, apiKey) {
        this.apiKey = apiKey;
        this.wss = new WebSocketServer({ server, path: "/ws" });
        this.setupListeners();
    }
    setupListeners() {
        if (!this.wss)
            return;
        this.wss.on("connection", (ws, req) => {
            const authenticated = this.authenticateConnection(req);
            const client = {
                ws,
                subscriptions: new Set(),
                alive: true,
                authenticated,
            };
            if (!authenticated) {
                ws.send(JSON.stringify({ type: "error", payload: { message: "Authentication required" } }));
                ws.close(4001, "Authentication required");
                return;
            }
            this.clients.add(client);
            ws.on("message", (data) => {
                try {
                    const msg = JSON.parse(data.toString());
                    this.handleMessage(client, msg);
                }
                catch {
                    // Ignore invalid messages
                }
            });
            ws.on("pong", () => {
                client.alive = true;
            });
            ws.on("close", () => {
                this.clients.delete(client);
            });
            ws.on("error", () => {
                this.clients.delete(client);
            });
        });
        // Heartbeat every 30s
        this.heartbeatInterval = setInterval(() => {
            for (const client of this.clients) {
                if (!client.alive) {
                    client.ws.terminate();
                    this.clients.delete(client);
                    continue;
                }
                client.alive = false;
                client.ws.ping();
            }
        }, 30000);
    }
    authenticateConnection(req) {
        if (!this.apiKey)
            return true;
        const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
        const queryToken = url.searchParams.get("token");
        if (queryToken === this.apiKey)
            return true;
        const authHeader = req.headers.authorization;
        if (authHeader?.startsWith("Bearer ") && authHeader.slice(7) === this.apiKey)
            return true;
        return false;
    }
    handleMessage(client, msg) {
        switch (msg.type) {
            case "subscribe": {
                const payload = msg.payload;
                if (payload?.userId) {
                    // Once a userId is set, it cannot be changed (prevents subscription hijacking)
                    if (client.userId && client.userId !== payload.userId) {
                        client.ws.send(JSON.stringify({
                            type: "error",
                            payload: { message: "Cannot change userId after initial subscription" },
                        }));
                        break;
                    }
                    client.userId = payload.userId;
                }
                if (payload?.sessionIds) {
                    for (const id of payload.sessionIds) {
                        client.subscriptions.add(id);
                    }
                }
                client.ws.send(JSON.stringify({ type: "subscribed", payload: { userId: client.userId } }));
                break;
            }
            case "unsubscribe": {
                const payload = msg.payload;
                if (payload?.sessionIds) {
                    for (const id of payload.sessionIds) {
                        client.subscriptions.delete(id);
                    }
                }
                break;
            }
            case "ping":
                client.ws.send(JSON.stringify({ type: "pong" }));
                break;
        }
    }
    broadcastToUser(userId, msg) {
        const data = JSON.stringify(msg);
        for (const client of this.clients) {
            if (client.authenticated && client.userId === userId && client.ws.readyState === WebSocket.OPEN) {
                client.ws.send(data);
            }
        }
    }
    broadcast(msg) {
        const data = JSON.stringify(msg);
        for (const client of this.clients) {
            if (client.authenticated && client.ws.readyState === WebSocket.OPEN) {
                client.ws.send(data);
            }
        }
    }
    getClientCount() {
        return this.clients.size;
    }
    stop() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
        for (const client of this.clients) {
            client.ws.close();
        }
        this.clients.clear();
        this.wss?.close();
    }
}
//# sourceMappingURL=server.js.map
// feat: add unsubscribe to ws server
