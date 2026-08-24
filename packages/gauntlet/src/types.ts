/**
 * The gauntlet's types, ordered the way the product's priorities are ordered.
 *
 * THE DATA MODEL IS THE PRODUCT. The game is a daily puzzle; what it produces is a corpus of human
 * judgments on provenanced artifacts, which is the only thing that lets this product print "we
 * scored it X, and people got this one right N of M times" instead of a bare number. Nobody in this
 * category publishes an error rate. That is the moat, and it is a data-collection problem before it
 * is a game-design problem, so the guess record is designed first and the round is designed around
 * what the guess record needs.
 *
 * WHAT A GUESS MUST CARRY, and why each field is not optional:
 *   - the artifact, not just the round, so the unit of analysis is the ARTIFACT (a rate per round
 *     is uninterpretable: rounds are not comparable, artifacts are);
 *   - which artifact was actually the human-made one, recoverable from the round;
 *   - the time to answer, measured on OUR clock, so a published median is not computed from a
 *     number the player's browser chose;
 *   - one guess per player per round, or every rate is a measurement of the retry loop.
 *
 * WHAT NO TYPE IN HERE HAS: a field for whoever made an artifact. The round shows work, never
 * people. `test/no-leak.test.ts` walks a serialised round view for anything that could identify one.
 */

import type { ArtifactLabel } from "@slop/db";

/** Bumped when the card shape changes, so a stored presentation can be told from a fresh one. */
export const PRESENTATION_VERSION = 1 as const;

/** One labelled block of a card. Panels, not prose: the player is comparing, not reading. */
export interface PresentedPanel {
  /** `heading`, not `label`: "label" is the answer key's field name, and the leak test bans it. */
  readonly heading: string;
  readonly lines: readonly string[];
}

/**
 * What a player sees. Everything in here has been through `redact`, and there is no field for a
 * url, a repository, an author or a licence header.
 */
export interface PresentedCard {
  readonly artifactId: string;
  readonly medium: "code" | "web";
  /** One neutral line: what kind of thing this is and how much of it there is. */
  readonly summary: string;
  readonly panels: readonly PresentedPanel[];
  readonly presentationVersion: typeof PRESENTATION_VERSION;
}

/** A pool member as the round builder sees it: an id, a label, and a card. */
export interface PoolArtifact {
  readonly artifactId: string;
  readonly corpus: string;
  readonly label: ArtifactLabel;
  readonly card: PresentedCard;
}

/** The built round, WITH the answer. Never leaves the server in this shape. */
export interface BuiltRound {
  readonly artifactIds: readonly string[];
  /** Index into `artifactIds` of the one made by a person. */
  readonly humanIndex: number;
  readonly seed: string;
  readonly builderVersion: number;
}

/**
 * A card as the CLIENT receives it.
 *
 * The stored `artifactId` is gone, replaced by a per-round opaque handle, and that is not
 * fastidiousness: the leak test caught the ids themselves giving the answer away. The pool contains
 * `code:synthetic-scaffold` and `code:sinatra`, and a player who sees those two strings does not
 * need to read either card. Ids are corpus bookkeeping and they are descriptive on purpose; the
 * view gets a hash instead, stable within a round so a client can key on it, and meaningless
 * outside one.
 *
 * Guesses are submitted by INDEX, so the handle is never an input to grading.
 */
export interface RoundCard {
  readonly cardId: string;
  readonly medium: "code" | "web";
  readonly summary: string;
  readonly panels: readonly PresentedPanel[];
}

/** The round as the client receives it. No label, no answer, no provenance, no corpus id. */
export interface RoundView {
  readonly roundId: string;
  readonly dayKey: string;
  readonly slot: number;
  /** Published so a player can check after the fact that the round was not rebuilt around them. */
  readonly seed: string;
  readonly builderVersion: number;
  readonly cards: readonly RoundCard[];
  readonly prompt: string;
  /** Signed. Carries the serve time, which is what makes time-to-answer OUR measurement. */
  readonly ticket: string;
  readonly servedAt: string;
}

export type GuessStatus =
  | "graded"
  | "already_answered"
  | "rate_limited"
  | "unknown_round"
  | "out_of_range"
  | "bad_ticket";

/**
 * The result of a submission.
 *
 * A union rather than a boolean plus optional fields: a renderer switches on `status` and never
 * parses a sentence, which is the same contract `@slop/reproduce` uses for its four-arm result.
 */
export type GuessOutcome =
  | {
      readonly status: "graded";
      readonly correct: boolean;
      readonly chosenArtifactId: string;
      readonly humanArtifactId: string;
      readonly elapsedMs: number;
      readonly timingDisputed: boolean;
      readonly currentStreak: number;
      readonly longestStreak: number;
    }
  | {
      readonly status: "already_answered";
      readonly correct: boolean;
      readonly chosenArtifactId: string;
      readonly humanArtifactId: string;
    }
  | { readonly status: "rate_limited"; readonly windowMs: number; readonly limit: number; readonly count: number }
  | { readonly status: "unknown_round" }
  | { readonly status: "out_of_range"; readonly size: number }
  | { readonly status: "bad_ticket"; readonly reason: string };

/**
 * The prompt, fixed and audited.
 *
 * "One of these was made by a person" is a statement about OUR corpus, whose labels carry stated
 * provenance a stranger can check. It is not a claim about a stranger's work, which is the line
 * `packages/reproduce/src/claims.ts` exists to hold. The wording is a constant so it is reviewable
 * in one place rather than typed into a component.
 */
export const ROUND_PROMPT = "Four of these came out of a generator. One did not. Find it." as const;
