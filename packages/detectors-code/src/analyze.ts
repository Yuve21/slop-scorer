import { makeFinding } from "@slop/core";
import type { Coverage, DetectorResult, Finding, Input, ProbeStatus } from "@slop/core";
import { PROBE_WEIGHTS } from "./artifact.js";
import type { ProbeId, RepoArtifact } from "./artifact.js";
import { CODE_CORPUS_VERSION, CODE_RULES } from "./rules/index.js";
import type { CodeRule } from "./rule.js";

export const CODE_DETECTOR_ID = "code.static-rules";

/**
 * Turn repository observations into findings. Pure: no filesystem, no network, no model.
 *
 * A rule whose probe returned nothing usable is SKIPPED and named in `warnings`, never
 * silently treated as "did not fire". "We could not look" and "we looked and it was fine"
 * produce the same empty finding list and opposite meanings, and keeping them apart is the
 * whole product.
 */
export function analyzeRepoArtifact(
  artifact: RepoArtifact,
  input: Input,
  opts: { readonly rules?: readonly CodeRule[]; readonly now?: () => Date } = {},
): DetectorResult {
  const rules = opts.rules ?? CODE_RULES;
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

  for (const phase of [1, 2] as const) {
    for (const rule of rules.filter((r) => r.phase === phase)) {
      if (!probeUsable(rule.requiresProbe)) {
        skipped.push(rule.id);
        continue;
      }
      evaluated.push(rule.id);
      const evidence = rule.detect(artifact, { priorFindings: findings });
      if (evidence.length === 0) continue;
      findings.push(
        makeFinding({ ...descriptorOf(rule), maxHits: rule.maxHits, counterScope: rule.counterScope }, evidence),
      );
    }
  }

  if (skipped.length > 0) {
    warnings.push(
      `${skipped.length} rule(s) were not evaluated because the probe they depend on returned no usable data: ${skipped.join(", ")}. ` +
        `They are absent from the receipt rather than counted as clean.`,
    );
  }
  if (!artifact.history.available) {
    warnings.push(
      `No git history was readable (${artifact.history.reason ?? "no .git directory"}), so the history family was not evaluated. ` +
        `A tarball, an export or a shallow clone all look like this and none of them is evidence of anything.`,
    );
  }
  if (artifact.skipped.length > 0) {
    warnings.push(`${artifact.skipped.length} file(s) were skipped for size or binary content and were not read.`);
  }

  return {
    detectorId: CODE_DETECTOR_ID,
    modality: "code",
    // Every rule in this corpus cites a file and a line the reader can open. Nothing here is
    // a model output, which is why the modality can honestly claim "deterministic".
    evidenceKind: "deterministic",
    corpusVersion: CODE_CORPUS_VERSION,
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

function descriptorOf(rule: CodeRule) {
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
 * Coverage is the share of PLANNED probe weight that came back usable, not the share that
 * was attempted. A probe that ran and collected nothing counts as zero, which is what stops
 * a glob matching no files from reading as a clean repository.
 */
export function coverageOf(artifact: RepoArtifact): Coverage {
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
    examined: `${artifact.files.length} source files: ${examined.join(", ") || "nothing"}`,
  };
}
