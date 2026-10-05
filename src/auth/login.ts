/** code=... in a pasted URL or console line. */
const CODE_PARAM = /[?&]code=([A-Za-z0-9._~-]+)/;
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
