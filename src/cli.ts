#!/usr/bin/env node
import { Command } from "commander";
import { startCommand } from "./commands/start.js";
import { initCommand } from "./commands/init.js";
import { statusCommand } from "./commands/status.js";
import { costCommand } from "./commands/cost.js";
import { replayCommand } from "./commands/replay.js";
const program = new Command();
program
    .name("candor")
    .description("MCP proxy for observability, cost tracking, and real-time monitoring")
    .version("0.1.0");
program
    .command("start")
    .description("Start the Candor proxy server")
    .option("-p, --port <port>", "Proxy port", "3100")
    .option("-w, --ws-port <port>", "WebSocket port", "3101")
    .option("--dashboard <url>", "Dashboard URL")
    .option("--no-dashboard", "Disable dashboard connection")
    .option("--config <path>", "Config file path", "candor.config.json")
    .option("--attach", "Attach to existing MCP server")
    .option("-v, --verbose", "Verbose logging")
    .action(startCommand);
program
    .command("init")
    .description("Initialize a new Candor configuration")
    .option("-d, --dir <dir>", "Directory for config file", ".")
    .option("-t, --template <template>", "Config template", "default")
    .action(initCommand);
program
    .command("status")
    .description("Show status of running Candor services")
    .action(statusCommand);
program
    .command("cost")
    .description("Show cost breakdown for sessions and upstreams")
    .option("--period <period>", "Time period (e.g. 24h, 7d)", "24h")
    .option("--session <id>", "Drill into a specific session")
    .action(costCommand);
program
    .command("replay <sessionId>")
    .description("Replay a past session's tool calls")
    .option("--speed <speed>", "Replay speed (e.g. 1x, 4x, 10x)", "1x")
    .option("--export <path>", "Export events to JSON file")
    .action(replayCommand);
program.parse();
//# sourceMappingURL=cli.js.map