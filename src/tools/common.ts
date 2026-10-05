import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult, ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import type { z } from "zod";
import { type AhClient, getMember, hasStatus } from "../ahapi/index.ts";
import { NotLoggedInError } from "../auth/session.ts";
import type { Session } from "../auth/session.ts";
import { log } from "../log.ts";
import { TtlCache } from "./cache.ts";
import type { BonusOffer, BonusPeriod, Member, Nutrient, Product } from "../ahapi/index.ts";

/** State shared by tool handlers. */
export interface ToolContext {
  session: Session;
  /** Don't open a browser on login. */
  remote: boolean;
  searches: TtlCache<Product[]>;
  products: TtlCache<Product>;
  nutrition: TtlCache<Nutrient[] | undefined>;
  bonuses: TtlCache<BonusOffer[]>;
  bonusPeriods: TtlCache<BonusPeriod[]>;
  /** Keyed by access token, so another login never sees a cached profile. */
  members: TtlCache<Member>;
}

export function newToolContext(session: Session, remote: boolean): ToolContext {
  return {
    session,
    remote,
    searches: new TtlCache(5 * 60_000),
    products: new TtlCache(10 * 60_000),
    nutrition: new TtlCache(60 * 60_000),
    bonuses: new TtlCache(10 * 60_000),
    bonusPeriods: new TtlCache(10 * 60_000),
    members: new TtlCache(30 * 60_000),
  };
}

/** Side effects; clients use them to decide which calls need confirmation. */
type ToolKind = "readOnly" | "additive" | "destructive";

function annotations(title: string, kind: ToolKind): ToolAnnotations {
  switch (kind) {
    case "readOnly":
      return { title, readOnlyHint: true };
    case "additive":
      return { title, readOnlyHint: false, destructiveHint: false };
    case "destructive":
      return { title, readOnlyHint: false, destructiveHint: true };
  }
}

interface ToolDef<Shape extends z.ZodRawShape> {
  name: string;
  title: string;
  kind: ToolKind;
  description: string;
  input?: Shape;
  /** Shape of the structured result of a successful call; clients get it as outputSchema. */
  output?: z.ZodRawShape;
}

type Args<Shape extends z.ZodRawShape> = z.infer<z.ZodObject<Shape>>;

export function text(value: string): CallToolResult {
  return { content: [{ type: "text", text: value }] };
}

/** A result with structured data, also sent as JSON text for clients without structured output; message replaces the text. */
export function structured(data: Record<string, unknown>, message?: string): CallToolResult {
  // AH sends null for some missing values; as "absent" they fit the optional fields of the output schemas.
  const json = JSON.stringify(data, (_key, value: unknown) => (value === null ? undefined : value), 2);
  return { content: [{ type: "text", text: message ?? json }], structuredContent: JSON.parse(json) as Record<string, unknown> };
}

function errorResult(err: unknown): CallToolResult {
  return { content: [{ type: "text", text: err instanceof Error ? err.message : String(err) }], isError: true };
}

/** Registers a tool. Thrown errors become error results; every call is logged. */
export function addTool<Shape extends z.ZodRawShape>(
  server: McpServer,
  def: ToolDef<Shape>,
  handler: (args: Args<Shape>) => Promise<CallToolResult>,
): void {
  const callback = async (args: Args<Shape>): Promise<CallToolResult> => {
    const start = Date.now();
    try {
      const result = await handler(args);
      log.info("tool call", { tool: def.name, duration_ms: Date.now() - start });
      return result;
    } catch (err) {
      log.warn("tool call returned error", { tool: def.name, duration_ms: Date.now() - start, err });
      return errorResult(err);
    }
  };
  server.registerTool(
    def.name,
    {
      title: def.title,
      description: def.description,
      inputSchema: def.input ?? ({} as Shape),
      outputSchema: def.output,
      annotations: annotations(def.title, def.kind),
    },
    // Typed via Args<Shape> above; the SDK's generic callback type doesn't infer here.
    callback as never,
  );
}

const NOT_AUTHENTICATED = JSON.stringify({
  error: "not_authenticated",
  message: "Not logged in. Call ah_login first.",
});

/** Registers a tool that needs a login. On a 401, refreshes the token and retries once. */
export function addAuthedTool<Shape extends z.ZodRawShape>(
  server: McpServer,
  ctx: ToolContext,
  def: ToolDef<Shape>,
  handler: (c: AhClient, args: Args<Shape>) => Promise<CallToolResult>,
): void {
  addTool(server, def, async (args) => {
    try {
      const c = await ctx.session.client();
      try {
        return await handler(c, args);
      } catch (err) {
        if (!isUnauthorized(err) || !c.token) throw err;
        return await handler(await ctx.session.refreshAfterRejection(c.token), args);
      }
    } catch (err) {
      throw err instanceof NotLoggedInError ? new Error(NOT_AUTHENTICATED) : err;
    }
  });
}

/** Reports whether err, or any error in its cause chain, is an HTTP 401 from AH. */
export function isUnauthorized(err: unknown): boolean {
  for (let e = err; e instanceof Error; e = e.cause) {
    if (hasStatus(e, 401)) return true;
  }
  return false;
}

export { wrapError } from "../ahapi/index.ts";

/** Runs fn; a non-401 error goes to onError. 401s propagate so addAuthedTool can refresh the token. */
export async function nonFatal<T>(fn: () => Promise<T>, onError: (err: unknown) => T): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (isUnauthorized(err)) throw err;
    return onError(err);
  }
}

/** The logged-in member's profile, cached. */
export function cachedMember(ctx: ToolContext, c: AhClient): Promise<Member> {
  return ctx.members.getOrLoad(c.token ?? "", () => getMember(c));
}

/** v if positive, else def. */
export function orDefault(v: number | undefined, def: number): number {
  return v && v > 0 ? v : def;
}

/** Runs fn(0..n-1) with at most limit in flight. */
export async function parallel(n: number, limit: number, fn: (i: number) => Promise<void>): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < n) await fn(next++);
  };
  await Promise.all(Array.from({ length: Math.min(limit, n) }, worker));
}

const amsterdam = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Europe/Amsterdam",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

/** ISO 8601 → "YYYY-MM-DD[ HH:MM]" in Dutch time; returns s unchanged if unparsable. */
export function formatDate(s: string | undefined, withTime: boolean): string {
  if (!s) return "";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  const formatted = amsterdam.format(d); // "YYYY-MM-DD HH:MM"
  return withTime ? formatted : formatted.slice(0, 10);
}

/** ISO 8601 → "HH:MM" in Dutch time. */
export function formatTime(s: string): string {
  return formatDate(s, true).slice(11);
}

/** Up to 3 attempts on rate limiting (429), waiting 1 s then 2 s. */
export async function withRetry<T>(tool: string, fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === 2 || !isRateLimited(err)) throw err;
      const waitMs = 1000 * 2 ** attempt;
      log.warn("rate limited by AH, retrying", { tool, wait_ms: waitMs, attempt: attempt + 1 });
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
}

function isRateLimited(err: unknown): boolean {
  if (hasStatus(err, 429)) return true;
  const msg = err instanceof Error ? err.message.toLowerCase() : "";
  return msg.includes("rate limit") || msg.includes("too many requests");
}
