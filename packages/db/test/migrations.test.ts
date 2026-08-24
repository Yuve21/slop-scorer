/**
 * The database contract, executed.
 *
 * Every rule below was written after something broke on Lark Dating, and each one is here because
 * it can be checked mechanically. A checkable rule left as prose in a README is a rule that decays
 * quietly: the schema record in that repo drifted six migrations behind the database it described,
 * including two security fixes, and nothing failed until somebody needed a rebuild.
 *
 * The suite also mutation-tests its own parser. A lint whose pattern cannot express the thing it
 * forbids passes forever - which is exactly how a `[a-z_]+` regex once skipped
 * `wingman_nudge2_sent_at` and left a security leak open for four commits.
 */

import { describe, expect, it } from "vitest";
import {
  DESTRUCTIVE_PATTERNS,
  NON_IDEMPOTENT_PATTERNS,
  createdTables,
  executableSql,
  loadMigrations,
  tablesWithRls,
} from "@slop/db";
import type {
  GauntletArtifactRow,
  GauntletGuessRow,
  GauntletParticipantRow,
  GauntletRoundRow,
  NotaryChainRow,
  NotaryCredentialRow,
  NotaryEventRow,
  NotaryRecordingRow,
  NotaryTimestampRow,
  SubstantiationRunRow,
} from "@slop/db";
import { InMemoryDatabase } from "@slop/db";

const migrations = loadMigrations();
const allSql = migrations.map((m) => m.sql).join("\n");
const allForward = migrations.map((m) => m.forward).join("\n");

/** Columns declared inside `create table if not exists public.<name> ( ... );`. */
function declaredColumns(sql: string, table: string): readonly string[] {
  const start = new RegExp(`create table if not exists\\s+public\\.${table}\\s*\\(`, "i").exec(executableSql(sql));
  if (start === null) throw new Error(`no create statement for ${table}`);
  const body = executableSql(sql).slice(start.index + start[0].length);
  let depth = 1;
  let end = 0;
  while (end < body.length && depth > 0) {
    if (body[end] === "(") depth += 1;
    if (body[end] === ")") depth -= 1;
    end += 1;
  }
  const NOT_A_COLUMN = new Set(["constraint", "primary", "unique", "check", "foreign", "exclude", "like"]);
  return body
    .slice(0, end - 1)
    .split("\n")
    .map((l) => l.trim())
    .map((l) => /^([a-z_][a-z0-9_]*)\s+/i.exec(l)?.[1]?.toLowerCase())
    .filter((n): n is string => n !== undefined && !NOT_A_COLUMN.has(n));
}

const snake = (s: string): string => s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

describe("the migration set is loadable and the parser can see it", () => {
  it("finds every file, numbered and ordered", () => {
    // The denominator. Every assertion below iterates this list, so an empty list is a green suite
    // that checked nothing.
    expect(migrations.length).toBeGreaterThanOrEqual(3);
    const numbers = migrations.map((m) => m.number);
    expect(numbers).toEqual([...numbers].sort((a, b) => a - b));
    expect(new Set(numbers).size, "two migrations share a number").toBe(numbers.length);
  });

  it("sees the tables it is about to make assertions about", () => {
    const tables = migrations.flatMap((m) => createdTables(m.sql));
    for (const expected of [
      "gauntlet_artifacts",
      "gauntlet_rounds",
      "gauntlet_participants",
      "gauntlet_guesses",
      "gauntlet_rate_limits",
      "notary_chains",
      "notary_events",
      "notary_timestamps",
      "notary_credentials",
      "notary_recordings",
      "substantiation_runs",
    ]) {
      expect(tables, `the table parser cannot see ${expected}, so it proves nothing`).toContain(expected);
    }
  });
});

describe("rule 1: additive only", () => {
  for (const migration of migrations) {
    it(`${migration.file} removes nothing`, () => {
      const forward = executableSql(migration.forward);
      const hits = DESTRUCTIVE_PATTERNS.filter((p) => p.pattern.test(forward)).map((p) => p.name);
      expect(hits, `removal belongs in a separate later migration`).toEqual([]);
    });
  }

  it("would catch a drop if one were added", () => {
    const injected = "alter table public.gauntlet_guesses drop column correct;";
    expect(DESTRUCTIVE_PATTERNS.some((p) => p.pattern.test(injected))).toBe(true);
  });
});

describe("rule 2: idempotent", () => {
  for (const migration of migrations) {
    it(`${migration.file} can be replayed`, () => {
      const forward = executableSql(migration.forward);
      const hits = NON_IDEMPOTENT_PATTERNS.filter((p) => p.pattern.test(forward)).map((p) => p.name);
      expect(hits).toEqual([]);
    });
  }

  it("policies are created inside a guarded block, because a policy cannot be `if not exists`", () => {
    const policyCount = [...executableSql(allForward).matchAll(/create policy/gi)].length;
    expect(policyCount).toBeGreaterThan(5);
    // Every `create policy` must be preceded, in its own file, by the pg_policies existence guard.
    for (const migration of migrations) {
      const forward = executableSql(migration.forward);
      const policies = [...forward.matchAll(/create policy\s+(\w+)/gi)].map((m) => m[1] as string);
      for (const name of policies) {
        expect(
          forward,
          `policy ${name} is created without an existence guard, so replaying the file fails`,
        ).toContain(`policyname = '${name}'`);
      }
    }
  });

  it("would catch a bare create table", () => {
    expect(NON_IDEMPOTENT_PATTERNS.some((p) => p.pattern.test("create table public.x (a int);"))).toBe(true);
  });
});

describe("rule 3: rollback written first", () => {
  for (const migration of migrations) {
    it(`${migration.file} carries a runnable undo block`, () => {
      expect(migration.rollback, "no -- ROLLBACK: block").not.toBeNull();
      const undo = migration.rollback as string;
      // Every table the forward section creates must be named in the undo section. A rollback that
      // forgets a table leaves the schema in a state neither direction describes.
      for (const table of createdTables(migration.sql)) {
        expect(undo, `${table} is created and never dropped in the rollback`).toContain(table);
      }
      expect(undo).toMatch(/drop\s+(table|view|function)/i);
    });
  }
});

describe("rule 4: RLS on, deny first", () => {
  for (const migration of migrations) {
    const tables = createdTables(migration.sql);
    const enabled = new Set(tablesWithRls(migration.sql));
    for (const table of tables) {
      it(`${table} has row level security enabled`, () => {
        expect(enabled.has(table), `${table} was created without enabling RLS`).toBe(true);
      });
      it(`${table} revokes the default grants`, () => {
        // Supabase grants anon and authenticated by default on new tables in `public`. Without an
        // explicit revoke, every column is readable and the per-column grants below are decoration.
        expect(
          executableSql(migration.forward),
          `${table} never revokes from anon, authenticated`,
        ).toMatch(new RegExp(`revoke all on public\\.${table}\\s+from anon, authenticated`, "i"));
      });
    }
  }

  it("the answer key is granted to nobody", () => {
    // The one leak that would end the gauntlet: a grant that includes the label or the answer index.
    const grants = [...executableSql(allForward).matchAll(/grant select \(([^)]*)\)\s*\n?\s*on public\.(\w+)/gi)];
    expect(grants.length).toBeGreaterThan(5);
    for (const [, columns, table] of grants) {
      const cols = (columns as string).split(",").map((c) => c.trim());
      if (table === "gauntlet_artifacts") {
        expect(cols, "label is the answer").not.toContain("label");
        expect(cols, "source names the project and its maintainers").not.toContain("source");
        expect(cols, "provenance names people").not.toContain("provenance");
      }
      if (table === "gauntlet_rounds") expect(cols).not.toContain("human_index");
    }
  });

  it("grants no client role any access to the discrimination view", () => {
    // The view carries `label` for every artifact in the pool, so one grant on it is the whole
    // answer key for every future round.
    expect(executableSql(allForward)).toMatch(
      /revoke all on public\.gauntlet_artifact_discrimination\s+from anon, authenticated/i,
    );
    expect(executableSql(allForward)).not.toMatch(/grant [^;]*on public\.gauntlet_artifact_discrimination/i);
  });

  it("the rate limiter has no policy at all", () => {
    expect(executableSql(allForward)).not.toMatch(/create policy[^;]*on public\.gauntlet_rate_limits/i);
  });
});

describe("rule 5: every CHECK vocabulary is stated in words", () => {
  // The Lark outage: `role_pref` allowed ('dater','wingman','both','duo') while the product had
  // been renamed to "matchmaker" in copy, and writing the app-facing word 500'd every signup. The
  // rule that came out of it is that an enum-ish CHECK must spell out its literal values in a
  // comment a reader of the migration cannot miss.
  const enumChecks = [...allSql.matchAll(/check\s*\(\s*(\w+)\s+in\s*\(([^)]*)\)/gi)];

  it("finds the enum-shaped checks", () => {
    expect(enumChecks.length).toBeGreaterThanOrEqual(6);
  });

  for (const migration of migrations) {
    const checks = [...migration.sql.matchAll(/check\s*\(\s*(\w+)\s+in\s*\(([^)]*)\)/gi)];
    for (const [, column, values] of checks) {
      it(`${migration.file}: ${column} states its allowed values`, () => {
        expect(migration.sql).toContain("Literal allowed values");
        for (const value of (values as string).split(",").map((v) => v.trim())) {
          expect(
            migration.sql.slice(0, migration.sql.indexOf(`check (${column} in`)),
            `${column} allows ${value} and no comment above it says so`,
          ).toContain(value.replace(/'/g, ""));
        }
      });
    }
  }
});

describe("the TypeScript mirror agrees with the SQL, column for column", () => {
  /**
   * Each sample below is typed, so the COMPILER rejects a missing or misspelled field, and its keys
   * are compared with the SQL, so the TEST rejects a column that exists in only one of the two
   * descriptions. Neither check alone catches drift in both directions.
   */
  const samples: readonly { readonly table: string; readonly keys: readonly string[] }[] = [
    {
      table: "gauntlet_artifacts",
      keys: Object.keys({
        artifactId: "",
        corpus: "",
        label: "human",
        source: "",
        provenance: "",
        presentation: {},
        captureDate: "",
        retiredAt: null,
        addedAt: "",
      } satisfies GauntletArtifactRow),
    },
    {
      table: "gauntlet_rounds",
      keys: Object.keys({
        roundId: "",
        dayKey: "",
        slot: 0,
        seed: "",
        builderVersion: 1,
        artifactIds: [],
        humanIndex: 0,
        builtAt: "",
      } satisfies GauntletRoundRow),
    },
    {
      table: "gauntlet_participants",
      keys: Object.keys({
        participantId: "",
        alias: null,
        currentStreak: 0,
        longestStreak: 0,
        roundsPlayed: 0,
        roundsCorrect: 0,
        lastPlayedDay: null,
        createdAt: "",
      } satisfies GauntletParticipantRow),
    },
    {
      table: "gauntlet_guesses",
      keys: Object.keys({
        guessId: "",
        roundId: "",
        participantId: "",
        chosenIndex: 0,
        chosenArtifactId: "",
        correct: false,
        servedAt: "",
        answeredAt: "",
        elapsedMs: 0,
        clientReportedMs: null,
        timingDisputed: false,
        createdAt: "",
      } satisfies GauntletGuessRow),
    },
    {
      table: "notary_chains",
      keys: Object.keys({
        chainId: "",
        ownerId: "",
        subjectSha256: null,
        disclosure: "private",
        rootSha256: null,
        eventCount: 0,
        createdAt: "",
        closedAt: null,
      } satisfies NotaryChainRow),
    },
    {
      table: "notary_events",
      keys: Object.keys({
        eventId: "",
        chainId: "",
        sequence: 0,
        kind: "draft",
        contentSha256: "",
        byteLength: 0,
        declaredAt: "",
        recordedAt: "",
        leafSha256: "",
        prevSha256: null,
        metadata: {},
      } satisfies NotaryEventRow),
    },
    {
      table: "notary_timestamps",
      keys: Object.keys({
        timestampId: "",
        chainId: "",
        rootSha256: "",
        authorityId: "",
        authorityUrl: "",
        jurisdiction: "",
        status: "granted",
        genTime: null,
        token: null,
        failureReason: null,
        requestedAt: "",
      } satisfies NotaryTimestampRow),
    },
    {
      table: "notary_credentials",
      keys: Object.keys({
        credentialId: "",
        chainId: "",
        rootSha256: "",
        statement: "",
        statementVersion: 1,
        eventCount: 0,
        authorityCount: 0,
        jurisdictionCount: 0,
        earliestGenTime: null,
        issuedAt: "",
        revokedAt: null,
        revocationReason: null,
      } satisfies NotaryCredentialRow),
    },
    {
      table: "notary_recordings",
      keys: Object.keys({
        recordingId: "",
        chainId: "",
        sourceTool: "procreate",
        parserId: "",
        frameCount: 0,
        durationMs: 0,
        finalFileSha256: null,
        unparsedFields: [],
        ingestedAt: "",
      } satisfies NotaryRecordingRow),
    },
    {
      table: "substantiation_runs",
      keys: Object.keys({
        runId: "",
        kind: "gauntlet-discrimination",
        corpusVersion: "",
        sampleSize: 0,
        minimumSample: 0,
        payload: {},
        producedBy: "",
        computedAt: "",
        publishedAt: null,
        supersededBy: null,
      } satisfies SubstantiationRunRow),
    },
  ];

  for (const sample of samples) {
    it(`${sample.table}`, () => {
      const sqlColumns = [...declaredColumns(allSql, sample.table)].sort();
      const tsColumns = sample.keys.map(snake).sort();
      expect(tsColumns).toEqual(sqlColumns);
    });
  }

  it("the discrimination view and its in-memory twin return the same fields", async () => {
    // Two implementations of one aggregate. The SQL one runs in production, the TypeScript one runs
    // in every test, and nothing but this assertion stops them diverging.
    const viewSelect = /create or replace view public\.gauntlet_artifact_discrimination as([\s\S]*?);\n/i.exec(
      executableSql(allSql),
    )?.[1];
    expect(viewSelect, "the view could not be located, so this proves nothing").toBeTruthy();
    const aliases = [...(viewSelect as string).matchAll(/\bas\s+(\w+)\s*[,\n]/gi)].map((m) =>
      (m[1] as string).toLowerCase(),
    );
    const viewColumns = new Set([
      ...aliases,
      // The un-aliased passthrough columns at the top of the select list.
      "artifact_id",
      "corpus",
      "label",
      "source",
      "provenance",
    ]);

    const db = new InMemoryDatabase();
    await db.upsertArtifacts([
      {
        artifactId: "a",
        corpus: "code",
        label: "human",
        source: "s",
        provenance: "p",
        presentation: {},
        captureDate: "2026-08-24",
        retiredAt: null,
        addedAt: "2026-08-24T00:00:00.000Z",
      },
    ]);
    const rows = await db.discrimination();
    expect(rows.length).toBe(1);
    const memoryColumns = Object.keys(rows[0] as object).map(snake).sort();
    expect(memoryColumns).toEqual([...viewColumns].sort());
  });
});

describe("no secret is in the repository", () => {
  it("no migration contains anything shaped like a key", () => {
    // JWTs start `eyJ`; Supabase service keys are JWTs. Postgres URLs carry a password.
    expect(allSql).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}/);
    expect(allSql).not.toMatch(/postgres(ql)?:\/\/[^\s]*:[^\s]*@/);
    expect(allSql).not.toMatch(/sk_live|service_role_key\s*=/i);
  });
});
