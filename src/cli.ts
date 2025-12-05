#!/usr/bin/env node
import { Command } from "commander";
const program = new Command();
program.name("candor").description("MCP proxy for observability").version("0.1.0");
program.command("start").description("Start the proxy")
  .option("-p, --port <port>", "Port", "3100")
  .option("--config <path>", "Config path", "candor.config.json")
  .action(() => console.log("Starting..."));
program.parse();
