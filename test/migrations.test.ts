import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { describe, it } from "node:test";

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
