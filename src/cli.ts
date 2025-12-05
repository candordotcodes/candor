#!/usr/bin/env node
import { Command } from "commander";
import { startCommand } from "./commands/start.js";
const program = new Command();
program.name("candor").description("MCP proxy for observability, cost tracking, and real-time monitoring").version("0.1.0");
program.command("start").description("Start the proxy")
  .option("-p, --port <port>", "Port", "3100")
  .option("--config <path>", "Config", "candor.config.json")
  .action(startCommand);
program.parse();
