import { Transform, type TransformCallback } from "node:stream";
export class JsonRpcSplitter extends Transform {
  private buffer = "";
  _transform(chunk: Buffer, _: string, cb: TransformCallback) {
    this.buffer += chunk.toString();
    const lines = this.buffer.split("\n");
    this.buffer = lines.pop() || "";
    for (const l of lines) { const t = l.trim(); if (t) this.push(t); }
    cb();
  }
}
