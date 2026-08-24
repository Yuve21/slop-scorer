/**
 * The generic rule contract.
 *
 * A rule is DATA, not a code path. `detect` has to be a function because a threshold
 * comparison must run somewhere, but everything that decides how much a rule MATTERS lives
 * in fields: family, weight, cap, severity, the false-positive note, the prevention hint,
 * the corpus version it entered in. That separation is what lets the corpus be published,
 * audited, disputed and versioned without shipping a new engine, and it is what makes
 * `list_rules` a real answer rather than a marketing page.
 *
 * It is generic over the artifact and the probe id, so the web corpus and the code corpus
 * are the SAME contract at two type arguments rather than two parallel implementations that
 * drift. A third modality adds a type argument, not an engine.
 *
 * `fixtures` is mandatory, and that is the single most important line in this file. A rule
 * whose selector, path or threshold goes stale stops firing. Nothing crashes. The report
 * still prints confident citations for the rules that did fire, and every artifact the dead
 * rule would have flagged silently scores LOWER. The product quietly becomes a random number
 * generator with footnotes. `mutation.test.ts` runs every rule against its own positive and
 * mutated fixture on every test run, so a dead rule fails the build instead.
 */

import type { CounterScope, Evidence, FamilyId, Finding, Polarity, Severity } from "./types.js";

export interface RuleFixtureCase<TArtifact> {
  readonly artifact: TArtifact;
  /** Phase-2 rules read the findings produced in phase 1. */
  readonly prior?: readonly Finding[];
}

export interface RuleContext {
  readonly priorFindings: readonly Finding[];
}

export interface Rule<TArtifact, TProbeId extends string> {
  readonly id: string;
  readonly family: FamilyId;
  readonly title: string;
  readonly polarity: Polarity;
  readonly counterScope?: CounterScope;
  readonly severity: Severity;
  /** Log-odds contribution for the first hit. Negative for counter-evidence. */
  readonly baseWeight: number;
  /** Evidence items beyond this stop counting toward the weight. They are still printed. */
  readonly maxHits: number;
  /** The probe this rule depends on. Cross-checked against the probe registry at test time. */
  readonly requiresProbe: TProbeId;
  /** Phase 2 rules can see phase 1's findings. Used by suppressors. */
  readonly phase: 1 | 2;
  readonly since: string;
  readonly explanation: string;
  readonly falsePositiveNote: string;
  readonly prevention?: string;
  detect(artifact: TArtifact, ctx: RuleContext): readonly Evidence[];
  readonly fixtures: {
    /** The rule MUST fire on this. */
    positive(base: TArtifact): RuleFixtureCase<TArtifact>;
    /** Same base, exactly one thing changed. The rule MUST NOT fire on this. */
    mutated(base: TArtifact): RuleFixtureCase<TArtifact>;
    readonly extra?: readonly {
      readonly name: string;
      readonly shouldFire: boolean;
      build(base: TArtifact): RuleFixtureCase<TArtifact>;
    }[];
  };
}

/** Evidence constructor. Keeps every citation in every corpus the same shape. */
export const ev = (
  kind: Evidence["kind"],
  locator: string,
  observed: string,
  extra: Partial<Omit<Evidence, "kind" | "locator" | "observed">> = {},
): Evidence => ({ kind, locator, observed, ...extra });

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends readonly (infer _U)[] ? T[K] : T[K] extends object ? DeepPartial<T[K]> : T[K];
};

/** Deep-ish patch helper for fixtures, so a case can change one nested field legibly. */
export function patch<T extends object>(base: T, changes: DeepPartial<T>): T {
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(changes as Record<string, unknown>)) {
    const current = out[k];
    if (
      v &&
      typeof v === "object" &&
      !Array.isArray(v) &&
      current &&
      typeof current === "object" &&
      !Array.isArray(current)
    ) {
      out[k] = patch(current as object, v as DeepPartial<object>);
    } else {
      out[k] = v;
    }
  }
  return out as T;
}
