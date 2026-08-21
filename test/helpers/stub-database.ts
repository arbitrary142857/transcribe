/**
 * Enough of D1 for the route tests.
 *
 * It keeps every statement and every value it was asked to bind — which is how
 * the tests check what the server decided rather than what the request
 * claimed — and it answers each statement by the first `Answer` whose pattern
 * matches the statement's text. That routing is the whole reason this is one
 * shared helper rather than a fixed row returned to every query: the moment a
 * route asks who is calling before it reads a level, a test has to be able to
 * say "the sessions query gets a session row and the transcriptions query gets
 * a level", and a stand-in that answered both with one row would hand the
 * level to the session lookup.
 *
 * Patterns are tested with `RegExp.test`, so they must not carry the `g` flag,
 * whose `lastIndex` would make the second test of the same pattern lie.
 */

import type { Database } from "../../dist-worker/worker/routes.js";

export type Row = Record<string, unknown>;

export type Asked = { sql: string; values: unknown[] };

/**
 * One answer the stand-in gives, to any statement whose text matches `when`.
 * `first` answers `.first()`, `rows` answers `.all()`; a statement matching
 * nothing gets `null` and `[]`, as an empty table would give.
 */
export type Answer = {
  when: RegExp;
  first?: Row;
  rows?: readonly Row[];
};

/** Whatever the statement, this row — for a test with only one query in view. */
export const anyFirst = (first: Row): Answer => ({ when: /./u, first });

export const anyRows = (rows: readonly Row[]): Answer => ({ when: /./u, rows });

export function stubDatabase(answers: readonly Answer[] = []): {
  asked: Asked[];
  db: Database;
  env: { DB: Database };
} {
  const asked: Asked[] = [];
  const db: Database = {
    prepare(sql: string) {
      const record: Asked = { sql, values: [] };
      asked.push(record);
      const answer = answers.find((each) => each.when.test(sql));
      const statement = {
        bind(...values: unknown[]) {
          record.values = values;
          return statement;
        },
        all: async () => ({ results: [...(answer?.rows ?? [])] }),
        first: async () => answer?.first ?? null,
        run: async () => ({ success: true }),
      };
      return statement;
    },
  };
  return { asked, db, env: { DB: db } };
}

/**
 * The values an INSERT bound, by the column order the statement names.
 *
 * Reads from the first `(` to the first `)`, so it holds only while the column
 * list is the first parenthesised thing in the statement and has no subquery
 * in it — which is how every INSERT in the worker is written.
 */
export const boundColumns = (
  sql: string,
  values: readonly unknown[],
): Record<string, unknown> => {
  const names = sql
    .slice(sql.indexOf("(") + 1, sql.indexOf(")"))
    .split(",")
    .map((name) => name.trim());
  return Object.fromEntries(names.map((name, index) => [name, values[index]]));
};

export const errorOf = async (response: Response): Promise<string> =>
  ((await response.json()) as { error: string }).error;
