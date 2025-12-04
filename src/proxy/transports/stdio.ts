import { spawn } from "node:child_process";
import { Transform } from "node:stream";
import { EventEmitter } from "node:events";
import { Interceptor } from "../interceptor.js";
const MAX_BUFFER_SIZE = 10 * 1024 * 1024; // 10 MB max buffer
export class JsonRpcSplitter extends Transform {
    buffer = "";
    _transform(chunk, _encoding, callback) {
        this.buffer += chunk.toString();
        // Prevent unbounded buffer growth
        if (this.buffer.length > MAX_BUFFER_SIZE) {
            this.buffer = "";
            callback(new Error("Buffer size exceeded maximum limit"));
            return;
        }
        // Try to parse complete JSON-RPC messages (newline-delimited)
        const lines = this.buffer.split("\n");
        this.buffer = lines.pop() || "";
        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed) {
                this.push(trimmed);
            }
        }
        callback();
    }
    _flush(callback) {
        if (this.buffer.trim()) {
            this.push(this.buffer.trim());
        }
        callback();
    }
}
// Disallow shell metacharacters and dangerous patterns in commands
function validateCommand(command) {
    // Block shell metacharacters
    if (/[;&|`$(){}]/.test(command)) {
        throw new Error(`Command contains disallowed shell metacharacters: ${command}`);
    }
    // Block path traversal
    if (command.includes("..")) {
        throw new Error(`Command contains path traversal: ${command}`);
    }
}
function validateArgs(args) {
    for (const arg of args) {
        // Block shell metacharacters in args
        if (/[;&|`$(){}]/.test(arg)) {
            throw new Error(`Argument contains disallowed shell metacharacters: ${arg}`);
        }
    }
}
export class StdioTransport extends EventEmitter {
    process = null;
    interceptor;
    options;
    constructor(options) {
        super();
        this.options = options;
        this.interceptor = new Interceptor();
    }
    start() {
        // Validate command and args to prevent injection
        validateCommand(this.options.command);
        if (this.options.args) {
            validateArgs(this.options.args);
        }
        const env = { ...process.env, ...this.options.env };
        this.process = spawn(this.options.command, this.options.args || [], {
            env,
            stdio: ["pipe", "pipe", "pipe"],
            shell: false, // Never use shell mode
        });
        // Parse stdout (responses from MCP server)
        const stdoutSplitter = new JsonRpcSplitter();
        this.process.stdout?.pipe(stdoutSplitter);
        stdoutSplitter.on("data", (data) => {
            const raw = data.toString();
            const message = this.interceptor.parseMessage(raw, "response");
            if (message) {
                this.emit("message", message);
            }
        });
        this.process.stderr?.on("data", (data) => {
            this.emit("stderr", data.toString());
        });
        this.process.on("exit", (code) => {
            this.emit("exit", code);
        });
        this.process.on("error", (err) => {
            this.emit("error", err);
        });
    }
    send(data) {
        if (!this.process?.stdin?.writable)
            return null;
        const message = this.interceptor.parseMessage(data, "request");
        this.process.stdin.write(data + "\n");
        return message;
    }
    sendRaw(data) {
        if (this.process?.stdin?.writable) {
            this.process.stdin.write(data + "\n");
        }
    }
    stop() {
        if (this.process) {
            this.process.stdin?.end();
            this.process.kill();
            this.process = null;
        }
    }
    isRunning() {
        return this.process !== null && !this.process.killed;
    }
}
//# sourceMappingURL=stdio.js.map