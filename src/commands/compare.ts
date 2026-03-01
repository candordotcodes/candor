import chalk from "chalk";
export async function compareCommand(sessionA, sessionB, options) {
    const exportPath = options.export;
    console.log();
    try {
        const [resA, resB] = await Promise.all([
            fetch(`http://localhost:3100/api/sessions/${sessionA}`, {
                signal: AbortSignal.timeout(5000),
            }),
            fetch(`http://localhost:3100/api/sessions/${sessionB}`, {
                signal: AbortSignal.timeout(5000),
            }),
        ]);
        if (!resA.ok || !resB.ok) {
            if (!resA.ok)
                console.log(chalk.red(`  Session ${sessionA} not found`));
            if (!resB.ok)
                console.log(chalk.red(`  Session ${sessionB} not found`));
            return;
        }
        const dataA = (await resA.json());
        const dataB = (await resB.json());
        // Export mode
        if (exportPath) {
            const fs = await import("fs");
            fs.writeFileSync(exportPath, JSON.stringify({ sessionA: dataA, sessionB: dataB }, null, 2));
            console.log(chalk.green(`  ✓ Exported comparison to ${exportPath}`));
            console.log();
            return;
        }
        console.log(chalk.cyan.bold("  Session Comparison"));
        console.log(chalk.gray("  ─────────────────────────────────────────────────────────"));
        console.log();
        // Overview
        const labelWidth = 20;
        const colA = `#${sessionA.slice(0, 8)}`;
        const colB = `#${sessionB.slice(0, 8)}`;
        console.log(chalk.bold(`  ${"".padEnd(labelWidth)}  ${chalk.cyan(colA.padEnd(18))}  ${chalk.magenta(colB)}`));
        console.log(chalk.gray("  ─────────────────────────────────────────────────────────"));
        printRow("Agent", dataA.agentId || "unknown", dataB.agentId || "unknown", labelWidth);
        printRow("Upstream", dataA.upstreamName || "unknown", dataB.upstreamName || "unknown", labelWidth);
        printRow("Duration", dataA.duration || "—", dataB.duration || "—", labelWidth);
        printRow("Total Events", String(dataA.events || 0), String(dataB.events || 0), labelWidth);
        printRow("Total Cost", "$" + (dataA.totalCost || 0).toFixed(4), "$" + (dataB.totalCost || 0).toFixed(4), labelWidth);
        // Latency comparison
        const latA = dataA.avgLatencyMs || 0;
        const latB = dataB.avgLatencyMs || 0;
        const latColorA = latA < 50 ? chalk.green : latA < 200 ? chalk.yellow : chalk.red;
        const latColorB = latB < 50 ? chalk.green : latB < 200 ? chalk.yellow : chalk.red;
        console.log(`  ${chalk.white("Avg Latency".padEnd(labelWidth))}  ${latColorA((latA + "ms").padEnd(18))}  ${latColorB(latB + "ms")}`);
        // Error rate
        const errA = dataA.errorRate || 0;
        const errB = dataB.errorRate || 0;
        const errColorA = errA < 1 ? chalk.green : errA < 5 ? chalk.yellow : chalk.red;
        const errColorB = errB < 1 ? chalk.green : errB < 5 ? chalk.yellow : chalk.red;
        console.log(`  ${chalk.white("Error Rate".padEnd(labelWidth))}  ${errColorA((errA.toFixed(1) + "%").padEnd(18))}  ${errColorB(errB.toFixed(1) + "%")}`);
        // Cost per event
        const cpeA = dataA.events > 0 ? dataA.totalCost / dataA.events : 0;
        const cpeB = dataB.events > 0 ? dataB.totalCost / dataB.events : 0;
        const cpeColorA = cpeA <= cpeB ? chalk.green : chalk.yellow;
        const cpeColorB = cpeB <= cpeA ? chalk.green : chalk.yellow;
        console.log(`  ${chalk.white("Cost/Event".padEnd(labelWidth))}  ${cpeColorA(("$" + cpeA.toFixed(4)).padEnd(18))}  ${cpeColorB("$" + cpeB.toFixed(4))}`);
        console.log();
        // Tool usage comparison
        if (dataA.byTool || dataB.byTool) {
            console.log(chalk.bold("  Tool Usage"));
            console.log(chalk.gray("  ─────────────────────────────────────────────────────────"));
            const allTools = new Set();
            for (const t of dataA.byTool || [])
                allTools.add(t.name);
            for (const t of dataB.byTool || [])
                allTools.add(t.name);
            const maxCalls = Math.max(...(dataA.byTool || []).map((t) => t.calls), ...(dataB.byTool || []).map((t) => t.calls), 1);
            for (const tool of allTools) {
                const tA = (dataA.byTool || []).find((t) => t.name === tool);
                const tB = (dataB.byTool || []).find((t) => t.name === tool);
                const callsA = tA ? tA.calls : 0;
                const callsB = tB ? tB.calls : 0;
                const costA = tA ? tA.cost : 0;
                const costB = tB ? tB.cost : 0;
                const barA = renderBar(callsA, maxCalls, 8);
                const barB = renderBar(callsB, maxCalls, 8);
                const cA = callsA > 0 ? `${callsA}`.padStart(3) : chalk.gray("  —");
                const cB = callsB > 0 ? `${callsB}`.padStart(3) : chalk.gray("  —");
                const csA = costA > 0 ? `$${costA.toFixed(4)}` : chalk.gray("—") + "      ";
                const csB = costB > 0 ? `$${costB.toFixed(4)}` : chalk.gray("—");
                console.log(`  ${chalk.white(tool.padEnd(22))} ${barA} ${cA}  ${csA}  ${chalk.gray("│")}  ${barB} ${cB}  ${csB}`);
            }
            console.log();
        }
        // Efficiency
        if (dataA.efficiency || dataB.efficiency) {
            console.log(chalk.bold("  Efficiency Analysis"));
            console.log(chalk.gray("  ─────────────────────────────────────────────────────────"));
            const effA = dataA.efficiency || {};
            const effB = dataB.efficiency || {};
            printEffRow("Redundant reads", effA.redundantReads, effB.redundantReads, labelWidth);
            printEffRow("Retry attempts", effA.retries, effB.retries, labelWidth);
            printEffRow("Unused calls", effA.unusedCalls, effB.unusedCalls, labelWidth);
            console.log();
        }
        // Summary
        console.log(chalk.bold("  Summary"));
        console.log(chalk.gray("  ─────────────────────────────────────────────────────────"));
        const cheaperSession = cpeA <= cpeB ? colA : colB;
        const cheaperAgent = cpeA <= cpeB ? dataA.agentId : dataB.agentId;
        const fasterSession = latA <= latB ? colA : colB;
        console.log(`  ${chalk.cyan(cheaperSession)} (${cheaperAgent}) is ${chalk.green("more cost-efficient")} per event.`);
        console.log(`  ${chalk.cyan(fasterSession)} has ${chalk.green("lower latency")}.`);
        console.log();
        console.log(chalk.gray(`  Export: candor compare ${sessionA} ${sessionB} --export report.json`));
    }
    catch {
        console.log(chalk.red("  Could not connect to proxy at localhost:3100"));
        console.log(chalk.gray("  Make sure candor is running: candor start"));
    }
    console.log();
}
function printRow(label, valA, valB, labelWidth) {
    console.log(`  ${chalk.white(label.padEnd(labelWidth))}  ${chalk.white(valA.padEnd(18))}  ${chalk.white(valB)}`);
}
function printEffRow(label, valA, valB, labelWidth) {
    const a = valA !== undefined ? valA : "—";
    const b = valB !== undefined ? valB : "—";
    const colorA = typeof a === "number" ? (a < 3 ? chalk.green : a < 10 ? chalk.yellow : chalk.red) : chalk.gray;
    const colorB = typeof b === "number" ? (b < 3 ? chalk.green : b < 10 ? chalk.yellow : chalk.red) : chalk.gray;
    console.log(`  ${chalk.white(label.padEnd(labelWidth))}  ${colorA(String(a).padEnd(18))}  ${colorB(String(b))}`);
}
function renderBar(value, max, width) {
    const filled = max > 0 ? Math.round(width * value / max) : 0;
    const pct = max > 0 ? (value / max) * 100 : 0;
    const color = pct < 40 ? chalk.green : pct < 70 ? chalk.yellow : chalk.red;
    return color("█".repeat(filled)) + chalk.gray("░".repeat(width - filled));
}
