import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { DEFAULT_CONFIG } from "./defaults.js";
export function loadConfig(configPath) {
    const fullPath = resolve(configPath);
    let fileConfig = {};
    if (existsSync(fullPath)) {
        try {
            const raw = readFileSync(fullPath, "utf-8");
            fileConfig = JSON.parse(raw);
        }
        catch (err) {
            console.warn(`Warning: Could not parse config at ${fullPath}:`, err);
        }
    }
    // Env var overrides
    const envOverrides = {};
    if (process.env.CANDOR_PORT) {
        const port = parseInt(process.env.CANDOR_PORT, 10);
        if (!isNaN(port))
            envOverrides.port = port;
    }
    if (process.env.CANDOR_WS_PORT) {
        const wsPort = parseInt(process.env.CANDOR_WS_PORT, 10);
        if (!isNaN(wsPort))
            envOverrides.wsPort = wsPort;
    }
    if (process.env.CANDOR_DASHBOARD_URL)
        envOverrides.dashboardUrl = process.env.CANDOR_DASHBOARD_URL;
    if (process.env.DATABASE_URL) {
        envOverrides.databaseUrl = process.env.DATABASE_URL;
        envOverrides.storage = "postgres";
    }
    if (process.env.CANDOR_STORAGE)
        envOverrides.storage = process.env.CANDOR_STORAGE;
    if (process.env.CANDOR_API_KEY)
        envOverrides.apiKey = process.env.CANDOR_API_KEY;
    if (process.env.LOG_RETENTION_DAYS) {
        const ret = parseInt(process.env.LOG_RETENTION_DAYS, 10);
        if (!isNaN(ret))
            envOverrides.logRetentionDays = ret;
    }
    if (process.env.MAX_EVENTS_PER_SESSION) {
        const max = parseInt(process.env.MAX_EVENTS_PER_SESSION, 10);
        if (!isNaN(max))
            envOverrides.maxEventsPerSession = max;
    }
    return {
        ...DEFAULT_CONFIG,
        ...fileConfig,
        ...envOverrides,
    };
}
export function validateConfig(config) {
    const errors = [];
    if (config.storage === "postgres" && !config.databaseUrl) {
        errors.push("PostgreSQL storage requires DATABASE_URL environment variable");
    }
    if (config.port < 1 || config.port > 65535) {
        errors.push(`Invalid port: ${config.port}`);
    }
    if (config.wsPort < 1 || config.wsPort > 65535) {
        errors.push(`Invalid WebSocket port: ${config.wsPort}`);
    }
    // Same port is allowed (single-port mode for Railway), but different ports must both be valid
    // No validation needed for same-port — handled by attachToServer in proxy
    for (const upstream of config.upstreams) {
        if (!upstream.name)
            errors.push("Upstream missing name");
        if (!upstream.command && upstream.transport === "stdio") {
            errors.push(`Upstream "${upstream.name}" (stdio) requires a command`);
        }
        if (!upstream.url && upstream.transport === "sse") {
            errors.push(`Upstream "${upstream.name}" (sse) requires a URL`);
        }
    }
    return errors;
}
//# sourceMappingURL=loader.js.map
// fix: config validation error handling
// refactor: normalize config paths #15
