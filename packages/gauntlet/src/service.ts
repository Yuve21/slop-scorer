/**
 * The service: the only place a label is read, and the only place a guess is graded.
 *
 * ANTI-GAMING, in the order the attacks arrive:
 *
 *  1. THE ANSWER NEVER LEAVES. `toRoundView` builds the client payload from cards and ids; there is
 *     no code path that puts a label or an answer index into it, and the leak test serialises a
 *     real view and greps it. Grading happens here, against a row the client cannot read, which is
 *     also why the migration grants no INSERT on `gauntlet_guesses`: a client that could write its
 *     own row could write `correct = true`.
 *  2. ONE GUESS PER ROUND, arbitrated by a unique index rather than by a prior read. A retry is not
 *     an error, it returns the FIRST answer. Without this every published rate is a measurement of
 *     how long players are willing to keep clicking.
 *  3. RATE LIMIT FIRST, BEFORE ANY VALIDATION. The bump happens before the round is even looked up,
 *     so a probe that submits garbage still spends quota. A limiter that only counts well-formed
 *     requests is a limiter that can be walked around by malforming them.
 *  4. TIME IS OURS. The serve time arrives back in a signed ticket. With no ticket secret
 *     configured, the row is stored `timingDisputed` and excluded from every published timing
 *     figure, rather than quietly recording a number the player chose.
 *
 * Everything runs against `InMemoryDatabase` with no keys and no network, which is how the four
 * behaviours above are exercised on every test run.
 */

import { createHash } from "node:crypto";
import type { GauntletGuessRow, GauntletRoundRow, GauntletStore } from "@slop/db";
import { ROUND_PROMPT, type GuessOutcome, type PoolArtifact, type RoundCard, type RoundView } from "./types.js";
import { toPoolArtifact } from "./pool.js";
import {
  DEFAULT_ROUND_SIZE,
  ROUND_BUILDER_VERSION,
  buildRound,
  grade,
  poolDigest,
  roundSeed,
} from "./round.js";
import { checkTicket, issueTicket } from "./ticket.js";

/** Injected, for the same reason `@slop/reproduce` injects one: the measurement is the product. */
export interface GauntletRuntime {
  now(): number;
  iso(): string;
  id(prefix: string): string;
}

export interface RateLimitPolicy {
  readonly limit: number;
  readonly windowMs: number;
}

/**
 * Thirty submissions a minute.
 *
 * Far above a human playing (one round is one submission) and far below a script enumerating the
 * pool. The number is deliberately loose: a limiter tight enough to catch a determined scraper is
 * tight enough to catch a person on a bad connection retrying, and the retry is already idempotent.
 */
export const DEFAULT_RATE_LIMIT: RateLimitPolicy = { limit: 30, windowMs: 60_000 };

/**
 * A per-round handle for a card.
 *
 * Not a secret and not trying to be: it is a hash of the round id and the artifact id, so it is
 * stable inside one round and useless outside it. Its whole job is that the corpus id, which reads
 * "synthetic-scaffold" or "sinatra", never reaches a browser.
 */
export function cardHandle(roundId: string, artifactId: string): string {
  return createHash("sha256").update(`${roundId}|${artifactId}`).digest("hex").slice(0, 16);
}

export interface GauntletServiceOptions {
  readonly db: GauntletStore;
  readonly runtime: GauntletRuntime;
  readonly roundSize?: number;
  readonly corpus?: string;
  /** HMAC key for serve tickets. Absent means timing is not measured, and says so on every row. */
  readonly ticketSecret?: string | null;
  /** Extra entropy in the seed. Absent is fine; see `round.ts`. */
  readonly salt?: string;
  readonly rateLimit?: RateLimitPolicy;
}

export class GauntletService {
  private readonly roundSize: number;
  private readonly rateLimit: RateLimitPolicy;

  constructor(private readonly options: GauntletServiceOptions) {
    this.roundSize = options.roundSize ?? DEFAULT_ROUND_SIZE;
    this.rateLimit = options.rateLimit ?? DEFAULT_RATE_LIMIT;
  }

  /** UTC. A daily puzzle whose day depends on the server's locale rolls over twice a year. */
  dayKey(atMs: number = this.options.runtime.now()): string {
    return new Date(atMs).toISOString().slice(0, 10);
  }

  /**
   * Today's round, built if it does not exist.
   *
   * The insert is `insertRoundIfAbsent`, so the first request of the day builds it and every
   * concurrent request reads the winner. Note that the cards are assembled from the WINNER's
   * `artifactIds`, never from the locally built round: on a lost race those two differ, and
   * rendering ours against theirs would show the player five cards and grade a different five.
   */
  async dailyRound(params: {
    readonly participantId: string;
    readonly dayKey?: string;
    readonly slot?: number;
  }): Promise<{ readonly round: GauntletRoundRow; readonly view: RoundView }> {
    const { db, runtime } = this.options;
    const dayKey = params.dayKey ?? this.dayKey();
    const slot = params.slot ?? 0;

    const rows = await db.listPoolArtifacts(
      this.options.corpus === undefined ? {} : { corpus: this.options.corpus },
    );
    const pool = rows.map(toPoolArtifact);
    const seed = roundSeed({
      dayKey,
      slot,
      poolDigest: poolDigest(pool),
      ...(this.options.salt === undefined ? {} : { salt: this.options.salt }),
    });
    const built = buildRound(seed, pool, this.roundSize);

    const round = await db.insertRoundIfAbsent({
      roundId: runtime.id("rnd"),
      dayKey,
      slot,
      seed: built.seed,
      builderVersion: ROUND_BUILDER_VERSION,
      artifactIds: built.artifactIds,
      humanIndex: built.humanIndex,
      builtAt: runtime.iso(),
    });

    return { round, view: this.toRoundView(round, pool, params.participantId) };
  }

  /**
   * The client payload.
   *
   * Built by NAMING the fields that go out, never by deleting fields from a row. A `delete
   * row.humanIndex` is one refactor away from shipping the answer, and the difference between the
   * two styles is invisible in a test that only checks today's output.
   */
  toRoundView(round: GauntletRoundRow, pool: readonly PoolArtifact[], participantId: string): RoundView {
    const byId = new Map(pool.map((p) => [p.artifactId, p.card]));
    const cards: RoundCard[] = round.artifactIds.map((id) => {
      const card = byId.get(id);
      if (card === undefined) throw new Error(`round ${round.roundId} names artifact ${id}, which is not in the pool`);
      // The stored id does not travel. It is descriptive by design - "code:synthetic-scaffold" and
      // "code:sinatra" are in the same round - so shipping it would hand over the answer to anyone
      // reading the network tab. The handle is per round, so it also cannot be accumulated across
      // days into a lookup table of which id is which.
      return { cardId: cardHandle(round.roundId, id), medium: card.medium, summary: card.summary, panels: card.panels };
    });
    const servedAtMs = this.options.runtime.now();
    const secret = this.options.ticketSecret ?? null;
    return {
      roundId: round.roundId,
      dayKey: round.dayKey,
      slot: round.slot,
      seed: round.seed,
      builderVersion: round.builderVersion,
      cards,
      prompt: ROUND_PROMPT,
      ticket:
        secret === null
          ? ""
          : issueTicket({ roundId: round.roundId, participantId, servedAtMs }, secret),
      servedAt: new Date(servedAtMs).toISOString(),
    };
  }

  async submitGuess(params: {
    readonly participantId: string;
    readonly roundId: string;
    readonly chosenIndex: number;
    readonly ticket?: string;
    readonly clientReportedMs?: number | null;
  }): Promise<GuessOutcome> {
    const { db, runtime } = this.options;
    const nowMs = runtime.now();

    // (3) First, unconditionally, before anything is validated or even looked up.
    const windowStart = new Date(Math.floor(nowMs / this.rateLimit.windowMs) * this.rateLimit.windowMs).toISOString();
    const count = await db.bumpRateLimit(params.participantId, windowStart, this.rateLimit.limit);
    if (count > this.rateLimit.limit) {
      return { status: "rate_limited", windowMs: this.rateLimit.windowMs, limit: this.rateLimit.limit, count };
    }

    const round = await db.getRound(params.roundId);
    if (round === null) return { status: "unknown_round" };
    if (
      !Number.isInteger(params.chosenIndex) ||
      params.chosenIndex < 0 ||
      params.chosenIndex >= round.artifactIds.length
    ) {
      return { status: "out_of_range", size: round.artifactIds.length };
    }

    const secret = this.options.ticketSecret ?? null;
    let servedAtMs: number;
    let unmeasuredTiming = false;
    if (secret === null) {
      // No secret configured. The elapsed figure becomes whatever the client said, and the row
      // carries `timingDisputed` so nothing published is computed from it.
      servedAtMs = nowMs - (params.clientReportedMs ?? 0);
      unmeasuredTiming = true;
    } else {
      const checked = checkTicket(params.ticket ?? "", secret, {
        roundId: params.roundId,
        participantId: params.participantId,
        nowMs,
      });
      if (!checked.ok) return { status: "bad_ticket", reason: checked.reason };
      servedAtMs = checked.payload.servedAtMs;
    }

    const graded = grade({
      artifactIds: round.artifactIds,
      humanIndex: round.humanIndex,
      chosenIndex: params.chosenIndex,
      servedAtMs,
      nowMs,
      clientReportedMs: params.clientReportedMs ?? null,
    });

    await db.ensureParticipant(params.participantId);
    const row: GauntletGuessRow = {
      guessId: runtime.id("gss"),
      roundId: round.roundId,
      participantId: params.participantId,
      chosenIndex: params.chosenIndex,
      chosenArtifactId: graded.chosenArtifactId,
      correct: graded.correct,
      servedAt: new Date(servedAtMs).toISOString(),
      answeredAt: new Date(nowMs).toISOString(),
      elapsedMs: graded.elapsedMs,
      clientReportedMs: params.clientReportedMs ?? null,
      timingDisputed: graded.timingDisputed || unmeasuredTiming,
      createdAt: runtime.iso(),
    };

    const { stored, alreadyAnswered } = await db.insertGuessIfAbsent(row);
    if (alreadyAnswered) {
      // (2) The first answer stands, and the answer key is still disclosed - a player who has
      // already played this round has already seen it, and withholding it here would only make a
      // reloaded page look broken.
      return {
        status: "already_answered",
        correct: stored.correct,
        chosenArtifactId: stored.chosenArtifactId,
        humanArtifactId: graded.humanArtifactId,
      };
    }

    const participant = await db.recordPlay(params.participantId, round.dayKey, graded.correct);
    return {
      status: "graded",
      correct: graded.correct,
      chosenArtifactId: graded.chosenArtifactId,
      humanArtifactId: graded.humanArtifactId,
      elapsedMs: graded.elapsedMs,
      timingDisputed: row.timingDisputed,
      currentStreak: participant.currentStreak,
      longestStreak: participant.longestStreak,
    };
  }

  /**
   * The board.
   *
   * Alias or nothing. There is no display name, no avatar and no email on a participant row, so a
   * leaderboard cannot become a directory of people who play a game about detecting machines.
   */
  async leaderboard(limit = 20): Promise<readonly { readonly alias: string; readonly currentStreak: number; readonly longestStreak: number; readonly roundsCorrect: number; readonly roundsPlayed: number }[]> {
    const rows = await this.options.db.leaderboard(limit);
    return rows.map((r) => ({
      alias: r.alias ?? "anonymous",
      currentStreak: r.currentStreak,
      longestStreak: r.longestStreak,
      roundsCorrect: r.roundsCorrect,
      roundsPlayed: r.roundsPlayed,
    }));
  }
}
