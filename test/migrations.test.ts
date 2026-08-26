import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { describe, it } from "node:test";
import { LEVEL_COLUMNS, PROGRESS_SQL, RATING_SQL, UPVOTE_SQL } from "../dist-worker/worker/routes.js";

/**
 * The migration files themselves, run against the SQLite that ships with
 * Node. D1 is SQLite, so what these prove is the SQL; what they cannot prove
 * is wrangler's statement splitting or D1's transaction around a file, which
 * is why `npm run db:migrate:local` is still part of the verification.
 *
 * This suite exists because a migration was once edited after it had been
 * applied, and the first real deploy met a column that was not there. A
 * migration that is run, in a test, every time, is one whose SQL cannot drift
 * from what the files say.
 */
const sqlOf = (name: string): string =>
  readFileSync(new URL(`../migrations/${name}`, import.meta.url), "utf8");

const MIGRATION = "0003_own_and_publish_transcriptions.sql";

type Row = Record<string, unknown>;

/** The database as it stood before 0003, with whatever `seed` puts in it. */
function before(seed: (db: DatabaseSync) => void = () => {}): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(sqlOf("0001_create_transcriptions.sql"));
  db.exec(sqlOf("0002_create_users_and_sessions.sql"));
  seed(db);
  return db;
}

const JASON = "7k2m9x4p3qwt";

const addUser = (db: DatabaseSync, id: string, createdAt: number): void => {
  db.prepare(
    `INSERT INTO users (id, google_sub, email, created_at) VALUES (?, ?, ?, ?)`,
  ).run(id, `sub-${id}`, `${id}@example.com`, createdAt);
};

/** A level as 0001 shaped one, finished unless told otherwise. */
const addLevel = (
  db: DatabaseSync,
  id: string,
  over: { unpitched_count?: number; created_at?: number } = {},
): void => {
  db.prepare(
    `INSERT INTO transcriptions (
      id, title, subtitle, instructions, video_id, mark_start, mark_end,
      measures, clef, meter_beats, meter_unit, key_fifths, key_mode,
      note_count, unpitched_count, melody, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    "Clair de lune",
    null,
    null,
    "dQw4w9WgXcQ",
    0,
    8,
    4,
    "treble",
    4,
    4,
    0,
    "major",
    4,
    over.unpitched_count ?? 0,
    "{}",
    over.created_at ?? 1_754_500_000_000,
  );
};

/** Rows as plain objects: node:sqlite hands back null-prototype ones. */
const rows = (db: DatabaseSync, sql: string): Row[] =>
  (db.prepare(sql).all() as Row[]).map((row) => ({ ...row }));

/** What the schema holds for the table, leaving out SQLite's own autoindex. */
const names = (db: DatabaseSync): string[] =>
  rows(
    db,
    `SELECT name FROM sqlite_master
      WHERE tbl_name = 'transcriptions' AND name NOT LIKE 'sqlite_%'
      ORDER BY name`,
  ).map((row) => row.name as string);

describe("migration 0003", () => {
  it("rebuilds transcriptions with an owner, a status and two more clocks, keeping every row", () => {
    const db = before((db) => {
      addUser(db, JASON, 1_754_000_000_000);
      addLevel(db, "aaaaaaaaaaaa");
      addLevel(db, "bbbbbbbbbbbb", { unpitched_count: 1 });
    });

    db.exec(sqlOf(MIGRATION));

    const kept = rows(db, `SELECT * FROM transcriptions ORDER BY id`);
    assert.equal(kept.length, 2);
    for (const row of kept) {
      assert.equal(row.owner_id, JASON);
      assert.equal(row.updated_at, row.created_at);
      // Everything 0001 held is still there.
      assert.equal(row.title, "Clair de lune");
      assert.equal(row.melody, "{}");
    }
  });

  it("hands every existing level to the earliest account, finished ones published as of their creation", () => {
    const db = before((db) => {
      addUser(db, "zzzzzzzzzzzz", 1_754_000_000_001);
      addUser(db, JASON, 1_754_000_000_000);
      addLevel(db, "aaaaaaaaaaaa", { created_at: 1_754_500_000_000 });
      addLevel(db, "bbbbbbbbbbbb", { unpitched_count: 1 });
    });

    db.exec(sqlOf(MIGRATION));

    const [finished, unfinished] = rows(
      db,
      `SELECT id, owner_id, status, published_at FROM transcriptions ORDER BY id`,
    );
    assert.deepEqual(finished, {
      id: "aaaaaaaaaaaa",
      owner_id: JASON,
      status: "published",
      published_at: 1_754_500_000_000,
    });
    assert.deepEqual(unfinished, {
      id: "bbbbbbbbbbbb",
      owner_id: JASON,
      status: "draft",
      published_at: null,
    });
  });

  it("refuses to run against a database that has levels but nobody to own them", () => {
    const db = before((db) => {
      addLevel(db, "aaaaaaaaaaaa");
    });

    assert.throws(() => db.exec(sqlOf(MIGRATION)), /NOT NULL/);
  });

  it("is at peace with an empty database, which is what the deployed one is", () => {
    const db = before();

    db.exec(sqlOf(MIGRATION));

    assert.deepEqual(rows(db, `SELECT * FROM transcriptions`), []);
  });

  it("leaves no foreign key unsatisfied and no scratch table behind", () => {
    const db = before((db) => {
      addUser(db, JASON, 1_754_000_000_000);
      addLevel(db, "aaaaaaaaaaaa");
    });

    db.exec(sqlOf(MIGRATION));

    assert.deepEqual(rows(db, `PRAGMA foreign_key_check`), []);
    assert.deepEqual(names(db), [
      "idx_transcriptions_owner",
      "idx_transcriptions_published",
      "transcriptions",
    ]);
    assert.equal(
      rows(db, `SELECT name FROM sqlite_master WHERE name LIKE '%next%'`).length,
      0,
    );
  });

  it("will not hold a level whose owner is nobody", () => {
    const db = before((db) => addUser(db, JASON, 1_754_000_000_000));
    db.exec(sqlOf(MIGRATION));

    assert.throws(
      () =>
        db
          .prepare(
            `INSERT INTO transcriptions (
              id, owner_id, title, video_id, mark_start, mark_end, measures, clef,
              meter_beats, meter_unit, key_fifths, key_mode, note_count,
              unpitched_count, melody, status, created_at, updated_at
            ) VALUES (?, ?, 'x', 'dQw4w9WgXcQ', 0, 8, 4, 'treble', 4, 4, 0, 'major',
                      4, 0, '{}', 'draft', 1, 1)`,
          )
          .run("cccccccccccc", "nobody000000"),
      /FOREIGN KEY/,
    );
  });

  it("will not hold a published level that is still missing pitches, nor one without a published_at", () => {
    const db = before((db) => addUser(db, JASON, 1_754_000_000_000));
    db.exec(sqlOf(MIGRATION));

    const insert = (over: {
      status: string;
      published_at: number | null;
      unpitched_count: number;
    }) =>
      db
        .prepare(
          `INSERT INTO transcriptions (
            id, owner_id, title, video_id, mark_start, mark_end, measures, clef,
            meter_beats, meter_unit, key_fifths, key_mode, note_count,
            unpitched_count, melody, status, published_at, created_at, updated_at
          ) VALUES (?, ?, 'x', 'dQw4w9WgXcQ', 0, 8, 4, 'treble', 4, 4, 0, 'major',
                    4, ?, '{}', ?, ?, 1, 1)`,
        )
        .run(
          `${over.status[0]}${over.unpitched_count}${String(over.published_at).slice(0, 1)}aaaaaaaaa`,
          JASON,
          over.unpitched_count,
          over.status,
          over.published_at,
        );

    // The two shapes a row may have.
    assert.doesNotThrow(() =>
      insert({ status: "published", published_at: 1, unpitched_count: 0 }),
    );
    assert.doesNotThrow(() =>
      insert({ status: "draft", published_at: null, unpitched_count: 3 }),
    );

    // And the three it may not.
    assert.throws(
      () => insert({ status: "published", published_at: null, unpitched_count: 0 }),
      /CHECK/,
    );
    assert.throws(
      () => insert({ status: "draft", published_at: 1, unpitched_count: 0 }),
      /CHECK/,
    );
    assert.throws(
      () => insert({ status: "published", published_at: 1, unpitched_count: 2 }),
      /CHECK/,
    );
  });
});

// ---- 0004 -----------------------------------------------------------------

const PROGRESS_MIGRATION = "0004_keep_progress_per_account.sql";
const NAMES_MIGRATION = "0005_name_the_author.sql";
const RATINGS_MIGRATION = "0006_keep_ratings_per_account.sql";
const UPVOTES_MIGRATION = "0007_keep_upvotes_per_account.sql";

/** The database as every migration leaves it, with whatever `seed` puts in it. */
function current(seed: (db: DatabaseSync) => void = () => {}): DatabaseSync {
  const db = before();
  db.exec(sqlOf(MIGRATION));
  db.exec(sqlOf(PROGRESS_MIGRATION));
  db.exec(sqlOf(NAMES_MIGRATION));
  db.exec(sqlOf(RATINGS_MIGRATION));
  db.exec(sqlOf(UPVOTES_MIGRATION));
  seed(db);
  return db;
}

const SOMEBODY = "2b4d6f8h0j1k";
const LEVEL = "aaaaaaaaaaaa";
const OTHER_LEVEL = "bbbbbbbbbbbb";

/** A level as 0003 shapes one, published unless told otherwise. */
const addOwnedLevel = (
  db: DatabaseSync,
  id: string,
  owner: string,
  status: "draft" | "published" = "published",
): void => {
  db.prepare(
    `INSERT INTO transcriptions (
      id, owner_id, title, video_id, mark_start, mark_end, measures, clef,
      meter_beats, meter_unit, key_fifths, key_mode, note_count,
      unpitched_count, melody, status, published_at, created_at, updated_at
    ) VALUES (?, ?, 'x', 'dQw4w9WgXcQ', 0, 8, 4, 'treble', 4, 4, 0, 'major',
              4, 0, '{}', ?, ?, 1, 1)`,
  ).run(id, owner, status, status === "published" ? 1 : null);
};

type ProgressOver = {
  elapsed_ms?: number;
  check_count?: number;
  solved_at?: number | null;
  pitches?: string;
  judged?: string;
  updated_at?: number;
};

const addProgress = (
  db: DatabaseSync,
  user: string,
  level: string,
  over: ProgressOver = {},
): void => {
  db.prepare(
    `INSERT INTO progress (
      user_id, level_id, elapsed_ms, check_count, solved_at, pitches, judged, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    user,
    level,
    over.elapsed_ms ?? 1000,
    over.check_count ?? 1,
    over.solved_at ?? null,
    over.pitches ?? "[]",
    over.judged ?? "[]",
    over.updated_at ?? 1,
  );
};

/** The unpublish route's UPDATE, word for word, so the refusal tested is the real one. */
const rotateId = (db: DatabaseSync, from: string, to: string): void => {
  db.prepare(
    `UPDATE transcriptions
        SET id = ?, status = ?, published_at = NULL, updated_at = ?
      WHERE id = ? AND status = ?`,
  ).run(to, "draft", 2, from, "published");
};

const progressRows = (db: DatabaseSync): Row[] =>
  rows(db, `SELECT * FROM progress ORDER BY user_id, level_id`);

describe("migration 0004", () => {
  it("creates progress keyed by player and level, with an index on the level and nothing else", () => {
    const db = current();

    const made = rows(
      db,
      `SELECT name, type FROM sqlite_master
        WHERE tbl_name = 'progress' AND name NOT LIKE 'sqlite_%'
        ORDER BY name`,
    );
    assert.deepEqual(made, [
      { name: "idx_progress_level", type: "index" },
      { name: "progress", type: "table" },
    ]);
    assert.deepEqual(
      rows(db, `PRAGMA table_info(progress)`).map((column) => column.name),
      ["user_id", "level_id", "elapsed_ms", "check_count", "solved_at", "pitches", "judged", "updated_at"],
    );
  });

  it("is at peace with a database that has every earlier migration and no rows, which is what the deployed one is", () => {
    const db = current();

    assert.deepEqual(progressRows(db), []);
    assert.deepEqual(rows(db, `PRAGMA foreign_key_check`), []);
  });

  it("will not hold progress for a player who is nobody, nor for a level that is not there", () => {
    const db = current((db) => {
      addUser(db, JASON, 1);
      addOwnedLevel(db, LEVEL, JASON);
    });

    assert.throws(() => addProgress(db, "nobody000000", LEVEL), /FOREIGN KEY/);
    assert.throws(() => addProgress(db, JASON, "nolevel00000"), /FOREIGN KEY/);
    assert.doesNotThrow(() => addProgress(db, JASON, LEVEL));
  });

  it("will not hold a negative clock, a negative count, or a solve with no check behind it", () => {
    const db = current((db) => {
      addUser(db, JASON, 1);
      addOwnedLevel(db, LEVEL, JASON);
    });

    assert.throws(() => addProgress(db, JASON, LEVEL, { elapsed_ms: -1 }), /CHECK/);
    assert.throws(() => addProgress(db, JASON, LEVEL, { check_count: -1 }), /CHECK/);
    assert.throws(
      () => addProgress(db, JASON, LEVEL, { check_count: 0, solved_at: 5 }),
      /CHECK/,
    );
    assert.doesNotThrow(() =>
      addProgress(db, JASON, LEVEL, { check_count: 1, solved_at: 5 }),
    );
  });

  it("will not hold pitches or verdicts that are not JSON arrays", () => {
    const db = current((db) => {
      addUser(db, JASON, 1);
      addOwnedLevel(db, LEVEL, JASON);
    });

    assert.throws(() => addProgress(db, JASON, LEVEL, { pitches: "{}" }), /CHECK/);
    // Text that is not JSON at all fails inside json_type() rather than at
    // the CHECK; refused either way, which is the point.
    assert.throws(() => addProgress(db, JASON, LEVEL, { judged: "not json" }), /CHECK|malformed JSON/);
    assert.doesNotThrow(() =>
      addProgress(db, JASON, LEVEL, {
        pitches: '[{"index":1,"midi":64}]',
        judged: '[{"index":1,"midi":64,"correct":true}]',
      }),
    );
  });

  it("holds one row per player per level, which is what makes the upserts upserts", () => {
    const db = current((db) => {
      addUser(db, JASON, 1);
      addUser(db, SOMEBODY, 2);
      addOwnedLevel(db, LEVEL, JASON);
      addOwnedLevel(db, OTHER_LEVEL, JASON);
      addProgress(db, JASON, LEVEL);
    });

    assert.throws(() => addProgress(db, JASON, LEVEL), /UNIQUE|PRIMARY KEY/);
    assert.doesNotThrow(() => addProgress(db, JASON, OTHER_LEVEL));
    assert.doesNotThrow(() => addProgress(db, SOMEBODY, LEVEL));
  });

  it("lets a player's progress go with their account", () => {
    const db = current((db) => {
      addUser(db, JASON, 1);
      addUser(db, SOMEBODY, 2);
      addOwnedLevel(db, LEVEL, JASON);
      addProgress(db, JASON, LEVEL);
      addProgress(db, SOMEBODY, LEVEL);
    });

    db.prepare(`DELETE FROM users WHERE id = ?`).run(SOMEBODY);

    assert.deepEqual(
      progressRows(db).map((row) => row.user_id),
      [JASON],
    );
  });

  it("lets every player's progress go with the level", () => {
    const db = current((db) => {
      addUser(db, JASON, 1);
      addUser(db, SOMEBODY, 2);
      addOwnedLevel(db, LEVEL, JASON);
      addOwnedLevel(db, OTHER_LEVEL, JASON);
      addProgress(db, JASON, LEVEL);
      addProgress(db, SOMEBODY, LEVEL);
      addProgress(db, JASON, OTHER_LEVEL);
    });

    db.prepare(`DELETE FROM transcriptions WHERE id = ?`).run(LEVEL);

    assert.deepEqual(
      progressRows(db).map((row) => [row.user_id, row.level_id]),
      [[JASON, OTHER_LEVEL]],
    );
  });

  it("refuses to move a level's id while progress points at it, and allows it once the progress is gone", () => {
    const db = current((db) => {
      addUser(db, JASON, 1);
      addUser(db, SOMEBODY, 2);
      addOwnedLevel(db, LEVEL, JASON);
      addProgress(db, SOMEBODY, LEVEL);
    });

    // The backstop: a route that forgot to delete first would be stopped here
    // rather than carrying a player's progress across to music about to change.
    assert.throws(() => rotateId(db, LEVEL, "cccccccccccc"), /FOREIGN KEY/);

    db.prepare(PROGRESS_SQL.forget).run(LEVEL);
    assert.doesNotThrow(() => rotateId(db, LEVEL, "cccccccccccc"));

    assert.deepEqual(progressRows(db), []);
    assert.deepEqual(
      rows(db, `SELECT id, status FROM transcriptions`),
      [{ id: "cccccccccccc", status: "draft" }],
    );
  });
});

/**
 * The statements the routes run, run for real.
 *
 * The stand-in database the route tests use never parses a statement, so an
 * upsert whose ON CONFLICT clause was wrong would pass every one of them and
 * fail on the first deploy. These are the statements with the most syntax in
 * them, so they are the ones proved here.
 */
describe("the progress statements the routes run", () => {
  const played = (): DatabaseSync =>
    current((db) => {
      addUser(db, JASON, 1);
      addUser(db, SOMEBODY, 2);
      addOwnedLevel(db, LEVEL, JASON);
      addOwnedLevel(db, OTHER_LEVEL, JASON);
    });

  const one = (db: DatabaseSync, user = JASON, level = LEVEL): Row =>
    ({ ...(db.prepare(PROGRESS_SQL.read).get(user, level) as Row) });

  it("counts each check, stamps the first solve, and leaves a solved row alone", () => {
    const db = played();
    const check = db.prepare(PROGRESS_SQL.check);

    // A first check begins the row: one check, the clock at zero for the page
    // to move, and this attempt's pitches and verdicts.
    check.run(JASON, LEVEL, null, '[{"index":1,"midi":60}]', '[{"index":1,"midi":60,"correct":false}]', 10);
    assert.deepEqual(one(db), {
      level_id: LEVEL,
      elapsed_ms: 0,
      check_count: 1,
      solved_at: null,
      pitches: '[{"index":1,"midi":60}]',
      judged: '[{"index":1,"midi":60,"correct":false}]',
    });

    // A second check counts, moves the pitches, and leaves the verdicts to the
    // page's save, which follows at once.
    check.run(JASON, LEVEL, null, '[{"index":1,"midi":62}]', '[{"index":1,"midi":62,"correct":false}]', 20);
    assert.equal(one(db).check_count, 2);
    assert.equal(one(db).pitches, '[{"index":1,"midi":62}]');
    assert.equal(one(db).judged, '[{"index":1,"midi":60,"correct":false}]');

    // The solving check stamps the solve.
    check.run(JASON, LEVEL, 30, '[{"index":1,"midi":64}]', '[]', 30);
    assert.equal(one(db).check_count, 3);
    assert.equal(one(db).solved_at, 30);

    // And after that, a stale tab's check changes nothing: not the count, not
    // the stamp, not the pitches the page treats as confirmed.
    check.run(JASON, LEVEL, 40, '[{"index":1,"midi":65}]', '[]', 40);
    assert.equal(one(db).check_count, 3);
    assert.equal(one(db).solved_at, 30);
    assert.equal(one(db).pitches, '[{"index":1,"midi":64}]');
  });

  it("saves the clock, the pitches and the verdicts without touching the score, and keeps a solved row's pitches", () => {
    const db = played();
    db.prepare(PROGRESS_SQL.check).run(JASON, LEVEL, null, "[]", "[]", 10);
    db.prepare(PROGRESS_SQL.check).run(JASON, LEVEL, null, "[]", "[]", 20);

    db.prepare(PROGRESS_SQL.save).run(JASON, LEVEL, 5000, '[{"index":1,"midi":60}]', '[{"index":1,"midi":60,"correct":false}]', 25);
    assert.deepEqual(one(db), {
      level_id: LEVEL,
      elapsed_ms: 5000,
      check_count: 2,
      solved_at: null,
      pitches: '[{"index":1,"midi":60}]',
      judged: '[{"index":1,"midi":60,"correct":false}]',
    });

    db.prepare(PROGRESS_SQL.check).run(JASON, LEVEL, 30, '[{"index":1,"midi":64}]', "[]", 30);
    db.prepare(PROGRESS_SQL.save).run(JASON, LEVEL, 6000, '[{"index":1,"midi":99}]', '[{"index":1,"midi":64,"correct":true}]', 31);
    const solved = one(db);
    assert.equal(solved.elapsed_ms, 6000);
    assert.equal(solved.judged, '[{"index":1,"midi":64,"correct":true}]');
    assert.equal(solved.pitches, '[{"index":1,"midi":64}]');
    assert.equal(solved.check_count, 3);
    assert.equal(solved.solved_at, 30);
  });

  it("begins a row at zero checks and unsolved when the first write is a save", () => {
    const db = played();

    db.prepare(PROGRESS_SQL.save).run(JASON, LEVEL, 1500, '[{"index":1,"midi":60}]', "[]", 5);

    assert.deepEqual(one(db), {
      level_id: LEVEL,
      elapsed_ms: 1500,
      check_count: 0,
      solved_at: null,
      pitches: '[{"index":1,"midi":60}]',
      judged: "[]",
    });
  });

  it("writes a merged row whole", () => {
    const db = played();
    db.prepare(PROGRESS_SQL.save).run(JASON, LEVEL, 1500, "[]", "[]", 5);

    db.prepare(PROGRESS_SQL.merge).run(JASON, LEVEL, 9000, 4, 77, '[{"index":1,"midi":64}]', '[{"index":1,"midi":64,"correct":true}]', 80);
    assert.deepEqual(one(db), {
      level_id: LEVEL,
      elapsed_ms: 9000,
      check_count: 4,
      solved_at: 77,
      pitches: '[{"index":1,"midi":64}]',
      judged: '[{"index":1,"midi":64,"correct":true}]',
    });

    // And a level the account had not played is simply begun.
    db.prepare(PROGRESS_SQL.merge).run(JASON, OTHER_LEVEL, 100, 0, null, "[]", "[]", 81);
    assert.equal(one(db, JASON, OTHER_LEVEL).check_count, 0);
  });

  it("lists sharing players' solve times for one level, never the author's own", () => {
    const db = played();
    const third = "3c5e7g9i1k2m";
    addUser(db, third, 3);
    // The author solved their own level; two players solved it, one of whom
    // keeps their play out of the figures; a fourth row never solved it.
    db.prepare(PROGRESS_SQL.merge).run(JASON, LEVEL, 40_000, 1, 5, "[]", "[]", 5);
    db.prepare(PROGRESS_SQL.merge).run(SOMEBODY, LEVEL, 90_000, 2, 6, "[]", "[]", 6);
    db.prepare(PROGRESS_SQL.merge).run(third, LEVEL, 60_000, 1, 7, "[]", "[]", 7);
    db.prepare(PROGRESS_SQL.save).run(SOMEBODY, OTHER_LEVEL, 10_000, "[]", "[]", 8);

    const all = (db.prepare(PROGRESS_SQL.solveTimes).all(LEVEL, JASON) as Row[])
      .map((row) => ({ ...row }));
    assert.deepEqual(
      all.sort((a, b) => (a.elapsed_ms as number) - (b.elapsed_ms as number)),
      [
        { elapsed_ms: 60_000, check_count: 1 },
        { elapsed_ms: 90_000, check_count: 2 },
      ],
    );

    db.prepare(`UPDATE users SET share_stats = 0 WHERE id = ?`).run(third);
    assert.equal(db.prepare(PROGRESS_SQL.solveTimes).all(LEVEL, JASON).length, 1);
  });

  it("reads one player's rows and nobody else's, most recently touched first", () => {
    const db = played();
    db.prepare(PROGRESS_SQL.save).run(JASON, LEVEL, 1, "[]", "[]", 10);
    db.prepare(PROGRESS_SQL.save).run(JASON, OTHER_LEVEL, 2, "[]", "[]", 20);
    db.prepare(PROGRESS_SQL.save).run(SOMEBODY, LEVEL, 3, "[]", "[]", 30);

    const mine = (db.prepare(PROGRESS_SQL.readAll).all(JASON, 100) as Row[]).map((row) => ({ ...row }));
    assert.deepEqual(
      mine.map((row) => [row.level_id, row.elapsed_ms]),
      [[OTHER_LEVEL, 2], [LEVEL, 1]],
    );
    assert.equal(one(db, SOMEBODY).elapsed_ms, 3);
    assert.equal(db.prepare(PROGRESS_SQL.read).get(SOMEBODY, OTHER_LEVEL), undefined);
  });
});

// ---- 0005 -----------------------------------------------------------------

describe("migration 0005", () => {
  /** Everything up to 0004, a user and a level, then 0005 over them. */
  const upgraded = (): DatabaseSync => {
    const db = before();
    db.exec(sqlOf(MIGRATION));
    db.exec(sqlOf(PROGRESS_MIGRATION));
    addUser(db, JASON, 1);
    addOwnedLevel(db, LEVEL, JASON);
    db.exec(sqlOf(NAMES_MIGRATION));
    return db;
  };

  it("gives every existing account its two settings and an unchosen name, and every level no difficulty", () => {
    const db = upgraded();

    assert.deepEqual(
      rows(db, `SELECT username, chose_username, anonymous_author, share_stats FROM users`),
      [{ username: null, chose_username: 0, anonymous_author: 0, share_stats: 1 }],
    );
    assert.deepEqual(rows(db, `SELECT difficulty_half FROM transcriptions`), [
      { difficulty_half: null },
    ]);
  });

  it("holds a difficulty of half a star to five, in halves, or none", () => {
    const db = upgraded();
    const rate = (half: number | null) =>
      db.prepare(`UPDATE transcriptions SET difficulty_half = ? WHERE id = ?`).run(half, LEVEL);

    for (const half of [1, 5, 10, null]) {
      assert.doesNotThrow(() => rate(half), `refused ${half}`);
    }
    assert.throws(() => rate(0), /CHECK/);
    assert.throws(() => rate(11), /CHECK/);
  });

  it("holds each setting as a yes or a no and nothing else", () => {
    const db = upgraded();
    const set = (column: string, value: number) =>
      db.prepare(`UPDATE users SET ${column} = ? WHERE id = ?`).run(value, JASON);

    for (const column of ["chose_username", "anonymous_author", "share_stats"]) {
      assert.doesNotThrow(() => set(column, 1));
      assert.doesNotThrow(() => set(column, 0));
      assert.throws(() => set(column, 2), /CHECK/, column);
    }
  });

  it("leaves the name unique whatever its case, as 0002 made it", () => {
    const db = current((db) => {
      addUser(db, JASON, 1);
      addUser(db, SOMEBODY, 2);
    });
    db.prepare(`UPDATE users SET username = ? WHERE id = ?`).run("quiet-heron", JASON);

    assert.throws(
      () => db.prepare(`UPDATE users SET username = ? WHERE id = ?`).run("Quiet-Heron", SOMEBODY),
      /UNIQUE/,
    );
  });

  it("will not let an account go while it still owns a level, which is what makes the route delete them first", () => {
    const db = current((db) => {
      addUser(db, JASON, 1);
      addOwnedLevel(db, LEVEL, JASON);
      addProgress(db, JASON, LEVEL);
    });

    assert.throws(() => db.prepare(`DELETE FROM users WHERE id = ?`).run(JASON), /FOREIGN KEY/);

    db.prepare(`DELETE FROM transcriptions WHERE owner_id = ?`).run(JASON);
    assert.doesNotThrow(() => db.prepare(`DELETE FROM users WHERE id = ?`).run(JASON));
    assert.deepEqual(rows(db, `SELECT * FROM progress`), []);
    assert.deepEqual(rows(db, `SELECT * FROM sessions`), []);
  });
});

// ---- 0006 -----------------------------------------------------------------

const addRating = (
  db: DatabaseSync,
  user: string,
  level: string,
  over: { half?: number; created_at?: number; updated_at?: number } = {},
): void => {
  db.prepare(
    `INSERT INTO ratings (user_id, level_id, half, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(user, level, over.half ?? 6, over.created_at ?? 1, over.updated_at ?? 1);
};

const ratingRows = (db: DatabaseSync): Row[] =>
  rows(db, `SELECT * FROM ratings ORDER BY user_id, level_id`);

describe("migration 0006", () => {
  it("creates ratings keyed by player and level, with an index on the level and nothing else", () => {
    const db = current();

    const made = rows(
      db,
      `SELECT name, type FROM sqlite_master
        WHERE tbl_name = 'ratings' AND name NOT LIKE 'sqlite_%'
        ORDER BY name`,
    );
    assert.deepEqual(made, [
      { name: "idx_ratings_level", type: "index" },
      { name: "ratings", type: "table" },
    ]);
    assert.deepEqual(
      rows(db, `PRAGMA table_info(ratings)`).map((column) => column.name),
      ["user_id", "level_id", "half", "created_at", "updated_at"],
    );
  });

  it("is at peace with a database that has every earlier migration and no rows", () => {
    const db = current();

    assert.deepEqual(ratingRows(db), []);
    assert.deepEqual(rows(db, `PRAGMA foreign_key_check`), []);
  });

  it("gives every already-published level the middle word, and touches nobody who already gave one", () => {
    // The upgrade path: levels published before difficulty existed meet 0006.
    const db = before();
    db.exec(sqlOf(MIGRATION));
    db.exec(sqlOf(PROGRESS_MIGRATION));
    db.exec(sqlOf(NAMES_MIGRATION));
    addUser(db, JASON, 1);
    addOwnedLevel(db, LEVEL, JASON); // published, unrated: the one 0006 rates
    addOwnedLevel(db, OTHER_LEVEL, JASON, "draft"); // unrated, but only a draft
    addOwnedLevel(db, "dddddddddddd", JASON); // published, and the author spoke
    db.prepare(`UPDATE transcriptions SET difficulty_half = ? WHERE id = ?`).run(8, "dddddddddddd");

    db.exec(sqlOf(RATINGS_MIGRATION));

    assert.deepEqual(
      rows(db, `SELECT id, difficulty_half FROM transcriptions ORDER BY id`),
      [
        { id: LEVEL, difficulty_half: 5 },
        { id: OTHER_LEVEL, difficulty_half: null },
        { id: "dddddddddddd", difficulty_half: 8 },
      ],
    );
  });

  it("holds half a pepper to five, in halves, and nothing else", () => {
    const db = current((db) => {
      addUser(db, JASON, 1);
      addOwnedLevel(db, LEVEL, JASON);
    });

    for (const half of [1, 5, 10]) {
      assert.doesNotThrow(() => addRating(db, JASON, LEVEL, { half, updated_at: half }), `refused ${half}`);
      db.prepare(`DELETE FROM ratings WHERE user_id = ?`).run(JASON);
    }
    assert.throws(() => addRating(db, JASON, LEVEL, { half: 0 }), /CHECK/);
    assert.throws(() => addRating(db, JASON, LEVEL, { half: 11 }), /CHECK/);
  });

  it("will not hold a rating from nobody, nor of a level that is not there", () => {
    const db = current((db) => {
      addUser(db, JASON, 1);
      addOwnedLevel(db, LEVEL, JASON);
    });

    assert.throws(() => addRating(db, "nobody000000", LEVEL), /FOREIGN KEY/);
    assert.throws(() => addRating(db, JASON, "nolevel00000"), /FOREIGN KEY/);
    assert.doesNotThrow(() => addRating(db, JASON, LEVEL));
  });

  it("holds one rating per player per level, which is what makes the upsert an upsert", () => {
    const db = current((db) => {
      addUser(db, JASON, 1);
      addUser(db, SOMEBODY, 2);
      addOwnedLevel(db, LEVEL, JASON);
      addOwnedLevel(db, OTHER_LEVEL, JASON);
      addRating(db, JASON, LEVEL);
    });

    assert.throws(() => addRating(db, JASON, LEVEL), /UNIQUE|PRIMARY KEY/);
    assert.doesNotThrow(() => addRating(db, JASON, OTHER_LEVEL));
    assert.doesNotThrow(() => addRating(db, SOMEBODY, LEVEL));
  });

  it("lets a player's ratings go with their account, and every rating go with the level", () => {
    // JASON owns the levels and cannot be deleted while he does (0005 proves
    // the refusal); it is the solvers' accounts and the levels that go.
    const db = current((db) => {
      addUser(db, JASON, 1);
      addUser(db, SOMEBODY, 2);
      addUser(db, "3c5e7g9i1k2m", 3);
      addOwnedLevel(db, LEVEL, JASON);
      addOwnedLevel(db, OTHER_LEVEL, JASON);
      addRating(db, "3c5e7g9i1k2m", LEVEL);
      addRating(db, SOMEBODY, LEVEL);
      addRating(db, SOMEBODY, OTHER_LEVEL);
    });

    db.prepare(`DELETE FROM users WHERE id = ?`).run("3c5e7g9i1k2m");
    assert.deepEqual(
      ratingRows(db).map((row) => row.user_id),
      [SOMEBODY, SOMEBODY],
    );

    db.prepare(`DELETE FROM transcriptions WHERE id = ?`).run(LEVEL);
    assert.deepEqual(
      ratingRows(db).map((row) => [row.user_id, row.level_id]),
      [[SOMEBODY, OTHER_LEVEL]],
    );
  });

  it("refuses to move a level's id while ratings point at it, and allows it once they are forgotten", () => {
    const db = current((db) => {
      addUser(db, JASON, 1);
      addUser(db, SOMEBODY, 2);
      addOwnedLevel(db, LEVEL, JASON);
      addRating(db, SOMEBODY, LEVEL);
    });

    // The backstop: an unpublish that forgot to erase the ratings would be
    // stopped here rather than leaving votes about music the author is about
    // to change note by note.
    assert.throws(() => rotateId(db, LEVEL, "cccccccccccc"), /FOREIGN KEY/);

    db.prepare(RATING_SQL.forget).run(LEVEL);
    assert.doesNotThrow(() => rotateId(db, LEVEL, "cccccccccccc"));

    assert.deepEqual(ratingRows(db), []);
  });
});

/**
 * The rating statements the routes run, run for real, in the PROGRESS_SQL
 * spirit: the stand-in database never parses a statement, so the upsert's
 * ON CONFLICT clause is proved here or nowhere.
 */
describe("the rating statements the routes run", () => {
  const solvedBy = (): DatabaseSync =>
    current((db) => {
      addUser(db, JASON, 1);
      addUser(db, SOMEBODY, 2);
      addOwnedLevel(db, LEVEL, JASON);
      addOwnedLevel(db, OTHER_LEVEL, JASON);
    });

  const one = (db: DatabaseSync, user = SOMEBODY, level = LEVEL): Row =>
    ({ ...(db.prepare(`SELECT * FROM ratings WHERE user_id = ? AND level_id = ?`).get(user, level) as Row) });

  it("begins a rating, then changes its mind without minting a second row", () => {
    const db = solvedBy();
    const rate = db.prepare(RATING_SQL.rate);

    rate.run(SOMEBODY, LEVEL, 6, 10, 10);
    assert.deepEqual(one(db), {
      user_id: SOMEBODY,
      level_id: LEVEL,
      half: 6,
      created_at: 10,
      updated_at: 10,
    });

    rate.run(SOMEBODY, LEVEL, 9, 20, 20);
    assert.deepEqual(one(db), {
      user_id: SOMEBODY,
      level_id: LEVEL,
      half: 9,
      created_at: 10, // the birth stays; only the mind changed
      updated_at: 20,
    });
    assert.equal(ratingRows(db).length, 1);
  });

  it("reads the caller's own rating and nobody else's", () => {
    const db = solvedBy();
    db.prepare(RATING_SQL.rate).run(SOMEBODY, LEVEL, 6, 10, 10);

    assert.deepEqual({ ...(db.prepare(RATING_SQL.read).get(SOMEBODY, LEVEL) as Row) }, { half: 6 });
    assert.equal(db.prepare(RATING_SQL.read).get(JASON, LEVEL), undefined);
  });

  it("clears one player's rating and nobody else's", () => {
    const db = solvedBy();
    db.prepare(RATING_SQL.rate).run(SOMEBODY, LEVEL, 6, 10, 10);
    db.prepare(RATING_SQL.rate).run(JASON, LEVEL, 2, 10, 10);

    db.prepare(RATING_SQL.clear).run(SOMEBODY, LEVEL);

    assert.deepEqual(
      ratingRows(db).map((row) => row.user_id),
      [JASON],
    );
  });

  it("forgets every rating of one level and no other's", () => {
    const db = solvedBy();
    db.prepare(RATING_SQL.rate).run(SOMEBODY, LEVEL, 6, 10, 10);
    db.prepare(RATING_SQL.rate).run(JASON, LEVEL, 2, 10, 10);
    db.prepare(RATING_SQL.rate).run(SOMEBODY, OTHER_LEVEL, 4, 10, 10);

    db.prepare(RATING_SQL.forget).run(LEVEL);

    assert.deepEqual(
      ratingRows(db).map((row) => [row.user_id, row.level_id]),
      [[SOMEBODY, OTHER_LEVEL]],
    );
  });
});

// ---- 0007 -----------------------------------------------------------------

const addUpvote = (
  db: DatabaseSync,
  user: string,
  level: string,
  createdAt = 1,
): void => {
  db.prepare(
    `INSERT INTO upvotes (user_id, level_id, created_at) VALUES (?, ?, ?)`,
  ).run(user, level, createdAt);
};

const upvoteRows = (db: DatabaseSync): Row[] =>
  rows(db, `SELECT * FROM upvotes ORDER BY user_id, level_id`);

describe("migration 0007", () => {
  it("creates upvotes keyed by player and level, with an index on the level and nothing else", () => {
    const db = current();

    const made = rows(
      db,
      `SELECT name, type FROM sqlite_master
        WHERE tbl_name = 'upvotes' AND name NOT LIKE 'sqlite_%'
        ORDER BY name`,
    );
    assert.deepEqual(made, [
      { name: "idx_upvotes_level", type: "index" },
      { name: "upvotes", type: "table" },
    ]);
    assert.deepEqual(
      rows(db, `PRAGMA table_info(upvotes)`).map((column) => column.name),
      ["user_id", "level_id", "created_at"],
    );
  });

  it("will not hold an upvote from nobody, nor of a level that is not there", () => {
    const db = current((db) => {
      addUser(db, JASON, 1);
      addOwnedLevel(db, LEVEL, JASON);
    });

    assert.throws(() => addUpvote(db, "nobody000000", LEVEL), /FOREIGN KEY/);
    assert.throws(() => addUpvote(db, JASON, "nolevel00000"), /FOREIGN KEY/);
    assert.doesNotThrow(() => addUpvote(db, JASON, LEVEL));
  });

  it("holds one upvote per player per level, which is what makes the toggle a toggle", () => {
    const db = current((db) => {
      addUser(db, JASON, 1);
      addUser(db, SOMEBODY, 2);
      addOwnedLevel(db, LEVEL, JASON);
      addUpvote(db, JASON, LEVEL);
    });

    assert.throws(() => addUpvote(db, JASON, LEVEL), /UNIQUE|PRIMARY KEY/);
    assert.doesNotThrow(() => addUpvote(db, SOMEBODY, LEVEL));
  });

  it("lets a player's upvotes go with their account, and every upvote go with the level", () => {
    const db = current((db) => {
      addUser(db, JASON, 1);
      addUser(db, SOMEBODY, 2);
      addUser(db, "3c5e7g9i1k2m", 3);
      addOwnedLevel(db, LEVEL, JASON);
      addOwnedLevel(db, OTHER_LEVEL, JASON);
      addUpvote(db, "3c5e7g9i1k2m", LEVEL);
      addUpvote(db, SOMEBODY, LEVEL);
      addUpvote(db, SOMEBODY, OTHER_LEVEL);
    });

    db.prepare(`DELETE FROM users WHERE id = ?`).run("3c5e7g9i1k2m");
    assert.deepEqual(
      upvoteRows(db).map((row) => row.user_id),
      [SOMEBODY, SOMEBODY],
    );

    db.prepare(`DELETE FROM transcriptions WHERE id = ?`).run(LEVEL);
    assert.deepEqual(
      upvoteRows(db).map((row) => [row.user_id, row.level_id]),
      [[SOMEBODY, OTHER_LEVEL]],
    );
  });

  it("refuses to move a level's id while upvotes point at it, and allows it once they are forgotten", () => {
    const db = current((db) => {
      addUser(db, JASON, 1);
      addUser(db, SOMEBODY, 2);
      addOwnedLevel(db, LEVEL, JASON);
      addUpvote(db, SOMEBODY, LEVEL);
    });

    assert.throws(() => rotateId(db, LEVEL, "cccccccccccc"), /FOREIGN KEY/);

    db.prepare(UPVOTE_SQL.forget).run(LEVEL);
    assert.doesNotThrow(() => rotateId(db, LEVEL, "cccccccccccc"));

    assert.deepEqual(upvoteRows(db), []);
  });
});

/** The upvote statements the routes run, run for real, as for the others. */
describe("the upvote statements the routes run", () => {
  const played = (): DatabaseSync =>
    current((db) => {
      addUser(db, JASON, 1);
      addUser(db, SOMEBODY, 2);
      addOwnedLevel(db, LEVEL, JASON);
      addOwnedLevel(db, OTHER_LEVEL, JASON);
    });

  it("gives once however often it is pressed, keeping the first press's moment", () => {
    const db = played();
    const give = db.prepare(UPVOTE_SQL.give);

    give.run(SOMEBODY, LEVEL, 10);
    give.run(SOMEBODY, LEVEL, 20);

    assert.deepEqual(upvoteRows(db), [
      { user_id: SOMEBODY, level_id: LEVEL, created_at: 10 },
    ]);
  });

  it("answers whether the caller's own upvote stands, and nobody else's", () => {
    const db = played();
    db.prepare(UPVOTE_SQL.give).run(SOMEBODY, LEVEL, 10);

    assert.notEqual(db.prepare(UPVOTE_SQL.read).get(SOMEBODY, LEVEL), undefined);
    assert.equal(db.prepare(UPVOTE_SQL.read).get(JASON, LEVEL), undefined);
  });

  it("takes back one player's upvote and no other's, and forgets a level's whole", () => {
    const db = played();
    db.prepare(UPVOTE_SQL.give).run(SOMEBODY, LEVEL, 10);
    db.prepare(UPVOTE_SQL.give).run(JASON, LEVEL, 10);
    db.prepare(UPVOTE_SQL.give).run(SOMEBODY, OTHER_LEVEL, 10);

    db.prepare(UPVOTE_SQL.clear).run(SOMEBODY, LEVEL);
    assert.deepEqual(
      upvoteRows(db).map((row) => [row.user_id, row.level_id]),
      [[SOMEBODY, OTHER_LEVEL], [JASON, LEVEL]],
    );

    db.prepare(UPVOTE_SQL.forget).run(LEVEL);
    assert.deepEqual(
      upvoteRows(db).map((row) => [row.user_id, row.level_id]),
      [[SOMEBODY, OTHER_LEVEL]],
    );
  });
});

/**
 * The listing's columns, spliced and run for real: the two rating subselects
 * are the statement with the next-most syntax in it after the upserts, and
 * the share_stats join is a promise the privacy page makes.
 */
describe("the level columns the listings splice", () => {
  const listed = (db: DatabaseSync): Row[] =>
    rows(db, `SELECT ${LEVEL_COLUMNS} FROM transcriptions ORDER BY id`);

  it("counts and sums only the ratings of accounts that share their play", () => {
    const db = current((db) => {
      addUser(db, JASON, 1);
      addUser(db, SOMEBODY, 2);
      addUser(db, "3c5e7g9i1k2m", 3);
      addOwnedLevel(db, LEVEL, JASON);
      addRating(db, SOMEBODY, LEVEL, { half: 6 });
      addRating(db, "3c5e7g9i1k2m", LEVEL, { half: 9 });
    });

    const [before] = listed(db);
    assert.equal(before!.rating_count, 2);
    assert.equal(before!.rating_halves, 15);

    // The opt-out is retroactive because nothing derived is stored: the next
    // read simply no longer sees the rows.
    db.prepare(`UPDATE users SET share_stats = 0 WHERE id = ?`).run("3c5e7g9i1k2m");
    const [after] = listed(db);
    assert.equal(after!.rating_count, 1);
    assert.equal(after!.rating_halves, 6);
  });

  it("answers zero and NULL for a level nobody has rated", () => {
    const db = current((db) => {
      addUser(db, JASON, 1);
      addOwnedLevel(db, LEVEL, JASON);
    });

    const [row] = listed(db);
    assert.equal(row!.rating_count, 0);
    assert.equal(row!.rating_halves, null);
    assert.equal(row!.upvote_count, 0);
    assert.equal(row!.solve_count, 0);
  });

  it("counts hearts only from accounts that share their play", () => {
    const db = current((db) => {
      addUser(db, JASON, 1);
      addUser(db, SOMEBODY, 2);
      addUser(db, "3c5e7g9i1k2m", 3);
      addOwnedLevel(db, LEVEL, JASON);
      addUpvote(db, SOMEBODY, LEVEL);
      addUpvote(db, "3c5e7g9i1k2m", LEVEL);
    });
    db.prepare(`UPDATE users SET share_stats = 0 WHERE id = ?`).run("3c5e7g9i1k2m");

    const [row] = listed(db);
    assert.equal(row!.upvote_count, 1);
  });

  it("counts solvers who share their play, and never the level's own author", () => {
    const db = current((db) => {
      addUser(db, JASON, 1);
      addUser(db, SOMEBODY, 2);
      addUser(db, "3c5e7g9i1k2m", 3);
      addOwnedLevel(db, LEVEL, JASON);
      // The author solved their own level; two players did too, one of whom
      // keeps their play out of the figures; a fourth row is still unsolved.
      addProgress(db, JASON, LEVEL, { check_count: 1, solved_at: 5 });
      addProgress(db, SOMEBODY, LEVEL, { check_count: 2, solved_at: 6 });
      addProgress(db, "3c5e7g9i1k2m", LEVEL, { check_count: 1, solved_at: 7 });
    });
    db.prepare(`UPDATE users SET share_stats = 0 WHERE id = ?`).run("3c5e7g9i1k2m");

    const [row] = listed(db);
    assert.equal(row!.solve_count, 1);
  });
});
