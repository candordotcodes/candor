import { writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import chalk from "chalk";
import inquirer from "inquirer";
import { DEFAULT_CONFIG } from "../config/defaults.js";
export async function initCommand(options) {
    console.log();
    console.log(chalk.bold("  Candor Configuration Wizard"));
    console.log(chalk.gray("  ─────────────────────────────────────"));
    console.log();
    const answers = await inquirer.prompt([
        {
            type: "list",
            name: "storage",
            message: "Storage backend:",
            choices: [
                { name: "In-memory (no database required)", value: "memory" },
                { name: "PostgreSQL (persistent storage)", value: "postgres" },
            ],
            default: "memory",
        },
        {
            type: "input",
            name: "databaseUrl",
            message: "PostgreSQL connection URL:",
            when: (a) => a.storage === "postgres",
            default: "postgresql://user:pass@localhost:5432/candor",
        },
        {
            type: "number",
            name: "port",
            message: "Proxy port:",
            default: 3100,
        },
        {
            type: "number",
            name: "wsPort",
            message: "WebSocket port:",
            default: 3101,
        },
        {
            type: "input",
            name: "dashboardUrl",
            message: "Dashboard URL:",
            default: "http://localhost:3000",
        },
        {
            type: "confirm",
            name: "addUpstreams",
            message: "Configure MCP servers now?",
            default: false,
        },
    ]);
    const upstreams = [];
    if (answers.addUpstreams) {
        let addMore = true;
        while (addMore) {
            const upstream = await inquirer.prompt([
                {
                    type: "input",
                    name: "name",
                    message: "MCP server name:",
                },
                {
                    type: "list",
                    name: "transport",
                    message: "Transport type:",
                    choices: [
                        { name: "stdio (spawn process)", value: "stdio" },
                        { name: "SSE (HTTP Server-Sent Events)", value: "sse" },
                    ],
                },
                {
                    type: "input",
                    name: "command",
                    message: "Command to spawn:",
                    when: (a) => a.transport === "stdio",
                },
                {
                    type: "input",
                    name: "url",
                    message: "SSE endpoint URL:",
                    when: (a) => a.transport === "sse",
                },
                {
                    type: "confirm",
                    name: "addAnother",
                    message: "Add another MCP server?",
                    default: false,
                },
            ]);
            upstreams.push({
                name: upstream.name,
                transport: upstream.transport,
                command: upstream.command || "",
                url: upstream.url,
            });
            addMore = upstream.addAnother;
        }
    }
    const config = {
        ...DEFAULT_CONFIG,
        port: answers.port,
        wsPort: answers.wsPort,
        dashboardUrl: answers.dashboardUrl,
        storage: answers.storage,
        databaseUrl: answers.databaseUrl,
        upstreams,
    };
    const configPath = resolve(join(options.dir, "candor.config.json"));
    writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
    console.log();
    console.log(chalk.green(`  Config saved to ${configPath}`));
    console.log();
    console.log(`  Run ${chalk.cyan("candor start")} to launch the proxy.`);
    console.log();
}
//# sourceMappingURL=init.js.map