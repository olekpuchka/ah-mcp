import { LOGIN_URL } from "../ahapi/index.ts";

/** code=... in the pasted appie://login-exit link or the console line quoting it; links elsewhere don't count. */
const CODE_PARAM = /appie:\/\/login-exit\?(?:[^\s'"]*&)?code=([A-Za-z0-9._~-]+)/;
/** A bare code. */
const BARE_CODE = /^[A-Za-z0-9._~-]{8,}$/;

/** The login code in an appie://login-exit link anywhere in text, if there is one. */
export function findCode(text: string): string | undefined {
  return CODE_PARAM.exec(text)?.[1];
}

/** Extracts the login code from the pasted redirect link, console line, or bare code. */
export function extractCode(input: string): string {
  const trimmed = input.trim();
  const code = findCode(trimmed);
  if (code) return code;
  if (BARE_CODE.test(trimmed)) return trimmed;
  throw new Error("no login code found: paste the appie://login-exit?code=... link or the code itself");
}

/** The steps for logging in by copying the code by hand; paste says where step 3 pastes it. */
export function manualLoginSteps(opened: boolean, paste: string): string {
  return `1. Open this link${opened ? " (it should have opened in your browser)" : ""} and log in:
   ${LOGIN_URL}
2. After logging in, the page stays put: the browser cannot open the AH app link it redirects to.
   Open the developer console (Chrome: Cmd+Option+J on Mac, Ctrl+Shift+J on Windows/Linux)
   and copy the link from the "Failed to launch 'appie://login-exit?code=...'" message.
3. Paste that link ${paste}. The code is single-use and expires quickly, so do this right away.`;
}
