/**
 * The port. Everything the two product packages are allowed to ask a database for.
 *
 * WHY A PORT AND NOT A SUPABASE CLIENT PASSED AROUND
 *
 *  1. THE TEST SUITE RUNS WITH ZERO NETWORK AND ZERO KEYS, which is the same rule
 *     `packages/reproduce` follows for providers. `InMemoryDatabase` is the reference
 *     implementation, so the rate limiter, the one-guess-per-round rule and the append-only chain
 *     are exercised on every test run rather than on the days somebody has credentials.
 *  2. THE FOUNDER HAS NO SUPABASE PROJECT FOR THIS YET. A port means the packages are finished and
 *     provable before the project exists, and standing one up is a configuration step rather than
 *     an integration.
 *
 * THREE SHAPES IN HERE ARE LOAD-BEARING, not stylistic:
 *
 *  - `insertRoundIfAbsent` and `insertGuessIfAbsent` return the WINNER's row rather than throwing.
 *    A daily puzzle means every player arrives in the same second; a check-then-act would build the
 *    round twice and lose one. The unique index is the arbiter and a 23505 is a win, per the
 *    atomic-transitions playbook.
 *  - `bumpRateLimit` returns the count AFTER the attempt, from a single statement. A limiter
 *    implemented as read-then-write does not limit anything under the load it exists for.
 *  - `appendEvents` takes a batch and the expected next sequence. A chain appended to by two
 *    callers at once must fork loudly (a unique-violation), never interleave quietly.
 */

import type {
  DiscriminationRow,
  GauntletArtifactRow,
  GauntletGuessRow,
  GauntletParticipantRow,
  GauntletRoundRow,
  NotaryChainRow,
  NotaryCredentialRow,
  NotaryEventRow,
  NotaryRecordingRow,
  NotaryTimestampRow,
  SubstantiationKind,
  SubstantiationRunRow,
} from "./rows.js";

/** Raised when an append would fork a chain or reuse a sequence number. */
export class SequenceConflictError extends Error {
  constructor(
    readonly chainId: string,
    readonly sequence: number,
  ) {
    super(
      `notary_events already has sequence ${sequence} on chain ${chainId}. ` +
        `An append-only chain that accepts a second row at one position verifies against whichever ` +
        `branch the reader happens to load, which is worse than refusing the write.`,
    );
    this.name = "SequenceConflictError";
  }
}

export interface GauntletStore {
  /** The pool, WITH labels. Service-role only by construction: no client role can select `label`. */
  listPoolArtifacts(options?: { readonly corpus?: string; readonly includeRetired?: boolean }): Promise<
    readonly GauntletArtifactRow[]
  >;
  /** Idempotent by `artifactId`. Loading a corpus twice must not double the pool. */
  upsertArtifacts(rows: readonly GauntletArtifactRow[]): Promise<number>;

  findRound(dayKey: string, slot: number): Promise<GauntletRoundRow | null>;
  getRound(roundId: string): Promise<GauntletRoundRow | null>;
  /** Insert, or return the row that won the race. Never throws on a duplicate. */
  insertRoundIfAbsent(row: GauntletRoundRow): Promise<GauntletRoundRow>;

  getParticipant(participantId: string): Promise<GauntletParticipantRow | null>;
  ensureParticipant(participantId: string, alias?: string | null): Promise<GauntletParticipantRow>;

  /**
   * One guess per player per round, enforced by the unique index rather than by a prior read.
   * `alreadyAnswered` distinguishes "your guess was stored" from "you already played this round",
   * and the returned row is always the STORED one, which on a duplicate is the first guess.
   */
  insertGuessIfAbsent(row: GauntletGuessRow): Promise<{
    readonly stored: GauntletGuessRow;
    readonly alreadyAnswered: boolean;
  }>;
  guessesForRound(roundId: string): Promise<readonly GauntletGuessRow[]>;
  guessesForParticipant(participantId: string): Promise<readonly GauntletGuessRow[]>;

  /** Single-statement streak accounting, idempotent for a day already counted. */
  recordPlay(participantId: string, dayKey: string, correct: boolean): Promise<GauntletParticipantRow>;

  /** Count after this attempt. The caller compares with its own limit. */
  bumpRateLimit(participantId: string, windowStartIso: string, limit: number): Promise<number>;

  leaderboard(limit: number): Promise<readonly GauntletParticipantRow[]>;

  /** Counts per artifact. Rates are computed above this layer, behind a sample gate. */
  discrimination(): Promise<readonly DiscriminationRow[]>;
}

export interface NotaryStore {
  createChain(row: NotaryChainRow): Promise<NotaryChainRow>;
  getChain(chainId: string): Promise<NotaryChainRow | null>;
  /**
   * Append a contiguous batch. Throws `SequenceConflictError` if any sequence is taken.
   * The chain's `eventCount` and `rootSha256` move in the same call, so a reader never sees a
   * chain whose count disagrees with its events.
   */
  appendEvents(
    chainId: string,
    events: readonly NotaryEventRow[],
    rootSha256: string,
  ): Promise<NotaryChainRow>;
  listEvents(chainId: string): Promise<readonly NotaryEventRow[]>;

  /** Idempotent per (chain, root, authority): re-stamping the same root is not a second stamp. */
  recordTimestamp(row: NotaryTimestampRow): Promise<NotaryTimestampRow>;
  listTimestamps(chainId: string, rootSha256?: string): Promise<readonly NotaryTimestampRow[]>;

  issueCredential(row: NotaryCredentialRow): Promise<NotaryCredentialRow>;
  getCredential(credentialId: string): Promise<NotaryCredentialRow | null>;
  revokeCredential(credentialId: string, atIso: string, reason: string): Promise<NotaryCredentialRow>;

  recordRecording(row: NotaryRecordingRow): Promise<NotaryRecordingRow>;
  listRecordings(chainId: string): Promise<readonly NotaryRecordingRow[]>;
}

export interface SubstantiationStore {
  recordRun(row: SubstantiationRunRow): Promise<SubstantiationRunRow>;
  publishedRuns(kind: SubstantiationKind): Promise<readonly SubstantiationRunRow[]>;
}

export interface SlopDatabase extends GauntletStore, NotaryStore, SubstantiationStore {}
