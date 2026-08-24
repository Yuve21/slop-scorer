/**
 * The round builder, and the two properties the audit story depends on.
 *
 * REPRODUCIBILITY is not a testing nicety here. The gauntlet's output is a published dataset, so
 * "show me that round was not built around me" has to be answerable by a stranger holding the seed
 * and a pool snapshot. Any dependence on wall-clock time, on the caller's array order, or on a
 * global random source would break that quietly, so all three are tested rather than asserted in a
 * comment.
 *
 * COMPOSITION is fixed at exactly one human-made artifact per round, because "how often did people
 * find the one" is only a sentence if every round contained one.
 */

import { describe, expect, it } from "vitest";
import {
  DEFAULT_ROUND_SIZE,
  InsufficientPoolError,
  SeededRandom,
  buildRound,
  grade,
  poolDigest,
  roundSeed,
} from "@slop/gauntlet";
import type { PoolArtifact } from "@slop/gauntlet";
import { PRESENTATION_VERSION } from "@slop/gauntlet";

const member = (id: string, label: "human" | "generated"): PoolArtifact => ({
  artifactId: id,
  corpus: "test",
  label,
  card: {
    artifactId: id,
    medium: "code",
    summary: `${id} summary`,
    panels: [{ heading: "Files", lines: [`${id}.ts  40 lines`] }],
    presentationVersion: PRESENTATION_VERSION,
  },
});

const pool = (humans: number, generated: number): PoolArtifact[] => [
  ...Array.from({ length: humans }, (_, i) => member(`h${i}`, "human")),
  ...Array.from({ length: generated }, (_, i) => member(`g${i}`, "generated")),
];

describe("the seeded stream", () => {
  it("is a function of the seed and nothing else", () => {
    const a = new SeededRandom("seed");
    const b = new SeededRandom("seed");
    const c = new SeededRandom("other");
    const draw = (r: SeededRandom): number[] => Array.from({ length: 8 }, () => r.next());
    expect(draw(a)).toEqual(draw(b));
    expect(draw(new SeededRandom("seed"))).not.toEqual(draw(c));
  });

  it("stays inside [0, 1) and does not collapse onto a few values", () => {
    const r = new SeededRandom("uniformity");
    const values = Array.from({ length: 500 }, () => r.next());
    expect(Math.min(...values)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...values)).toBeLessThan(1);
    // Not a randomness test - a smoke test that the byte assembly is not returning a constant or a
    // handful of buckets, which is how a broken counter stream usually presents.
    expect(new Set(values.map((v) => Math.floor(v * 100))).size).toBeGreaterThan(60);
  });

  it("shuffles every position, not just the tail", () => {
    const items = Array.from({ length: 10 }, (_, i) => i);
    const moved = new Set<number>();
    for (let s = 0; s < 40; s += 1) {
      new SeededRandom(`s${s}`).shuffle(items).forEach((v, i) => {
        if (v !== i) moved.add(i);
      });
    }
    expect(moved.size).toBe(items.length);
  });
});

describe("buildRound", () => {
  const p = pool(4, 12);
  const seed = roundSeed({ dayKey: "2026-08-24", slot: 0, poolDigest: poolDigest(p) });

  it("draws exactly one human-made artifact and fills the rest", () => {
    const round = buildRound(seed, p);
    expect(round.artifactIds.length).toBe(DEFAULT_ROUND_SIZE);
    expect(new Set(round.artifactIds).size, "an artifact appears twice in one round").toBe(DEFAULT_ROUND_SIZE);
    const humans = round.artifactIds.filter((id) => id.startsWith("h"));
    expect(humans.length).toBe(1);
    expect(round.artifactIds[round.humanIndex]).toBe(humans[0]);
  });

  it("is reproducible from the seed alone", () => {
    expect(buildRound(seed, p)).toEqual(buildRound(seed, p));
  });

  it("does not depend on the order the pool was read in", () => {
    // A pool read back from Postgres in a different order must reproduce the same round, or the
    // audit story is "it verifies if you happen to sort it the way we did".
    const shuffled = new SeededRandom("reorder").shuffle(p);
    expect(buildRound(seed, shuffled)).toEqual(buildRound(seed, p));
  });

  it("puts the answer in every position across a run of days", () => {
    // A builder that always lands the answer in slot 3 is a builder players solve in a week.
    const positions = new Set<number>();
    for (let d = 1; d <= 40; d += 1) {
      const daily = roundSeed({ dayKey: `2026-09-${String(d).padStart(2, "0")}`, slot: 0, poolDigest: poolDigest(p) });
      positions.add(buildRound(daily, p).humanIndex);
    }
    expect([...positions].sort()).toEqual([0, 1, 2, 3, 4]);
  });

  it("refuses a short round rather than changing the odds silently", () => {
    expect(() => buildRound(seed, pool(1, 2))).toThrow(InsufficientPoolError);
    expect(() => buildRound(seed, pool(0, 20))).toThrow(InsufficientPoolError);
    // The message names the counts, because "insufficient pool" without them is a bug report
    // nobody can act on.
    const error = (() => {
      try {
        buildRound(seed, pool(1, 2));
        return null;
      } catch (e) {
        return e as InsufficientPoolError;
      }
    })();
    expect(error?.available).toEqual({ human: 1, generated: 2 });
  });
});

describe("the seed", () => {
  it("changes when the pool changes, so a round cannot be verified against a different pool", () => {
    const before = poolDigest(pool(4, 12));
    const after = poolDigest(pool(4, 13));
    expect(before).not.toBe(after);
  });

  it("changes when a label changes, which is the correct blast radius for editing the answer key", () => {
    const p = pool(4, 12);
    const relabelled = p.map((m) => (m.artifactId === "g0" ? { ...m, label: "human" as const } : m));
    expect(poolDigest(p)).not.toBe(poolDigest(relabelled));
  });

  it("differs by day, by slot and by salt", () => {
    const d = poolDigest(pool(4, 12));
    const base = roundSeed({ dayKey: "2026-08-24", slot: 0, poolDigest: d });
    expect(roundSeed({ dayKey: "2026-08-25", slot: 0, poolDigest: d })).not.toBe(base);
    expect(roundSeed({ dayKey: "2026-08-24", slot: 1, poolDigest: d })).not.toBe(base);
    expect(roundSeed({ dayKey: "2026-08-24", slot: 0, poolDigest: d, salt: "x" })).not.toBe(base);
  });
});

describe("grading", () => {
  const base = {
    artifactIds: ["a", "b", "c", "d", "e"],
    humanIndex: 2,
    servedAtMs: 1_000_000,
    nowMs: 1_004_000,
  };

  it("is correct only on the answer index", () => {
    expect(grade({ ...base, chosenIndex: 2 }).correct).toBe(true);
    expect(grade({ ...base, chosenIndex: 3 }).correct).toBe(false);
    expect(grade({ ...base, chosenIndex: 3 }).humanArtifactId).toBe("c");
  });

  it("measures elapsed on the server clock", () => {
    expect(grade({ ...base, chosenIndex: 2, clientReportedMs: 300 }).elapsedMs).toBe(4_000);
  });

  it("marks a row disputed when the browser's stopwatch disagrees, and only then", () => {
    expect(grade({ ...base, chosenIndex: 2, clientReportedMs: 3_900 }).timingDisputed).toBe(false);
    expect(grade({ ...base, chosenIndex: 2, clientReportedMs: 300 }).timingDisputed).toBe(true);
    // No client figure is not a disagreement.
    expect(grade({ ...base, chosenIndex: 2, clientReportedMs: null }).timingDisputed).toBe(false);
  });

  it("never reports a negative duration when clocks disagree", () => {
    expect(grade({ ...base, chosenIndex: 2, nowMs: base.servedAtMs - 5_000 }).elapsedMs).toBe(0);
  });
});
