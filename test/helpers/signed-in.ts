/**
 * Being somebody, in a test.
 *
 * A route that asks who is calling reads the session cookie, hashes it, and
 * looks the hash up with one statement that joins sessions to users. These
 * are the two halves of that: the header a signed-in browser would send, and
 * the `Answer` that makes the stand-in database recognise it.
 *
 * The expiry is twenty-nine days out on purpose. `sessionUserOf` extends any
 * session past the middle of its life, and that extension is an UPDATE plus a
 * Set-Cookie a test about levels did not ask for and should not have to
 * account for.
 */

import { createHash } from "node:crypto";
import type { Answer, Row } from "./stub-database.js";

export const DAY_MS = 24 * 60 * 60 * 1000;

export const TOKEN = "a-session-token-somebody-was-issued";

/** The header a browser holding the session would send. */
export const SIGNED_IN = { cookie: `session=${TOKEN}` };

/** The account the level fixtures belong to. */
export const OWNER_ID = "7k2m9x4p3qwt";

/** Somebody else entirely. */
export const STRANGER_ID = "2b4d6f8h0j1k";

export const sha256Hex = (text: string): string =>
  createHash("sha256").update(text).digest("hex");

/** A session row as the join reads one, for the statement that reads it. */
export const sessionAnswer = (over: Row = {}): Answer => ({
  when: /FROM sessions JOIN users/iu,
  first: {
    id: OWNER_ID,
    email: "jason@example.com",
    username: null,
    is_admin: 0,
    // The row holds the subject; a test can check the answer never does.
    google_sub: "107691503500061507151",
    expires_at: Date.now() + 29 * DAY_MS,
    ...over,
  },
});

export const asOwner = (): Answer => sessionAnswer();

export const asStranger = (): Answer => sessionAnswer({ id: STRANGER_ID });

export const asAdmin = (): Answer =>
  sessionAnswer({ id: STRANGER_ID, is_admin: 1 });
