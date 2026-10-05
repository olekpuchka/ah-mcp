/** code=... in the pasted appie://login-exit link or the console line quoting it; links elsewhere don't count. */
const CODE_PARAM = /appie:\/\/login-exit\?(?:[^\s'"]*&)?code=([A-Za-z0-9._~-]+)/;
/** A bare code. */
const BARE_CODE = /^[A-Za-z0-9._~-]{8,}$/;

/** Extracts the login code from the pasted redirect link, console line, or bare code. */
export function extractCode(input: string): string {
  const trimmed = input.trim();
  const match = CODE_PARAM.exec(trimmed);
  if (match?.[1]) return match[1];
  if (BARE_CODE.test(trimmed)) return trimmed;
  throw new Error("no login code found: paste the appie://login-exit?code=... link or the code itself");
}
