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
 * `batch` runs its statements one after another, exactly as `run` would, and
 * records which statements went together in `batches`. There is no
 * transaction to be in, so nothing here can prove that a batch is atomic; what
 * a test can prove is that a route chose to batch, and what it put in the
 * batch and in what order — which is the decision the route makes.
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
 *
 * `throws` is what the database says instead of answering — a UNIQUE index
 * refusing a name is the one a route has to handle. An `Error` is thrown
 * every time the statement runs; a function is asked each time, with how many
 * times this answer has run before, so a test can have the first try refused
 * and the next accepted.
 */
export type Answer = {
  when: RegExp;
  first?: Row;
  rows?: readonly Row[];
  throws?: Error | ((nth: number) => Error | undefined);
};

/** Whatever the statement, this row — for a test with only one query in view. */
export const anyFirst = (first: Row): Answer => ({ when: /./u, first });

export const anyRows = (rows: readonly Row[]): Answer => ({ when: /./u, rows });

type Statement = ReturnType<Database["prepare"]>;

/** A prepared statement that remembers which `Asked` it is, for `batch`. */
type StubStatement = Statement & { record: Asked };

export function stubDatabase(answers: readonly Answer[] = []): {
  asked: Asked[];
  batches: Asked[][];
  db: Database;
  env: { DB: Database };
} {
  const asked: Asked[] = [];
  const batches: Asked[][] = [];
  const ran = new Map<Answer, number>();
  const db: Database = {
    prepare(sql: string) {
      const record: Asked = { sql, values: [] };
      asked.push(record);
      const answer = answers.find((each) => each.when.test(sql));
      /** What the database would have said instead of answering, if anything. */
      const refusal = (): Error | undefined => {
        if (answer?.throws === undefined) return undefined;
        const nth = ran.get(answer) ?? 0;
        ran.set(answer, nth + 1);
        return typeof answer.throws === "function" ? answer.throws(nth) : answer.throws;
      };
      const running = async <T>(result: () => T): Promise<T> => {
        const thrown = refusal();
        if (thrown !== undefined) throw thrown;
        return result();
      };
      const statement: StubStatement = {
        record,
        bind(...values: unknown[]) {
          record.values = values;
          return statement;
        },
        all: () => running(() => ({ results: [...(answer?.rows ?? [])] })),
        first: () => running(() => answer?.first ?? null),
        run: () => running(() => ({ success: true })),
      };
      return statement;
    },
    async batch(statements) {
      batches.push(statements.map((each) => (each as StubStatement).record));
      const results = [];
      for (const each of statements) {
        results.push(await each.run());
      }
      return results;
    },
  };
  return { asked, batches, db, env: { DB: db } };
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
