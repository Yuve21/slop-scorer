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

import type { CounterScope, Evidence, EvidenceKind, FamilyId, Finding, Polarity, Severity } from "./types.js";
import type { Remediation } from "./remediation.js";

/**
 * How a rule turns its own citations into proposed edits.
 *
 * It takes the evidence THIS RUN produced, not the artifact alone, so the `before` value in
 * the patch is the text that was actually cited rather than a second read that may disagree
 * with it. The artifact is passed too, because some fixes need a neighbouring fact the
 * citation does not carry (the size of the file being deleted, the URL that was scanned).
 */
export type Remediator<TArtifact> = (
  evidence: readonly Evidence[],
  artifact: TArtifact,
) => readonly Remediation[];

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
  /**
   * Declared only when this rule's evidence is WEAKER than its detector's. A deterministic
   * corpus may hold a probabilistic rule; it may not quietly print it as a fact.
   */
  readonly evidenceKind?: EvidenceKind;
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
  /**
   * What to change, given what was found. Optional on the type and MANDATORY in practice for
   * every signal rule: `attachRemedies` refuses a corpus where one is missing, and refuses
   * one on a counter rule. See the note on that function for why the two halves of that
   * check belong together.
   */
  remediate?: Remediator<TArtifact>;
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

/**
 * Attach a remediation table to a family of rules, at the point the family is declared.
 *
 * The table is keyed by rule id, which is a list restated in a second place, and a list
 * restated in a second place goes stale in exactly one of them. So this function refuses to
 * return unless the two agree exactly:
 *
 *   - every SIGNAL rule in the array has an entry. A rule that can fire and cannot say what
 *     to change is a report line the loop stops at.
 *   - no COUNTER rule has one. Counter-evidence argues FOR the artifact; a "fix" for it
 *     would delete the best thing about the thing being scanned.
 *   - no entry names a rule that is not in the array. That is the stale half.
 *
 * It throws at module load, which is the loudest place available: the corpus cannot be
 * imported at all until the table matches it.
 */
export function attachRemedies<TArtifact, TProbeId extends string>(
  rules: readonly Rule<TArtifact, TProbeId>[],
  table: Readonly<Record<string, Remediator<TArtifact>>>,
): readonly Rule<TArtifact, TProbeId>[] {
  const ids = new Set(rules.map((r) => r.id));
  for (const key of Object.keys(table)) {
    if (!ids.has(key)) {
      throw new Error(
        `Remediation table names "${key}", which is not a rule in this family. The table has gone stale against the rules it describes.`,
      );
    }
  }
  return rules.map((rule) => {
    const remediate = table[rule.id];
    if (rule.polarity === "counter") {
      if (remediate) {
        throw new Error(
          `Counter rule "${rule.id}" has a remediation. Counter-evidence is a positive signal and there is nothing to fix; proposing an edit here would argue for removing the strongest thing on the artifact.`,
        );
      }
      return rule;
    }
    if (!remediate) {
      throw new Error(
        `Signal rule "${rule.id}" has no remediation. Every rule that can fire must say what to change, even if what it says is that a person has to decide.`,
      );
    }
    // The rebuttal on the fix IS the rule's own false-positive note, injected here rather
    // than retyped in the table. A caveat restated in a second place is a caveat that
    // softens in exactly one of them, and the softened copy is always the one attached to
    // the patch somebody is about to apply. A remediator that sets its own is left alone.
    const withRebuttal: Remediator<TArtifact> = (evidence, artifact) =>
      remediate(evidence, artifact).map((r) => (r.rebuttal ? r : { ...r, rebuttal: rule.falsePositiveNote }));
    return { ...rule, remediate: withRebuttal };
  });
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
