import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";
import { returnPathOf, type TokenFetch } from "../dist-worker/worker/auth.js";
import { api } from "../dist-worker/worker/routes.js";
import {
  DAY_MS,
  SIGNED_IN,
  TOKEN,
  sessionAnswer,
  sha256Hex,
} from "./helpers/signed-in.js";
import {
  anyFirst,
  boundColumns,
  errorOf,
  stubDatabase,
  type Row,
} from "./helpers/stub-database.js";

const CLIENT_ID = "test-client.apps.googleusercontent.com";
const CLIENT_SECRET = "a-secret-nobody-should-see";

/** The flight cookie as /api/auth/google would have set it. */
const STATE = "the-state-that-was-set";
const VERIFIER = "the-verifier-that-was-set";
const FLIGHT = { cookie: `signin=${STATE}.${VERIFIER}` };

/** The same, remembering where to go back to. */
const encodedPath = (path: string) => Buffer.from(path).toString("base64url");
const flightBackTo = (path: string) => ({
  cookie: `signin=${STATE}.${VERIFIER}.${encodedPath(path)}`,
});

/**
 * Enough of Google's token endpoint: whatever it is asked, it answers with
 * the one body it was built around, and it keeps what it was asked so a test
 * can check what left the server — and what did not.
 */
function stubGoogle(answer: { status?: number; body?: unknown } = {}) {
  const calls: { url: string; body: string }[] = [];
  const fetch: TokenFetch = async (url, init) => {
    calls.push({ url, body: init.body });
    const status = answer.status ?? 200;
    return { ok: status < 400, status, json: async () => answer.body ?? {} };
  };
  return { calls, fetch };
}

/**
 * An ID token as Google mints one, but for the signature — these routes
 * receive theirs straight from Google over TLS and deliberately do not check
 * it, so the tests must not depend on one being checkable.
 */
const part = (data: unknown) =>
  Buffer.from(JSON.stringify(data)).toString("base64url");

const idTokenOf = (over: Record<string, unknown> = {}) =>
  [
    part({ alg: "RS256", typ: "JWT" }),
    part({
      iss: "https://accounts.google.com",
      aud: CLIENT_ID,
      exp: Math.floor(Date.now() / 1000) + 3600,
      sub: "107691503500061507151",
      email: "jason@example.com",
      email_verified: true,
      ...over,
    }),
    "signature-not-checked",
  ].join(".");

const envOf = (
  db: ReturnType<typeof stubDatabase>["db"],
  fetch?: TokenFetch,
) => ({
  DB: db,
  google:
    fetch === undefined
      ? undefined
      : { clientId: CLIENT_ID, clientSecret: CLIENT_SECRET, fetch },
});

const cookiesOf = (response: Response) => response.headers.getSetCookie();

const cookieNamed = (response: Response, name: string) =>
  cookiesOf(response).find((cookie) => cookie.startsWith(`${name}=`));

const cookieValueOf = (cookie: string) =>
  cookie.slice(cookie.indexOf("=") + 1, cookie.indexOf(";"));

// ---- starting a sign-in ---------------------------------------------------

describe("GET /api/auth/google", () => {
  it("sends the visitor to Google, naming only what Google needs", async () => {
    const { db } = stubDatabase();
    const response = await api.request(
      "/api/auth/google",
      undefined,
      envOf(db, stubGoogle().fetch),
    );

    assert.equal(response.status, 302);
    const sent = new URL(response.headers.get("location")!);
    assert.equal(sent.origin, "https://accounts.google.com");
    assert.equal(sent.searchParams.get("client_id"), CLIENT_ID);
    assert.equal(sent.searchParams.get("response_type"), "code");
    assert.equal(sent.searchParams.get("scope"), "openid email profile");
    assert.equal(sent.searchParams.get("code_challenge_method"), "S256");
    assert.notEqual(sent.searchParams.get("state"), null);
    // The secret is for the token exchange, which happens server to server.
    assert.equal(sent.searchParams.has("client_secret"), false);
  });

  it("asks Google to offer the choice of account every time", async () => {
    // Signing out of this site does not sign anybody out of Google. Without
    // this, Google sees one account signed in and one consent already given,
    // and sends the visitor straight back in as whoever they were.
    const { db } = stubDatabase();
    const response = await api.request(
      "/api/auth/google",
      undefined,
      envOf(db, stubGoogle().fetch),
    );

    const sent = new URL(response.headers.get("location")!);
    assert.equal(sent.searchParams.get("prompt"), "select_account");
  });

  it("keeps the state and verifier in a cookie no script can read", async () => {
    const { db } = stubDatabase();
    const response = await api.request(
      "/api/auth/google",
      undefined,
      envOf(db, stubGoogle().fetch),
    );

    const flight = cookieNamed(response, "signin");
    assert.notEqual(flight, undefined);
    assert.match(flight!, /HttpOnly/i);
    assert.match(flight!, /SameSite=Lax/i);
    assert.match(flight!, /Path=\/api\/auth/i);
    assert.match(flight!, /Max-Age=600/i);

    // The same state the visitor carries to Google, or the match on the way
    // back could never succeed.
    const sent = new URL(response.headers.get("location")!);
    const [state] = cookieValueOf(flight!).split(".");
    assert.equal(state, sent.searchParams.get("state"));
  });

  it("hides the challenge behind a hash rather than sending the verifier", async () => {
    const { db } = stubDatabase();
    const response = await api.request(
      "/api/auth/google",
      undefined,
      envOf(db, stubGoogle().fetch),
    );

    const sent = new URL(response.headers.get("location")!);
    const [, verifier] = cookieValueOf(cookieNamed(response, "signin")!).split(
      ".",
    );
    const challenge = createHash("sha256")
      .update(verifier!)
      .digest("base64url");
    assert.equal(sent.searchParams.get("code_challenge"), challenge);
  });

  it("derives its return address from wherever the site is being served", async () => {
    const { db } = stubDatabase();
    const response = await api.request(
      "https://transcribe.jasonmao.com/api/auth/google",
      undefined,
      envOf(db, stubGoogle().fetch),
    );

    const sent = new URL(response.headers.get("location")!);
    assert.equal(
      sent.searchParams.get("redirect_uri"),
      "https://transcribe.jasonmao.com/api/auth/callback",
    );
  });

  it("marks the cookie Secure when the site is served over https", async () => {
    const { db } = stubDatabase();
    const env = envOf(db, stubGoogle().fetch);

    const over = await api.request(
      "https://transcribe.jasonmao.com/api/auth/google",
      undefined,
      env,
    );
    assert.match(cookieNamed(over, "signin")!, /Secure/i);

    // Local work is served over plain http, where a Secure cookie would be
    // dropped and sign-in would quietly never finish.
    const local = await api.request("/api/auth/google", undefined, env);
    assert.doesNotMatch(cookieNamed(local, "signin")!, /Secure/i);
  });

  it("answers with a sentence when sign-in is not configured", async () => {
    const { db, asked } = stubDatabase();
    const response = await api.request("/api/auth/google", undefined, {
      DB: db,
    });

    assert.equal(response.status, 503);
    assert.equal(await errorOf(response), "Sign-in is not set up on this server.");
    assert.equal(asked.length, 0);
  });

  it("keeps the place to return to in the flight cookie, where no script can read it", async () => {
    const { db } = stubDatabase();
    const response = await api.request(
      "/api/auth/google?next=%2Fedit%3Flevel%3Dk3m9x2p7qw4t",
      undefined,
      envOf(db, stubGoogle().fetch),
    );

    const flight = cookieValueOf(cookieNamed(response, "signin")!);
    const [, , where] = flight.split(".");
    assert.equal(
      Buffer.from(where!, "base64url").toString(),
      "/edit?level=k3m9x2p7qw4t",
    );
    // Google is told nothing about it: the redirect_uri it matches exactly
    // stays what it was, and nothing else names the path.
    const sent = new URL(response.headers.get("location")!);
    assert.equal(sent.searchParams.get("redirect_uri"), "http://localhost/api/auth/callback");
    assert.equal(sent.toString().includes("edit"), false);
  });

  it("remembers only the site's own pages, and home for anything else", async () => {
    const { db } = stubDatabase();
    const response = await api.request(
      "/api/auth/google?next=//evil.example.com/edit",
      undefined,
      envOf(db, stubGoogle().fetch),
    );

    const [, , where] = cookieValueOf(cookieNamed(response, "signin")!).split(".");
    assert.equal(Buffer.from(where!, "base64url").toString(), "/");
  });
});

describe("returnPathOf()", () => {
  it("keeps a path within the site, query string and all", () => {
    assert.equal(returnPathOf("/edit?level=k3m9x2p7qw4t"), "/edit?level=k3m9x2p7qw4t");
    assert.equal(returnPathOf("/mine"), "/mine");
    assert.equal(returnPathOf("/"), "/");
    assert.equal(returnPathOf("/play?level=abc#top"), "/play?level=abc#top");
  });

  it("sends a path to another site home instead", () => {
    for (const elsewhere of [
      "//evil.example.com/edit",
      "/\\evil.example.com",
      "https://evil.example.com/",
      "javascript:alert(1)",
      "http://localhost/edit",
    ]) {
      assert.equal(returnPathOf(elsewhere), "/", `kept ${elsewhere}`);
    }
  });

  it("sends anything that is not a path home", () => {
    for (const notAPath of [undefined, null, "", "edit", "edit?level=x", 42, {}, []]) {
      assert.equal(returnPathOf(notAPath), "/", `kept ${String(notAPath)}`);
    }
  });

  it("sends an unreasonably long path home", () => {
    assert.equal(returnPathOf(`/${"a".repeat(600)}`), "/");
  });

  it("sends a path under /api home, since nothing there is a page", () => {
    assert.equal(returnPathOf("/api/auth/google"), "/");
    assert.equal(returnPathOf("/api"), "/");
    assert.equal(returnPathOf("/apiary"), "/apiary");
  });
});

// ---- finishing a sign-in ----------------------------------------------------

describe("GET /api/auth/callback", () => {
  it("refuses a state that does not match the one it set", async () => {
    const { db, asked } = stubDatabase();
    const google = stubGoogle({ body: { id_token: idTokenOf() } });

    const response = await api.request(
      "/api/auth/callback?code=abc&state=some-other-state",
      { headers: FLIGHT },
      envOf(db, google.fetch),
    );

    assert.equal(response.status, 400);
    // Nothing was believed: Google was never asked and nothing was written.
    assert.equal(google.calls.length, 0);
    assert.equal(asked.length, 0);
  });

  it("refuses a callback that arrives without its flight cookie", async () => {
    const { db } = stubDatabase();
    const google = stubGoogle({ body: { id_token: idTokenOf() } });

    const response = await api.request(
      `/api/auth/callback?code=abc&state=${STATE}`,
      undefined,
      envOf(db, google.fetch),
    );

    assert.equal(response.status, 400);
    assert.equal(google.calls.length, 0);
  });

  it("lets a visitor who changed their mind at Google come home quietly", async () => {
    const { db, asked } = stubDatabase();
    const google = stubGoogle();

    const response = await api.request(
      "/api/auth/callback?error=access_denied",
      { headers: FLIGHT },
      envOf(db, google.fetch),
    );

    assert.equal(response.status, 302);
    assert.equal(response.headers.get("location"), "/");
    assert.equal(google.calls.length, 0);
    assert.equal(asked.length, 0);
  });

  it("sends the visitor back where they came from once signed in", async () => {
    const { db } = stubDatabase();
    const google = stubGoogle({ body: { id_token: idTokenOf() } });

    const response = await api.request(
      `/api/auth/callback?code=abc&state=${STATE}`,
      { headers: flightBackTo("/edit?level=k3m9x2p7qw4t") },
      envOf(db, google.fetch),
    );

    assert.equal(response.status, 302);
    assert.equal(response.headers.get("location"), "/edit?level=k3m9x2p7qw4t");
    assert.notEqual(cookieNamed(response, "session"), undefined);
  });

  it("sends a visitor who cancelled at Google back there too", async () => {
    const { db } = stubDatabase();

    const response = await api.request(
      "/api/auth/callback?error=access_denied",
      { headers: flightBackTo("/edit") },
      envOf(db, stubGoogle().fetch),
    );

    assert.equal(response.status, 302);
    assert.equal(response.headers.get("location"), "/edit");
  });

  it("goes home when the cookie names nowhere, as cookies set before this did", async () => {
    const { db } = stubDatabase();
    const google = stubGoogle({ body: { id_token: idTokenOf() } });

    const response = await api.request(
      `/api/auth/callback?code=abc&state=${STATE}`,
      { headers: FLIGHT },
      envOf(db, google.fetch),
    );

    assert.equal(response.headers.get("location"), "/");
  });

  it("trusts the cookie's return path no more than the query's", async () => {
    // The cookie is the browser's to send, so a forged third segment must not
    // become a Location header pointing off the site.
    const { db } = stubDatabase();
    const google = stubGoogle({ body: { id_token: idTokenOf() } });

    for (const forged of ["https://evil.example.com/", "//evil.example.com", "nonsense"]) {
      const response = await api.request(
        `/api/auth/callback?code=abc&state=${STATE}`,
        { headers: flightBackTo(forged) },
        envOf(db, google.fetch),
      );
      assert.equal(response.status, 302, `choked on ${forged}`);
      assert.equal(response.headers.get("location"), "/", `followed ${forged}`);
    }
  });

  it("still refuses a mismatched state, whatever the cookie says about where to go", async () => {
    const { db, asked } = stubDatabase();
    const google = stubGoogle({ body: { id_token: idTokenOf() } });

    const response = await api.request(
      "/api/auth/callback?code=abc&state=some-other-state",
      { headers: flightBackTo("/edit") },
      envOf(db, google.fetch),
    );

    assert.equal(response.status, 400);
    assert.equal(google.calls.length, 0);
    assert.equal(asked.length, 0);
  });

  it("creates an account at first sign-in and remembers the Google subject", async () => {
    const { db, asked } = stubDatabase();
    const google = stubGoogle({ body: { id_token: idTokenOf() } });

    const response = await api.request(
      `/api/auth/callback?code=abc&state=${STATE}`,
      { headers: FLIGHT },
      envOf(db, google.fetch),
    );

    assert.equal(response.status, 302);
    assert.equal(response.headers.get("location"), "/");

    const insert = asked.find((each) => /insert into users/i.test(each.sql));
    assert.notEqual(insert, undefined);
    const bound = boundColumns(insert!.sql, insert!.values);
    assert.equal(bound.google_sub, "107691503500061507151");
    assert.equal(bound.email, "jason@example.com");
    assert.match(bound.id as string, /^[0-9abcdefghjkmnpqrstvwxyz]{12}$/);
  });

  it("recognises a returning account rather than creating another", async () => {
    const { db, asked } = stubDatabase([anyFirst({ id: "7k2m9x4p3qwt" })]);
    const google = stubGoogle({ body: { id_token: idTokenOf() } });

    await api.request(
      `/api/auth/callback?code=abc&state=${STATE}`,
      { headers: FLIGHT },
      envOf(db, google.fetch),
    );

    assert.equal(
      asked.find((each) => /insert into users/i.test(each.sql)),
      undefined,
    );
    const session = asked.find((each) =>
      /insert into sessions/i.test(each.sql),
    );
    const bound = boundColumns(session!.sql, session!.values);
    assert.equal(bound.user_id, "7k2m9x4p3qwt");
  });

  it("refreshes the email on file at each sign-in", async () => {
    const { db, asked } = stubDatabase([anyFirst({ id: "7k2m9x4p3qwt" })]);
    const google = stubGoogle({
      body: { id_token: idTokenOf({ email: "renamed@example.com" }) },
    });

    await api.request(
      `/api/auth/callback?code=abc&state=${STATE}`,
      { headers: FLIGHT },
      envOf(db, google.fetch),
    );

    const update = asked.find((each) => /update users/i.test(each.sql));
    assert.notEqual(update, undefined);
    assert.deepEqual(update!.values, ["renamed@example.com", "7k2m9x4p3qwt"]);
  });

  it("stores a hash of the session token, never the token", async () => {
    const { db, asked } = stubDatabase();
    const google = stubGoogle({ body: { id_token: idTokenOf() } });

    const response = await api.request(
      `/api/auth/callback?code=abc&state=${STATE}`,
      { headers: FLIGHT },
      envOf(db, google.fetch),
    );

    const token = cookieValueOf(cookieNamed(response, "session")!);
    assert.notEqual(token, "");

    const session = asked.find((each) =>
      /insert into sessions/i.test(each.sql),
    );
    const bound = boundColumns(session!.sql, session!.values);
    assert.equal(bound.token_hash, sha256Hex(token));
    assert.equal(session!.values.includes(token), false);
  });

  it("marks the session cookie HttpOnly, Lax, and site-wide", async () => {
    const { db } = stubDatabase();
    const google = stubGoogle({ body: { id_token: idTokenOf() } });

    const response = await api.request(
      `/api/auth/callback?code=abc&state=${STATE}`,
      { headers: FLIGHT },
      envOf(db, google.fetch),
    );

    const cookie = cookieNamed(response, "session")!;
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /SameSite=Lax/i);
    assert.match(cookie, /Path=\//i);
  });

  it("refuses a token minted for some other application", async () => {
    const { db, asked } = stubDatabase();
    const google = stubGoogle({
      body: { id_token: idTokenOf({ aud: "somebody-else" }) },
    });

    const response = await api.request(
      `/api/auth/callback?code=abc&state=${STATE}`,
      { headers: FLIGHT },
      envOf(db, google.fetch),
    );

    assert.equal(response.status, 400);
    assert.equal(asked.length, 0);
  });

  it("refuses a token from an issuer that is not Google", async () => {
    const { db, asked } = stubDatabase();
    const google = stubGoogle({
      body: { id_token: idTokenOf({ iss: "https://evil.example.com" }) },
    });

    const response = await api.request(
      `/api/auth/callback?code=abc&state=${STATE}`,
      { headers: FLIGHT },
      envOf(db, google.fetch),
    );

    assert.equal(response.status, 400);
    assert.equal(asked.length, 0);
  });

  it("refuses a token that has expired", async () => {
    const { db, asked } = stubDatabase();
    const google = stubGoogle({
      body: {
        id_token: idTokenOf({ exp: Math.floor(Date.now() / 1000) - 60 }),
      },
    });

    const response = await api.request(
      `/api/auth/callback?code=abc&state=${STATE}`,
      { headers: FLIGHT },
      envOf(db, google.fetch),
    );

    assert.equal(response.status, 400);
    assert.equal(asked.length, 0);
  });

  it("refuses a token whose email Google has not verified", async () => {
    // The email is stored and shown, so an email Google itself will not
    // vouch for must not reach the users table wearing this site's trust.
    const { db, asked } = stubDatabase();
    const google = stubGoogle({
      body: { id_token: idTokenOf({ email_verified: false }) },
    });

    const response = await api.request(
      `/api/auth/callback?code=abc&state=${STATE}`,
      { headers: FLIGHT },
      envOf(db, google.fetch),
    );

    assert.equal(response.status, 400);
    assert.equal(asked.length, 0);
  });

  it("sweeps expired sessions on its way through a sign-in", async () => {
    const { db, asked } = stubDatabase();
    const google = stubGoogle({ body: { id_token: idTokenOf() } });

    await api.request(
      `/api/auth/callback?code=abc&state=${STATE}`,
      { headers: FLIGHT },
      envOf(db, google.fetch),
    );

    const sweep = asked.find((each) =>
      /delete from sessions/i.test(each.sql),
    );
    assert.notEqual(sweep, undefined);
    assert.match(sweep!.sql, /expires_at < \?/i);
    assert.equal(typeof sweep!.values[0], "number");
  });

  it("turns Google's refusal into a sentence, with the secret in none of it", async () => {
    const { db } = stubDatabase();
    const google = stubGoogle({
      status: 400,
      body: { error: "invalid_grant" },
    });

    const response = await api.request(
      `/api/auth/callback?code=stale&state=${STATE}`,
      { headers: FLIGHT },
      envOf(db, google.fetch),
    );

    assert.equal(response.status, 400);
    const said = await response.text();
    assert.equal(said.includes(CLIENT_SECRET), false);
    assert.equal(typeof JSON.parse(said).error, "string");
  });

  it("hands the code, the verifier and the secret to Google alone", async () => {
    const { db } = stubDatabase();
    const google = stubGoogle({ body: { id_token: idTokenOf() } });

    await api.request(
      `/api/auth/callback?code=the-code&state=${STATE}`,
      { headers: FLIGHT },
      envOf(db, google.fetch),
    );

    assert.equal(google.calls.length, 1);
    assert.equal(google.calls[0]!.url, "https://oauth2.googleapis.com/token");
    const sent = new URLSearchParams(google.calls[0]!.body);
    assert.equal(sent.get("code"), "the-code");
    assert.equal(sent.get("code_verifier"), VERIFIER);
    assert.equal(sent.get("client_secret"), CLIENT_SECRET);
    assert.equal(sent.get("grant_type"), "authorization_code");
  });
});

// ---- asking who is signed in ----------------------------------------------

describe("GET /api/me", () => {
  it("answers nobody when no cookie was sent", async () => {
    const { db, asked } = stubDatabase();
    const response = await api.request("/api/me", undefined, { DB: db });

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {});
    assert.equal(asked.length, 0);
  });

  it("answers nobody for a token it never issued", async () => {
    const { db } = stubDatabase();
    const response = await api.request(
      "/api/me",
      { headers: SIGNED_IN },
      { DB: db },
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {});
  });

  it("names the signed-in user without the google subject or any token", async () => {
    const { db, asked } = stubDatabase([sessionAnswer()]);
    const response = await api.request(
      "/api/me",
      { headers: SIGNED_IN },
      { DB: db },
    );

    const said = await response.text();
    assert.deepEqual(JSON.parse(said), {
      user: { id: "7k2m9x4p3qwt", email: "jason@example.com", isAdmin: false },
    });
    // The row held the subject; the answer must not.
    assert.equal(said.includes("107691503500061507151"), false);
    // The lookup went by the hash, so the token itself reached nothing.
    assert.equal(asked[0]!.values.includes(TOKEN), false);
    assert.equal(asked[0]!.values.includes(sha256Hex(TOKEN)), true);
  });

  it("leaves out a username nobody has chosen, rather than sending null", async () => {
    const { db } = stubDatabase([sessionAnswer({ username: null })]);
    const response = await api.request(
      "/api/me",
      { headers: SIGNED_IN },
      { DB: db },
    );

    const { user } = (await response.json()) as { user: Row };
    assert.equal("username" in user, false);
  });

  it("says so when the signed-in user is an admin", async () => {
    const { db } = stubDatabase([sessionAnswer({ is_admin: 1 })]);
    const response = await api.request(
      "/api/me",
      { headers: SIGNED_IN },
      { DB: db },
    );

    const { user } = (await response.json()) as { user: Row };
    assert.equal(user.isAdmin, true);
  });

  it("asks the database only for sessions that have not expired", async () => {
    const { db, asked } = stubDatabase();
    await api.request("/api/me", { headers: SIGNED_IN }, { DB: db });

    assert.match(asked[0]!.sql, /expires_at > \?/i);
    const now = asked[0]!.values.find((value) => typeof value === "number");
    assert.equal(typeof now, "number");
  });

  it("pushes a session's end away while it keeps being used", async () => {
    const { db, asked } = stubDatabase([sessionAnswer({ expires_at: Date.now() + 5 * DAY_MS })]);
    await api.request("/api/me", { headers: SIGNED_IN }, { DB: db });

    const renewal = asked.find((each) => /update sessions/i.test(each.sql));
    assert.notEqual(renewal, undefined);
    assert.equal(renewal!.values.includes(sha256Hex(TOKEN)), true);
  });

  it("re-dates the cookie when it extends the row, or the browser would forget first", async () => {
    // The row's extension alone is not a renewal: the browser discards the
    // cookie when the Max-Age it was issued with runs out, however alive the
    // row behind it is. The same token goes back out with a fresh thirty days.
    const { db } = stubDatabase([sessionAnswer({ expires_at: Date.now() + 5 * DAY_MS })]);
    const response = await api.request(
      "/api/me",
      { headers: SIGNED_IN },
      { DB: db },
    );

    const cookie = cookieNamed(response, "session");
    assert.notEqual(cookie, undefined);
    assert.equal(cookieValueOf(cookie!), TOKEN);
    assert.match(cookie!, /Max-Age=2592000/i);
  });

  it("leaves a fresh session's clock alone", async () => {
    const { db, asked } = stubDatabase([sessionAnswer({ expires_at: Date.now() + 29 * DAY_MS })]);
    const response = await api.request(
      "/api/me",
      { headers: SIGNED_IN },
      { DB: db },
    );

    assert.equal(
      asked.find((each) => /update sessions/i.test(each.sql)),
      undefined,
    );
    assert.equal(cookieNamed(response, "session"), undefined);
  });
});

// ---- signing out ------------------------------------------------------------

describe("POST /api/auth/logout", () => {
  it("forgets the session and clears the cookie", async () => {
    const { db, asked } = stubDatabase();
    const response = await api.request(
      "/api/auth/logout",
      { method: "POST", headers: SIGNED_IN },
      { DB: db },
    );

    assert.equal(response.status, 204);
    const gone = asked.find((each) => /delete from sessions/i.test(each.sql));
    assert.notEqual(gone, undefined);
    assert.deepEqual(gone!.values, [sha256Hex(TOKEN)]);

    const cookie = cookieNamed(response, "session")!;
    assert.match(cookie, /Max-Age=0/i);
  });

  it("is at peace with a visitor who was never signed in", async () => {
    const { db, asked } = stubDatabase();
    const response = await api.request(
      "/api/auth/logout",
      { method: "POST" },
      { DB: db },
    );

    assert.equal(response.status, 204);
    assert.equal(asked.length, 0);
  });
});
