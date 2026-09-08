import "server-only";

import { createHash, randomBytes, randomUUID } from "node:crypto";
import { type AccountConfig, readAccount, replaceAccount } from "./config";
import { ApiError, jsonBody, parseInput, publicApi } from "./http";
import { accountInputSchema, passwordSchema, usernameSchema } from "./schemas";

const COOKIE_NAME = "arrsenal-session";
const SESSION_SECONDS = 7 * 24 * 60 * 60;
const MAX_SESSIONS = 128;
const MAX_HASHES = 2;
const ATTEMPT_CAPACITY = 10;
const ATTEMPT_REFILL_MS = 6000;
const INVALID_CREDENTIALS = "Invalid username or password.";

type Session = { account: string; expires: number };
type AuthState = {
  sessions: Map<string, Session>;
  activeHashes: number;
  attempts: number;
  refilledAt: number;
};
const processState = globalThis as typeof globalThis & {
  __arrsenalAuth?: AuthState;
};
processState.__arrsenalAuth ??= {
  sessions: new Map(),
  activeHashes: 0,
  attempts: ATTEMPT_CAPACITY,
  refilledAt: Date.now(),
};
const state = processState.__arrsenalAuth;

function accountIdentity(account: AccountConfig): string {
  return createHash("sha256")
    .update(
      JSON.stringify([
        account.generation,
        account.username,
        account.passwordHash,
      ]),
    )
    .digest("hex");
}

function sessionDigest(cookieHeader: string | null): string | undefined {
  if (!cookieHeader || cookieHeader.length > 16384) return undefined;
  let token: string | undefined;
  for (const cookie of cookieHeader.split(";")) {
    const separator = cookie.indexOf("=");
    if (cookie.slice(0, separator).trim() !== COOKIE_NAME) continue;
    if (token !== undefined) return undefined;
    token = cookie.slice(separator + 1).trim();
  }
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return undefined;
  return createHash("sha256").update(token).digest("hex");
}

function hasSession(
  cookieHeader: string | null,
  account: AccountConfig,
): boolean {
  const identity = accountIdentity(account);
  const now = Date.now();
  for (const [digest, session] of state.sessions) {
    if (session.expires <= now) {
      state.sessions.delete(digest);
    }
  }
  const digest = sessionDigest(cookieHeader);
  return (
    digest !== undefined && state.sessions.get(digest)?.account === identity
  );
}

export async function authorize(cookieHeader: string | null): Promise<boolean> {
  const account = await readAccount();
  if (!account) return true;
  return hasSession(cookieHeader, account);
}

export async function authStatus(
  cookieHeader: string | null,
): Promise<{ enabled: boolean; username?: string }> {
  const account = await readAccount();
  if (!account) return { enabled: false };
  if (!hasSession(cookieHeader, account)) {
    throw new ApiError(401, "Sign in to continue.");
  }
  return { enabled: true, username: account.username };
}

// One process-wide budget cannot be bypassed by rotating usernames or spoofing
// forwarded IP headers. It intentionally also limits current-password guesses.
function consumeAttempt(): void {
  const now = Date.now();
  state.attempts = Math.min(
    ATTEMPT_CAPACITY,
    state.attempts + Math.max(0, now - state.refilledAt) / ATTEMPT_REFILL_MS,
  );
  state.refilledAt = now;
  if (state.attempts < 1) {
    throw new ApiError(
      429,
      "Too many authentication attempts. Try again later.",
    );
  }
  state.attempts -= 1;
}

async function passwordWork<T>(work: () => Promise<T>): Promise<T> {
  // Do not queue expensive work: both active memory use and queued requests
  // must remain bounded under an unauthenticated flood.
  if (state.activeHashes >= MAX_HASHES) {
    throw new ApiError(429, "Authentication is busy. Try again later.");
  }
  state.activeHashes += 1;
  try {
    return await work();
  } finally {
    state.activeHashes -= 1;
  }
}

async function verifyCurrentPassword(
  account: AccountConfig,
  cookieHeader: string | null,
  password: unknown,
): Promise<void> {
  if (!hasSession(cookieHeader, account)) {
    throw new ApiError(401, "Sign in to continue.");
  }
  consumeAttempt();
  const parsed = passwordSchema.safeParse(password);
  if (
    !parsed.success ||
    !(await passwordWork(() =>
      Bun.password.verify(parsed.data, account.passwordHash),
    ))
  ) {
    throw new ApiError(401, INVALID_CREDENTIALS);
  }
  if (!hasSession(cookieHeader, account)) {
    throw new ApiError(401, "Sign in to continue.");
  }
}

function issueSession(account: AccountConfig): string {
  const identity = accountIdentity(account);
  const now = Date.now();
  for (const [digest, session] of state.sessions) {
    if (session.expires <= now) {
      state.sessions.delete(digest);
    }
  }
  while (state.sessions.size >= MAX_SESSIONS) {
    const oldest = state.sessions.keys().next().value;
    if (oldest !== undefined) state.sessions.delete(oldest);
  }
  const token = randomBytes(32).toString("base64url");
  state.sessions.set(createHash("sha256").update(token).digest("hex"), {
    account: identity,
    expires: now + SESSION_SECONDS * 1000,
  });
  return token;
}

function cookieResponse(
  request: Request,
  body: unknown,
  token?: string,
): Response {
  // Use the request's public protocol; HTTP remains supported on trusted LANs.
  const secure = new URL(request.url).protocol === "https:";
  return Response.json(body, {
    headers: {
      "Set-Cookie": `${COOKIE_NAME}=${token ?? ""}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${token ? SESSION_SECONDS : 0}${secure ? "; Secure" : ""}`,
    },
  });
}

export async function authApi(
  action: () => Promise<unknown>,
): Promise<Response> {
  const response = await publicApi(action);
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Vary", "Cookie");
  response.headers.set("X-Content-Type-Options", "nosniff");
  return response;
}

export async function login(request: Request): Promise<Response> {
  const body = await jsonBody(request);
  consumeAttempt();
  const account = await readAccount();
  if (!account) throw new ApiError(409, "Authentication is not enabled.");
  const username = usernameSchema.safeParse(body.username);
  const password = passwordSchema.safeParse(body.password);
  if (!username.success || !password.success) {
    throw new ApiError(401, INVALID_CREDENTIALS);
  }
  // Verify even an unknown username against the same hash, so the error and
  // expensive path are indistinguishable from an incorrect password.
  const valid = await passwordWork(() =>
    Bun.password.verify(password.data, account.passwordHash),
  );
  if (!valid || username.data !== account.username) {
    throw new ApiError(401, INVALID_CREDENTIALS);
  }
  const current = await readAccount();
  if (!current || accountIdentity(current) !== accountIdentity(account)) {
    throw new ApiError(401, INVALID_CREDENTIALS);
  }
  return cookieResponse(
    request,
    { enabled: true, username: account.username },
    issueSession(account),
  );
}

export async function saveAccount(request: Request): Promise<Response> {
  const body = await jsonBody(request);
  const expected = await readAccount();
  const cookieHeader = request.headers.get("cookie");
  if (expected)
    await verifyCurrentPassword(expected, cookieHeader, body.currentPassword);
  else consumeAttempt();
  const input = parseInput(accountInputSchema, body);
  const passwordHash = await passwordWork(() =>
    Bun.password.hash(input.password, {
      algorithm: "argon2id",
      memoryCost: 65536,
      timeCost: 3,
    }),
  );
  if (expected && !hasSession(cookieHeader, expected)) {
    throw new ApiError(401, "Sign in to continue.");
  }
  const account: AccountConfig = {
    username: input.username,
    passwordHash,
    generation: randomUUID(),
  };
  await replaceAccount(expected, account);
  state.sessions.clear();
  return cookieResponse(
    request,
    { enabled: true, username: account.username },
    issueSession(account),
  );
}

export async function disableAccount(request: Request): Promise<Response> {
  const body = await jsonBody(request);
  const expected = await readAccount();
  if (!expected) throw new ApiError(409, "Authentication is not enabled.");
  await verifyCurrentPassword(
    expected,
    request.headers.get("cookie"),
    body.currentPassword,
  );
  await replaceAccount(expected, undefined);
  state.sessions.clear();
  return cookieResponse(request, { enabled: false });
}

export async function logout(request: Request): Promise<Response> {
  await jsonBody(request);
  if (!(await authorize(request.headers.get("cookie")))) {
    throw new ApiError(401, "Sign in to continue.");
  }
  const digest = sessionDigest(request.headers.get("cookie"));
  if (digest) state.sessions.delete(digest);
  return cookieResponse(request, { ok: true });
}
