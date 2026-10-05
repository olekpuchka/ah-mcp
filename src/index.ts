#!/usr/bin/env node
// ah-mcp: a Model Context Protocol server for the Albert Heijn supermarket API.

import { readFileSync } from "node:fs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Session } from "./auth/session.ts";
import { loadConfig, loadDotEnv, USAGE } from "./config.ts";
import { log, logToFile } from "./log.ts";
import { serveHttp } from "./server/http.ts";
import { newToolContext, registerTools } from "./tools/index.ts";

const { version } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
  version: string;
};

/** Shown by clients that display server icons. */
const ICON = {
  src: `data:image/png;base64,${readFileSync(new URL("../assets/icon.png", import.meta.url)).toString("base64")}`,
  mimeType: "image/png",
  sizes: ["128x128"],
};

/** Sent to clients on connect. */
const INSTRUCTIONS =
  "When you mention an Albert Heijn product or recipe to the user, link its name to its page: " +
  "use the url field from the tool result, e.g. [AH Halfvolle melk](https://www.ah.nl/producten/product/wi...).";

async function main(): Promise<void> {
  loadDotEnv();
  const cfg = loadConfig(process.argv.slice(2));
  if (cfg.showHelp) {
    console.log(USAGE);
    return;
  }
  if (cfg.showVersion) {
    console.log(`ah-mcp ${version}`);
    return;
  }
  if (cfg.logFile) await logToFile(cfg.logFile);
  log.info("ah-mcp", { version });

  const ctx = newToolContext(new Session(cfg.tokensPath), cfg.remote);
  const newServer = () => {
    const server = new McpServer({ name: "Albert Heijn", version, icons: [ICON] }, { instructions: INSTRUCTIONS });
    registerTools(server, ctx);
    return server;
  };

  if (cfg.transport === "stdio") {
    log.info("starting server", { transport: "stdio" });
    await newServer().connect(new StdioServerTransport());
    return;
  }

  const httpServer = await serveHttp(newServer, cfg.http);
  const shutdown = () => {
    log.info("shutting down");
    httpServer.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref();
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
}

main().catch((err) => {
  log.error("fatal", { err });
  process.exit(1);
});
