/**
 * @slop/gauntlet
 *
 * Five artifacts, one made by a person, spot it. Daily rounds, streaks, a leaderboard.
 *
 * The game is the surface. What it produces is the point: a per-artifact record of how often PEOPLE
 * find the human-made one, on the same provenanced corpus the detector is calibrated against. That
 * is the only honest way to publish an accuracy claim in this category, and nobody in it publishes
 * one at all.
 *
 * Four things a reader of this file should take away:
 *
 *  - THE DATA MODEL CAME FIRST. `discrimination.ts` is what the rest of the package exists to feed.
 *    No rate is computed under `MINIMUM_SAMPLE`, every rate ships with a Wilson interval, and no
 *    figure is a constant anywhere in the package.
 *  - THE ANSWER NEVER REACHES THE CLIENT. `RoundView` is built by naming fields, the label and the
 *    answer index are column-revoked in SQL, and a test serialises a real view and greps it.
 *  - A ROUND IS REPRODUCIBLE. `roundSeed` plus a pool snapshot rebuilds the exact five artifacts and
 *    the exact answer, so "was that round rigged?" is answerable by somebody who does not trust us.
 *  - NO CARD NAMES A PERSON. The presenters never touch commit history (which carries author
 *    emails), and everything that does go on a card passes through `redactAndTrim` first.
 *
 * It runs against `InMemoryDatabase` with no network and no keys.
 */

export type {
  BuiltRound,
  GuessOutcome,
  GuessStatus,
  PoolArtifact,
  PresentedCard,
  PresentedPanel,
  RoundCard,
  RoundView,
} from "./types.js";
export { PRESENTATION_VERSION, ROUND_PROMPT } from "./types.js";

export type { Redaction } from "./redact.js";
export {
  COPYRIGHT,
  EMAIL,
  FORBIDDEN_CARD_FIELDS,
  FORBIDDEN_VIEW_FIELDS,
  HANDLE,
  IDENTITY_PLACEHOLDER,
  LINK_PLACEHOLDER,
  MAX_LINE_CHARS,
  PROJECT_PLACEHOLDER,
  URL,
  redactAndTrim,
  redactLine,
  redactionFor,
} from "./redact.js";

export { presentRepo, presentWeb } from "./present.js";

export type { PoolLoadOptions, PoolLoadResult } from "./pool.js";
export { MalformedPresentationError, asPresentedCard, poolRowsFromCorpus, toPoolArtifact } from "./pool.js";

export type { Grade, GradeInput, SeedInput } from "./round.js";
export {
  DEFAULT_ROUND_SIZE,
  InsufficientPoolError,
  ROUND_BUILDER_VERSION,
  SeededRandom,
  TIMING_TOLERANCE_MS,
  TIMING_TOLERANCE_RATIO,
  buildRound,
  grade,
  poolDigest,
  roundSeed,
} from "./round.js";

export type { TicketCheck, TicketFailure, TicketPayload } from "./ticket.js";
export { TICKET_TTL_MS, TICKET_VERSION, checkTicket, issueTicket } from "./ticket.js";

export type { ArtifactStat, CalibrationExport, Interval, SummarizeOptions } from "./discrimination.js";
export {
  MINIMUM_SAMPLE,
  formatCalibrationExport,
  summarize,
  toSubstantiationRun,
  wilson,
} from "./discrimination.js";

export type { GauntletRuntime, GauntletServiceOptions, RateLimitPolicy } from "./service.js";
export { DEFAULT_RATE_LIMIT, GauntletService, cardHandle } from "./service.js";
