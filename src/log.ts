import { createWriteStream, type WriteStream } from "node:fs";

// Logs go to stderr; stdout carries the stdio transport.

type Level = "INFO" | "WARN" | "ERROR";

let file: WriteStream | undefined;

/** Also appends logs to the file at path. */
export function logToFile(path: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const stream = createWriteStream(path, { flags: "a", mode: 0o600 });
    stream.once("open", () => {
      file = stream;
      resolve();
    });
    stream.once("error", reject);
  });
}

function format(value: unknown): string {
  const s = value instanceof Error ? value.message : String(value);
  return /[\s"=]/.test(s) ? JSON.stringify(s) : s;
}

function write(level: Level, msg: string, attrs: Record<string, unknown>): void {
  const parts = [`time=${new Date().toISOString()}`, `level=${level}`, `msg=${format(msg)}`];
  for (const [key, value] of Object.entries(attrs)) {
    if (value !== undefined) parts.push(`${key}=${format(value)}`);
  }
  const line = `${parts.join(" ")}\n`;
  process.stderr.write(line);
  file?.write(line);
}

export const log = {
  info: (msg: string, attrs: Record<string, unknown> = {}) => write("INFO", msg, attrs),
  warn: (msg: string, attrs: Record<string, unknown> = {}) => write("WARN", msg, attrs),
  error: (msg: string, attrs: Record<string, unknown> = {}) => write("ERROR", msg, attrs),
};
