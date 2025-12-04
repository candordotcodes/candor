import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { DEFAULT_CONFIG } from "./defaults.js";

export interface UpstreamConfig {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  transport: "stdio" | "sse";
  url?: string;
}

export interface CandorConfig {
  port: number;
  wsPort: number;
  storage: "postgres" | "memory";
  databaseUrl?: string;
  upstreams: UpstreamConfig[];
  verbose: boolean;
}

export function loadConfig(path: string): CandorConfig {
  const full = resolve(path);
  let file: Partial<CandorConfig> = {};
  if (existsSync(full)) {
    try { file = JSON.parse(readFileSync(full, "utf-8")); } catch {}
  }
  const env: Partial<CandorConfig> = {};
  if (process.env.CANDOR_PORT) env.port = parseInt(process.env.CANDOR_PORT);
  if (process.env.DATABASE_URL) { env.databaseUrl = process.env.DATABASE_URL; env.storage = "postgres"; }
  return { ...DEFAULT_CONFIG, ...file, ...env } as CandorConfig;
}
