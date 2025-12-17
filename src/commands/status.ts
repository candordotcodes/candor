import chalk from "chalk";
export async function statusCommand() {
    console.log();
    console.log(chalk.bold("  Candor Status"));
    console.log(chalk.gray("  ─────────────────────────────────────"));
    // Try to connect to proxy health endpoint
    try {
        const res = await fetch("http://localhost:3100/health", {
            signal: AbortSignal.timeout(3000),
        });
        if (res.ok) {
            const data = (await res.json());
            console.log(`  ${chalk.green("●")} Proxy          http://localhost:3100`);
            console.log(`    Upstreams:     ${data.upstreams}`);
            console.log(`    Sessions:      ${data.activeSessions}`);
            console.log(`    WS Clients:    ${data.wsClients}`);
        }
        else {
            console.log(`  ${chalk.red("●")} Proxy          not responding`);
        }
    }
    catch {
        console.log(`  ${chalk.red("●")} Proxy          not running`);
    }
    // Try to connect to WebSocket
    try {
        const ws = await new Promise((resolve) => {
            import("ws").then(({ default: WebSocket }) => {
                const socket = new WebSocket("ws://localhost:3101");
                const timeout = setTimeout(() => {
                    socket.close();
                    resolve(false);
                }, 3000);
                socket.on("open", () => {
                    clearTimeout(timeout);
                    socket.close();
                    resolve(true);
                });
                socket.on("error", () => {
                    clearTimeout(timeout);
                    resolve(false);
                });
            });
        });
        console.log(`  ${ws ? chalk.green("●") : chalk.red("●")} WebSocket      ws://localhost:3101`);
    }
    catch {
        console.log(`  ${chalk.red("●")} WebSocket      not reachable`);
    }
    // Try to connect to dashboard
    try {
        const res = await fetch("http://localhost:3000", {
            signal: AbortSignal.timeout(3000),
        });
        console.log(`  ${res.ok ? chalk.green("●") : chalk.yellow("●")} Dashboard      http://localhost:3000`);
    }
    catch {
        console.log(`  ${chalk.gray("●")} Dashboard      not running`);
    }
    console.log(chalk.gray("  ─────────────────────────────────────"));
    console.log();
}
//# sourceMappingURL=status.js.map