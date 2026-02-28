import chalk from "chalk";
export async function costCommand(options) {
    const period = options.period || "24h";
    const sessionId = options.session;
    console.log();
    if (sessionId) {
        await showSessionCost(sessionId);
    }
    else {
        await showCostOverview(period);
    }
}
async function showCostOverview(period) {
    console.log(chalk.cyan.bold("  Candor Cost Report") + chalk.gray(` — Last ${period}`));
    console.log(chalk.gray("  ─────────────────────────────────────────────"));
    try {
        const res = await fetch("http://localhost:3100/api/costs?period=" + period, {
            signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) {
            console.log(chalk.red("  Failed to fetch cost data"));
            return;
        }
        const data = (await res.json());
        // Overview
        console.log();
        console.log(chalk.bold("  Overview"));
        console.log(`  ${chalk.gray("├─")} Total Sessions     ${chalk.white(data.totalSessions)}`);
        console.log(`  ${chalk.gray("├─")} Total Events       ${chalk.white(data.totalEvents.toLocaleString())}`);
        console.log(`  ${chalk.gray("├─")} Total Est. Cost    ${chalk.white("$" + data.totalCost.toFixed(4))}`);
        console.log(`  ${chalk.gray("└─")} Avg Cost/Session   ${chalk.white("$" + (data.totalCost / data.totalSessions).toFixed(4))}`);
        console.log();
        // Cost by upstream
        if (data.byUpstream && data.byUpstream.length > 0) {
            console.log(chalk.bold("  Cost by Upstream"));
            console.log(chalk.gray("  ─────────────────────────────────────────────"));
            const maxCost = Math.max(...data.byUpstream.map((u) => u.cost));
            for (const upstream of data.byUpstream) {
                const bar = renderBar(upstream.cost, maxCost, 20);
                console.log(`  ${chalk.white(upstream.name.padEnd(14))} ${bar}  ${chalk.white("$" + upstream.cost.toFixed(4))}  ${chalk.gray(`(${upstream.events} events)`)}`);
            }
            console.log();
        }
        // Top tools by cost
        if (data.byTool && data.byTool.length > 0) {
            console.log(chalk.bold("  Top Tools by Cost"));
            console.log(chalk.gray("  ─────────────────────────────────────────────"));
            const maxToolCost = Math.max(...data.byTool.map((t) => t.cost));
            for (let i = 0; i < Math.min(data.byTool.length, 8); i++) {
                const tool = data.byTool[i];
                const bar = renderBar(tool.cost, maxToolCost, 15);
                console.log(`  ${chalk.cyan((i + 1) + ".")} ${chalk.white(tool.name.padEnd(22))} ${bar}  ${chalk.white("$" + tool.cost.toFixed(4))}  ${chalk.gray(`${tool.calls} calls`)}`);
            }
            console.log();
        }
        // Most expensive sessions
        if (data.topSessions && data.topSessions.length > 0) {
            console.log(chalk.bold("  Most Expensive Sessions"));
            console.log(chalk.gray("  ─────────────────────────────────────────────"));
            for (const session of data.topSessions.slice(0, 5)) {
                const costColor = session.cost > 0.15
                    ? chalk.red
                    : session.cost > 0.10
                        ? chalk.yellow
                        : chalk.white;
                console.log(`  ${chalk.cyan("#" + session.id.slice(0, 8))}  ${chalk.magenta(session.agentId?.padEnd(10) || "unknown".padEnd(10))}  ${chalk.white(session.events + " events")}  ${costColor("$" + session.cost.toFixed(4))}`);
            }
            console.log();
        }
        // Daily budget
        if (data.dailyBudget) {
            console.log(chalk.bold("  Daily Budget"));
            const pct = (data.totalCost / data.dailyBudget) * 100;
            const bar = renderBar(data.totalCost, data.dailyBudget, 30);
            console.log(`  ${bar}  ${chalk.white("$" + data.totalCost.toFixed(2))} / $${data.dailyBudget.toFixed(2)}  ${chalk.gray(`(${pct.toFixed(0)}% used)`)}`);
            console.log();
        }
    }
    catch {
        console.log(chalk.red("  Could not connect to proxy at localhost:3100"));
        console.log(chalk.gray("  Make sure candor is running: candor start"));
    }
    console.log();
}
async function showSessionCost(sessionId) {
    console.log(chalk.cyan.bold(`  Session #${sessionId}`) + chalk.gray(" — Cost Breakdown"));
    console.log(chalk.gray("  ─────────────────────────────────────────────"));
    try {
        const res = await fetch(`http://localhost:3100/api/sessions/${sessionId}/costs`, {
            signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) {
            console.log(chalk.red(`  Session ${sessionId} not found`));
            return;
        }
        const data = (await res.json());
        console.log();
        console.log(`  ${chalk.gray("├─")} Agent          ${chalk.magenta(data.agentId || "unknown")}`);
        console.log(`  ${chalk.gray("├─")} Duration       ${chalk.white(data.duration)}`);
        console.log(`  ${chalk.gray("├─")} Events         ${chalk.white(data.events)}`);
        console.log(`  ${chalk.gray("├─")} Total Cost     ${chalk.white("$" + data.totalCost.toFixed(4))}`);
        console.log(`  ${chalk.gray("└─")} Avg Cost/Event ${chalk.white("$" + (data.totalCost / data.events).toFixed(4))}`);
        console.log();
        // Tool breakdown
        if (data.byTool && data.byTool.length > 0) {
            console.log(chalk.bold("  Tool Breakdown"));
            const maxCost = Math.max(...data.byTool.map((t) => t.cost));
            for (const tool of data.byTool) {
                const bar = renderBar(tool.cost, maxCost, 15);
                const pct = ((tool.cost / data.totalCost) * 100).toFixed(1);
                console.log(`  ${chalk.white(tool.name.padEnd(16))} ${bar}  ${chalk.white("$" + tool.cost.toFixed(4))}  ${chalk.gray(`${tool.calls} calls (${pct}%)`)}`);
            }
            console.log();
        }
    }
    catch {
        console.log(chalk.red("  Could not connect to proxy at localhost:3100"));
    }
    console.log();
}
function renderBar(value, max, width) {
    const filled = max > 0 ? Math.round(width * value / max) : 0;
    const pct = max > 0 ? (value / max) * 100 : 0;
    const color = pct < 40 ? chalk.green : pct < 70 ? chalk.yellow : chalk.red;
    return color("█".repeat(filled)) + chalk.gray("░".repeat(width - filled));
}
