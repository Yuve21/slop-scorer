/**
 * Both adapters, against the same contract.
 *
 * `InMemoryDatabase` is exercised behaviourally, because everything above it is tested against it
 * and a lenient fake makes the packages above it look correct. `SupabaseDatabase` is exercised on
 * the WIRE: a fake `fetch` records the method, the URL, the headers and the body, so what is
 * asserted is what PostgREST would receive rather than that a mock was called.
 *
 * The three behaviours worth the most here are the concurrent ones, because they are the ones a
 * single-player test never reaches: two servers building today's round, one player double-tapping
 * submit, and two writers appending to the same chain.
 */

import { describe, expect, it } from "vitest";
import { InMemoryDatabase, PostgrestError, SequenceConflictError, SupabaseDatabase } from "@slop/db";
import type { FetchLike, GauntletGuessRow, GauntletRoundRow, NotaryEventRow } from "@slop/db";
import { readSupabaseEnv, SUPABASE_ENV_VARS } from "@slop/db";

const T0 = "2026-08-24T12:00:00.000Z";

const round = (over: Partial<GauntletRoundRow> = {}): GauntletRoundRow => ({
  roundId: "r1",
  dayKey: "2026-08-24",
  slot: 0,
  seed: "seed",
  builderVersion: 1,
  artifactIds: ["a", "b", "c", "d", "e"],
  humanIndex: 2,
  builtAt: T0,
  ...over,
});

const guess = (over: Partial<GauntletGuessRow> = {}): GauntletGuessRow => ({
  guessId: "g1",
  roundId: "r1",
  participantId: "p1",
  chosenIndex: 2,
  chosenArtifactId: "c",
  correct: true,
  servedAt: T0,
  answeredAt: T0,
  elapsedMs: 4200,
  clientReportedMs: 4180,
  timingDisputed: false,
  createdAt: T0,
  ...over,
});

const event = (sequence: number, over: Partial<NotaryEventRow> = {}): NotaryEventRow => ({
  eventId: `e${sequence}`,
  chainId: "c1",
  sequence,
  kind: "draft",
  contentSha256: "a".repeat(64),
  byteLength: 10,
  declaredAt: T0,
  recordedAt: T0,
  leafSha256: "b".repeat(64),
  prevSha256: null,
  metadata: {},
  ...over,
});

describe("InMemoryDatabase honours the constraints the SQL declares", () => {
  it("converges two concurrent round builds on one round", async () => {
    const db = new InMemoryDatabase();
    const mine = await db.insertRoundIfAbsent(round({ roundId: "r-mine" }));
    const theirs = await db.insertRoundIfAbsent(round({ roundId: "r-theirs", seed: "different" }));
    // The unique index is (day_key, slot). The second builder reads the winner rather than
    // producing a second round for the same day, which would split the day's labels in two.
    expect(theirs.roundId).toBe(mine.roundId);
    expect(theirs.seed).toBe("seed");
  });

  it("takes exactly one guess per player per round, and keeps the FIRST", async () => {
    const db = new InMemoryDatabase();
    await db.insertRoundIfAbsent(round());
    const first = await db.insertGuessIfAbsent(guess({ chosenIndex: 0, chosenArtifactId: "a", correct: false }));
    const second = await db.insertGuessIfAbsent(guess({ guessId: "g2", chosenIndex: 2, chosenArtifactId: "c", correct: true }));
    expect(first.alreadyAnswered).toBe(false);
    expect(second.alreadyAnswered).toBe(true);
    // The retry does not overwrite. A player who could resubmit until correct would make every
    // discrimination rate in the published table a measurement of the retry loop.
    expect(second.stored.correct).toBe(false);
    expect((await db.guessesForRound("r1")).length).toBe(1);
  });

  it("counts rate-limit overage rather than clamping it", async () => {
    const db = new InMemoryDatabase();
    const counts: number[] = [];
    for (let i = 0; i < 5; i += 1) counts.push(await db.bumpRateLimit("p1", T0, 3));
    expect(counts).toEqual([1, 2, 3, 4, 5]);
    // Different window, fresh count.
    expect(await db.bumpRateLimit("p1", "2026-08-24T13:00:00.000Z", 3)).toBe(1);
  });

  it("runs a streak forward on consecutive days, and breaks it on a miss", async () => {
    const db = new InMemoryDatabase();
    await db.ensureParticipant("p1");
    await db.recordPlay("p1", "2026-08-22", true);
    await db.recordPlay("p1", "2026-08-23", true);
    const third = await db.recordPlay("p1", "2026-08-24", true);
    expect(third.currentStreak).toBe(3);
    expect(third.longestStreak).toBe(3);
    const missed = await db.recordPlay("p1", "2026-08-25", false);
    expect(missed.currentStreak).toBe(0);
    expect(missed.longestStreak, "the record survives the break").toBe(3);
    expect(missed.roundsPlayed).toBe(4);
    expect(missed.roundsCorrect).toBe(3);
  });

  it("skips a day and restarts the streak at one", async () => {
    const db = new InMemoryDatabase();
    await db.ensureParticipant("p1");
    await db.recordPlay("p1", "2026-08-20", true);
    const later = await db.recordPlay("p1", "2026-08-24", true);
    expect(later.currentStreak).toBe(1);
  });

  it("refuses a second event at one sequence rather than forking the chain", async () => {
    const db = new InMemoryDatabase();
    await db.createChain({
      chainId: "c1",
      ownerId: "o1",
      subjectSha256: null,
      disclosure: "private",
      rootSha256: null,
      eventCount: 0,
      createdAt: T0,
      closedAt: null,
    });
    await db.appendEvents("c1", [event(0), event(1)], "r".repeat(64));
    await expect(db.appendEvents("c1", [event(1, { eventId: "other" })], "z".repeat(64))).rejects.toThrow(
      SequenceConflictError,
    );
    expect((await db.listEvents("c1")).length).toBe(2);
    expect((await db.getChain("c1"))?.rootSha256).toBe("r".repeat(64));
  });

  it("does not publish an unpublished substantiation run", async () => {
    const db = new InMemoryDatabase();
    await db.recordRun({
      runId: "run1",
      kind: "gauntlet-discrimination",
      corpusVersion: "v1",
      sampleSize: 400,
      minimumSample: 30,
      payload: {},
      producedBy: "test",
      computedAt: T0,
      publishedAt: null,
      supersededBy: null,
    });
    expect((await db.publishedRuns("gauntlet-discrimination")).length).toBe(0);
  });
});

/* ------------------------------------------------------------------------------------------- */

interface Recorded {
  readonly url: string;
  readonly method: string;
  readonly headers: Record<string, string>;
  readonly body: unknown;
}

function recorder(responses: readonly { status: number; body: string }[]): {
  fetch: FetchLike;
  calls: Recorded[];
} {
  const calls: Recorded[] = [];
  let i = 0;
  const fetch: FetchLike = async (url, init) => {
    calls.push({
      url,
      method: init.method as string,
      headers: init.headers as Record<string, string>,
      body: init.body === undefined ? undefined : JSON.parse(init.body as string),
    });
    const next = responses[i] ?? { status: 200, body: "[]" };
    i += 1;
    return new Response(next.body, { status: next.status });
  };
  return { fetch, calls };
}

const env = { url: "https://example.supabase.co", serviceRoleKey: "test-key", schema: "public" };

describe("SupabaseDatabase, on the wire", () => {
  it("reads the pool with the service role and excludes retired artifacts", async () => {
    const { fetch, calls } = recorder([{ status: 200, body: "[]" }]);
    await new SupabaseDatabase({ env, fetch }).listPoolArtifacts();
    const call = calls[0] as Recorded;
    expect(call.method).toBe("GET");
    expect(call.url).toContain("/rest/v1/gauntlet_artifacts");
    expect(call.url).toContain("retired_at=is.null");
    expect(call.headers.authorization).toBe("Bearer test-key");
  });

  it("treats a duplicate round as a win and reads the winner", async () => {
    const { fetch, calls } = recorder([
      // PostgREST answers an ignored duplicate with an empty representation, not an error.
      { status: 201, body: "" },
      { status: 200, body: JSON.stringify([{ round_id: "r-theirs", day_key: "2026-08-24", slot: 0, seed: "theirs", builder_version: 1, artifact_ids: ["a"], human_index: 0, built_at: T0 }]) },
    ]);
    const out = await new SupabaseDatabase({ env, fetch }).insertRoundIfAbsent(round({ roundId: "r-mine" }));
    expect(out.roundId).toBe("r-theirs");
    expect((calls[0] as Recorded).headers.prefer).toBe("resolution=ignore-duplicates,return=representation");
    // And the columns went out snake_cased, which is the only mapping in the adapter.
    expect(Object.keys((calls[0] as Recorded).body as object[])).toEqual(["0"]);
    expect(((calls[0] as Recorded).body as Record<string, unknown>[])[0]).toHaveProperty("human_index", 2);
  });

  it("turns a duplicate event into a fork error rather than swallowing it", async () => {
    const { fetch } = recorder([{ status: 409, body: JSON.stringify({ code: "23505", message: "duplicate key" }) }]);
    await expect(
      new SupabaseDatabase({ env, fetch }).appendEvents("c1", [event(1)], "r".repeat(64)),
    ).rejects.toThrow(SequenceConflictError);
  });

  it("names the table and the SQLSTATE in an error, and nothing from the row", async () => {
    const { fetch } = recorder([
      { status: 400, body: JSON.stringify({ code: "22P02", message: "invalid input syntax" }) },
    ]);
    const db = new SupabaseDatabase({ env, fetch });
    const failure = await db.recordRun({
      runId: "run1",
      kind: "detector-calibration",
      corpusVersion: "v1",
      sampleSize: 1,
      minimumSample: 1,
      payload: { secret: "should-not-appear" },
      producedBy: "test",
      computedAt: T0,
      publishedAt: null,
      supersededBy: null,
    }).catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(PostgrestError);
    expect((failure as Error).message).toContain("substantiation_runs");
    expect((failure as Error).message).toContain("22P02");
    expect((failure as Error).message, "the failing row must not be quoted back into a log").not.toContain(
      "should-not-appear",
    );
  });

  it("calls the atomic RPCs rather than reading and writing", async () => {
    const { fetch, calls } = recorder([{ status: 200, body: "7" }]);
    const count = await new SupabaseDatabase({ env, fetch }).bumpRateLimit("p1", T0, 5);
    expect(count).toBe(7);
    expect((calls[0] as Recorded).url).toContain("/rest/v1/rpc/slop_gauntlet_bump_rate_limit");
    expect((calls[0] as Recorded).body).toEqual({ p_participant: "p1", p_window: T0, p_limit: 5 });
  });
});

describe("configuration", () => {
  it("names what is missing and never prints a value", () => {
    const result = readSupabaseEnv({ SLOP_SUPABASE_URL: "https://x.supabase.co" });
    expect(result.value).toBeNull();
    expect(result.missing).toEqual(["SLOP_SUPABASE_SERVICE_ROLE_KEY"]);
    expect(SUPABASE_ENV_VARS.length).toBe(2);
  });

  it("treats an empty string as unset, because a blank env var is the usual way this fails", () => {
    expect(readSupabaseEnv({ SLOP_SUPABASE_URL: "  ", SLOP_SUPABASE_SERVICE_ROLE_KEY: "k" }).missing).toEqual([
      "SLOP_SUPABASE_URL",
    ]);
  });

  it("trims a trailing slash off the project url, so no request ever doubles one", () => {
    const value = readSupabaseEnv({
      SLOP_SUPABASE_URL: "https://x.supabase.co/",
      SLOP_SUPABASE_SERVICE_ROLE_KEY: "k",
    }).value;
    expect(value?.url).toBe("https://x.supabase.co");
  });
});
