/**
 * The round builder. Deterministic, seeded, and reproducible from data anyone can hold.
 *
 * WHY DETERMINISM IS A SECURITY PROPERTY HERE, not a testing convenience
 *
 * The gauntlet produces the labels this product publishes accuracy against, so "was that round
 * rigged?" has to be answerable, and answerable by somebody who does not trust us. A round is
 * therefore a pure function of (day, slot, pool digest, salt): given the pool snapshot, an auditor
 * recomputes the exact five artifacts and the exact answer index. Nothing is drawn from a global
 * random source, and nothing depends on when the builder ran.
 *
 * The seed is published to the player. That is safe and it is the point: the seed selects from a
 * pool whose LABELS are column-revoked, so knowing the seed tells you which five artifacts you got,
 * which you can already see, and nothing about which one is the answer. What it buys is that a
 * round cannot be quietly rebuilt around a player after the fact - the seed on the receipt is the
 * seed that produced the round.
 *
 * The PRNG is a SHA-256 counter stream rather than a small integer generator. Not because a puzzle
 * needs cryptographic randomness, but because an LCG's low bits are predictable, and "predictable"
 * is a word we would then have to defend in the one place the product's credibility lives.
 */

import { createHash } from "node:crypto";
import type { ArtifactLabel } from "@slop/db";
import type { BuiltRound, PoolArtifact } from "./types.js";

export const ROUND_BUILDER_VERSION = 1 as const;
export const DEFAULT_ROUND_SIZE = 5 as const;

const sha256 = (input: string | Uint8Array): Buffer => createHash("sha256").update(input).digest();

/**
 * A deterministic uniform stream over [0, 1).
 *
 * Counter-mode over the seed: block i is `sha256(seed || i)`, and each block yields one draw from
 * its first six bytes. Six bytes is 2^48 states, which is far past what a five-card shuffle can
 * distinguish, and it avoids the float-precision edge at 2^53.
 */
export class SeededRandom {
  private counter = 0;

  constructor(private readonly seed: string) {}

  next(): number {
    const block = sha256(`${this.seed}#${this.counter}`);
    this.counter += 1;
    let value = 0;
    for (let i = 0; i < 6; i += 1) value = value * 256 + (block[i] as number);
    return value / 2 ** 48;
  }

  /** Uniform integer in [0, n). */
  int(n: number): number {
    if (n <= 0) throw new RangeError("int(n) needs n > 0");
    return Math.floor(this.next() * n) % n;
  }

  /** Fisher-Yates, driven by the same stream, so a shuffle is part of the reproducible transcript. */
  shuffle<T>(items: readonly T[]): T[] {
    const out = [...items];
    for (let i = out.length - 1; i > 0; i -= 1) {
      const j = this.int(i + 1);
      const a = out[i] as T;
      out[i] = out[j] as T;
      out[j] = a;
    }
    return out;
  }
}

/**
 * A fingerprint of the pool the round was drawn from.
 *
 * Included in the seed so a round cannot be reproduced against a DIFFERENT pool and appear to
 * verify. Ids and labels both go in: retiring an artifact, or relabelling one, changes every future
 * round's seed, which is the correct blast radius for an edit to the answer key.
 */
export function poolDigest(pool: readonly PoolArtifact[]): string {
  const canonical = [...pool]
    .map((p) => `${p.artifactId}:${p.label}`)
    .sort()
    .join("|");
  return sha256(canonical).toString("hex");
}

export interface SeedInput {
  readonly dayKey: string;
  readonly slot: number;
  readonly poolDigest: string;
  /**
   * A server-held salt. Optional, and its absence is not a hole: with no salt the seed is
   * predictable, which reveals only WHICH artifacts appear, and those are shown to the player
   * anyway. It exists so a future variant that draws from a much larger pool can stop a scraper
   * pre-computing tomorrow's five.
   */
  readonly salt?: string;
}

export function roundSeed(input: SeedInput): string {
  return sha256(
    `slop-gauntlet/v${ROUND_BUILDER_VERSION}|${input.dayKey}|${input.slot}|${input.poolDigest}|${input.salt ?? ""}`,
  ).toString("hex");
}

export class InsufficientPoolError extends Error {
  constructor(
    readonly available: Readonly<Record<ArtifactLabel, number>>,
    readonly size: number,
  ) {
    super(
      `a round of ${size} needs 1 human-made artifact and ${size - 1} generated ones; the pool has ` +
        `${available.human} human and ${available.generated} generated. Building a short round would ` +
        `change the odds without saying so, and every discrimination rate computed from it would be ` +
        `pooled with rounds that had different odds.`,
    );
    this.name = "InsufficientPoolError";
  }
}

/**
 * Draw a round.
 *
 * Exactly one human-made artifact, `size - 1` generated ones, then a shuffle. The composition is
 * FIXED rather than random, because the published rate is "how often did people find the one" and
 * that sentence is only meaningful if every round contained exactly one.
 */
export function buildRound(seed: string, pool: readonly PoolArtifact[], size: number = DEFAULT_ROUND_SIZE): BuiltRound {
  const humans = pool.filter((p) => p.label === "human");
  const generated = pool.filter((p) => p.label === "generated");
  if (humans.length < 1 || generated.length < size - 1) {
    throw new InsufficientPoolError({ human: humans.length, generated: generated.length }, size);
  }

  const rng = new SeededRandom(seed);
  // Sorted first: the caller's array order must not change the draw, or a pool read back in a
  // different order reproduces a different round and the audit story collapses.
  const sortedHumans = [...humans].sort((a, b) => a.artifactId.localeCompare(b.artifactId));
  const sortedGenerated = [...generated].sort((a, b) => a.artifactId.localeCompare(b.artifactId));

  const human = sortedHumans[rng.int(sortedHumans.length)] as PoolArtifact;
  const decoys = rng.shuffle(sortedGenerated).slice(0, size - 1);
  const ordered = rng.shuffle([human, ...decoys]);

  return {
    artifactIds: ordered.map((p) => p.artifactId),
    humanIndex: ordered.findIndex((p) => p.artifactId === human.artifactId),
    seed,
    builderVersion: ROUND_BUILDER_VERSION,
  };
}

/** Grading, server side, against the stored answer. */
export interface GradeInput {
  readonly artifactIds: readonly string[];
  readonly humanIndex: number;
  readonly chosenIndex: number;
  readonly servedAtMs: number;
  readonly nowMs: number;
  readonly clientReportedMs?: number | null;
}

export interface Grade {
  readonly correct: boolean;
  readonly chosenArtifactId: string;
  readonly humanArtifactId: string;
  readonly elapsedMs: number;
  readonly timingDisputed: boolean;
}

/**
 * How far the browser's stopwatch may differ from ours before the row is marked disputed.
 *
 * Not a fraud detector. A disputed row is simply excluded from any published timing figure, which
 * is the honest handling: the alternative is a median computed partly from a number the player
 * controls, and that is a substantiation problem rather than a cheating problem.
 */
export const TIMING_TOLERANCE_MS = 1_500;
export const TIMING_TOLERANCE_RATIO = 0.25;

export function grade(input: GradeInput): Grade {
  const elapsedMs = Math.max(0, input.nowMs - input.servedAtMs);
  const client = input.clientReportedMs ?? null;
  const allowed = Math.max(TIMING_TOLERANCE_MS, elapsedMs * TIMING_TOLERANCE_RATIO);
  return {
    correct: input.chosenIndex === input.humanIndex,
    chosenArtifactId: input.artifactIds[input.chosenIndex] as string,
    humanArtifactId: input.artifactIds[input.humanIndex] as string,
    elapsedMs,
    timingDisputed: client !== null && Math.abs(client - elapsedMs) > allowed,
  };
}
