import { multiplicity } from "./math.js";
import { assertWellFormedRemediation } from "./remediation.js";
import type { Remediation } from "./remediation.js";
import type { Evidence, Finding, Polarity, RuleDescriptor, CounterScope } from "./types.js";

/**
 * Turn a rule descriptor plus its citations into a Finding, applying within-rule
 * multiplicity. Detectors should build every finding through here so the decay rule is
 * applied in one place and cannot drift between modalities.
 */
export function makeFinding(
  rule: RuleDescriptor & { readonly maxHits?: number; readonly counterScope?: CounterScope },
  evidence: readonly Evidence[],
  overrides: { readonly explanation?: string; readonly remediation?: readonly Remediation[] } = {},
): Finding {
  if (evidence.length === 0) {
    throw new Error(`Rule "${rule.id}" tried to produce a finding with no evidence. No evidence, no finding.`);
  }
  const remediation = overrides.remediation ?? [];
  if (remediation.length > 0 && rule.polarity === "counter") {
    throw new Error(
      `Counter rule "${rule.id}" produced a remediation. Counter-evidence is an argument FOR the artifact; there is nothing here to fix.`,
    );
  }
  for (const r of remediation) assertWellFormedRemediation(rule.id, r);
  const cap = rule.maxHits ?? 3;
  const hitsCounted = Math.min(evidence.length, cap);
  const polarity: Polarity = rule.polarity;
  return {
    ruleId: rule.id,
    family: rule.family,
    title: rule.title,
    severity: rule.severity,
    polarity,
    ...(polarity === "counter" ? { counterScope: rule.counterScope ?? "family" } : {}),
    baseWeight: rule.baseWeight,
    weight: rule.baseWeight * multiplicity(hitsCounted),
    hitsCounted,
    evidence,
    explanation: overrides.explanation ?? rule.explanation,
    falsePositiveNote: rule.falsePositiveNote,
    ...(rule.prevention ? { prevention: rule.prevention } : {}),
    ...(remediation.length > 0 ? { remediation } : {}),
  };
}
