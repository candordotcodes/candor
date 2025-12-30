import { createServer } from "node:http";
import { MemoryStore } from "../storage/memory.js";
import { PostgresStore } from "../storage/postgres.js";
import { SessionManager } from "./session-manager.js";
import { EventPipeline } from "./event-pipeline.js";
import { AlertEvaluator } from "./alert-evaluator.js";
import { Interceptor } from "./interceptor.js";
import { StdioTransport } from "./transports/stdio.js";
import { SSETransport } from "./transports/sse.js";
import { WSServer } from "../ws/server.js";
const MAX_BODY_SIZE = 10 * 1024 * 1024; // 10 MB max request body
export class CandorProxy {
    config;
    store;
    sessionManager;
    pipeline;
    alertEvaluator;
    wsServer;
    httpServer = null;
    upstreams = [];
    interceptor;
    constructor(config) {
        this.config = config;
        // Initialize storage
        if (config.storage === "postgres" && config.databaseUrl) {
            this.store = new PostgresStore(config.databaseUrl);
        }
        else {
            this.store = new MemoryStore();
        }
        // Initialize components
        this.wsServer = new WSServer();
        this.sessionManager = new SessionManager(this.store);
        this.alertEvaluator = new AlertEvaluator(this.store, this.wsServer);
        this.pipeline = new EventPipeline(this.store, this.alertEvaluator, this.wsServer, {
            maxEventsPerSession: config.maxEventsPerSession,
            verbose: config.verbose,
        });
        this.interceptor = new Interceptor();
    }
    async start() {
        // Start HTTP proxy server first
        await this.startHttpServer();
        // If ports are the same (Railway single-port mode), attach WS to HTTP server
        if (this.config.port === this.config.wsPort && this.httpServer) {
            this.wsServer.attachToServer(this.httpServer, this.config.apiKey);
        }
        else {
            this.wsServer.start(this.config.wsPort, this.config.apiKey);
        }
        // Connect to upstreams
        for (const upstreamConfig of this.config.upstreams) {
            await this.connectUpstream(upstreamConfig);
        }
        // Periodic cleanup intervals
        setInterval(() => {
            this.interceptor.clearStale();
            this.alertEvaluator.cleanupCounters();
        }, 10000);
        // Data retention cleanup on startup and every 24h
        const retentionDays = this.config.logRetentionDays;
        this.store
            .cleanupOldData(retentionDays)
            .then((count) => {
            if (count > 0 && this.config.verbose) {
                console.log(`[retention] Cleaned up ${count} old records`);
            }
        })
            .catch((err) => console.error("[retention] Cleanup failed:", err));
        setInterval(() => {
            this.store
                .cleanupOldData(retentionDays)
                .catch((err) => console.error("[retention] Cleanup failed:", err));
        }, 24 * 60 * 60 * 1000);
    }
    startHttpServer() {
        return new Promise((resolve) => {
            this.httpServer = createServer(async (req, res) => {
                await this.handleRequest(req, res);
            });
            this.httpServer.listen(this.config.port, () => {
                resolve();
            });
        });
    }
    /** Validate API key from request header */
    authenticateRequest(req) {
        // If no API key is configured, allow all (dev mode)
        if (!this.config.apiKey)
            return true;
        const authHeader = req.headers.authorization;
        if (authHeader?.startsWith("Bearer ") && authHeader.slice(7) === this.config.apiKey) {
            return true;
        }
        const apiKeyHeader = req.headers["x-api-key"];
        if (apiKeyHeader === this.config.apiKey) {
            return true;
        }
        return false;
    }
    async handleRequest(req, res) {
        // CORS headers
        res.setHeader("Access-Control-Allow-Origin", this.config.dashboardUrl || "*");
        res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Api-Key, X-Agent-Id, X-User-Id");
        if (req.method === "OPTIONS") {
            res.writeHead(204);
            res.end();
            return;
        }
        // Health check (no auth required)
        if (req.url === "/health") {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({
                status: "ok",
                upstreams: this.upstreams.length,
                activeSessions: this.sessionManager.getActiveSessions().length,
                wsClients: this.wsServer.getClientCount(),
            }));
            return;
        }
        // All other endpoints require authentication
        if (!this.authenticateRequest(req)) {
            res.writeHead(401, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Authentication required" }));
            return;
        }
        // MCP JSON-RPC passthrough
        if (req.method === "POST") {
            let body = "";
            let bodySize = 0;
            req.on("data", (chunk) => {
                bodySize += chunk.length;
                if (bodySize > MAX_BODY_SIZE) {
                    res.writeHead(413, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({ error: "Request body too large" }));
                    req.destroy();
                    return;
                }
                body += chunk;
            });
            req.on("end", async () => {
                if (bodySize > MAX_BODY_SIZE)
                    return; // Already responded with 413
                try {
                    const message = this.interceptor.parseMessage(body, "request");
                    const userId = req.headers["x-user-id"];
                    // Forward to all upstreams
                    for (const upstream of this.upstreams) {
                        if (message) {
                            // Ensure session exists
                            if (!upstream.sessionId) {
                                const agentId = req.headers["x-agent-id"];
                                const session = await this.sessionManager.startSession(agentId, userId);
                                upstream.sessionId = session.id;
                                upstream.userId = userId;
                                // Only broadcast to the session owner
                                if (userId) {
                                    this.wsServer.broadcastToUser(userId, {
                                        type: "session:start",
                                        payload: {
                                            id: session.id,
                                            agentId: session.agentId,
                                            startedAt: session.startedAt.toISOString(),
                                        },
                                    });
                                }
                            }
                            // Process through pipeline
                            await this.pipeline.process(message, upstream.sessionId, upstream.userId);
                        }
                        // Forward raw message
                        if (upstream.transport instanceof StdioTransport) {
                            upstream.transport.sendRaw(body);
                        }
                        else {
                            await upstream.transport.send(body);
                        }
                    }
                    res.writeHead(200, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({ status: "forwarded" }));
                }
                catch {
                    res.writeHead(500, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({ error: "Internal error" }));
                }
            });
            return;
        }
        res.writeHead(404);
        res.end();
    }
    async connectUpstream(config) {
        const connection = {
            config,
            transport: null,
            sessionId: null,
        };
        if (config.transport === "stdio") {
            const transport = new StdioTransport({
                command: config.command,
                args: config.args,
                env: config.env,
            });
            transport.on("message", async (message) => {
                if (connection.sessionId) {
                    await this.pipeline.process(message, connection.sessionId, connection.userId);
                }
            });
            transport.on("exit", async (code) => {
                if (this.config.verbose) {
                    console.log(`[upstream] ${config.name} exited with code ${code}`);
                }
                if (connection.sessionId) {
                    const session = this.sessionManager.getSession(connection.sessionId);
                    await this.sessionManager.endSession(connection.sessionId);
                    if (connection.userId) {
                        this.wsServer.broadcastToUser(connection.userId, {
                            type: "session:end",
                            payload: {
                                id: connection.sessionId,
                                endedAt: new Date().toISOString(),
                                totalCostEstimate: session?.totalCostEstimate || 0,
                            },
                        });
                    }
                    connection.sessionId = null;
                }
            });
            transport.on("stderr", (data) => {
                if (this.config.verbose) {
                    console.error(`[upstream:${config.name}:stderr]`, data);
                }
            });
            // Start transport and create session
            transport.start();
            const session = await this.sessionManager.startSession(config.name);
            connection.sessionId = session.id;
            connection.transport = transport;
            // No userId for pre-configured upstreams, so no user-scoped broadcast needed
        }
        else if (config.transport === "sse" && config.url) {
            const transport = new SSETransport({ url: config.url });
            transport.on("message", async (message) => {
                if (connection.sessionId) {
                    await this.pipeline.process(message, connection.sessionId, connection.userId);
                }
            });
            transport.on("connected", async () => {
                const session = await this.sessionManager.startSession(config.name);
                connection.sessionId = session.id;
                // No userId for pre-configured upstreams
            });
            await transport.start();
            connection.transport = transport;
        }
        this.upstreams.push(connection);
    }
    async stop() {
        // End all sessions
        await this.sessionManager.endAllSessions();
        // Stop all transports
        for (const upstream of this.upstreams) {
            upstream.transport.stop();
        }
        // Stop servers
        this.wsServer.stop();
        this.httpServer?.close();
    }
    getStatus() {
        return {
            port: this.config.port,
            wsPort: this.config.wsPort,
            storage: this.config.storage,
            upstreams: this.upstreams.map((u) => ({
                name: u.config.name,
                transport: u.config.transport,
                sessionId: u.sessionId,
                running: u.transport instanceof StdioTransport
                    ? u.transport.isRunning()
                    : u.transport.isConnected(),
            })),
            activeSessions: this.sessionManager.getActiveSessions().length,
            wsClients: this.wsServer.getClientCount(),
        };
    }
}
//# sourceMappingURL=index.js.map
// refactor: move transport handlers to connectUpstream
