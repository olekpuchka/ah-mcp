import { rm } from "node:fs/promises";
import { AhClient, ContextError, exchangeCode, hasStatus, refreshToken, wrapError } from "../ahapi/index.ts";
import type { LogSafe } from "../log.ts";
import { loadTokens, saveTokens, type TokenFile, toTokenFile, withFileLock } from "./tokens.ts";

/** Refresh this long before the access token expires. */
const REFRESH_MARGIN_MS = 60_000;

/** No tokens are stored. */
export class NotLoggedInError extends Error implements LogSafe {
  constructor() {
    super("not logged in");
    this.name = "NotLoggedInError";
  }

  logText(): string {
    return this.message;
  }
}

/** AH rejected the stored refresh token (expired or revoked): the user must log in again. */
export class SessionExpiredError extends ContextError {
  constructor(cause: unknown) {
    super("token refresh failed; log in again", cause);
    this.name = "SessionExpiredError";
  }
}

function expiresSoon(tf: TokenFile): boolean {
  // No refresh if AH sent no lifetime: NaN compares false.
  return Date.parse(tf.expires_at ?? "") - Date.now() < REFRESH_MARGIN_MS;
}

/**
 * Login session: stored tokens and API clients built from them.
 *
 * Token writes are serialised, within this process and across all processes
 * sharing the tokens file: refresh tokens rotate, so parallel refreshes would
 * race, and a pending refresh must not undo a logout or login.
 * Tokens are re-read on every call to pick up refreshes by other processes.
 */
export class Session {
  readonly tokensPath: string;
  #lock: Promise<unknown> = Promise.resolve();

  constructor(tokensPath: string) {
    this.tokensPath = tokensPath;
  }

  #withLock<T>(fn: () => Promise<T>): Promise<T> {
    const locked = () => withFileLock(this.tokensPath, fn);
    const run = this.#lock.then(locked, locked);
    this.#lock = run.catch(() => {});
    return run;
  }

  /** Reports whether a refresh token is stored. */
  async isAuthenticated(): Promise<boolean> {
    try {
      return Boolean((await loadTokens(this.tokensPath))?.refresh_token);
    } catch {
      return false;
    }
  }

  /** Returns an authenticated client, refreshing the token first if it expires soon. */
  async client(): Promise<AhClient> {
    // Lock only to refresh: another process may have refreshed meanwhile, so re-check.
    const tf = await this.#requireTokens();
    if (!expiresSoon(tf)) return new AhClient(tf.access_token);
    return this.#withLock(async () => {
      let fresh = await this.#requireTokens();
      if (expiresSoon(fresh)) fresh = await this.#refresh(fresh);
      return new AhClient(fresh.access_token);
    });
  }

  /** After AH rejected staleAccessToken: refreshes (unless already replaced) and returns a new client. */
  refreshAfterRejection(staleAccessToken: string): Promise<AhClient> {
    return this.#withLock(async () => {
      let tf = await this.#requireTokens();
      if (tf.access_token === staleAccessToken) tf = await this.#refresh(tf);
      return new AhClient(tf.access_token);
    });
  }

  async #requireTokens(): Promise<TokenFile> {
    const tf = await loadTokens(this.tokensPath);
    if (!tf?.refresh_token) throw new NotLoggedInError();
    return tf;
  }

  async #refresh(tf: TokenFile): Promise<TokenFile> {
    let tok;
    try {
      tok = await refreshToken(new AhClient(), tf.refresh_token);
    } catch (err) {
      // 400/401 mean the refresh token is no good; anything else may be temporary.
      throw hasStatus(err, 400) || hasStatus(err, 401) ? new SessionExpiredError(err) : wrapError("token refresh failed", err);
    }
    const next = toTokenFile(tok);
    await saveTokens(this.tokensPath, next);
    return next;
  }

  /** Exchanges a login code for tokens and saves them. */
  completeLogin(code: string): Promise<void> {
    return this.#withLock(async () => {
      let tok;
      try {
        tok = await exchangeCode(new AhClient(), code);
      } catch (err) {
        throw wrapError("exchange code (codes are single-use and expire quickly; log in again for a new one)", err);
      }
      await saveTokens(this.tokensPath, toTokenFile(tok));
    });
  }

  /** Deletes the tokens file, even if corrupt. Returns whether it existed. */
  logout(): Promise<boolean> {
    return this.#withLock(async () => {
      try {
        await rm(this.tokensPath);
        return true;
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") return false;
        throw wrapError("remove tokens", err);
      }
    });
  }
}
