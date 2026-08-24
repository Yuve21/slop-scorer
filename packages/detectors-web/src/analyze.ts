import { makeFinding } from "@slop/core";
import type { Coverage, DetectorResult, Finding, Input, ProbeStatus } from "@slop/core";
import { PROBE_WEIGHTS } from "./artifact.js";
import type { ProbeId, WebArtifact } from "./artifact.js";
import { CORPUS_VERSION, WEB_RULES } from "./rules/index.js";
import type { WebRule } from "./rule.js";

export const WEB_DETECTOR_ID = "web.render-rules";

/**
 * Turn observations into findings. Pure: no network, no filesystem, no clock beyond the
 * timestamps the caller supplies. Every rule that could not be evaluated is reported as
 * such rather than quietly treated as not firing, because "we could not look" and "we
 * looked and it was fine" are the two things this product exists to keep apart.
 */
export function analyzeArtifact(
  artifact: WebArtifact,
  input: Input,
  opts: { readonly rules?: readonly WebRule[]; readonly now?: () => Date } = {},
): DetectorResult {
  const rules = opts.rules ?? WEB_RULES;
  const now = opts.now ?? (() => new Date());
  const startedAt = now().toISOString();

  const probeIndex = new Map<string, ProbeStatus>(artifact.probes.map((p) => [p.id, p]));
  const probeUsable = (id: ProbeId): boolean => {
    const p = probeIndex.get(id);
    return !!p && p.ran && (!p.expectsNonEmpty || (p.denominator ?? 0) > 0);
  };

  const warnings: string[] = [];
  const evaluated: string[] = [];
  const skipped: string[] = [];
  const findings: Finding[] = [];

  const runPhase = (phase: 1 | 2): void => {
    for (const rule of rules.filter((r) => r.phase === phase)) {
      if (!probeUsable(rule.requiresProbe)) {
        skipped.push(rule.id);
        continue;
      }
      evaluated.push(rule.id);
      const evidence = rule.detect(artifact, { priorFindings: findings });
      if (evidence.length === 0) continue;
      findings.push(makeFinding({ ...ruleDescriptorOf(rule), maxHits: rule.maxHits, counterScope: rule.counterScope }, evidence));
    }
  };

  runPhase(1);
  runPhase(2);

  if (skipped.length > 0) {
    warnings.push(
      `${skipped.length} rule(s) were not evaluated because the probe they depend on did not return usable data: ${skipped.join(", ")}. ` +
        `They are absent from the receipt rather than counted as clean.`,
    );
  }
  if (artifact.tier === "static") {
    warnings.push(
      "Read without a browser. Computed styles, loaded font faces and anything rendered client side were not observed, so coverage sits below the floor at which this engine will print a score.",
    );
  }

  return {
    detectorId: WEB_DETECTOR_ID,
    modality: "web",
    // Every rule in this corpus cites a fact a user can re-read in DevTools. Nothing here
    // is a model output, which is why the modality can honestly claim "deterministic".
    evidenceKind: "deterministic",
    corpusVersion: CORPUS_VERSION,
    input,
    startedAt,
    finishedAt: now().toISOString(),
    findings,
    coverage: coverageOf(artifact),
    rulesEvaluated: evaluated,
    warnings,
    artifact,
  };
}

function ruleDescriptorOf(rule: WebRule) {
  return {
    id: rule.id,
    family: rule.family,
    title: rule.title,
    polarity: rule.polarity,
    baseWeight: rule.baseWeight,
    severity: rule.severity,
    explanation: rule.explanation,
    falsePositiveNote: rule.falsePositiveNote,
    ...(rule.prevention ? { prevention: rule.prevention } : {}),
    since: rule.since,
  };
}

/**
 * Coverage is the share of the PLANNED probe weight that came back usable, not the share of
 * probes that were attempted. A probe that ran and collected nothing counts as zero, which
 * is what stops a broken selector from reading as a clean page.
 */
export function coverageOf(artifact: WebArtifact): Coverage {
  const total = Object.values(PROBE_WEIGHTS).reduce((a, b) => a + b, 0);
  let got = 0;
  const examined: string[] = [];
  for (const id of Object.keys(PROBE_WEIGHTS) as ProbeId[]) {
    const p = artifact.probes.find((x) => x.id === id);
    const usable = !!p && p.ran && (!p.expectsNonEmpty || (p.denominator ?? 0) > 0);
    if (usable) {
      got += PROBE_WEIGHTS[id];
      examined.push(`${id}(${p?.denominator ?? 1})`);
    }
  }
  return {
    ratio: total === 0 ? 0 : got / total,
    probes: artifact.probes,
    examined: `${artifact.tier} read: ${examined.join(", ") || "nothing"}`,
  };
}
