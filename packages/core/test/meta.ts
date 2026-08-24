/**
 * The corpus meta-suite, shared by every modality.
 *
 * WHAT THIS EXISTS TO CATCH, and why it is worth a whole module.
 *
 * The source corpus this project inherited shipped the same bug three times in one day, in
 * three unrelated files, months apart:
 *
 *   - a chunk pattern matched `/_next/static/chunks/` while production served
 *     `/_next/static/immutable/chunks/`. It scanned ZERO chunks, three downstream checks
 *     asserted "none of them are bad" over an empty list, and the suite printed PASS for
 *     months while the thing it guarded was broken.
 *   - a `[a-z_]+` pattern could not express `wingman_nudge2_sent_at`, so a column-leak check
 *     skipped it in silence and a security leak stayed open across four commits.
 *   - the vacuous-check detector written to catch the first two carried the defect itself.
 *
 * The shape is always identical and it is INVISIBLE BY CONSTRUCTION: a collection is built by
 * scanning; assertions are made about the collection; nothing ever asserts the collection is
 * non-empty. In a detector the consequence is worse than a failing test. A rule that stops
 * matching does not crash: it silently LOWERS the score of every artifact it would have
 * flagged, while the report keeps printing confident citations for the rules that survived.
 * The product becomes a random number generator with footnotes, and the number goes DOWN, so
 * nobody complains.
 *
 * Five checks, applied to every rule in every corpus:
 *
 *   1. NEUTRAL SILENCE. The neutral artifact fires nothing. A rule written to fire on absence
 *      announces itself the moment it is added.
 *   2. POSITIVE FIRES. Every rule fires on its own positive fixture. This is the one that
 *      fails when a selector, a path or a threshold goes stale.
 *   3. MUTATION KILLS IT. The mutated fixture differs in exactly one thing, and the rule must
 *      NOT fire. This is what stops a rule from passing check 2 by firing on everything.
 *   4. EVERY CITATION IS FOLLOWABLE. Locator and observed value non-empty on every piece of
 *      evidence the rule produces.
 *   5. DENOMINATORS. Every probe a rule depends on exists, and zeroing that probe makes the
 *      rule disappear from `rulesEvaluated` with a warning naming it, rather than quietly
 *      counting as clean.
 */

import { expect } from "vitest";
import { applicabilityOf, assertWellFormedRemediation, assertWithinTarget, pathOf } from "@slop/core";
import type { DetectorResult, ProbeStatus, Rule } from "@slop/core";

export interface CorpusUnderTest<TArtifact, TProbeId extends string> {
  readonly name: string;
  readonly rules: readonly Rule<TArtifact, TProbeId>[];
  readonly neutral: () => TArtifact;
  readonly probeIds: readonly TProbeId[];
  /** Run the corpus over an artifact. Must be the real analyze path, not a shim. */
  readonly analyze: (artifact: TArtifact, rules?: readonly Rule<TArtifact, TProbeId>[]) => DetectorResult;
  /** Return a copy of the artifact with one probe zeroed, as a stale scan would look. */
  readonly zeroProbe: (artifact: TArtifact, probe: TProbeId) => TArtifact;
}

/** Check 1. */
export function expectNeutralSilence<A, P extends string>(corpus: CorpusUnderTest<A, P>): void {
  const result = corpus.analyze(corpus.neutral());
  expect(
    result.findings.map((f) => f.ruleId),
    `${corpus.name}: the neutral artifact must fire NOTHING, counter-evidence included. A rule that fires here is reading absence, and every mutation fixture below is then measuring the fixture rather than the rule.`,
  ).toEqual([]);
  expect(result.rulesEvaluated.length, `${corpus.name}: no rule was evaluated at all against the neutral artifact`).toBe(
    corpus.rules.length,
  );
}

/** Checks 2, 3 and 4, for one rule. */
export function expectRuleIsAlive<A, P extends string>(corpus: CorpusUnderTest<A, P>, rule: Rule<A, P>): void {
  const only = [rule];

  const positive = rule.fixtures.positive(corpus.neutral());
  const fired = rule.detect(positive.artifact, { priorFindings: positive.prior ?? [] });
  expect(
    fired.length,
    `${rule.id} did not fire on its own positive fixture. Either the fixture drifted or the rule went stale. A stale rule does not crash: it silently lowers the score of every artifact it would have flagged.`,
  ).toBeGreaterThan(0);

  for (const e of fired) {
    expect(e.locator, `${rule.id} produced evidence with an empty locator`).toBeTruthy();
    expect(e.observed, `${rule.id} produced evidence with an empty observed value`).toBeTruthy();
  }

  const mutated = rule.fixtures.mutated(corpus.neutral());
  const afterMutation = rule.detect(mutated.artifact, { priorFindings: mutated.prior ?? [] });
  expect(
    afterMutation.length,
    `${rule.id} still fires after its mutation, which changes exactly one thing. The rule is reading something it did not declare, so its citations point at the wrong fact.`,
  ).toBe(0);

  for (const extra of rule.fixtures.extra ?? []) {
    const c = extra.build(corpus.neutral());
    const got = rule.detect(c.artifact, { priorFindings: c.prior ?? [] });
    expect(got.length > 0, `${rule.id} extra case "${extra.name}"`).toBe(extra.shouldFire);
  }

  // And through the real analyze path, so the phase and probe wiring is exercised too.
  const viaAnalyze = corpus.analyze(positive.artifact, only);
  expect(viaAnalyze.rulesEvaluated, `${rule.id} was not evaluated by the analyze path`).toContain(rule.id);
}

/** Check 5, for one rule. */
export function expectStaleProbeFailsLoudly<A, P extends string>(
  corpus: CorpusUnderTest<A, P>,
  rule: Rule<A, P>,
): void {
  expect(
    corpus.probeIds,
    `${rule.id} declares requiresProbe "${rule.requiresProbe}", which is not a probe this detector runs. The rule would never be evaluated and nothing would say so.`,
  ).toContain(rule.requiresProbe);

  const positive = rule.fixtures.positive(corpus.neutral());
  const withDeadProbe = corpus.zeroProbe(positive.artifact, rule.requiresProbe);
  const result = corpus.analyze(withDeadProbe, [rule]);

  expect(
    result.rulesEvaluated,
    `${rule.id}: when its probe collects nothing, the rule must be absent from rulesEvaluated rather than counted as evaluated-and-clean.`,
  ).not.toContain(rule.id);
  expect(
    result.findings.map((f) => f.ruleId),
    `${rule.id}: a dead probe must not still produce findings.`,
  ).not.toContain(rule.id);
  expect(
    (result.warnings ?? []).join(" "),
    `${rule.id}: a dead probe must produce a warning that NAMES the skipped rule. Silence here is the whole bug: the artifact scores lower and nothing says why.`,
  ).toContain(rule.id);
}

/** Every declared probe is used by at least one rule, and vice versa. */
export function expectProbeRegistryIsHonest<A, P extends string>(corpus: CorpusUnderTest<A, P>): void {
  const used = new Set(corpus.rules.map((r) => r.requiresProbe));
  for (const probe of corpus.probeIds) {
    expect(
      used.has(probe),
      `${corpus.name}: probe "${probe}" is collected and weighted into coverage but no rule reads it. It inflates coverage without contributing evidence, which makes a thin read look complete.`,
    ).toBe(true);
  }
}

/** Rule ids are unique, and every rule declares the fields the receipt prints. */
export function expectDescriptorsAreComplete<A, P extends string>(corpus: CorpusUnderTest<A, P>): void {
  const ids = corpus.rules.map((r) => r.id);
  expect(new Set(ids).size, `${corpus.name}: duplicate rule ids: ${ids.filter((id, i) => ids.indexOf(id) !== i)}`).toBe(
    ids.length,
  );
  for (const r of corpus.rules) {
    expect(r.explanation.length, `${r.id} has no explanation`).toBeGreaterThan(40);
    expect(r.falsePositiveNote.length, `${r.id} has no falsePositiveNote. Every rule must ship its own rebuttal.`).toBeGreaterThan(
      30,
    );
    expect(r.since, `${r.id} has no 'since' version, so old reports become inexplicable`).toBeTruthy();
    if (r.polarity === "signal") expect(r.baseWeight, `${r.id} is a signal with a non-positive weight`).toBeGreaterThan(0);
    if (r.polarity === "counter") expect(r.baseWeight, `${r.id} is a counter with a non-negative weight`).toBeLessThan(0);
  }
}

/** Helper for `zeroProbe` implementations. */
export const zeroed = (probes: readonly ProbeStatus[], id: string): ProbeStatus[] =>
  probes.map((p) => (p.id === id ? { ...p, ran: true, denominator: 0, expectsNonEmpty: true } : p));

/**
 * Check 6. THE FIXES ARE AS HONEST AS THE FINDINGS.
 *
 * A remediation is a claim, made to another agent that is about to act on it, so it gets the
 * same treatment as the finding it hangs off. Five things, over the whole corpus:
 *
 *   1. Every SIGNAL rule proposes something, even if what it proposes is that a person
 *      decides. A rule that fires and says nothing is where the loop stops.
 *   2. No COUNTER rule proposes anything. Counter-evidence argues FOR the artifact; there is
 *      nothing in it to fix, and a "fix" for one would remove the best thing about the thing
 *      being scanned. This is the assertion, not a comment.
 *   3. Every proposal is well formed: a rebuttal, a stop condition, a citation it answers.
 *   4. Every proposal addresses a locator the rule ACTUALLY CITED. A patch pointing somewhere
 *      the evidence never mentioned is a patch nobody can check.
 *   5. Every applicable patch names a file the finding cited, or `.gitignore`, and never
 *      anything outside the target. The blast radius of a detector is supposed to be zero.
 */
export function expectRemediationsAreHonest<A, P extends string>(corpus: CorpusUnderTest<A, P>): void {
  let checked = 0;
  for (const rule of corpus.rules) {
    if (rule.polarity === "counter") {
      expect(
        rule.remediate,
        `${rule.id} is counter-evidence and has a remediation. Counter-evidence is an argument FOR the artifact; proposing an edit for it would argue for deleting the strongest thing on the page.`,
      ).toBeUndefined();
      continue;
    }
    expect(
      rule.remediate,
      `${rule.id} can fire and proposes nothing. Every signal rule must say what to change, even if what it says is that a person has to decide.`,
    ).toBeTypeOf("function");

    const positive = rule.fixtures.positive(corpus.neutral());
    const evidence = rule.detect(positive.artifact, { priorFindings: positive.prior ?? [] });
    const proposals = rule.remediate?.(evidence, positive.artifact) ?? [];
    expect(proposals.length, `${rule.id} fired on its own fixture and proposed nothing`).toBeGreaterThan(0);

    // Both the whole locator and its comma-separated parts count as cited: a rule that cites
    // one block in three files writes all three into one locator, and a fix may name either
    // the whole citation or one of the places in it.
    const cited = new Set(evidence.flatMap((e) => [e.locator, ...e.locator.split(",").map((part) => part.trim())]));
    const citedFiles = new Set([...cited].map((l) => l.split(":")[0] ?? l));
    for (const p of proposals) {
      assertWellFormedRemediation(rule.id, p);
      for (const address of p.addresses) {
        expect(
          cited.has(address),
          `${rule.id} proposed a fix addressing "${address}", which is not something the rule cited. A patch pointing at a locator the evidence never mentioned cannot be checked by the person applying it.`,
        ).toBe(true);
      }
      const path = pathOf(p);
      if (path === null) continue;
      assertWithinTarget(rule.id, path);
      if (applicabilityOf(p) === "manual") continue;
      expect(
        citedFiles.has(path) || path === ".gitignore",
        `${rule.id} proposed editing "${path}", which is neither a file it cited nor .gitignore. An applicable patch may only touch what the finding pointed at.`,
      ).toBe(true);
    }
    checked += 1;
  }
  // The denominator. Without it a corpus that somehow presented no signal rules would pass
  // every assertion above by never running one, which is the exact shape this file exists for.
  expect(checked, `${corpus.name}: no signal rule was checked for remediation, so this proves nothing`).toBeGreaterThan(0);
  expect(checked).toBe(corpus.rules.filter((r) => r.polarity === "signal").length);
}
