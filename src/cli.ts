#!/usr/bin/env node
import { Command } from "commander";
import { startCommand } from "./commands/start.js";
import { initCommand } from "./commands/init.js";
import { statusCommand } from "./commands/status.js";
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
program.parse();
//# sourceMappingURL=cli.js.map