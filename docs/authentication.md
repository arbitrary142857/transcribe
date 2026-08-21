# Authentication

How signing in works, why each piece is shaped the way it is, and how to
operate it. The code lives in `worker/auth.ts` (routes and session lookup),
`src/shared/session.ts` (the shapes both sides agree on),
`src/ui/session-nav.ts` (the corner of the nav), and
`migrations/0002_create_users_and_sessions.sql` (the tables), and
`migrations/0003_own_and_publish_transcriptions.sql` (levels gaining owners).
Tests:
`test/auth.test.ts`, `test/session.test.ts`.

## The two systems

"Sign in with Google" is two systems wearing one button, and they are worth
keeping separate in your head:

1. **The OAuth/OIDC dance** proves who the visitor is, *once*, at the moment
   they sign in. Google does the proving; we receive the verdict.
2. **Sessions** remember that verdict on every request afterwards. Google is
   not involved; a cookie and a table row are.

A visitor signs in through system 1 perhaps once a month. Every other request
they ever make is system 2.

## System 1: the dance, step by step

The whole flow is a chain of top-level browser navigations — no Google
JavaScript is loaded into any page, which keeps this site's
no-external-scripts posture intact.

That chain is why `wrangler.jsonc` carries
`"run_worker_first": ["/api/*"]`, and the line is load-bearing: with recent
compatibility dates, Workers Assets answers a *navigated* path that matches
no file with the 404 page directly, never invoking the Worker. Pages reach
the API with `fetch()` and never notice, but both `/api/auth/google` and the
callback from Google are navigations — remove that line and clicking
"Sign in" lands on "Nothing here" instead of Google.

```
Browser                       This Worker                      Google
  |  GET /api/auth/google        |                                |
  |----------------------------->|                                |
  |   302 -> accounts.google.com |  (sets the "signin" cookie:    |
  |<-----------------------------|   state.verifier.return, 10m)  |
  |  consent screen              |                                |
  |------------------------------------------------------------->|
  |   302 -> /api/auth/callback?code=...&state=...                |
  |<--------------------------------------------------------------|
  |  GET /api/auth/callback      |                                |
  |----------------------------->|  POST /token (code, secret,    |
  |                              |------------------------------->|
  |                              |   { id_token }                 |
  |                              |<-------------------------------|
  |   302 -> return              |  (upserts user, inserts        |
  |<-----------------------------|   session, sets "session")     |
```

`return` is where on this site to land afterwards — `/api/auth/google?next=/edit`
puts it in the flight cookie, and the callback reads it back. It is a path
the browser supplied, and it becomes a `Location` header, which is the shape
an open redirect takes, so `returnPathOf()` holds it to being one of our own
pages: it must start with a single `/`, must still be on our origin after the
URL parser has had its way with it (which rejects `//host`, `/\host` and any
scheme), and must not be under `/api`, where nothing is a page and
`/api/auth/google` itself would loop. It is checked on the way *in* and
again on the way *out*, because on the way out it comes from a cookie, and a
cookie is the browser's to send. Anything that fails goes home. Google is
told nothing about it: the `redirect_uri` Google matches exactly stays what
it was.

**What each moving part defends against:**

- **`state`** is an unguessable name for this one sign-in attempt. We mint it,
  keep it in the flight cookie, and Google hands it back untouched. A callback
  whose `state` does not match the cookie was not started by this browser on
  this site — a forged link, a replayed URL — and is refused. This is the
  login-CSRF defence.
- **PKCE** (`code_challenge` / `code_verifier`): we send Google the *hash* of
  a secret and later prove we knew the secret itself. If the authorization
  `code` leaks in transit (redirect URLs end up in logs and histories), the
  thief still cannot redeem it, because redeeming needs the verifier and the
  verifier never travelled.
- **The `code`** the visitor carries back is single-use and short-lived, and
  worthless without both the client secret and the PKCE verifier. Only the
  server holds those.
- **The client secret** authenticates *this application* to Google. It leaves
  the server in exactly one place: the server-to-server token exchange. It is
  never in a page, a redirect, or an error message — there is a test pinning
  that.

**Why the ID token's signature is not checked.** The ID token is a JWT, and
JWTs are usually verified against the issuer's published keys (JWKS). We
deliberately skip that, on Google's own guidance, because of *how* the token
arrives: not from the browser, but as the direct answer to our own HTTPS call
to `oauth2.googleapis.com`, authenticated by our client secret. A signature
proves the token was not tampered with in transit — TLS already proved that.
What TLS cannot promise is checked in `readIdToken()`:

- `iss` — it is Google speaking, not any other identity provider;
- `aud` — the token was minted *for this application*. This is the check that
  matters most: without it, an ID token minted for any other site the visitor
  ever signed into would open an account here;
- `exp` — it is not stale;
- `email_verified` — Google has actually confirmed the holder controls the
  address the token carries. Google accounts *can* assert unverified emails
  (Workspace-provisioned and some legacy accounts), and this site stores and
  shows the email, so an address Google will not vouch for is refused rather
  than displayed wearing this site's trust.

If tokens ever arrive from the browser instead (for example, if sign-in were
rebuilt on Google's pop-up widget), signature verification becomes mandatory.
The comment on `readJwtClaims()` says the same thing, deliberately.

**Why accounts key on `sub`, never on email.** `sub` is the one identifier
Google promises never changes for an account. An email is a fact about a
person that the person can change; keying on it would make a renamed email a
brand-new account, orphaning everything the old one owned. The email is
stored anyway — refreshed at each sign-in — purely so a human reading the
users table can tell who is who.

**The return address is derived, not configured.** `redirect_uri` is built
from the origin of the incoming request, so `localhost` and
`transcribe.jasonmao.me` both work with no per-environment config —
*provided* each origin's callback URL is on the Google console's allowed
list (see the runbook below). Google enforces exact matches on that list,
which is what stops an attacker pointing the redirect somewhere of their
choosing. The flip side: that console list *is* part of this site's security
config, not paperwork. Every origin on it is an origin whose sign-in flow you
are vouching for, so it holds exactly the origins being served and nothing
else — which is why the `workers.dev` hostname is switched off rather than
left as a second door (see the runbook's domain section).

## System 2: sessions

On a successful callback, the server mints a session token — 32 random bytes,
base64url, so 256 bits — and gives it to the browser as a cookie. The
database stores only the token's SHA-256. Two consequences:

- **A leaked database is not a bag of sessions.** A backup, a breach, or an
  admin's own eyes see hashes, and a hash cannot be put in a Cookie header.
  (There is no salt and no slow hash, deliberately: those defend guessable
  secrets like passwords, and a 256-bit random token is not guessable.)
- **Sign-out is real.** Logout deletes the row, not just the cookie, so a
  token copied before sign-out dies with the row.

**The cookie's flags, and what each one is for:**

| Flag | Defends against |
| --- | --- |
| `HttpOnly` | scripts reading the token — even a script injected past every other defence cannot carry the cookie away |
| `SameSite=Lax` | other sites sending requests that arrive wearing our cookie — which is most of what CSRF is. Lax still sends it on top-level navigations, which is exactly why "Sign in" is a plain link |
| `Secure` | the token travelling over plain http. Set whenever the request came over https; left off on localhost, where dev serves plain http and a Secure cookie would be silently dropped |
| `Path=/` | nothing — sessions are for the whole site. The *flight* cookie, by contrast, is scoped to `/api/auth`, because nothing else ever reads it |

**Expiry is sliding — in both places thirty days is written down.** Sessions
live thirty days. Any use past the halfway mark quietly pushes the end
another thirty days out (`sessionUserOf`): the row's `expires_at` moves,
*and* the cookie is re-issued with a fresh `Max-Age`. The second half
matters as much as the first — a browser discards a cookie when the Max-Age
it was issued with runs out, however alive the row behind it is, so a
renewal that moved only the row would still sign the faithful visitor out on
day thirty. The expiry check is part of the SQL (`expires_at > now`), not an
afterthought in code — an expired session is indistinguishable from no
session, including to our own code. Lapsed rows are swept opportunistically
on the sign-in path (every callback deletes rows already past their
`expires_at`), so the table stays the size of the truth without anything
scheduled.

**Reading the session** is `sessionUserOf(c)`: cookie → SHA-256 → one query
joining `sessions` to `users`. `/api/me` calls it; so does every route that
writes a level or reads its answer, before anything else; and the two play
routes call it only once a row has turned out to be a draft (see below).

## The tables

```
users     id            12-char Crockford id, same shape as level ids
          google_sub    Google's permanent identifier; UNIQUE; the login key
          email         copy of Google's current answer; refreshed at sign-in
          username      NULL until chosen; UNIQUE COLLATE NOCASE
          is_admin      0/1; written only by hand (see runbook)
          created_at    epoch ms

sessions  token_hash    hex SHA-256 of the cookie token; PRIMARY KEY
          user_id       -> users.id, ON DELETE CASCADE
          created_at    epoch ms
          expires_at    epoch ms; slid forward while the session is used

transcriptions  (the level table, rebuilt by 0003 to carry these)
          owner_id      -> users.id, NOT NULL; who may edit, delete, publish
          status        'draft' | 'published'
          published_at  epoch ms, or NULL — CHECKed to agree with status
          updated_at    epoch ms; moved by every write, publishing included
          CHECK         a published level has every note pitched
```

Users have their own ids rather than using `google_sub` directly so that
every future table (level ownership, progress, ratings) points at a user
without caring how that user signs in. The day a second sign-in method
exists, only `users` changes.

## What the page knows

`GET /api/me` answers `{ user: { id, email, username?, isAdmin } }` or `{}`.
Deliberately absent from that answer: the session token (the cookie carries
it and scripts cannot read the cookie), `google_sub` (how someone signs in is
not the page's business), and the expiry. `isAdmin` is carried so the page
can *draw* admin controls, never so it can grant them — see the trust
boundary below.

Each page asks `/api/me` fresh on load (these are separate pages, not one
app). Until the answer arrives, the nav corner is empty rather than wrong.

## What a session is for: ownership and publishing

A level belongs to the account that saved it. It begins as a **draft** —
saved work that only its owner (and an admin) can open, play, change, delete
or publish, and that the public listing never names. **Publishing** requires
every note to have a pitch (the route says so; the database's CHECK makes it
a fact), stamps `published_at`, and freezes the music: from then on the only
edit a published level accepts is to its title, subtitle and instructions,
judged by whether the music or the marks *differ* from what is stored rather
than by whether they were mentioned — the editor always sends the melody.
**Unpublishing** turns it back into a draft under a **new id**. Players keep
progress against an id, and the author is about to change the music that
progress was keyed to note by note; rotating the id means the old progress
meets nothing rather than the wrong answer key.

Who may do what, by route:

| route | session | no session | stranger, published | stranger, draft |
| --- | --- | --- | --- | --- |
| `GET /api/levels` | none | 200 | — | — |
| `GET /api/mine` | required | 401 | — | — |
| `POST /api/levels` | required | 401 | — | — |
| `GET /api/levels/:id/source` | required | 401 | 403 | 404 |
| `PUT /api/levels/:id` | required | 401 | 403 | 404 |
| `DELETE /api/levels/:id` | required | 401 | 403 | 404 |
| `POST /api/levels/:id/publish` | required | 401 | 403 | 404 |
| `POST /api/levels/:id/unpublish` | required | 401 | 403 | 404 |
| `GET /api/levels/:id/puzzle` | only for drafts | 200 / 404 | 200 | 404 |
| `POST /api/levels/:id/check` | only for drafts | 200 / 404 | 200 | 404 |

Three things the table encodes. A signed-out request to a gated route is
401 before the body is read and before any row is looked up, so it learns
nothing about any id. A stranger's request about a *published* level may be
told "only the author can change this" (403), because a published level's
existence is public; about a *draft* it is told exactly what a missing level
would tell it (404, same sentence), because a draft's existence is the
author's. And the play routes look the session up *lazily* — only after the
row has said it is a draft — so a published level's `/check`, the hottest
path on the site, never costs a sessions query. An admin (`is_admin = 1`)
passes every ownership check; nothing in a request can make someone one.

## The trust boundary, in one sentence

**The UI is never the security boundary: every check happens server-side, on
every request, from the database.** Hiding a button is a courtesy to the
person who could not have used it; the enforcement is the route reading
cookie → session row → user row before touching anything. Anyone can send
any request with curl; the routes are written for that person, and the page
is written for everyone else.

## Runbook

### First-time Google Cloud setup (one-time, ~30 minutes)

1. [console.cloud.google.com](https://console.cloud.google.com) → new project
   (name it anything; the name is only seen in the console, never by visitors).
2. **APIs & Services → OAuth consent screen**: External; app name, your
   support email. Scopes: only `openid`, `email`, `profile` — all
   non-sensitive, so no Google review is needed. Publish the app (in
   "Testing" mode only listed test users can sign in and consent expires
   weekly).
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   type *Web application*. Authorized redirect URIs — exact strings:
   - `http://localhost:5173/api/auth/callback`
   - `https://transcribe.jasonmao.me/api/auth/callback`

   Nothing else. The `workers.dev` hostname is switched off (see below), so
   it does not belong on this list; every entry is an origin whose sign-in
   you vouch for.

   (No "authorized JavaScript origins" needed — nothing runs Google's JS.)
4. Copy the client ID and client secret it mints.

### Wiring the credentials in

- **Locally**: put both values in `.dev.vars` (gitignored; a commented
  template is in the repo). Restart `npm run dev` after changing it.
- **Deployed**: put the client id in `wrangler.jsonc` under `vars`
  (it is public by nature — it travels in every sign-in redirect), and the
  secret via

  ```
  wrangler secret put GOOGLE_CLIENT_SECRET
  ```
- After changing `wrangler.jsonc`, rerun `npm run cf-typegen`.
- Apply the migrations: `npm run db:migrate:local` and
  `npm run db:migrate:remote`. 0003 rebuilds the level table and hands any
  existing levels to the *earliest account*, so on a database that has levels
  but no accounts it fails loudly on purpose — sign in once first.

With credentials absent or blank, the sign-in routes answer 503 with a
sentence and the rest of the site is untouched — a fresh clone works without
any Google setup.

### Granting (and revoking) admin

By hand, and only by hand — no route writes `is_admin`, which is the entire
security model: becoming an admin requires the Cloudflare account, not a
request. First sign in once so the user row exists, then:

```
wrangler d1 execute transcribe --remote \
  --command "UPDATE users SET is_admin = 1 WHERE google_sub = '<sub>'"
```

(Find the sub with
`wrangler d1 execute transcribe --remote --command "SELECT id, email, google_sub FROM users"`.)
Set `= 0` to revoke. The change takes effect on the user's next request; no
redeploy, no sign-out needed.

Always designate by `google_sub` or `id`, **never** by email. The email
column is a display field, refreshed from whatever Google last asserted and
only ever as trustworthy as the `email_verified` check — identity lives in
`sub`. A `WHERE email = ...` admin grant would make the one soft field in the
table load-bearing.

### Rotating the client secret

In the Google console, add a second client secret to the same OAuth client,
`wrangler secret put GOOGLE_CLIENT_SECRET` with the new value, then delete
the old secret in the console. Sessions are untouched — the secret is only
used at sign-in.

### Signing everybody out (incident response)

Sessions are rows, so revocation is SQL:

```
wrangler d1 execute transcribe --remote --command "DELETE FROM sessions"
```

— everyone signs in again next visit. For one user:
`DELETE FROM sessions WHERE user_id = '...'`.

### The domain, and why there is only one door

The site is served at `transcribe.jasonmao.me`, declared in `wrangler.jsonc`:

```jsonc
"routes": [{ "pattern": "transcribe.jasonmao.me", "custom_domain": true }],
"workers_dev": false,
"preview_urls": false,
```

A custom domain is a second door to the same Worker, not a second
deployment: `npm run deploy` is the whole release process, and there is no
separate "production" that a git push updates. Declaring the domain in
config rather than in the dashboard means deploying is enough — Cloudflare
writes the DNS record and issues the certificate itself (the `jasonmao.me`
zone is on Cloudflare DNS, which is the one prerequisite). The Worker needed
no change to move here: the return address is derived from each request.

`workers_dev: false` closes the `transcribe.<subdomain>.workers.dev`
hostname on purpose, so the site has exactly one origin and Google's
redirect list has exactly one production entry. Wrangler closes it by
default the moment `routes` exists; the config says so explicitly so that is
never a surprise. `preview_urls` would reopen the workers.dev subdomain for
`wrangler versions upload` pre-flights (a version you can look at before it
takes traffic); flip it to `true` the day that is wanted — sign-in cannot be
tested on a preview URL regardless, since each version gets a new hostname
and Google's list takes no wildcards.

Two consequences of a freshly attached hostname, both temporary: the
certificate takes a few minutes to issue (TLS handshakes fail until then),
and a machine that looked the name up *before* the record existed may cache
the "no such host" answer for a while — Cloudflare's own resolver
(`dig @1.1.1.1`) tells the truth in the meantime.

## Decisions a future phase will revisit

- **`/api/me` on every page load** is one D1 read per visit; fine at this
  scale, cacheable later if it ever matters.
- **Google-only** means a lost Google account is a lost site account.
  Acceptable for now; passkeys are the natural second method, and `users`
  is already shaped for one.
