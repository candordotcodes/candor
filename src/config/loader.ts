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
    if (process.env.CANDOR_PORT)
        envOverrides.port = parseInt(process.env.CANDOR_PORT);
    if (process.env.CANDOR_WS_PORT)
        envOverrides.wsPort = parseInt(process.env.CANDOR_WS_PORT);
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
    if (process.env.LOG_RETENTION_DAYS)
        envOverrides.logRetentionDays = parseInt(process.env.LOG_RETENTION_DAYS);
    if (process.env.MAX_EVENTS_PER_SESSION)
        envOverrides.maxEventsPerSession = parseInt(process.env.MAX_EVENTS_PER_SESSION);
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
