import chalk from "chalk";
import ora from "ora";
import { loadConfig, validateConfig } from "../config/loader.js";
import { CandorProxy } from "../proxy/index.js";
export async function startCommand(options) {
    const spinner = ora("Loading configuration...").start();
    try {
        // Load config
        const config = loadConfig(options.config);
        // Apply CLI overrides
        config.port = parseInt(options.port) || config.port;
        config.wsPort = parseInt(options.wsPort) || config.wsPort;
        if (options.dashboard)
            config.dashboardUrl = options.dashboard;
        if (options.verbose)
            config.verbose = true;
        // Railway sets $PORT — use it for both proxy and WS (single-port mode)
        if (process.env.PORT && !options.port) {
            const railwayPort = parseInt(process.env.PORT);
            config.port = railwayPort;
            config.wsPort = railwayPort; // Same port triggers attachToServer mode
        }
        // Validate
        const errors = validateConfig(config);
        if (errors.length > 0) {
            spinner.fail("Configuration errors:");
            for (const err of errors) {
                console.error(chalk.red(`  - ${err}`));
            }
            process.exit(1);
        }
        spinner.text = "Starting Candor proxy...";
        // Create and start proxy
        const proxy = new CandorProxy(config);
        await proxy.start();
        spinner.succeed("Candor proxy started");
        // Display status banner
        console.log();
        console.log(chalk.bold("  Candor MCP Proxy"));
        console.log(chalk.gray("  ─────────────────────────────────────"));
        console.log(`  ${chalk.cyan("Proxy:")}       http://localhost:${config.port}`);
        if (config.port === config.wsPort) {
            console.log(`  ${chalk.cyan("WebSocket:")}   ws://localhost:${config.wsPort}/ws ${chalk.gray("(shared port)")}`);
        }
        else {
            console.log(`  ${chalk.cyan("WebSocket:")}   ws://localhost:${config.wsPort}`);
        }
        console.log(`  ${chalk.cyan("Storage:")}     ${config.storage}`);
        if (config.dashboardUrl) {
            console.log(`  ${chalk.cyan("Dashboard:")}   ${config.dashboardUrl}`);
        }
        if (config.upstreams.length > 0) {
            console.log(`  ${chalk.cyan("Upstreams:")}   ${config.upstreams.length} configured`);
            for (const u of config.upstreams) {
                console.log(`    ${chalk.gray("•")} ${u.name} (${u.transport})`);
            }
        }
        console.log(chalk.gray("  ─────────────────────────────────────"));
        console.log(`  ${chalk.green("Ready")} — intercepting MCP traffic`);
        console.log();
        // Graceful shutdown
        const shutdown = async () => {
            console.log();
            const shutdownSpinner = ora("Shutting down...").start();
            await proxy.stop();
            shutdownSpinner.succeed("Candor proxy stopped");
            process.exit(0);
        };
        process.on("SIGINT", shutdown);
        process.on("SIGTERM", shutdown);
    }
    catch (err) {
        spinner.fail(`Failed to start: ${err instanceof Error ? err.message : err}`);
        process.exit(1);
    }
}
//# sourceMappingURL=start.js.map
// feat: railway PORT auto-detection
