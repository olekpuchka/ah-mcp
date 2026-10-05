import { spawn } from "node:child_process";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getMember, LOGIN_URL, type Member } from "../ahapi/index.ts";
import { extractCode } from "../auth/login.ts";
import { SessionExpiredError } from "../auth/session.ts";
import { addAuthedTool, addTool, isUnauthorized, json, text, type ToolContext } from "./common.ts";

export function registerAccountTools(server: McpServer, ctx: ToolContext): void {
  addTool(
    server,
    {
      name: "ah_login",
      title: "Albert Heijn: Log In",
      kind: "additive",
      description:
        "Log in to Albert Heijn in two steps. " +
        "1) Call without arguments: returns the AH login link and instructions to show the user. " +
        "2) After the user logs in, the browser shows a link like appie://login-exit?code=...; " +
        "call ah_login again with code set to that link (or just the code) to finish. " +
        "Codes are single-use and expire quickly. " +
        "If already logged in, returns the account name.",
      input: {
        code: z
          .string()
          .optional()
          .describe(
            "The appie://login-exit?code=... link the user copied after logging in, or just the code. Omit to start a login.",
          ),
      },
    },
    async ({ code }) => {
      if (code) {
        await ctx.session.completeLogin(extractCode(code));
        const name = await memberName(ctx);
        return text(name ? `Login successful! Connected as ${name}.` : "Login successful!");
      }
      // A stored session that AH no longer accepts (e.g. a revoked refresh token) gets a new login.
      let stale = false;
      if (await ctx.session.isAuthenticated()) {
        try {
          return text(`Already connected as ${fullName(await currentMember(ctx))}.`);
        } catch (err) {
          if (!(err instanceof SessionExpiredError)) {
            return text(`Already logged in (could not fetch member name: ${(err as Error).message}).`);
          }
          stale = true;
        }
      }
      if (!ctx.remote) openBrowser(LOGIN_URL);
      return text(`${stale ? "The stored login no longer works, so log in again.\n\n" : ""}To log in to Albert Heijn:

1. Open this link${ctx.remote ? "" : " (it should have opened in your browser)"} and log in:
   ${LOGIN_URL}
2. After logging in, the page stays put: the browser cannot open the AH app link it redirects to.
   Open the developer console (Chrome: Cmd+Option+J on Mac, Ctrl+Shift+J on Windows/Linux)
   and copy the link from the "Failed to launch 'appie://login-exit?code=...'" message.
3. Paste that link here. The code is single-use and expires quickly, so do this right away.`);
    },
  );

  addTool(
    server,
    {
      name: "ah_logout",
      title: "Albert Heijn: Log Out",
      kind: "destructive",
      description:
        "Log out of Albert Heijn by deleting the stored tokens. " +
        "Use this to switch accounts or reset a broken session. " +
        "After logout, call ah_login to authenticate again.",
    },
    async () =>
      (await ctx.session.logout())
        ? text("Logged out. Call ah_login to authenticate again.")
        : text("Already logged out (no active session)."),
  );

  addAuthedTool(
    server,
    ctx,
    {
      name: "ah_get_member_profile",
      title: "Albert Heijn: Member Profile",
      kind: "readOnly",
      description:
        "Get your Albert Heijn member profile. " +
        "Returns name, email, date_of_birth, and bonus_card_number (last 4 digits only).",
    },
    async (c) => {
      const m = await getMember(c);
      const card = m.bonusCardNumber;
      return json({
        name: fullName(m),
        email: m.email,
        bonus_card_number: card ? (card.length > 4 ? `****${card.slice(-4)}` : card) : undefined,
        date_of_birth: m.dateOfBirth || undefined,
      });
    },
  );
}

function fullName(m: Member): string {
  return `${m.firstName} ${m.lastName}`.trim();
}

/** The logged-in member; on a 401, refreshes the token and retries once. */
async function currentMember(ctx: ToolContext): Promise<Member> {
  const c = await ctx.session.client();
  try {
    return await getMember(c);
  } catch (err) {
    if (!isUnauthorized(err) || !c.token) throw err;
    return getMember(await ctx.session.refreshAfterRejection(c.token));
  }
}

/** Member name, or "" on failure. */
async function memberName(ctx: ToolContext): Promise<string> {
  try {
    return fullName(await currentMember(ctx));
  } catch {
    return "";
  }
}

/** Opens url in the default browser; failures are ignored (the link is also returned). */
function openBrowser(url: string): void {
  const [cmd, args] =
    process.platform === "darwin"
      ? ["open", [url]]
      : process.platform === "win32"
        ? ["rundll32", ["url.dll,FileProtocolHandler", url]]
        : ["xdg-open", [url]];
  try {
    spawn(cmd, args, { stdio: "ignore", detached: true }).on("error", () => {}).unref();
  } catch {
    // Ignored.
  }
}
