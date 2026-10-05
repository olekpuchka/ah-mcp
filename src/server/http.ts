import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { HttpOptions } from "../config.ts";
import { log } from "../log.ts";
import { OAuth } from "./oauth.ts";
import { isLoopbackHost, readBody } from "./request.ts";

const MCP_PATH = "/mcp";
const MAX_BODY_BYTES = 4 * 1024 * 1024;

/** Reports whether url's host is localhost or loopback; an unparsable url is not. */
function isLocalUrl(url: string): boolean {
  return URL.canParse(url) && isLoopbackHost(new URL(url).hostname);
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
    ? new Set([
        ...["localhost", "127.0.0.1", "[::1]"].flatMap((h) => (opts.port === 80 ? [h, `${h}:80`] : [`${h}:${opts.port}`])),
        new URL(opts.baseUrl).host,
      ])
    : undefined;

  // Web clients such as ChatGPT log in with OAuth; others send the token itself.
  const oauth = new OAuth(opts.baseUrl, MCP_PATH, token);

  const handle = async (req: IncomingMessage, res: ServerResponse) => {
    // Checked here rather than in the MCP transport, so it covers the OAuth routes too.
    if (allowedHosts && !allowedHosts.has(req.headers.host ?? "")) {
      res.writeHead(403).end("Forbidden");
      return;
    }
    const url = new URL(req.url ?? "/", "http://localhost");
    if (await oauth.handle(req, res, url)) return;
    if (url.pathname !== MCP_PATH) {
      res.writeHead(404).end("Not Found");
      return;
    }
    const challenge = oauth.authenticate(req, url);
    if (challenge) {
      res.writeHead(401, { "WWW-Authenticate": challenge }).end("Unauthorized");
      return;
    }
    const raw = req.method === "POST" ? await readBody(req, MAX_BODY_BYTES) : "";
    const body: unknown = raw ? JSON.parse(raw) : undefined;
    const server = newServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
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
