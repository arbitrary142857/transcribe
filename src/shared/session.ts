/**
 * Who is signed in, as it travels between the Worker and the page.
 *
 * Both sides import this, so nothing here may touch the DOM or the Workers
 * runtime. What it deliberately does not hold is as telling as what it does:
 * no session token — the cookie carries that and scripts cannot read the
 * cookie — and no `google_sub`, which is a fact about how someone signs in
 * rather than who they are to the site.
 */

import { countCharacters } from "./transcription.js";

/** Everything the page may know about the signed-in user. */
export type UserSummary = {
  id: string;
  email: string;
  /**
   * What bylines say. Minted at sign-in for an account that has none, and
   * chosen on the profile page; absent only for a row that predates names
   * and has not signed in since.
   */
  username: string | undefined;
  /**
   * Carried so the page can show admin controls, never so it can grant them.
   * Every admin-gated route checks the database for itself; a response field
   * is a fact about drawing, not a permission.
   */
  isAdmin: boolean;
  /** Whether the name was the person's own choice, or one picked for them. */
  choseUsername: boolean;
  /** Whether their bylines read Anonymous whatever the name is. */
  anonymousAuthor: boolean;
  /** Whether their play may count towards the figures other players see. */
  shareStats: boolean;
};

/**
 * What `GET /api/me` answers: `{ user }` for somebody, `{}` for nobody.
 * An absent field rather than null, as everywhere else.
 */
export type MeResponse = { user?: UserSummary };

/**
 * The answer, if it is one.
 *
 * Read defensively in the shape `readProgress` reads local storage: whatever
 * arrived as JSON reaches this, and anything misshapen is nobody rather than
 * a throw partway into drawing the corner of the page.
 */
export function readMe(value: unknown): UserSummary | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const user = (value as { user?: unknown }).user;
  if (typeof user !== "object" || user === null) return undefined;

  const { id, email, username, isAdmin, choseUsername, anonymousAuthor, shareStats } =
    user as Record<string, unknown>;
  if (typeof id !== "string" || id === "") return undefined;
  if (typeof email !== "string") return undefined;
  if (username !== undefined && typeof username !== "string") return undefined;
  if (typeof isAdmin !== "boolean") return undefined;
  if (typeof choseUsername !== "boolean") return undefined;
  if (typeof anonymousAuthor !== "boolean") return undefined;
  if (typeof shareStats !== "boolean") return undefined;

  return { id, email, username, isAdmin, choseUsername, anonymousAuthor, shareStats };
}

// ---- names ----------------------------------------------------------------

/** What a byline says of an author with no name to show. */
export const ANONYMOUS = "Anonymous";

/** The byline, as every place a level is named prints it. */
export const authorLabel = (author: string | undefined): string =>
  `by ${author ?? ANONYMOUS}`;

export const USERNAME = { min: 2, max: 24 } as const;

/**
 * Names nobody may take: the word a byline uses for nobody, and two that
 * would read as the site speaking. Compared in lower case, because the
 * column is NOCASE and so is a reader.
 */
export const RESERVED_USERNAMES: readonly string[] = ["anonymous", "admin", "transcribe"];

/**
 * Letters and digits from any script, the underscore and the hyphen. The
 * minted names are two words and a hyphen; a chosen one may be a name in any
 * language, which is why this is `\p{L}` and not `[a-z]`.
 */
const USERNAME_CHARACTERS = /^[\p{L}\p{N}_-]+$/u;

/** The name as it is stored and compared: trimmed, and settled to one spelling. */
export const cleanUsername = (name: string): string => name.trim().normalize("NFC");

/**
 * Why this cannot be a username, or nothing if it can.
 *
 * Shared by the profile page, which greys Save and says why as the person
 * types, and by the route, which is the one that counts. Judged on the
 * cleaned name, since that is what would be stored, and counted in
 * characters rather than code units so a name in a script that takes two
 * is not half as long as it looks.
 */
export function usernameProblem(name: string): string | undefined {
  const cleaned = cleanUsername(name);
  const length = countCharacters(cleaned);
  if (length < USERNAME.min) {
    return `A username needs at least ${USERNAME.min} characters.`;
  }
  if (length > USERNAME.max) {
    return `A username can have at most ${USERNAME.max} characters.`;
  }
  if (!USERNAME_CHARACTERS.test(cleaned)) {
    return "A username is letters, digits, underscores and hyphens.";
  }
  if (RESERVED_USERNAMES.includes(cleaned.toLowerCase())) {
    return "That name is not one anybody can have.";
  }
  return undefined;
}

/**
 * Where a page sends somebody to sign in, and — if given — where they come
 * back to afterwards.
 *
 * The page's half of `returnPathOf` in the Worker: this only encodes, because
 * the server judges the path for itself on the way in and again on the way
 * out. A page passes its own address (path and query) so that signing in from
 * the middle of something lands back in the middle of it.
 */
export function signInPath(next?: string): string {
  return next === undefined
    ? "/api/auth/google"
    : `/api/auth/google?next=${encodeURIComponent(next)}`;
}
