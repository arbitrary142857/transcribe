/**
 * Who is signed in, as it travels between the Worker and the page.
 *
 * Both sides import this, so nothing here may touch the DOM or the Workers
 * runtime. What it deliberately does not hold is as telling as what it does:
 * no session token — the cookie carries that and scripts cannot read the
 * cookie — and no `google_sub`, which is a fact about how someone signs in
 * rather than who they are to the site.
 */

/** Everything the page may know about the signed-in user. */
export type UserSummary = {
  id: string;
  email: string;
  /** Chosen later. Absent until there is somewhere a username is shown. */
  username: string | undefined;
  /**
   * Carried so the page can show admin controls, never so it can grant them.
   * Every admin-gated route checks the database for itself; a response field
   * is a fact about drawing, not a permission.
   */
  isAdmin: boolean;
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

  const { id, email, username, isAdmin } = user as Record<string, unknown>;
  if (typeof id !== "string" || id === "") return undefined;
  if (typeof email !== "string") return undefined;
  if (username !== undefined && typeof username !== "string") return undefined;
  if (typeof isAdmin !== "boolean") return undefined;

  return { id, email, username, isAdmin };
}
