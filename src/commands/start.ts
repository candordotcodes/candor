import { loadConfig } from "../config/loader.js";
import { CandorProxy } from "../proxy/index.js";
export async function startCommand(opts: { port: string; config: string }) {
  const config = loadConfig(opts.config);
  config.port = parseInt(opts.port) || config.port;
  const proxy = new CandorProxy(config);
  await proxy.start();
  console.log(`Candor proxy on port ${config.port}`);
  process.on("SIGINT", async () => { await proxy.stop(); process.exit(0); });
}
