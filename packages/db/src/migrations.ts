/**
 * The migration set, as data, so the contract can be a TEST rather than a paragraph in a README.
 *
 * The Lark database contract (`AGENTS.md` in that repo) is five rules that were each written after
 * something broke: additive-only, idempotent, rollback-written-first, RLS on, and state the literal
 * vocabulary of every CHECK. Four of the five are mechanically checkable, and a rule that is
 * checkable and unchecked is a rule that decays. `test/migrations.test.ts` runs them.
 *
 * The parser is deliberately dumb - it reads SQL as text. That is honest about what it is: a lint,
 * not a planner. Its one job is to make a missing `enable row level security` fail a test run
 * instead of failing an audit.
 */

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Resolves to `<repo>/supabase/migrations` from either `src/` or the built `dist/`, same depth.
 *
 * THIS MODULE IS NOT REACHABLE FROM `@slop/db`. Turbopack reads the `new URL(..., import.meta.url)`
 * below as a static asset reference - a directory is not an asset, so the reference fails the
 * build of any bundle that contains this file - and moving it inside a function does not help,
 * because the analysis is syntactic. So the barrel does not re-export it and `apps/web` cannot
 * pull it in behind `InMemoryDatabase`. Import it as `@slop/db/migrations`, from a test.
 */
export const MIGRATIONS_DIR = fileURLToPath(new URL("../../../supabase/migrations/", import.meta.url));

export interface Migration {
  readonly file: string;
  readonly number: number;
  readonly sql: string;
  /** The section above the `-- ROLLBACK:` marker: everything that actually executes. */
  readonly forward: string;
  /** The commented undo block. Present or the file is not runnable under the contract. */
  readonly rollback: string | null;
}

const ROLLBACK_MARKER = "-- ROLLBACK:";

export function loadMigrations(dir: string = MIGRATIONS_DIR): readonly Migration[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".sql") && !f.startsWith("_"))
    .sort()
    .map((file) => {
      const sql = readFileSync(new URL(file, `file://${dir.replace(/\\/g, "/")}`), "utf8");
      const at = sql.indexOf(ROLLBACK_MARKER);
      const numberPart = /^(\d+)/.exec(file)?.[1];
      if (numberPart === undefined) throw new Error(`migration ${file} does not start with a number`);
      return {
        file,
        number: Number(numberPart),
        sql,
        forward: at === -1 ? sql : sql.slice(0, at),
        rollback: at === -1 ? null : sql.slice(at + ROLLBACK_MARKER.length),
      };
    });
}

/** Strip comments so a rule cannot be satisfied - or violated - by prose. */
export function executableSql(sql: string): string {
  return sql
    .split(/\r?\n/)
    .map((line) => {
      const at = line.indexOf("--");
      return at === -1 ? line : line.slice(0, at);
    })
    .join("\n");
}

/** Tables created by a migration, in order of creation. */
export function createdTables(sql: string): readonly string[] {
  return [...executableSql(sql).matchAll(/create table if not exists\s+public\.(\w+)/gi)].map(
    (m) => m[1] as string,
  );
}

export function tablesWithRls(sql: string): readonly string[] {
  return [...executableSql(sql).matchAll(/alter table\s+public\.(\w+)\s+enable row level security/gi)].map(
    (m) => m[1] as string,
  );
}

/**
 * Statements that remove or rewrite something. Blocked in a forward migration by the
 * expand-before-contract rule: removal is a separate later file, run after the new code is proven.
 */
export const DESTRUCTIVE_PATTERNS: readonly { readonly name: string; readonly pattern: RegExp }[] = [
  { name: "drop table", pattern: /\bdrop\s+table\b/i },
  { name: "drop column", pattern: /\bdrop\s+column\b/i },
  { name: "drop view", pattern: /\bdrop\s+view\b/i },
  { name: "truncate", pattern: /\btruncate\b/i },
  { name: "delete from", pattern: /\bdelete\s+from\b/i },
  { name: "alter column type", pattern: /\balter\s+column\s+\w+\s+type\b/i },
];

/**
 * Creations that are not idempotent.
 *
 * `create or replace` counts as idempotent for functions and views; a bare `create table`,
 * `create index` or `create policy` does not, and a policy specifically cannot be `if not exists`
 * in Postgres, which is why every policy in this set lives inside a guarded `do $$` block.
 */
export const NON_IDEMPOTENT_PATTERNS: readonly { readonly name: string; readonly pattern: RegExp }[] = [
  { name: "create table without if not exists", pattern: /\bcreate\s+table\s+(?!if not exists)/i },
  { name: "create index without if not exists", pattern: /\bcreate\s+(unique\s+)?index\s+(?!if not exists|concurrently)/i },
  { name: "create function without or replace", pattern: /\bcreate\s+function\b/i },
  { name: "create view without or replace", pattern: /\bcreate\s+view\b/i },
];
