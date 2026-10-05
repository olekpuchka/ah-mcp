import { existsSync } from "node:fs";
import { parseArgs } from "node:util";
import { defaultTokensPath } from "./auth/tokens.ts";

const TRANSPORTS = ["stdio", "streamable-http"] as const;
type Transport = (typeof TRANSPORTS)[number];

export interface HttpOptions {
  /** Listen address. Default 127.0.0.1; use a reverse proxy for remote access. */
  host: string;
  port: number;
  /** Public URL of the server. */
  baseUrl: string;
  /** Required on every request; serveHttp refuses to start without it. */
  token?: string;
}

export interface Config {
  transport: Transport;
  /** Don't open a browser on login (e.g. on a server). */
  remote: boolean;
  showVersion: boolean;
  showHelp: boolean;
  tokensPath: string;
  logFile?: string;
  http: HttpOptions;
}

export const USAGE = `Usage: ah-mcp [--transport stdio|streamable-http] [--remote] [--version] [--help]

  --transport  stdio (default) or streamable-http
  --remote     don't open a browser on login (also AH_REMOTE=true)

Settings come from environment variables, also read from a .env file in the
working directory. See README.md.`;

/** Reads flags and environment variables. */
export function loadConfig(argv: string[], env: NodeJS.ProcessEnv = process.env): Config {
  const { values } = parseArgs({
    args: argv,
    options: {
      transport: { type: "string", default: "stdio" },
      remote: { type: "boolean", default: false },
      version: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
    strict: true,
  });
  const transport = values.transport as Transport;
  if (!TRANSPORTS.includes(transport)) {
    throw new Error(`unknown transport "${values.transport}" (use ${TRANSPORTS.join(" or ")})`);
  }
  const port = envInt(env, "AH_MCP_PORT", 3000);
  const baseUrl = env.AH_MCP_BASE_URL || `http://localhost:${port}`;
  if (!URL.canParse(baseUrl)) throw new Error(`AH_MCP_BASE_URL: "${baseUrl}" is not a URL (e.g. https://ah-mcp.example.com)`);
  return {
    transport,
    remote: values.remote || env.AH_REMOTE === "true",
    showVersion: values.version,
    showHelp: values.help,
    tokensPath: env.AH_TOKENS_PATH || defaultTokensPath(),
    logFile: env.AH_LOG_FILE || undefined,
    http: {
      host: env.AH_MCP_HOST || "127.0.0.1",
      port,
      baseUrl,
      token: env.AH_MCP_TOKEN || undefined,
    },
  };
}

function envInt(env: NodeJS.ProcessEnv, key: string, def: number): number {
  const v = env[key];
  if (!v) return def;
  const n = Number(v);
  if (!Number.isInteger(n)) throw new Error(`${key}: "${v}" is not a number`);
  return n;
}

/** Loads ./.env if present; existing variables take precedence. */
export function loadDotEnv(path = ".env"): void {
  if (existsSync(path)) process.loadEnvFile(path);
}
