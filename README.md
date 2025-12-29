# candor-proxy

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue.svg)](https://typescriptlang.org)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D20-green.svg)](https://nodejs.org)

> MCP proxy for observability, cost tracking, and real-time monitoring.

Candor Proxy sits between your AI agents and MCP servers, intercepting JSON-RPC traffic to provide real-time observability, cost estimation, alerting, and session management — all without modifying your existing MCP setup.

## Architecture

```
Agent ──► Candor Proxy ──► MCP Server (stdio/SSE)
              │
              ├── Event Pipeline (token & cost estimation)
              ├── Alert Evaluator (rule-based alerts)
              ├── Session Manager (lifecycle tracking)
              └── WebSocket Server (real-time dashboard)
```

## Getting Started

### Prerequisites

- Node.js >= 20
- PostgreSQL (optional, defaults to in-memory storage)

### Installation

```bash
git clone https://github.com/candordotcodes/candor-proxy.git
cd candor-proxy
npm install
npm run build
```

### Configuration

```bash
# Interactive setup
npx candor init

# Or set environment variables
export DATABASE_URL="postgresql://..."
export CANDOR_API_KEY="your-key"
```

### Launch

```bash
npx candor start --port 3100 --config candor.config.json
```

## CLI Commands

| Command | Description |
|---------|-------------|
| `candor start` | Start the proxy server |
| `candor init` | Interactive config wizard |
| `candor status` | Check running services |

## Transports

- **Stdio** — Spawns MCP server as child process, communicates via stdin/stdout
- **SSE** — Connects to remote MCP server via Server-Sent Events

## Alert Rules

Configure alert rules per user with conditions:

- `error_rate` — Triggers when error rate exceeds threshold in time window
- `latency` — Triggers when response latency exceeds threshold
- `cost_spike` — Triggers when session cost exceeds threshold
- `tool_failure` — Triggers on specific tool errors

## Deployment

### Railway

```bash
railway up
```

### Docker

```bash
docker build -t candor-proxy .
docker run -p 3100:3100 -p 3101:3101 candor-proxy
```

## Security

- API key authentication for proxy and WebSocket
- CORS restricted to dashboard origin
- Command injection prevention in Stdio transport
- SSRF protection for webhooks
- Request body size limits
- User-scoped WebSocket broadcasts
- Non-root Docker container

## Links

- [Website](https://candor.codes)
- [Twitter](https://x.com/candordotcodes)

## License

MIT
