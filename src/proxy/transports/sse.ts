import { EventEmitter } from "node:events";
import { Interceptor } from "../interceptor.js";
export class SSETransport extends EventEmitter {
    interceptor;
    options;
    eventSource = null;
    reconnectAttempts = 0;
    maxReconnectAttempts = 10;
    connected = false;
    constructor(options) {
        super();
        this.options = options;
        this.interceptor = new Interceptor();
    }
    async start() {
        await this.connect();
    }
    async connect() {
        try {
            // Use dynamic import for eventsource (node doesn't have native EventSource in all versions)
            const { default: EventSource } = await import("eventsource");
            this.eventSource = new EventSource(this.options.url, {
                headers: this.options.headers,
            });
            this.eventSource.onopen = () => {
                this.connected = true;
                this.reconnectAttempts = 0;
                this.emit("connected");
            };
            this.eventSource.onmessage = (event) => {
                const message = this.interceptor.parseMessage(event.data, "response");
                if (message) {
                    this.emit("message", message);
                }
            };
            this.eventSource.onerror = () => {
                this.connected = false;
                this.emit("disconnected");
                this.attemptReconnect();
            };
        }
        catch (err) {
            this.emit("error", err);
            this.attemptReconnect();
        }
    }
    attemptReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            this.emit("error", new Error("Max reconnect attempts reached"));
            return;
        }
        const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
        this.reconnectAttempts++;
        setTimeout(() => {
            this.connect().catch(() => { });
        }, delay);
    }
    async send(data) {
        const message = this.interceptor.parseMessage(data, "request");
        // For SSE, we POST requests to the server
        try {
            await fetch(this.options.url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    ...this.options.headers,
                },
                body: data,
            });
        }
        catch (err) {
            this.emit("error", err);
        }
        return message;
    }
    stop() {
        this.eventSource?.close();
        this.eventSource = null;
        this.connected = false;
    }
    isConnected() {
        return this.connected;
    }
}
//# sourceMappingURL=sse.js.map
// refactor: SSE reconnect session reuse
