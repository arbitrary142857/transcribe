-- Who can sign in, and who is signed in right now.
--
-- Two tables because they live and die differently: a user row is close to
-- permanent, while a session row is churn -- born at a sign-in, gone at a
-- sign-out or thirty days of silence. Nothing else references sessions, and
-- nothing here yet references transcriptions; ownership arrives in a later
-- migration, once there is somebody for a level to belong to.

CREATE TABLE users (
  -- Same shape as a transcription id: 12 characters of Crockford's base 32,
  -- drawn at random. Its own id rather than Google's, so that every other
  -- table can point at a user without repeating who signs them in -- the day
  -- a second way in exists, nothing but this table changes.
  id          TEXT    PRIMARY KEY,

  -- The `sub` claim of Google's ID token: the one identifier Google promises
  -- never changes for an account. This is what a sign-in is looked up by.
  -- Never the email, which a person can change without becoming anybody else.
  google_sub  TEXT    NOT NULL UNIQUE,

  -- Kept so a row is recognizable to a human reading the database, and so the
  -- page can say who is signed in before usernames exist. It is a copy of
  -- Google's current answer, refreshed at each sign-in, not an identity.
  email       TEXT    NOT NULL,

  -- Chosen by the user, eventually: nothing shows a username yet, so nothing
  -- asks for one, and every row starts without. NOCASE so that two names a
  -- reader cannot tell apart cannot both exist.
  username    TEXT    UNIQUE COLLATE NOCASE,

  -- Granted by hand and only by hand:
  --
  --   wrangler d1 execute transcribe --remote \
  --     --command "UPDATE users SET is_admin = 1 WHERE google_sub = '...'"
  --
  -- No route writes this column, which is the entire security model: becoming
  -- an admin requires the Cloudflare account, not a request.
  is_admin    INTEGER NOT NULL DEFAULT 0 CHECK (is_admin IN (0, 1)),

  created_at  INTEGER NOT NULL
);

CREATE TABLE sessions (
  -- The SHA-256 of the cookie token, in hex -- never the token itself. The
  -- token is shown once, to the browser that signed in; what the database
  -- holds cannot be replayed by anyone who reads the database.
  token_hash  TEXT    PRIMARY KEY,

  user_id     TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  created_at  INTEGER NOT NULL,

  -- Epoch milliseconds, like created_at everywhere else. Read at every
  -- request (WHERE expires_at > now), pushed forward as a session nears its
  -- end, so a visitor who keeps visiting is never signed out mid-visit.
  expires_at  INTEGER NOT NULL
);

-- Sign-out-everywhere and account deletion both ask "which sessions are this
-- user's", and neither should have to scan for the answer.
CREATE INDEX idx_sessions_user ON sessions (user_id);
