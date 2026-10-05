// Client for the AH mobile app API (REST under /mobile-services, plus GraphQL).

// The API expects the official iOS app. If AH starts rejecting requests,
// update the version and user agent to the current app release first.
export const CLIENT_NAME = "appie-ios";
const CLIENT_VERSION = "9.28";
const USER_AGENT = "Appie/9.28 (iPhone17,3; iPhone; CPU OS 26_1 like Mac OS X)";
const BASE_URL = "https://api.ah.nl";
const TIMEOUT_MS = 30_000;

/** A non-2xx API response. */
export class AhApiError extends Error {
  readonly status: number;

  /** body usually explains the error. */
  constructor(status: number, body: string) {
    super(`AH API error ${status}: ${body}`);
    this.name = "AhApiError";
    this.status = status;
  }
}

/** Reports whether err is an AhApiError with this HTTP status. */
export function hasStatus(err: unknown, status: number): boolean {
  return err instanceof AhApiError && err.status === status;
}

/** Wraps err with context, keeping it as the cause so its HTTP status stays visible. */
export function wrapError(message: string, err: unknown): Error {
  return new Error(`${message}: ${err instanceof Error ? err.message : String(err)}`, { cause: err });
}

/** The errors array of a GraphQL response. */
export class GraphQLError extends Error {
  constructor(messages: string[]) {
    super(`AH GraphQL error: ${messages.join("; ")}`);
    this.name = "GraphQLError";
  }
}

export interface RequestOptions {
  method?: string;
  body?: unknown;
  /** Sent as Appie-Current-Order-Id; required by order writes. */
  orderId?: number;
}

export class AhClient {
  /** Access token sent as a Bearer token with every request, if any. */
  readonly token: string | undefined;

  constructor(token?: string) {
    this.token = token;
  }

  /** Sends a REST request; returns the parsed JSON body, or undefined if empty. */
  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const headers: Record<string, string> = {
      "User-Agent": USER_AGENT,
      "x-client-name": CLIENT_NAME,
      "x-client-version": CLIENT_VERSION,
      "x-application": "AHWEBSHOP",
      Accept: "application/json",
    };
    if (options.body !== undefined) headers["Content-Type"] = "application/json";
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    if (options.orderId) headers["Appie-Current-Order-Id"] = String(options.orderId);

    const res = await fetch(BASE_URL + path, {
      method: options.method ?? "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const text = await res.text();
    if (!res.ok) throw new AhApiError(res.status, text.trim());
    return (text ? JSON.parse(text) : undefined) as T;
  }

  /** Runs a GraphQL operation; returns its data or throws GraphQLError. */
  async graphql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
    const res = await this.request<{ data?: T; errors?: { message: string }[] }>("/graphql", {
      method: "POST",
      body: { query, variables: variables ?? {} },
    });
    if (res.errors?.length) throw new GraphQLError(res.errors.map((e) => e.message));
    return res.data as T;
  }
}

/** Result object of AH GraphQL mutations. */
export interface MutationResult {
  status: string;
  errorMessage?: string | null;
}

/** Throws unless status is SUCCESS. */
export function checkMutation(result: MutationResult | undefined): void {
  if (result?.status !== "SUCCESS") {
    throw new Error(`mutation failed (${result?.status ?? "no result"}): ${result?.errorMessage ?? ""}`);
  }
}
