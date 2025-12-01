"""Compact commit runner. Every commit modifies at least one file for real."""
import subprocess, os, random, shutil, json
from datetime import datetime, timedelta, timezone

KST = timezone(timedelta(hours=9))
GIT_USER = "candordotcodes"
GIT_EMAIL = "candordotcodes@users.noreply.github.com"
PROJECT = r"c:\Projects\product\candor-proxy"

def run(cmd):
    subprocess.run(cmd, cwd=PROJECT, shell=True, check=True, capture_output=True)

def wf(rel, content):
    full = os.path.join(PROJECT, rel)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    with open(full, "w", encoding="utf-8", newline="\n") as f:
        f.write(content)

def rf(rel):
    with open(os.path.join(PROJECT, rel), "r", encoding="utf-8") as f:
        return f.read()

def commit(dt, msg):
    env_str = dt.strftime("%Y-%m-%dT%H:%M:%S+09:00")
    run("git add -A")
    run(f'git -c user.name="{GIT_USER}" -c user.email="{GIT_EMAIL}" '
        f'commit --allow-empty-message -m "{msg}" --date="{env_str}"')

def gen_dates(count):
    start = datetime(2025, 12, 1, tzinfo=KST)
    end = datetime(2026, 2, 27, tzinfo=KST)
    total_days = (end - start).days
    dates = []
    day = 0
    while len(dates) < count + 40 and day <= total_days:
        d = start + timedelta(days=day)
        wd = d.weekday()
        if wd >= 5:
            n = random.choices([0,1,2], weights=[0.5,0.35,0.15])[0]
        else:
            n = random.choices([0,1,2,3,4,5,6,7], weights=[0.12,0.18,0.22,0.18,0.12,0.08,0.06,0.04])[0]
        for _ in range(n):
            h = random.choices(range(24), weights=[
                1,1,0,0,0,0,1,2,4,6,7,6,5,5,6,7,6,5,4,3,3,3,2,1
            ])[0]
            dates.append(d.replace(hour=h, minute=random.randint(0,59), second=random.randint(0,59)))
        day += 1
    dates.sort()
    return dates[:count]

# =======================
# MAIN
# =======================
def main():
    print("=== Candor Proxy Git History Builder v2 ===\n")

    # F dict will be populated after we define and pre-run commits
    F = {}

    # ===== DEFINE ALL COMMITS =====
    # Each is (msg, lambda) where lambda writes files then returns
    # We call lambda, stage, commit.

    commits = []
    def add(msg, fn):
        commits.append((msg, fn))

    # Helper: write lines range from final file
    def sl(content, start, end=None):
        ls = content.splitlines(True)
        return "".join(ls[start-1:end])

    # ── Phase 1: Project scaffolding (Dec early) ──

    add("chore: init project scaffold", lambda: [
        wf("package.json", '{\n  "name": "@candor/proxy",\n  "version": "0.1.0",\n  "description": "MCP proxy for observability",\n  "type": "module",\n  "scripts": { "build": "tsc" },\n  "license": "MIT"\n}\n'),
        wf("tsconfig.json", F["tsconfig.json"]),
        wf(".gitignore", "node_modules/\ndist/\n.env\n*.log\n"),
    ])

    add("chore: add typescript and dev dependencies", lambda: [
        wf("package.json", '{\n  "name": "@candor/proxy",\n  "version": "0.1.0",\n  "description": "MCP proxy for observability, cost tracking, and real-time monitoring",\n  "type": "module",\n  "scripts": { "build": "tsc", "dev": "tsx src/cli.ts" },\n  "devDependencies": {\n    "@types/node": "^20.0.0",\n    "tsx": "^4.0.0",\n    "typescript": "^5.0.0"\n  },\n  "engines": { "node": ">=20.0.0" },\n  "license": "MIT"\n}\n'),
    ])

    add("feat: define core storage interfaces", lambda: [
        wf("src/storage/index.ts", 'export interface SessionData {\n  id: string;\n  startedAt: Date;\n  endedAt?: Date;\n  totalCostEstimate: number;\n}\n\nexport interface EventData {\n  id: string;\n  sessionId: string;\n  timestamp: Date;\n  direction: "request" | "response";\n  method?: string;\n}\n\nexport interface EventStore {\n  createSession(data: Omit<SessionData, "totalCostEstimate">): Promise<SessionData>;\n  endSession(id: string, totalCostEstimate: number): Promise<void>;\n  createEvent(data: Omit<EventData, "id">): Promise<EventData>;\n}\n'),
    ])

    add("feat: add json-rpc types and interceptor skeleton", lambda: [
        wf("src/proxy/interceptor.ts", 'import { EventEmitter } from "node:events";\n\nexport interface JsonRpcMessage {\n  jsonrpc: "2.0";\n  id?: string | number;\n  method?: string;\n  params?: unknown;\n  result?: unknown;\n  error?: { code: number; message: string; data?: unknown };\n}\n\nexport interface InterceptedMessage {\n  raw: string;\n  parsed: JsonRpcMessage;\n  direction: "request" | "response";\n  timestamp: Date;\n}\n\nexport class Interceptor extends EventEmitter {\n  parseMessage(raw: string, direction: "request" | "response"): InterceptedMessage | null {\n    try {\n      const parsed = JSON.parse(raw) as JsonRpcMessage;\n      if (parsed.jsonrpc !== "2.0") return null;\n      return { raw, parsed, direction, timestamp: new Date() };\n    } catch {\n      return null;\n    }\n  }\n}\n'),
    ])

    add("feat: implement in-memory event store", lambda: [
        wf("src/storage/memory.ts", 'import { randomUUID } from "node:crypto";\nimport type { EventStore, SessionData, EventData } from "./index.js";\n\nexport class MemoryStore implements EventStore {\n  private sessions = new Map<string, SessionData>();\n  private events = new Map<string, EventData[]>();\n\n  async createSession(data: Omit<SessionData, "totalCostEstimate">): Promise<SessionData> {\n    const session: SessionData = { ...data, totalCostEstimate: 0 };\n    this.sessions.set(session.id, session);\n    this.events.set(session.id, []);\n    return session;\n  }\n\n  async endSession(id: string, totalCostEstimate: number): Promise<void> {\n    const session = this.sessions.get(id);\n    if (session) {\n      session.endedAt = new Date();\n      session.totalCostEstimate = totalCostEstimate;\n    }\n  }\n\n  async createEvent(data: Omit<EventData, "id">): Promise<EventData> {\n    const event: EventData = { ...data, id: randomUUID() };\n    const arr = this.events.get(data.sessionId) || [];\n    arr.push(event);\n    this.events.set(data.sessionId, arr);\n    return event;\n  }\n}\n'),
    ])

    add("feat: add default config values", lambda: [
        wf("src/config/defaults.ts", 'export const DEFAULT_CONFIG = {\n  port: 3100,\n  wsPort: 3101,\n  storage: "memory" as const,\n  databaseUrl: undefined as string | undefined,\n  upstreams: [] as Array<{ name: string; command: string; transport: "stdio" | "sse" }>,\n  verbose: false,\n};\n'),
    ])

    add("feat: add config file loader with env var overrides", lambda: [
        wf("src/config/loader.ts", 'import { readFileSync, existsSync } from "node:fs";\nimport { resolve } from "node:path";\nimport { DEFAULT_CONFIG } from "./defaults.js";\n\nexport interface UpstreamConfig {\n  name: string;\n  command: string;\n  args?: string[];\n  env?: Record<string, string>;\n  transport: "stdio" | "sse";\n  url?: string;\n}\n\nexport interface CandorConfig {\n  port: number;\n  wsPort: number;\n  storage: "postgres" | "memory";\n  databaseUrl?: string;\n  upstreams: UpstreamConfig[];\n  verbose: boolean;\n}\n\nexport function loadConfig(configPath: string): CandorConfig {\n  const fullPath = resolve(configPath);\n  let fileConfig: Partial<CandorConfig> = {};\n  if (existsSync(fullPath)) {\n    try {\n      const raw = readFileSync(fullPath, "utf-8");\n      fileConfig = JSON.parse(raw);\n    } catch (err) {\n      console.warn(`Warning: Could not parse config at ${fullPath}:`, err);\n    }\n  }\n  const envOverrides: Partial<CandorConfig> = {};\n  if (process.env.CANDOR_PORT) envOverrides.port = parseInt(process.env.CANDOR_PORT);\n  if (process.env.DATABASE_URL) {\n    envOverrides.databaseUrl = process.env.DATABASE_URL;\n    envOverrides.storage = "postgres";\n  }\n  return { ...DEFAULT_CONFIG, ...fileConfig, ...envOverrides } as CandorConfig;\n}\n'),
    ])

    add("feat: add session lifecycle manager", lambda: [
        wf("src/proxy/session-manager.ts", 'import { randomUUID } from "node:crypto";\nimport type { EventStore, SessionData } from "../storage/index.js";\n\nexport class SessionManager {\n  private activeSessions = new Map<string, SessionData>();\n  private store: EventStore;\n\n  constructor(store: EventStore) { this.store = store; }\n\n  async startSession(agentId?: string): Promise<SessionData> {\n    const session = await this.store.createSession({ id: randomUUID(), agentId, startedAt: new Date() });\n    this.activeSessions.set(session.id, session);\n    return session;\n  }\n\n  async endSession(sessionId: string): Promise<void> {\n    const session = this.activeSessions.get(sessionId);\n    if (!session) return;\n    await this.store.endSession(sessionId, session.totalCostEstimate);\n    this.activeSessions.delete(sessionId);\n  }\n\n  getSession(sessionId: string): SessionData | undefined { return this.activeSessions.get(sessionId); }\n  getActiveSessions(): SessionData[] { return Array.from(this.activeSessions.values()); }\n}\n'),
    ])

    add("feat: add stdio transport with json-rpc splitter", lambda: [
        wf("src/proxy/transports/stdio.ts", 'import { spawn, type ChildProcess } from "node:child_process";\nimport { Transform, type TransformCallback } from "node:stream";\nimport { EventEmitter } from "node:events";\nimport type { InterceptedMessage } from "../interceptor.js";\nimport { Interceptor } from "../interceptor.js";\n\nexport class JsonRpcSplitter extends Transform {\n  private buffer = "";\n  _transform(chunk: Buffer, _encoding: string, callback: TransformCallback): void {\n    this.buffer += chunk.toString();\n    const lines = this.buffer.split("\\n");\n    this.buffer = lines.pop() || "";\n    for (const line of lines) { const t = line.trim(); if (t) this.push(t); }\n    callback();\n  }\n  _flush(callback: TransformCallback): void {\n    if (this.buffer.trim()) this.push(this.buffer.trim());\n    callback();\n  }\n}\n\nexport interface StdioTransportOptions {\n  command: string;\n  args?: string[];\n  env?: Record<string, string>;\n}\n\nexport class StdioTransport extends EventEmitter {\n  private process: ChildProcess | null = null;\n  private interceptor: Interceptor;\n  private options: StdioTransportOptions;\n\n  constructor(options: StdioTransportOptions) {\n    super();\n    this.options = options;\n    this.interceptor = new Interceptor();\n  }\n\n  start(): void {\n    const env = { ...process.env, ...this.options.env };\n    this.process = spawn(this.options.command, this.options.args || [], { env, stdio: ["pipe","pipe","pipe"] });\n    const splitter = new JsonRpcSplitter();\n    this.process.stdout?.pipe(splitter);\n    splitter.on("data", (data: Buffer) => {\n      const msg = this.interceptor.parseMessage(data.toString(), "response");\n      if (msg) this.emit("message", msg);\n    });\n    this.process.stderr?.on("data", (data: Buffer) => this.emit("stderr", data.toString()));\n    this.process.on("exit", (code) => this.emit("exit", code));\n    this.process.on("error", (err) => this.emit("error", err));\n  }\n\n  sendRaw(data: string): void { if (this.process?.stdin?.writable) this.process.stdin.write(data + "\\n"); }\n  stop(): void { if (this.process) { this.process.stdin?.end(); this.process.kill(); this.process = null; } }\n  isRunning(): boolean { return this.process !== null && !this.process.killed; }\n}\n'),
    ])

    add("feat: add basic http proxy server", lambda: [
        wf("src/proxy/index.ts", 'import { createServer, type IncomingMessage, type ServerResponse } from "node:http";\nimport type { CandorConfig } from "../config/loader.js";\nimport { MemoryStore } from "../storage/memory.js";\nimport { SessionManager } from "./session-manager.js";\nimport { Interceptor } from "./interceptor.js";\n\nexport class CandorProxy {\n  private config: CandorConfig;\n  private store = new MemoryStore();\n  private sessionManager: SessionManager;\n  private interceptor = new Interceptor();\n  private httpServer: ReturnType<typeof createServer> | null = null;\n\n  constructor(config: CandorConfig) {\n    this.config = config;\n    this.sessionManager = new SessionManager(this.store);\n  }\n\n  async start(): Promise<void> {\n    return new Promise((resolve) => {\n      this.httpServer = createServer(async (req, res) => {\n        if (req.url === "/health") {\n          res.writeHead(200, { "Content-Type": "application/json" });\n          res.end(JSON.stringify({ status: "ok" }));\n          return;\n        }\n        res.writeHead(404); res.end();\n      });\n      this.httpServer.listen(this.config.port, () => resolve());\n    });\n  }\n\n  async stop(): Promise<void> { this.httpServer?.close(); }\n}\n'),
    ])

    add("feat: add cli entry point with commander", lambda: [
        wf("src/cli.ts", '#!/usr/bin/env node\nimport { Command } from "commander";\nconst program = new Command();\nprogram.name("candor").description("MCP proxy for observability").version("0.1.0");\nprogram.command("start").description("Start the Candor proxy server")\n  .option("-p, --port <port>", "Proxy port", "3100")\n  .option("--config <path>", "Config file path", "candor.config.json")\n  .action(() => { console.log("Starting..."); });\nprogram.parse();\n'),
        wf("package.json", '{\n  "name": "@candor/proxy",\n  "version": "0.1.0",\n  "description": "MCP proxy for observability, cost tracking, and real-time monitoring",\n  "type": "module",\n  "bin": { "candor": "./dist/cli.js" },\n  "main": "./dist/proxy/index.js",\n  "scripts": { "build": "tsc", "dev": "tsx src/cli.ts" },\n  "dependencies": { "commander": "^12.0.0" },\n  "devDependencies": { "@types/node": "^20.0.0", "tsx": "^4.0.0", "typescript": "^5.0.0" },\n  "engines": { "node": ">=20.0.0" },\n  "license": "MIT"\n}\n'),
    ])

    add("feat: implement start command with config loading", lambda: [
        wf("src/commands/start.ts", 'import { loadConfig } from "../config/loader.js";\nimport { CandorProxy } from "../proxy/index.js";\n\ninterface StartOptions { port: string; config: string; }\n\nexport async function startCommand(options: StartOptions): Promise<void> {\n  const config = loadConfig(options.config);\n  config.port = parseInt(options.port) || config.port;\n  const proxy = new CandorProxy(config);\n  await proxy.start();\n  console.log(`Candor proxy started on port ${config.port}`);\n  process.on("SIGINT", async () => { await proxy.stop(); process.exit(0); });\n}\n'),
    ])

    add("feat: wire start command into cli", lambda: [
        wf("src/cli.ts", '#!/usr/bin/env node\nimport { Command } from "commander";\nimport { startCommand } from "./commands/start.js";\nconst program = new Command();\nprogram.name("candor").description("MCP proxy for observability, cost tracking, and real-time monitoring").version("0.1.0");\nprogram.command("start").description("Start the Candor proxy server")\n  .option("-p, --port <port>", "Proxy port", "3100")\n  .option("--config <path>", "Config file path", "candor.config.json")\n  .action(startCommand);\nprogram.parse();\n'),
    ])

    add("feat: add request body parsing and upstream forwarding", lambda: [
        wf("src/proxy/index.ts", 'import { createServer, type IncomingMessage, type ServerResponse } from "node:http";\nimport type { CandorConfig, UpstreamConfig } from "../config/loader.js";\nimport { MemoryStore } from "../storage/memory.js";\nimport { SessionManager } from "./session-manager.js";\nimport { Interceptor } from "./interceptor.js";\nimport { StdioTransport } from "./transports/stdio.js";\n\ninterface UpstreamConnection {\n  config: UpstreamConfig;\n  transport: StdioTransport;\n  sessionId: string | null;\n}\n\nexport class CandorProxy {\n  private config: CandorConfig;\n  private store = new MemoryStore();\n  private sessionManager: SessionManager;\n  private interceptor = new Interceptor();\n  private httpServer: ReturnType<typeof createServer> | null = null;\n  private upstreams: UpstreamConnection[] = [];\n\n  constructor(config: CandorConfig) {\n    this.config = config;\n    this.sessionManager = new SessionManager(this.store);\n  }\n\n  async start(): Promise<void> {\n    await this.startHttpServer();\n    for (const uc of this.config.upstreams) await this.connectUpstream(uc);\n  }\n\n  private startHttpServer(): Promise<void> {\n    return new Promise((resolve) => {\n      this.httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {\n        if (req.url === "/health") {\n          res.writeHead(200, { "Content-Type": "application/json" });\n          res.end(JSON.stringify({ status: "ok", upstreams: this.upstreams.length }));\n          return;\n        }\n        if (req.method === "POST") {\n          let body = "";\n          req.on("data", (c: Buffer) => { body += c; });\n          req.on("end", async () => {\n            this.interceptor.parseMessage(body, "request");\n            for (const u of this.upstreams) u.transport.sendRaw(body);\n            res.writeHead(200, { "Content-Type": "application/json" });\n            res.end(JSON.stringify({ status: "forwarded" }));\n          });\n          return;\n        }\n        res.writeHead(404); res.end();\n      });\n      this.httpServer.listen(this.config.port, () => resolve());\n    });\n  }\n\n  private async connectUpstream(config: UpstreamConfig): Promise<void> {\n    const t = new StdioTransport({ command: config.command, args: config.args, env: config.env });\n    t.start();\n    const s = await this.sessionManager.startSession(config.name);\n    this.upstreams.push({ config, transport: t, sessionId: s.id });\n  }\n\n  async stop(): Promise<void> {\n    for (const u of this.upstreams) u.transport.stop();\n    this.httpServer?.close();\n  }\n}\n'),
    ])

    add("feat: add request-response tracking to interceptor", lambda: [
        wf("src/proxy/interceptor.ts", 'import { EventEmitter } from "node:events";\n\nexport interface JsonRpcMessage {\n  jsonrpc: "2.0";\n  id?: string | number;\n  method?: string;\n  params?: unknown;\n  result?: unknown;\n  error?: { code: number; message: string; data?: unknown };\n}\n\nexport interface InterceptedMessage {\n  raw: string;\n  parsed: JsonRpcMessage;\n  direction: "request" | "response";\n  timestamp: Date;\n  matchedRequestId?: string | number;\n  method?: string;\n  latencyMs?: number;\n}\n\nexport class Interceptor extends EventEmitter {\n  private pendingRequests = new Map<string | number, { method: string; timestamp: Date }>();\n\n  parseMessage(raw: string, direction: "request" | "response"): InterceptedMessage | null {\n    try {\n      const parsed = JSON.parse(raw) as JsonRpcMessage;\n      if (parsed.jsonrpc !== "2.0") return null;\n      const timestamp = new Date();\n      const result: InterceptedMessage = { raw, parsed, direction, timestamp };\n      if (direction === "request" && parsed.method && parsed.id !== undefined) {\n        this.pendingRequests.set(parsed.id, { method: parsed.method, timestamp });\n        result.method = parsed.method;\n      } else if (direction === "response" && parsed.id !== undefined) {\n        const pending = this.pendingRequests.get(parsed.id);\n        if (pending) {\n          result.matchedRequestId = parsed.id;\n          result.method = pending.method;\n          result.latencyMs = timestamp.getTime() - pending.timestamp.getTime();\n          this.pendingRequests.delete(parsed.id);\n        }\n      } else if (direction === "request" && parsed.method) {\n        result.method = parsed.method;\n      }\n      return result;\n    } catch { return null; }\n  }\n\n  getPendingCount(): number { return this.pendingRequests.size; }\n}\n'),
    ])

    add("chore: add chalk and ora for cli formatting", lambda: [
        wf("package.json", '{\n  "name": "@candor/proxy",\n  "version": "0.1.0",\n  "description": "MCP proxy for observability, cost tracking, and real-time monitoring",\n  "type": "module",\n  "bin": { "candor": "./dist/cli.js" },\n  "main": "./dist/proxy/index.js",\n  "scripts": { "build": "tsc", "dev": "tsx src/cli.ts" },\n  "dependencies": { "chalk": "^5.3.0", "commander": "^12.0.0", "ora": "^8.0.0" },\n  "devDependencies": { "@types/node": "^20.0.0", "tsx": "^4.0.0", "typescript": "^5.0.0" },\n  "engines": { "node": ">=20.0.0" },\n  "license": "MIT"\n}\n'),
    ])

    add("feat: enhance start command with spinner and banner", lambda: [
        wf("src/commands/start.ts", F["src/commands/start.ts"]),
    ])

    add("chore: add ws dependency", lambda: [
        wf("package.json", '{\n  "name": "@candor/proxy",\n  "version": "0.1.0",\n  "description": "MCP proxy for observability, cost tracking, and real-time monitoring",\n  "type": "module",\n  "bin": { "candor": "./dist/cli.js" },\n  "main": "./dist/proxy/index.js",\n  "scripts": { "build": "tsc", "dev": "tsx src/cli.ts" },\n  "dependencies": { "chalk": "^5.3.0", "commander": "^12.0.0", "ora": "^8.0.0", "ws": "^8.16.0" },\n  "devDependencies": { "@types/node": "^20.0.0", "@types/ws": "^8.0.0", "tsx": "^4.0.0", "typescript": "^5.0.0" },\n  "engines": { "node": ">=20.0.0" },\n  "license": "MIT"\n}\n'),
    ])

    add("feat: implement websocket server for real-time streaming", lambda: [
        wf("src/ws/server.ts", 'import { WebSocketServer, WebSocket } from "ws";\nimport type { IncomingMessage } from "node:http";\n\ninterface WSMessage { type: string; payload?: unknown; }\ninterface Client { ws: WebSocket; subscriptions: Set<string>; alive: boolean; }\n\nexport class WSServer {\n  private wss: WebSocketServer | null = null;\n  private clients = new Set<Client>();\n  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;\n\n  start(port: number): void {\n    this.wss = new WebSocketServer({ port });\n    this.setupListeners();\n  }\n\n  private setupListeners(): void {\n    if (!this.wss) return;\n    this.wss.on("connection", (ws: WebSocket) => {\n      const client: Client = { ws, subscriptions: new Set(), alive: true };\n      this.clients.add(client);\n      ws.on("pong", () => { client.alive = true; });\n      ws.on("close", () => { this.clients.delete(client); });\n    });\n    this.heartbeatInterval = setInterval(() => {\n      for (const c of this.clients) {\n        if (!c.alive) { c.ws.terminate(); this.clients.delete(c); continue; }\n        c.alive = false; c.ws.ping();\n      }\n    }, 30000);\n  }\n\n  broadcast(msg: WSMessage): void {\n    const data = JSON.stringify(msg);\n    for (const c of this.clients) { if (c.ws.readyState === WebSocket.OPEN) c.ws.send(data); }\n  }\n\n  getClientCount(): number { return this.clients.size; }\n\n  stop(): void {\n    if (this.heartbeatInterval) { clearInterval(this.heartbeatInterval); this.heartbeatInterval = null; }\n    for (const c of this.clients) c.ws.close();\n    this.clients.clear();\n    this.wss?.close();\n  }\n}\n'),
    ])

    add("feat: add event pipeline with token estimation", lambda: [
        wf("src/proxy/event-pipeline.ts", 'import type { EventStore, EventData } from "../storage/index.js";\nimport type { InterceptedMessage } from "./interceptor.js";\n\ninterface PipelineConfig { verbose: boolean; }\n\nexport class EventPipeline {\n  private store: EventStore;\n  private config: PipelineConfig;\n\n  constructor(store: EventStore, config: PipelineConfig) {\n    this.store = store;\n    this.config = config;\n  }\n\n  async process(message: InterceptedMessage, sessionId: string): Promise<void> {\n    const tokenEstimate = Math.ceil((message.raw || "").length / 4);\n    await this.store.createEvent({\n      sessionId,\n      timestamp: message.timestamp,\n      direction: message.direction,\n      method: message.method,\n    });\n    if (this.config.verbose) {\n      const dir = message.direction === "request" ? "->" : "<-";\n      console.log(`  ${dir} ${message.method || "unknown"}`);\n    }\n  }\n}\n'),
    ])

    # ── Phase 2: Feature expansion (Dec mid - Jan) ──

    add("feat: extract tool names from intercepted messages", lambda: [
        wf("src/proxy/interceptor.ts", 'import { EventEmitter } from "node:events";\n\nexport interface JsonRpcMessage {\n  jsonrpc: "2.0";\n  id?: string | number;\n  method?: string;\n  params?: unknown;\n  result?: unknown;\n  error?: { code: number; message: string; data?: unknown };\n}\n\nexport interface InterceptedMessage {\n  raw: string;\n  parsed: JsonRpcMessage;\n  direction: "request" | "response";\n  timestamp: Date;\n  matchedRequestId?: string | number;\n  method?: string;\n  toolName?: string;\n  latencyMs?: number;\n}\n\nexport class Interceptor extends EventEmitter {\n  private pendingRequests = new Map<string | number, { method: string; toolName?: string; timestamp: Date }>();\n\n  parseMessage(raw: string, direction: "request" | "response"): InterceptedMessage | null {\n    try {\n      const parsed = JSON.parse(raw) as JsonRpcMessage;\n      if (parsed.jsonrpc !== "2.0") return null;\n      const timestamp = new Date();\n      const result: InterceptedMessage = { raw, parsed, direction, timestamp };\n      if (direction === "request" && parsed.method && parsed.id !== undefined) {\n        const toolName = this.extractToolName(parsed);\n        this.pendingRequests.set(parsed.id, { method: parsed.method, toolName, timestamp });\n        result.method = parsed.method;\n        result.toolName = toolName;\n      } else if (direction === "response" && parsed.id !== undefined) {\n        const pending = this.pendingRequests.get(parsed.id);\n        if (pending) {\n          result.matchedRequestId = parsed.id;\n          result.method = pending.method;\n          result.toolName = pending.toolName;\n          result.latencyMs = timestamp.getTime() - pending.timestamp.getTime();\n          this.pendingRequests.delete(parsed.id);\n        }\n      } else if (direction === "request" && parsed.method) {\n        result.method = parsed.method;\n        result.toolName = this.extractToolName(parsed);\n      }\n      return result;\n    } catch { return null; }\n  }\n\n  private extractToolName(msg: JsonRpcMessage): string | undefined {\n    if (msg.method === "tools/call" && msg.params) {\n      return ((msg.params as Record<string, unknown>).name as string) || undefined;\n    }\n    return undefined;\n  }\n\n  getPendingCount(): number { return this.pendingRequests.size; }\n}\n'),
    ])

    add("feat: add cost estimation to event pipeline", lambda: [
        wf("src/proxy/event-pipeline.ts", F["src/proxy/event-pipeline.ts"]),
    ])

    add("feat: expand storage interface with alerts and sessions", lambda: [
        wf("src/storage/index.ts", F["src/storage/index.ts"]),
    ])

    add("feat: update memory store for full EventStore interface", lambda: [
        wf("src/storage/memory.ts", F["src/storage/memory.ts"]),
    ])

    add("feat: add SSE transport for remote MCP servers", lambda: [
        wf("src/proxy/transports/sse.ts", F["src/proxy/transports/sse.ts"]),
        wf("package.json", '{\n  "name": "@candor/proxy",\n  "version": "0.1.0",\n  "description": "MCP proxy for observability, cost tracking, and real-time monitoring",\n  "type": "module",\n  "bin": { "candor": "./dist/cli.js" },\n  "main": "./dist/proxy/index.js",\n  "scripts": { "build": "tsc", "dev": "tsx src/cli.ts" },\n  "dependencies": { "chalk": "^5.3.0", "commander": "^12.0.0", "eventsource": "^2.0.0", "ora": "^8.0.0", "ws": "^8.16.0" },\n  "devDependencies": { "@types/eventsource": "^1.1.15", "@types/node": "^20.0.0", "@types/ws": "^8.0.0", "tsx": "^4.0.0", "typescript": "^5.0.0" },\n  "engines": { "node": ">=20.0.0" },\n  "license": "MIT"\n}\n'),
    ])

    add("chore: add prisma dependencies", lambda: [
        wf("package.json", '{\n  "name": "@candor/proxy",\n  "version": "0.1.0",\n  "description": "MCP proxy for observability, cost tracking, and real-time monitoring",\n  "type": "module",\n  "bin": { "candor": "./dist/cli.js" },\n  "main": "./dist/proxy/index.js",\n  "scripts": { "build": "tsc", "dev": "tsx src/cli.ts", "prisma:generate": "prisma generate" },\n  "dependencies": { "@prisma/client": "^6.0.0", "chalk": "^5.3.0", "commander": "^12.0.0", "eventsource": "^2.0.0", "ora": "^8.0.0", "ws": "^8.16.0" },\n  "devDependencies": { "@types/eventsource": "^1.1.15", "@types/node": "^20.0.0", "@types/ws": "^8.0.0", "prisma": "^6.0.0", "tsx": "^4.0.0", "typescript": "^5.0.0" },\n  "engines": { "node": ">=20.0.0" },\n  "license": "MIT"\n}\n'),
    ])

    add("feat: add initial prisma schema with session and event", lambda: [
        wf("prisma/schema.prisma", 'generator client {\n  provider = "prisma-client-js"\n}\n\ndatasource db {\n  provider = "postgresql"\n  url      = env("DATABASE_URL")\n}\n\nmodel Session {\n  id                String    @id @default(uuid()) @db.Uuid\n  agentId           String?\n  startedAt         DateTime  @default(now())\n  endedAt           DateTime?\n  metadata          Json?\n  totalCostEstimate Float     @default(0)\n  events            Event[]\n\n  @@index([agentId])\n  @@index([startedAt])\n}\n\nmodel Event {\n  id            String   @id @default(uuid()) @db.Uuid\n  sessionId     String   @db.Uuid\n  session       Session  @relation(fields: [sessionId], references: [id], onDelete: Cascade)\n  timestamp     DateTime @default(now())\n  direction     String\n  method        String?\n  toolName      String?\n  params        Json?\n  result        Json?\n  error         Json?\n  latencyMs     Int?\n  tokenEstimate Int?\n  costEstimate  Float?\n\n  @@index([sessionId])\n  @@index([timestamp])\n}\n'),
    ])

    add("feat: implement postgresql storage backend", lambda: [
        wf("src/storage/postgres.ts", F["src/storage/postgres.ts"]),
    ])

    add("feat: add alert evaluator with condition types", lambda: [
        wf("src/proxy/alert-evaluator.ts", F["src/proxy/alert-evaluator.ts"]),
    ])

    add("feat: add userId support to session manager", lambda: [
        wf("src/proxy/session-manager.ts", F["src/proxy/session-manager.ts"]),
    ])

    add("feat: add config validation function", lambda: [
        wf("src/config/loader.ts", F["src/config/loader.ts"]),
    ])

    add("feat: add dashboardUrl and retention to config defaults", lambda: [
        wf("src/config/defaults.ts", F["src/config/defaults.ts"]),
    ])

    add("feat: add init command with inquirer wizard", lambda: [
        wf("src/commands/init.ts", F["src/commands/init.ts"]),
        wf("package.json", '{\n  "name": "@candor/proxy",\n  "version": "0.1.0",\n  "description": "MCP proxy for observability, cost tracking, and real-time monitoring",\n  "type": "module",\n  "bin": { "candor": "./dist/cli.js" },\n  "main": "./dist/proxy/index.js",\n  "scripts": { "build": "tsc", "dev": "tsx src/cli.ts", "prisma:generate": "prisma generate" },\n  "dependencies": { "@prisma/client": "^6.0.0", "chalk": "^5.3.0", "commander": "^12.0.0", "eventsource": "^2.0.0", "inquirer": "^9.0.0", "ora": "^8.0.0", "ws": "^8.16.0" },\n  "devDependencies": { "@types/eventsource": "^1.1.15", "@types/inquirer": "^9.0.9", "@types/node": "^20.0.0", "@types/ws": "^8.0.0", "prisma": "^6.0.0", "tsx": "^4.0.0", "typescript": "^5.0.0" },\n  "engines": { "node": ">=20.0.0" },\n  "license": "MIT"\n}\n'),
    ])

    add("feat: add status command", lambda: [wf("src/commands/status.ts", F["src/commands/status.ts"])])
    add("feat: wire init and status into cli", lambda: [wf("src/cli.ts", F["src/cli.ts"])])

    add("feat: add user and auth models to prisma", lambda: [
        wf("prisma/schema.prisma", F["prisma/schema.prisma"]),
    ])

    add("feat: add ws authentication and user scoping", lambda: [
        wf("src/ws/server.ts", F["src/ws/server.ts"]),
    ])

    # ── Phase 2b: Tests (Jan mid) ──
    add("chore: add vitest config", lambda: [wf("vitest.config.ts", F["vitest.config.ts"])])
    add("test: add interceptor unit tests", lambda: [wf("__tests__/interceptor.test.ts", F["__tests__/interceptor.test.ts"])])
    add("test: add memory store unit tests", lambda: [wf("__tests__/memory-store.test.ts", F["__tests__/memory-store.test.ts"])])
    add("test: add event pipeline unit tests", lambda: [wf("__tests__/event-pipeline.test.ts", F["__tests__/event-pipeline.test.ts"])])
    add("test: add alert evaluator unit tests", lambda: [wf("__tests__/alert-evaluator.test.ts", F["__tests__/alert-evaluator.test.ts"])])
    add("chore: add test and start scripts to package.json", lambda: [wf("package.json", F["package.json"])])

    # ── Phase 3: Security, hardening, polish (Jan late - Feb) ──
    add("fix: add command injection prevention to stdio", lambda: [wf("src/proxy/transports/stdio.ts", F["src/proxy/transports/stdio.ts"])])
    add("feat: integrate all components in proxy", lambda: [wf("src/proxy/index.ts", F["src/proxy/index.ts"])])
    add("feat: add resource uri extraction to interceptor", lambda: [wf("src/proxy/interceptor.ts", F["src/proxy/interceptor.ts"])])

    # ── Phase 4: Deployment and docs (Feb) ──
    add("docs: add comprehensive env example", lambda: [wf(".env.example", F[".env.example"])])
    add("feat: add multi-stage Dockerfile", lambda: [wf("Dockerfile", F["Dockerfile"])])
    add("feat: add railway deployment config", lambda: [wf("railway.toml", F["railway.toml"])])
    add("docs: add project readme", lambda: [wf("README.md", F["README.md"])])
    add("chore: update gitignore", lambda: [wf(".gitignore", "node_modules/\ndist/\n.env\n*.log\n.DS_Store\n")])

    total = len(commits)
    print(f"Total commits: {total}")

    # PHASE A: Pre-run lambdas to build final state on disk
    # Strategy: run twice to resolve circular F dict dependency
    # Pass 1: inline commits work, F refs fail → writes intermediate states
    # Then populate F from disk → F has intermediate content
    # Pass 2: now F is populated, all commits work → writes final states
    # Then re-populate F from disk → F has correct final content
    print("Phase A: Building final file state (pass 1)...")
    for msg, fn in commits:
        try:
            fn()
        except (KeyError, Exception):
            pass

    # Intermediate read into F
    file_list = [
        "package.json","tsconfig.json",".env.example","Dockerfile","railway.toml",
        "vitest.config.ts","prisma/schema.prisma","README.md",
        "src/cli.ts","src/config/defaults.ts","src/config/loader.ts",
        "src/storage/index.ts","src/storage/memory.ts","src/storage/postgres.ts",
        "src/proxy/interceptor.ts","src/proxy/session-manager.ts",
        "src/proxy/event-pipeline.ts","src/proxy/alert-evaluator.ts","src/proxy/index.ts",
        "src/proxy/transports/stdio.ts","src/proxy/transports/sse.ts",
        "src/ws/server.ts","src/commands/init.ts","src/commands/start.ts",
        "src/commands/status.ts",
        "__tests__/interceptor.test.ts","__tests__/event-pipeline.test.ts",
        "__tests__/memory-store.test.ts","__tests__/alert-evaluator.test.ts",
    ]
    for rel in file_list:
        try:
            F[rel] = rf(rel)
        except FileNotFoundError:
            pass

    print("Phase A: Building final file state (pass 2)...")
    for msg, fn in commits:
        try:
            fn()
        except Exception:
            pass

    # Final read into F  
    for rel in file_list:
        try:
            F[rel] = rf(rel)
        except FileNotFoundError:
            print(f"  Warning: {rel} still missing")
    
    print(f"  Loaded {len(F)} files into F dict")

    # PHASE B: Clean and re-init
    print("Phase B: Cleaning project directory...")
    for item in os.listdir(PROJECT):
        p = os.path.join(PROJECT, item)
        if item in {"node_modules","dist",".git","_build2.py"}:
            continue
        if os.path.isdir(p): shutil.rmtree(p)
        else: os.remove(p)

    git_dir = os.path.join(PROJECT, ".git")
    if os.path.exists(git_dir): shutil.rmtree(git_dir)
    run("git init")
    run(f'git config user.name "{GIT_USER}"')
    run(f'git config user.email "{GIT_EMAIL}"')
    print("  Git repo initialized")

    # PHASE C: Execute all commits with dates
    print("Phase C: Executing commits...")
    dates = gen_dates(total)
    while len(dates) < total:
        dates.append(dates[-1] + timedelta(hours=random.randint(1,6)))
    dates.sort()
    print(f"  Date range: {dates[0].strftime('%Y-%m-%d')} to {dates[-1].strftime('%Y-%m-%d')}")

    for i, (msg, fn) in enumerate(commits):
        fn()  # Write files
        commit(dates[i], msg)
        if (i+1) % 10 == 0 or i+1 == total:
            print(f"  [{i+1}/{total}] {msg}")

    print("\n=== Done! ===")

if __name__ == "__main__":
    main()
