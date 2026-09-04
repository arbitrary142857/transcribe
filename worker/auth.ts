/**
 * Sign-in, and the session that remembers it.
 *
 * Two systems share this file because neither is anything without the other.
 * The OAuth dance with Google proves who the visitor is, once; the session
 * cookie is what carries that proof to every request after. Google is spoken
 * to twice in the whole affair: the visitor is sent to Google's consent page,
 * and the code they come back with is traded for an ID token in one
 * server-to-server call.
 *
 * That call is why there is no JWKS fetching and no signature checking here.
 * The ID token arrives straight from Google over TLS, authenticated by the
 * client secret, so its signature proves nothing the connection has not
 * already proved — Google's own guidance says so. What still gets checked is
 * what the connection cannot promise: that the token names this application
 * (`aud`), came from Google (`iss`), has not expired (`exp`), and carries an
 * email Google has actually confirmed (`email_verified`).
 *
 * Accounts are keyed on the `sub` claim and never on the email. An email is a
 * fact about a person that a person can change; `sub` is the one identifier
 * Google promises is permanent. The email is stored anyway — refreshed at
 * each sign-in — so a human reading the users table can tell who is who.
 *
 * Kept free of any Workers type, like routes.ts: Google's token endpoint is
 * reached through a function handed in from the entry, so the tests can stand
 * in for Google exactly as they stand in for D1.
 */

import type { Context } from "hono";
import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { newId } from "../src/shared/id.js";
import { mintNames, randomBelow } from "../src/shared/names.js";
import {
  cleanUsername,
  usernameProblem,
  type UserSummary,
} from "../src/shared/session.js";
import type { ApiEnv } from "./routes.js";

// ---- what Google is, as far as this file is concerned ---------------------

/**
 * The one request this file ever sends: the code-for-token exchange. Typed as
 * a shape rather than as `fetch` so the entry can hand in the real one and a
 * test can hand in a recording — the same reason `Database` names no D1 class.
 */
export type TokenFetch = (
  url: string,
  init: { method: "POST"; headers: Record<string, string>; body: string },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

/** The credentials from the Google Cloud console, and the way to Google. */
export type GoogleSignIn = {
  clientId: string;
  clientSecret: string;
  fetch: TokenFetch;
};

/**
 * The environment's Google credentials, if it has any.
 *
 * Nothing, rather than a half-configured object, when either credential is
 * absent or empty — which is the state of a fresh clone without .dev.vars,
 * and of the deployed Worker before the secret is put. The routes answer that
 * state with a sentence instead of sending anybody to Google with a blank
 * client id.
 */
export function googleSignInOf(
  clientId: string | undefined,
  clientSecret: string | undefined,
  fetch: TokenFetch,
): GoogleSignIn | undefined {
  return clientId && clientSecret
    ? { clientId, clientSecret, fetch }
    : undefined;
}

// ---- the shape of the dance ------------------------------------------------

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

/** The cookie a browser holds between requests. Its value is the raw token. */
const SESSION_COOKIE = "session";

/**
 * The cookie that lasts from pressing "sign in" to landing back here, holding
 * `state.verifier.return` -- the last being where on this site to go once it
 * is over, base64url so it can hold a `/` and a `?` without the dots that
 * separate the three meaning anything. Scoped to /api/auth because nothing
 * else ever reads it, and short-lived because the round trip to Google takes
 * seconds, not days.
 */
const FLIGHT_COOKIE = "signin";
const FLIGHT_PATH = "/api/auth";
const FLIGHT_TTL_SECONDS = 10 * 60;

/**
 * Where a return path is measured against. A made-up origin, so that a path
 * which resolves to anywhere else -- a scheme, a `//host`, a `/\host` the
 * URL parser reads as one -- stands out by not resolving to this.
 */
const RETURN_BASE = "https://return.invalid";

/** Longer than any page address here, and well inside what a cookie holds. */
const RETURN_PATH_MAX = 512;

/**
 * Thirty days, slid forward whenever a session's second half is reached — so
 * a visitor who keeps visiting is never signed out, and one who stops is,
 * within a month. Milliseconds, like every other timestamp in the database.
 */
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const RENEW_BELOW_MS = SESSION_TTL_MS / 2;

const NOT_SET_UP = "Sign-in is not set up on this server.";

/** One sentence for every way a callback can be malformed. Which check failed
 * is a detail for nobody: the visitor's remedy is the same, and a probe is
 * owed no map of the checks. */
const TRY_AGAIN = "That sign-in could not be finished. Try again.";

export const auth = new Hono<{ Bindings: ApiEnv }>();

/**
 * Where to send the visitor after sign-in: the page they asked for, if it is
 * one of ours, and home otherwise.
 *
 * This becomes a Location header, which is the shape an open redirect takes,
 * so it is held to being a path on this site and nothing else. The test is
 * to resolve it against an origin of our own choosing and see whether it
 * stayed there: a scheme, a `//host`, and the `/\host` the WHATWG parser reads
 * as a host all resolve elsewhere. Nothing under /api is a page, and letting
 * `/api/auth/google` through would send a freshly signed-in visitor round
 * again. Run on the way in and again on the way out, because on the way out
 * it is read from a cookie, and a cookie is the browser's to send.
 */
export function returnPathOf(next: unknown): string {
  if (typeof next !== "string" || next.length > RETURN_PATH_MAX) {
    return "/";
  }
  if (!next.startsWith("/") || next.startsWith("//")) {
    return "/";
  }

  let url: URL;
  try {
    url = new URL(next, RETURN_BASE);
  } catch {
    return "/";
  }
  if (url.origin !== RETURN_BASE) {
    return "/";
  }
  if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
    return "/";
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

// ---- starting: send the visitor to Google ----------------------------------

auth.get("/api/auth/google", async (c) => {
  const google = c.env.google;
  if (google === undefined) {
    return c.json({ error: NOT_SET_UP }, 503);
  }

  // `state` is an unguessable name for this one attempt: Google hands it back
  // untouched, and a callback bearing the wrong one was started by somebody
  // else (a forged link, a replay) and is refused. The PKCE verifier rides
  // beside it; only its hash travels to Google, so a snooped redirect learns
  // nothing that redeems the code it carries.
  const state = randomToken();
  const verifier = randomToken();
  const challenge = toBase64Url(await sha256(verifier));

  // Where to land afterwards rides in the cookie too, never in anything sent
  // to Google: the redirect_uri is matched exactly against the console's
  // list, and a path tacked onto it would match nothing.
  const back = toBase64Url(
    new TextEncoder().encode(returnPathOf(c.req.query("next"))),
  );

  const { origin, protocol } = new URL(c.req.url);
  setCookie(c, FLIGHT_COOKIE, `${state}.${verifier}.${back}`, {
    path: FLIGHT_PATH,
    httpOnly: true,
    sameSite: "Lax",
    // Not over plain http, where dev serves from localhost and Secure cookies
    // would be dropped — and sign-in would quietly never finish.
    secure: protocol === "https:",
    maxAge: FLIGHT_TTL_SECONDS,
  });

  // The return address is derived from where this request arrived rather than
  // configured, so localhost, workers.dev and the custom domain all work
  // untouched — provided each is on the Google console's allowed list.
  const ask = new URL(AUTH_URL);
  ask.searchParams.set("client_id", google.clientId);
  ask.searchParams.set("redirect_uri", `${origin}/api/auth/callback`);
  ask.searchParams.set("response_type", "code");
  // Two scopes, not the usual three. `openid` is what makes this an OpenID
  // Connect request at all and is where `sub` comes from; `email` carries the
  // address and `email_verified`. `profile` — the name, the picture, the
  // locale — is deliberately not asked for: nothing here reads any of it, the
  // username is minted rather than borrowed from Google, and a scope that is
  // never used is a line on the consent screen asking for something this site
  // has no business seeing.
  ask.searchParams.set("scope", "openid email");
  ask.searchParams.set("state", state);
  ask.searchParams.set("code_challenge", challenge);
  ask.searchParams.set("code_challenge_method", "S256");
  // Signing out here does not sign anybody out of Google, so without this a
  // visitor who signed out would be sent straight back in as whoever they
  // were: one Google account, one consent already given, no question asked.
  // This asks the question every time, which costs a click and is honest.
  ask.searchParams.set("prompt", "select_account");
  return c.redirect(ask.toString());
});

// ---- finishing: the visitor lands back with a code ---------------------------

auth.get("/api/auth/callback", async (c) => {
  const google = c.env.google;
  if (google === undefined) {
    return c.json({ error: NOT_SET_UP }, 503);
  }

  const flight = getCookie(c, FLIGHT_COOKIE);
  // Spent either way: a flight cookie is for one attempt, however it ends.
  deleteCookie(c, FLIGHT_COOKIE, { path: FLIGHT_PATH });

  // A cookie set before there was a third part decodes to nothing, and
  // nothing is home. A cookie somebody wrote themselves is judged exactly as
  // the query was -- see returnPathOf.
  const [expected, verifier, encodedBack] = (flight ?? "").split(".");
  const back = returnPathOf(fromBase64Url(encodedBack));

  // The visitor pressed cancel at Google's screen. Nothing went wrong and
  // nobody needs a sentence about it; they go back to where they were.
  if (c.req.query("error") !== undefined) {
    return c.redirect(back);
  }

  const code = c.req.query("code");
  const state = c.req.query("state");
  if (!flight || !code || !state || !expected || !verifier || state !== expected) {
    return c.json({ error: TRY_AGAIN }, 400);
  }

  // The exchange. The secret leaves the server here and nowhere else.
  const answer = await google.fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: google.clientId,
      client_secret: google.clientSecret,
      redirect_uri: `${new URL(c.req.url).origin}/api/auth/callback`,
      grant_type: "authorization_code",
      code_verifier: verifier,
    }).toString(),
  });
  if (!answer.ok) {
    // Usually a stale or reused code. Google's own words stay in the logs'
    // domain; the visitor gets the remedy.
    return c.json({ error: TRY_AGAIN }, 400);
  }

  const tokens = await answer.json();
  const claims = readIdToken(
    isObject(tokens) ? tokens.id_token : undefined,
    google.clientId,
  );
  if (claims === undefined) {
    return c.json({ error: TRY_AGAIN }, 400);
  }

  // The account, found by subject or begun. The email is refreshed on the
  // way through because it is a copy of Google's current answer, not a name
  // this site owns. A name is minted for an account that has none -- a new
  // one, or one from before names were minted -- so that every account has
  // something for a byline to say (see `nameAccount`).
  const existing = (await c.env.DB.prepare(
    `SELECT id, username FROM users WHERE google_sub = ?`,
  )
    .bind(claims.sub)
    .first()) as { id: string; username: string | null } | null;

  let userId: string;
  if (existing === null) {
    userId = newId();
    const begin = async (username: string | null) => {
      await c.env.DB.prepare(
        `INSERT INTO users (id, google_sub, email, username, created_at) VALUES (?, ?, ?, ?, ?)`,
      )
        .bind(userId, claims.sub, claims.email, username, Date.now())
        .run();
    };
    // Every minted name refused is no reason to refuse the account: it is
    // begun unnamed, and named at the next sign-in.
    if (!(await withMintedName(begin))) {
      await begin(null);
    }
  } else {
    userId = existing.id;
    await c.env.DB.prepare(`UPDATE users SET email = ? WHERE id = ?`)
      .bind(claims.email, userId)
      .run();
    if (existing.username === null || existing.username === undefined) {
      await withMintedName(async (username) => {
        // `username IS NULL` so that a sign-in racing this one cannot name
        // the account twice; the second try finds nothing to do.
        await c.env.DB.prepare(
          `UPDATE users SET username = ? WHERE id = ? AND username IS NULL`,
        )
          .bind(username, userId)
          .run();
      });
    }
  }

  // The session: the browser keeps the token, the database keeps its hash.
  // Whoever reads the database — a backup, a breach, an admin's own eyes —
  // holds nothing a Cookie header would accept.
  const token = randomToken();
  const now = Date.now();
  await c.env.DB.prepare(
    `INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)`,
  )
    .bind(await sha256Hex(token), userId, now, now + SESSION_TTL_MS)
    .run();

  // Sessions that quietly lapsed are swept here, on the rare write path,
  // rather than by anything scheduled: every sign-in tidies the table a
  // little, and a table nobody signs into needs no tidying. The lookup
  // ignores expired rows regardless; this only keeps the table the size of
  // the truth.
  await c.env.DB.prepare(`DELETE FROM sessions WHERE expires_at < ?`)
    .bind(now)
    .run();

  setSessionCookie(c, token);
  return c.redirect(back);
});

// ---- every request after: who is asking --------------------------------------

/**
 * The signed-in user, or nobody.
 *
 * Called by any route that cares who is asking: /api/me, every route that
 * writes a level or reads its answer, and -- only once a row has turned out
 * to be a draft -- the two play routes. The expiry is part of the query rather
 * than checked afterwards, so an expired session is indistinguishable from no
 * session — including to this code.
 *
 * A session used past the middle of its life is quietly extended, which is
 * the write-on-read below: a visitor who keeps visiting stays signed in
 * without ever being asked again. Extended in both of the places thirty days
 * is written down — the row, and the cookie. The browser discards a cookie
 * when the Max-Age it was issued with runs out, however alive the row behind
 * it is, so a renewal that moved only the row would still sign the faithful
 * visitor out on day thirty; it would just do it more confusingly.
 */
export async function sessionUserOf(
  c: Context<{ Bindings: ApiEnv }>,
): Promise<UserSummary | undefined> {
  const token = getCookie(c, SESSION_COOKIE);
  if (token === undefined || token === "") {
    return undefined;
  }

  const hash = await sha256Hex(token);
  const now = Date.now();
  const row = (await c.env.DB.prepare(
    `SELECT users.id AS id, users.email AS email, users.username AS username,
            users.is_admin AS is_admin, users.chose_username AS chose_username,
            users.anonymous_author AS anonymous_author, users.share_stats AS share_stats,
            sessions.expires_at AS expires_at
       FROM sessions JOIN users ON users.id = sessions.user_id
      WHERE sessions.token_hash = ? AND sessions.expires_at > ?`,
  )
    .bind(hash, now)
    .first()) as
    | {
        id: string;
        email: string;
        username: string | null;
        is_admin: number;
        chose_username: number;
        anonymous_author: number;
        share_stats: number;
        expires_at: number;
      }
    | null;

  if (row === null) {
    return undefined;
  }

  if (row.expires_at - now < RENEW_BELOW_MS) {
    await c.env.DB.prepare(
      `UPDATE sessions SET expires_at = ? WHERE token_hash = ?`,
    )
      .bind(now + SESSION_TTL_MS, hash)
      .run();
    // The same token, freshly dated — see the note above.
    setSessionCookie(c, token);
  }

  // Field by field, never the row: the row knows the google_sub and the
  // expiry, and neither is the page's to know.
  return {
    id: row.id,
    email: row.email,
    username: row.username ?? undefined,
    isAdmin: row.is_admin === 1,
    choseUsername: row.chose_username === 1,
    anonymousAuthor: row.anonymous_author === 1,
    shareStats: row.share_stats === 1,
  };
}

// Works without Google configured: a session already issued answers to
// nobody's client id, only to the sessions table.
auth.get("/api/me", async (c) => {
  const user = await sessionUserOf(c);
  return c.json(user === undefined ? {} : { user });
});

auth.post("/api/auth/logout", async (c) => {
  const token = getCookie(c, SESSION_COOKIE);
  if (token !== undefined && token !== "") {
    // The row goes, not just the cookie: sign-out is a fact about the server,
    // or a copied token would outlive the button that promised otherwise.
    await c.env.DB.prepare(`DELETE FROM sessions WHERE token_hash = ?`)
      .bind(await sha256Hex(token))
      .run();
  }
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  return c.body(null, 204);
});

// ---- the account's own --------------------------------------------------------
//
// What the profile page does: check a name, change the name and the two
// settings, and delete the account. Each asks who is calling first and
// answers 401 before a body is read; nothing here is for nobody.

const SIGN_IN_FIRST = "Sign in to change your account.";

const NAME_TAKEN = "That username is taken.";

/** Room for a name and two yes-or-nos, and nothing like more. */
const MAX_ACCOUNT_BYTES = 4 * 1024;

/**
 * Whether the name is free, for the page to say so as the person types.
 *
 * The column is NOCASE, so `=` already compares the way the unique index
 * does; the account's own current name is left out of the question, since
 * keeping it is not taking it. Nothing is reserved by asking: the PATCH that
 * follows still meets the index, and a 409 there is the race.
 */
auth.get("/api/username", async (c) => {
  const user = await sessionUserOf(c);
  if (user === undefined) {
    return c.json({ error: SIGN_IN_FIRST }, 401);
  }

  const name = cleanUsername(c.req.query("name") ?? "");
  const problem = usernameProblem(name);
  if (problem !== undefined) {
    return c.json({ available: false, problem });
  }

  const holder = await c.env.DB.prepare(
    `SELECT id FROM users WHERE username = ? AND id <> ?`,
  )
    .bind(name, user.id)
    .first();
  return c.json({ available: holder === null });
});

/** The columns a PATCH may set, by the field that sets them. Spliced, so named here and nowhere else. */
const ACCOUNT_COLUMNS = {
  username: "username",
  choseUsername: "chose_username",
  anonymousAuthor: "anonymous_author",
  shareStats: "share_stats",
} as const;

/**
 * Change the name, or either setting.
 *
 * Each field given is one UPDATE, and they go as one batch. A name is held
 * to `usernameProblem` here as on the page, and a name the index refuses is
 * a 409 -- the one database error a route catches, because it is the one
 * that is somebody's doing rather than the server's. The answer is the user
 * as just written, assembled from the session's user and the values bound,
 * rather than read back: a second JOIN would cost a query and, past the
 * middle of the session's life, a cookie re-set, to learn what this already
 * knows.
 */
auth.patch("/api/me", async (c) => {
  const user = await sessionUserOf(c);
  if (user === undefined) {
    return c.json({ error: SIGN_IN_FIRST }, 401);
  }

  const text = await c.req.raw.text();
  if (text.length > MAX_ACCOUNT_BYTES) {
    return c.json({ error: "That is too much to change at once." }, 413);
  }
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return c.json({ error: "The request was not JSON." }, 400);
  }
  if (!isObject(body)) {
    return c.json({ error: "The request was not a change to the account." }, 400);
  }

  const changed: UserSummary = { ...user };
  const writes: { column: string; value: string | number }[] = [];

  if (body.username !== undefined) {
    if (typeof body.username !== "string") {
      return c.json({ error: "A username is text." }, 400);
    }
    const username = cleanUsername(body.username);
    const problem = usernameProblem(username);
    if (problem !== undefined) {
      return c.json({ error: problem }, 400);
    }
    writes.push({ column: ACCOUNT_COLUMNS.username, value: username });
    writes.push({ column: ACCOUNT_COLUMNS.choseUsername, value: 1 });
    changed.username = username;
    changed.choseUsername = true;
  }
  for (const field of ["anonymousAuthor", "shareStats"] as const) {
    if (body[field] === undefined) continue;
    if (typeof body[field] !== "boolean") {
      return c.json({ error: "A setting is a yes or a no." }, 400);
    }
    writes.push({ column: ACCOUNT_COLUMNS[field], value: body[field] ? 1 : 0 });
    changed[field] = body[field];
  }

  if (writes.length > 0) {
    try {
      await c.env.DB.batch(
        writes.map(({ column, value }) =>
          c.env.DB.prepare(`UPDATE users SET ${column} = ? WHERE id = ?`).bind(value, user.id),
        ),
      );
    } catch (error) {
      if (isUniqueRefusal(error)) {
        return c.json({ error: NAME_TAKEN }, 409);
      }
      throw error;
    }
  }

  return c.json({ user: changed });
});

/**
 * Delete the account, and everything it made.
 *
 * The levels first, because the users foreign key on transcriptions has no
 * cascade -- on purpose, so that a route which forgot them would be refused
 * rather than leave levels owned by nobody -- and then the row, whose
 * cascades take the sessions and the progress. Other players' progress on
 * the deleted levels goes with those levels. One batch: either all of it
 * happened or none did. The cookie is cleared as sign-out clears it, though
 * the row it named is gone either way.
 */
auth.delete("/api/me", async (c) => {
  const user = await sessionUserOf(c);
  if (user === undefined) {
    return c.json({ error: SIGN_IN_FIRST }, 401);
  }

  await c.env.DB.batch([
    c.env.DB.prepare(`DELETE FROM transcriptions WHERE owner_id = ?`).bind(user.id),
    c.env.DB.prepare(`DELETE FROM users WHERE id = ?`).bind(user.id),
  ]);

  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  return c.body(null, 204);
});

// ---- small parts -------------------------------------------------------------

/** What D1 says when the unique index on a name refuses one. */
const isUniqueRefusal = (error: unknown): boolean =>
  error instanceof Error && /UNIQUE constraint failed/u.test(error.message);

/**
 * Run `write` with each minted name in turn until one is not refused, and
 * answer whether any was written.
 *
 * Uniqueness is the index's and never a lookup: two sign-ins landing at the
 * same instant would both be told a name was free and one of them would be
 * wrong, where a caught `UNIQUE constraint failed` cannot be. `mintNames`
 * decides what to try and in what order — plain pairs, then the last of them
 * numbered.
 *
 * Running out gives up quietly. An unnamed account is shown as Anonymous and
 * named at its next sign-in, which is a better outcome than a sign-in that
 * fails over a word.
 */
async function withMintedName(
  write: (username: string) => Promise<void>,
): Promise<boolean> {
  for (const name of mintNames(randomBelow)) {
    try {
      await write(name);
      return true;
    } catch (error) {
      if (!isUniqueRefusal(error)) throw error;
    }
  }
  return false;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * The session cookie, freshly dated: thirty days from now, whenever now is.
 * Set at sign-in and set again by the renewal in `sessionUserOf`, so the
 * browser's copy of the deadline moves with the row's.
 */
function setSessionCookie(
  c: Context<{ Bindings: ApiEnv }>,
  token: string,
): void {
  setCookie(c, SESSION_COOKIE, token, {
    path: "/",
    // HttpOnly: no script can read it, so a script injected despite every
    // other defence still cannot carry it away. SameSite=Lax: other sites'
    // requests arrive here without it, which is most of what CSRF is.
    httpOnly: true,
    sameSite: "Lax",
    secure: new URL(c.req.url).protocol === "https:",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
}

/**
 * 32 random bytes as base64url: 256 bits, which is the strength of the whole
 * session system, since guessing one of these *is* signing in as somebody.
 */
function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return toBase64Url(bytes);
}

/** Standard base64url: what PKCE requires of the challenge, unpadded. */
function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
}

/** The text a base64url string spells, or nothing if it spells none. */
function fromBase64Url(text: string | undefined): string | undefined {
  if (text === undefined || text === "") {
    return undefined;
  }
  try {
    const binary = atob(text.replaceAll("-", "+").replaceAll("_", "/"));
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return undefined;
  }
}

async function sha256(text: string): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return new Uint8Array(digest);
}

async function sha256Hex(text: string): Promise<string> {
  return [...(await sha256(text))]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * The claims of a JWT, read without any signature check.
 *
 * Deliberate, and only safe where this file calls it: on a token that arrived
 * by the server-to-server exchange. A token that came from a browser instead
 * would need the signature checked against Google's published keys, because a
 * browser can be made to carry anything.
 */
function readJwtClaims(token: string): Record<string, unknown> | undefined {
  const parts = token.split(".");
  if (parts.length !== 3) {
    return undefined;
  }
  const text = fromBase64Url(parts[1]);
  if (text === undefined) {
    return undefined;
  }
  try {
    const claims: unknown = JSON.parse(text);
    return isObject(claims) ? claims : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Who Google says this is, if the token really is Google's answer to us.
 *
 * `aud` is the check that matters most: without it, any application's ID
 * token — minted for any site the visitor ever signed into — would open an
 * account here.
 */
function readIdToken(
  idToken: unknown,
  clientId: string,
): { sub: string; email: string } | undefined {
  if (typeof idToken !== "string") {
    return undefined;
  }
  const claims = readJwtClaims(idToken);
  if (claims === undefined) {
    return undefined;
  }

  const { iss, aud, exp, sub, email } = claims;
  if (iss !== "https://accounts.google.com" && iss !== "accounts.google.com") {
    return undefined;
  }
  if (aud !== clientId) {
    return undefined;
  }
  if (typeof exp !== "number" || exp * 1000 <= Date.now()) {
    return undefined;
  }
  if (typeof sub !== "string" || sub === "") {
    return undefined;
  }
  if (typeof email !== "string" || email === "") {
    return undefined;
  }
  // A Google account can carry an address Google has never confirmed the
  // holder controls — Workspace-provisioned and some legacy accounts do.
  // This site stores and shows the email, so an email Google will not vouch
  // for does not get in wearing this site's trust. (And it is one reason the
  // admin flag is granted by google_sub, never by email: the email column is
  // a display field, only ever as true as this check.)
  if (claims.email_verified !== true) {
    return undefined;
  }
  return { sub, email };
}
