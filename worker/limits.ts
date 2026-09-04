/**
 * How often one caller may ask, and how much they may send.
 *
 * Kept apart from the routes for the reason routes.ts is kept apart from the
 * entry, and free of any Workers type for the same one: what a limiter is, as
 * far as this file is concerned, is a thing with a `limit` method, and the
 * real binding is fitted to that shape in index.ts where tsc checks the two
 * agree. A test hands in a stand-in exactly as it hands in a database.
 *
 * The whole of the policy is `rateClassOf` below, and it is written as a
 * *classification of every request* rather than as a call inside each route.
 * That is the point: a route added tomorrow and forgotten today still lands
 * in a class, because the function has a last line that catches everything.
 * The alternative -- a `limit()` at the top of each handler -- is the version
 * where the twenty-ninth route is the one nobody remembered.
 *
 * Six classes, by what a request costs and what it is worth to abuse, never
 * by its verb. `check` is its own class because it is the one route on the
 * site that leaks an answer; `list` is its own because it is the one read
 * that runs five correlated subselects over a hundred rows.
 */

import type { Context, MiddlewareHandler } from "hono";

/**
 * One bucket, as the Workers rate-limiting binding presents one.
 *
 * `limit` answers whether this key is still under its allowance and counts
 * the ask. Cloudflare's own words for it are "permissive, eventually
 * consistent, and intentionally designed to not be used as an accurate
 * accounting system": the count is kept per data centre rather than
 * globally, so a caller spread across the world gets more than the number
 * says. It is a brake on scripted abuse, not a quota, and nothing here
 * should be read as promising otherwise.
 */
export type RateLimiter = {
  limit(options: { key: string }): Promise<{ success: boolean }>;
};

/** What a request is being charged against. See `rateClassOf`. */
export type RateClass = "check" | "auth" | "heavy" | "list" | "write" | "read";

/** One limiter per class, as the entry assembles them out of the bindings. */
export type RateLimits = Record<RateClass, RateLimiter>;

/** The classes, in one place, so nothing has to list them twice. */
export const RATE_CLASSES: readonly RateClass[] = [
  "check",
  "auth",
  "heavy",
  "list",
  "write",
  "read",
];

/**
 * The six limiters, or nothing if the environment is missing any of them.
 *
 * All six or none, deliberately, in the shape `googleSignInOf` answers a
 * half-configured environment: a partial set would be an object whose missing
 * member throws a TypeError inside the middleware, which is a 500 on every
 * request to a class nobody noticed was absent. Nothing is a site that serves
 * with one thing switched off, and that is the failure worth having.
 */
export function rateLimitsOf(
  bindings: Partial<Record<RateClass, RateLimiter | undefined>>,
): RateLimits | undefined {
  const limits: Partial<RateLimits> = {};
  for (const cls of RATE_CLASSES) {
    const limiter = bindings[cls];
    if (limiter === undefined || typeof limiter.limit !== "function") {
      return undefined;
    }
    limits[cls] = limiter;
  }
  return limits as RateLimits;
}

/**
 * The path, in the segments this file reasons about.
 *
 * Empty segments are dropped, so a trailing slash and a doubled one both read
 * as the path without them -- which matters because the classification below
 * counts segments, and `/api/tunes/` must not be one segment longer than
 * `/api/tunes` and so fall through to a different class.
 */
const segmentsOf = (path: string): string[] =>
  path.split("/").filter((part) => part !== "");

/** The four methods that change something. Everything else only reads. */
const WRITES = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Which bucket this request is charged to.
 *
 * A pure function of the method and the path, so the whole policy can be read
 * in one place and tested against the whole route table without a server. The
 * order of the cases is the order of the argument:
 *
 * 1. The sign-in dance, whatever it is doing. Its cost is an outbound call to
 *    Google and a handful of statements, and nobody signs in ten times a
 *    minute.
 * 2. `check`, alone. It is an oracle -- roughly forty of these can pin one
 *    note -- and it is the only write on the site that takes no session at
 *    all, so it is the cheapest thing here to abuse and the most rewarding.
 * 3. The heavy few: making a tune, moving one across the publish line,
 *    throwing one away, deleting an account, and the merge, whose loop is two
 *    statements per record for up to a hundred records. Rare when honest.
 * 4. The two listings, which are the expensive reads.
 * 5. Everything else that writes -- including the progress save, which fires
 *    about once a second while somebody is actually playing, and so is why
 *    this class is not tighter than it is.
 * 6. Everything else, which is every remaining read.
 *
 * The last two lines are the ones that make this exhaustive: a route nobody
 * thought about is a write or it is a read, and either way it is limited.
 */
export function rateClassOf(method: string, path: string): RateClass {
  const parts = segmentsOf(path);
  const writes = WRITES.has(method.toUpperCase());

  // 1. /api/auth/anything.
  if (parts[0] === "api" && parts[1] === "auth") return "auth";

  if (parts[0] === "api" && parts[1] === "tunes") {
    // 2. POST /api/tunes/:id/check
    if (parts.length === 4 && parts[3] === "check" && method === "POST") {
      return "check";
    }
    // 3a. POST /api/tunes/:id/publish and /unpublish
    if (
      parts.length === 4 &&
      (parts[3] === "publish" || parts[3] === "unpublish") &&
      method === "POST"
    ) {
      return "heavy";
    }
    // 3b. POST /api/tunes, and DELETE /api/tunes/:id -- the whole tune, which
    // is why the length is exact: DELETE of a rating or an upvote is one
    // segment longer and is an ordinary write.
    if (parts.length === 2 && method === "POST") return "heavy";
    if (parts.length === 3 && method === "DELETE") return "heavy";
    // 4a. GET /api/tunes
    if (parts.length === 2 && !writes) return "list";
  }

  // 3c. POST /api/progress/merge
  if (
    parts[0] === "api" &&
    parts[1] === "progress" &&
    parts[2] === "merge" &&
    method === "POST"
  ) {
    return "heavy";
  }

  // 3d. DELETE /api/me -- the account and everything it made.
  if (parts[0] === "api" && parts[1] === "me" && parts.length === 2 && method === "DELETE") {
    return "heavy";
  }

  // 4b. GET /api/mine, the other listing.
  if (parts[0] === "api" && parts[1] === "mine" && !writes) return "list";

  return writes ? "write" : "read";
}

/**
 * Who is asking, for the purpose of counting.
 *
 * The connecting address, and deliberately not the account. Cloudflare's
 * guidance prefers a stable identifier over an address, and it is right in
 * general -- an office or a school shares one -- but naming the account here
 * would mean a sessions query on every request, including the two play
 * routes whose whole design is to answer a stranger in one statement. The
 * address is what is available for free and is the only thing at all that a
 * signed-out caller has.
 *
 * `CF-Connecting-IP` is set by Cloudflare on the way in and cannot be forged
 * from outside; it is absent only where there is no Cloudflare in front,
 * which is local development, where everything shares one bucket and that is
 * fine.
 */
export const callerKeyOf = (request: { headers: { get(name: string): string | null } }): string =>
  request.headers.get("CF-Connecting-IP") ?? "no-address";

const TOO_MUCH =
  "That is more asking than this site takes at once. Wait a moment and try again.";

/**
 * Said instead when the checking itself is what was too fast, because this is
 * the one refusal a real player might ever meet: somebody a note away from
 * the end, pressing Check on every guess.
 */
const TOO_MUCH_CHECKING =
  "That is a lot of checking at once. Wait a moment and try again.";

/**
 * Refuse what is over the line, before anything else looks at it.
 *
 * Mounted first, so a refused request costs no session lookup, no body read
 * and no statement. Answered as 429 with a sentence, in the shape every other
 * refusal here takes, and with `Retry-After` for anything reading the answer
 * rather than the words.
 *
 * With no limiters at all -- a test, or a local run without the bindings --
 * nothing is limited and everything passes, which is the same bargain
 * `google` is offered in routes.ts: absent configuration is a site that works
 * with one thing missing, rather than a site that refuses to start.
 */
export const rateLimit: MiddlewareHandler<{
  Bindings: { limits?: RateLimits };
}> = async (c, next) => {
  const limits = c.env.limits;
  if (limits === undefined) return next();

  const cls = rateClassOf(c.req.method, c.req.path);
  const { success } = await limits[cls].limit({ key: `${cls}:${callerKeyOf(c.req.raw)}` });
  if (success) return next();

  c.header("Retry-After", "60");
  return c.json({ error: cls === "check" ? TOO_MUCH_CHECKING : TOO_MUCH }, 429);
};

/**
 * Whether a write arrived from somewhere other than this site.
 *
 * Second only: `SameSite=Lax` on the session cookie is what actually stops
 * cross-site writes, since another site's fetch reaches here without the
 * cookie at all, and every route that changes anything is a POST, PUT, PATCH
 * or DELETE rather than a navigation. This is the belt beside those braces,
 * and it is worth exactly one thing -- catching a future route that the
 * cookie rule would not have covered.
 *
 * Judged only when `Origin` is *there*. A browser sends it on every one of
 * those four methods; a request without one came from something that is not
 * a browser, which is not the attack this defends against, and refusing those
 * would break curl, a script somebody wrote, and the tests.
 */
export function foreignWrite(c: Context): boolean {
  if (!WRITES.has(c.req.method.toUpperCase())) return false;
  const origin = c.req.header("Origin");
  if (origin === undefined || origin === "") return false;
  return origin !== new URL(c.req.url).origin;
}

// ---- how much one caller may send ----------------------------------------

/**
 * What a string weighs on the wire.
 *
 * The distinction this file exists to keep: `text.length` counts UTF-16 code
 * units, and every limit in the Worker is a number of bytes. A character
 * outside Latin-1 is two or three bytes to one unit, so counting units against
 * a byte budget lets through up to three times what was meant.
 */
export const byteLengthOf = (text: string): number =>
  new TextEncoder().encode(text).byteLength;

/** A request as this file needs one: something with headers and a body. */
type Sent = {
  headers: { get(name: string): string | null };
  text(): Promise<string>;
};

/**
 * The body as text, or nothing at all when it is more than `maxBytes`.
 *
 * Two refusals, and the first is the one that matters. `Content-Length` is
 * read *before* the body, so a caller announcing a hundred megabytes is turned
 * away without any of it being read into memory -- which is what the old rule
 * could not do, since it counted a string it had already built. The header is
 * the sender's word, so it is only ever believed when it says no; a sender who
 * omits it or lies low is still counted properly below.
 *
 * The counting has a fast path at each end, because encoding a megabyte to
 * measure it is a megabyte of work for a question usually answered by
 * arithmetic. Every character is at least one byte per unit and at most three
 * (an astral character is four bytes to two units), so a string longer than
 * the budget in units is certainly over it, one under a third of the budget is
 * certainly under, and only the band between them has to be encoded.
 */
export async function bodyTextOf(
  request: Sent,
  maxBytes: number,
): Promise<string | undefined> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) return undefined;

  const text = await request.text();
  if (text.length > maxBytes) return undefined;
  if (text.length * 3 <= maxBytes) return text;
  return byteLengthOf(text) > maxBytes ? undefined : text;
}
