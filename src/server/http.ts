import { createHash, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { HttpOptions } from "../config.ts";
import { log } from "../log.ts";

const MCP_PATH = "/mcp";
const MAX_BODY_BYTES = 4 * 1024 * 1024;

function isLoopbackHost(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, "");
  return h === "localhost" || h === "::1" || /^127\./.test(h);
}

/** Reports whether url's host is localhost or loopback; an unparsable url is not. */
function isLocalUrl(url: string): boolean {
  return URL.canParse(url) && isLoopbackHost(new URL(url).hostname);
}

const sha256 = (s: string) => createHash("sha256").update(s).digest();

/** Checks "Authorization: Bearer <token>" or "?token=<token>" in constant time. */
function hasToken(req: IncomingMessage, token: string): boolean {
  // Hashing makes the lengths equal, so the comparison doesn't reveal the token's length either.
  const expected = sha256(token);
  const matches = (candidate: string | null | undefined) => Boolean(candidate) && timingSafeEqual(sha256(candidate!), expected);
  const auth = req.headers.authorization;
  if (auth?.startsWith("Bearer ") && matches(auth.slice("Bearer ".length))) return true;
  return matches(new URL(req.url ?? "/", "http://localhost").searchParams.get("token"));
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) throw new Error("request body too large");
    chunks.push(chunk as Buffer);
  }
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : undefined;
}

/** Serves MCP at /mcp, stateless: each request gets a new server. Resolves once listening. */
export async function serveHttp(newServer: () => McpServer, opts: HttpOptions): Promise<Server> {
  // Anyone who reaches the server acts as the logged-in AH account, and a
  // reverse proxy can make a loopback listener public without the server knowing.
  const { token } = opts;
  if (!token) throw new Error("AH_MCP_TOKEN is required for the HTTP transport; generate one with: openssl rand -hex 32");

  // DNS-rebinding protection for local-only setups. When the server is
  // reachable under another name (reverse proxy, or listening on a LAN
  // address), the Host header differs, so the check is off.
  const local = isLocalUrl(opts.baseUrl) && isLoopbackHost(opts.host);
  // Clients omit the port for port 80; a local proxy may listen on another port (the base URL's).
  const allowedHosts = local
    ? [
        ...new Set([
          ...["localhost", "127.0.0.1", "[::1]"].flatMap((h) => (opts.port === 80 ? [h, `${h}:80`] : [`${h}:${opts.port}`])),
          new URL(opts.baseUrl).host,
        ]),
      ]
    : undefined;

  const handle = async (req: IncomingMessage, res: ServerResponse) => {
    if (new URL(req.url ?? "/", "http://localhost").pathname !== MCP_PATH) {
      res.writeHead(404).end("Not Found");
      return;
    }
    if (!hasToken(req, token)) {
      res.writeHead(401).end("Unauthorized");
      return;
    }
    const body = req.method === "POST" ? await readJsonBody(req) : undefined;
    const server = newServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableDnsRebindingProtection: local,
      allowedHosts,
    });
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, body);
  };

  const httpServer = createServer((req, res) => {
    handle(req, res).catch((err) => {
      log.error("HTTP request failed", { err });
      if (!res.headersSent) res.writeHead(400).end("Bad Request");
    });
  });
  httpServer.headersTimeout = 10_000;
  await new Promise<void>((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(opts.port, opts.host, resolve);
  });
  log.info("starting server", {
    transport: "streamable-http",
    addr: `${opts.host}:${opts.port}${MCP_PATH}`,
    base_url: opts.baseUrl,
  });
  return httpServer;
}
