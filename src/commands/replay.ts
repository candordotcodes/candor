import chalk from "chalk";
export async function replayCommand(sessionId, options) {
    const speed = parseSpeed(options.speed || "1x");
    const exportPath = options.export;
    console.log();
    try {
        const res = await fetch(`http://localhost:3100/api/sessions/${sessionId}/events`, {
            signal: AbortSignal.timeout(10000),
        });
        if (!res.ok) {
            console.log(chalk.red(`  Session ${sessionId} not found`));
            return;
        }
        const data = (await res.json());
        const events = data.events || [];
        const session = data.session || {};
        // Export mode
        if (exportPath) {
            const fs = await import("fs");
            fs.writeFileSync(exportPath, JSON.stringify(data, null, 2));
            console.log(chalk.green(`  ✓ Exported ${events.length} events to ${exportPath}`));
            console.log();
            return;
        }
        // Session header
        console.log(chalk.cyan.bold("  Session Replay") + chalk.gray(` — #${sessionId}`));
        console.log(chalk.gray("  ─────────────────────────────────────────────────"));
        console.log(`  ${chalk.gray("├─")} Agent          ${chalk.magenta(session.agentId || "unknown")}`);
        console.log(`  ${chalk.gray("├─")} Upstream       ${chalk.white(session.upstreamName || "unknown")}`);
        console.log(`  ${chalk.gray("├─")} Started        ${chalk.white(formatTimestamp(session.createdAt))}`);
        console.log(`  ${chalk.gray("├─")} Events         ${chalk.white(String(events.length))}`);
        console.log(`  ${chalk.gray("└─")} Total Cost     ${chalk.white("$" + (session.totalCost || 0).toFixed(4))}`);
        console.log();
        console.log(chalk.gray(`  Replaying at ${options.speed || "1x"} speed (press Ctrl+C to stop)`));
        console.log(chalk.gray("  ─────────────────────────────────────────────────"));
        console.log();
        // Phase detection
        let currentPhase = "";
        // Replay events
        for (let i = 0; i < events.length; i++) {
            const event = events[i];
            const phase = detectPhase(event);
            if (phase && phase !== currentPhase) {
                currentPhase = phase;
                console.log();
                console.log(chalk.magenta.bold(`  ▸ ${phase}`));
                console.log();
            }
            // Format event line
            const ts = formatEventTime(event.timestamp);
            const dir = event.direction === "request" ? chalk.cyan("→") : chalk.green("←");
            const method = event.method || "";
            const toolStr = event.toolName ? chalk.gray(`  tool=${event.toolName}`) : "";
            if (event.direction === "request") {
                console.log(`  ${chalk.gray(ts)}  ${dir}  ${method}${toolStr}`);
            }
            else {
                const latency = event.latencyMs ? `${event.latencyMs}ms` : "";
                const latColor = (event.latencyMs || 0) < 20
                    ? chalk.green(latency)
                    : (event.latencyMs || 0) < 50
                        ? chalk.yellow(latency)
                        : chalk.red(latency);
                const cost = event.costEstimate
                    ? chalk.gray(`  ~$${event.costEstimate.toFixed(4)}`)
                    : "";
                console.log(`  ${chalk.gray(ts)}  ${dir}  ${method}  ${latColor}${toolStr}${cost}`);
            }
            // Timing delay between events at replay speed
            if (i < events.length - 1) {
                const currentTime = new Date(event.timestamp).getTime();
                const nextTime = new Date(events[i + 1].timestamp).getTime();
                const gap = Math.max(0, nextTime - currentTime);
                const delay = Math.min(gap / speed, 2000); // Cap at 2s
                if (delay > 10) {
                    await sleep(delay);
                }
            }
        }
        // Summary
        console.log();
        console.log(chalk.gray("  ─────────────────────────────────────────────────"));
        console.log(chalk.gray(`  Replay complete (${events.length} events)`));
        console.log();
        console.log(chalk.gray(`  Export JSON: candor replay ${sessionId} --export events.json`));
    }
    catch {
        console.log(chalk.red("  Could not connect to proxy at localhost:3100"));
        console.log(chalk.gray("  Make sure candor is running: candor start"));
    }
    console.log();
}
function detectPhase(event) {
    const method = event.method || "";
    const tool = event.toolName || "";
    if (method === "tools/list" || method === "resources/list") {
        return "Discovery";
    }
    if (tool === "listDirectory" || tool === "list_directory") {
        return "Project Structure";
    }
    if (tool === "readFile" || tool === "read_file" || tool === "getFileContents") {
        return "Reading";
    }
    if (tool === "writeFile" || tool === "write_file" || tool === "createFile") {
        return "Writing";
    }
    if (method === "resources/read") {
        return "Resource Access";
    }
    return null;
}
function parseSpeed(speedStr) {
    const match = speedStr.match(/^(\d+)x$/);
    return match ? parseInt(match[1], 10) : 1;
}
function formatTimestamp(ts) {
    if (!ts)
        return "unknown";
    const d = new Date(ts);
    return d.toISOString().replace("T", " ").slice(0, 19);
}
function formatEventTime(ts) {
    if (!ts)
        return "??:??:??.???";
    const d = new Date(ts);
    return d.toISOString().slice(11, 23);
}
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
