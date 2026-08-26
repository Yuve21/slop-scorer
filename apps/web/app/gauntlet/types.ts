/**
 * The two shapes that cross the server/client boundary on this route, and nothing else.
 *
 * This module has NO imports on purpose. It is pulled into the browser bundle by
 * `round.tsx`, and the moment it reaches for `@/lib/gauntlet/store` it reaches for
 * `pool.json`, which is the answer key. The partition is the same one `lib/sample-ids.ts`
 * exists for, and it is load-bearing rather than tidy.
 *
 * Note what a `RevealCard` is and when it exists: it is produced by the server ONLY as the
 * return value of a graded guess. There is no path that renders one before an answer has
 * been submitted, and `test/gauntlet-route.test.ts` renders the un-answered page and greps
 * the HTML for every field on it.
 */

export interface DetectorSummary {
  /** `assessed` | `inconclusive` | `not_assessed`. Branch on this before reading `score`. */
  readonly status: string;
  readonly score: number | null;
  readonly bandLabel: string;
  readonly corpusVersion: string;
  readonly findingCount: number;
  readonly counterCount: number;
  /** Measured duration of the detector run that produced this reading. */
  readonly elapsedMs: number;
  readonly top: readonly { readonly ruleId: string; readonly title: string; readonly points: number }[];
}

export interface RevealCard {
  /** The same per-round handle the card was served under, so the client can match them up. */
  readonly cardId: string;
  readonly position: number;
  readonly artifactId: string;
  readonly label: "human" | "generated";
  /** Where the artifact came from, and the stated basis for its label. Both public, both checkable. */
  readonly source: string;
  readonly provenance: string;
  readonly captureDate: string;
  readonly detector: DetectorSummary;
  readonly receiptHref: string;
  readonly chosen: boolean;
  readonly isAnswer: boolean;
}

export type GuessState =
  | { readonly status: "idle" }
  | {
      readonly status: "revealed";
      readonly correct: boolean;
      /** True when this round had already been answered by this participant. */
      readonly replayed: boolean;
      readonly currentStreak: number | null;
      readonly longestStreak: number | null;
      readonly cards: readonly RevealCard[];
    }
  | { readonly status: "refused"; readonly reason: string };
