import type { EventStore } from "../storage/index.js";
import type { InterceptedMessage } from "./interceptor.js";

export class EventPipeline {
  private store: EventStore;
  private verbose: boolean;
  constructor(store: EventStore, config: { verbose: boolean }) {
    this.store = store;
    this.verbose = config.verbose;
  }
  async process(msg: InterceptedMessage, sessionId: string) {
    const tokens = Math.ceil((msg.raw || "").length / 4);
    await this.store.createEvent({ sessionId, timestamp: msg.timestamp, direction: msg.direction, method: msg.method });
    if (this.verbose) console.log(`  ${msg.direction === "request" ? "->" : "<-"} ${msg.method || "unknown"}`);
  }
}
