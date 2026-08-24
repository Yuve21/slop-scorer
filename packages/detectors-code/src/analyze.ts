import { makeFinding } from "@slop/core";
import type { Coverage, DetectorResult, Finding, Input, ProbeStatus } from "@slop/core";
import { PROBE_WEIGHTS } from "./artifact.js";
import type { ProbeId, RepoArtifact } from "./artifact.js";
import { CODE_CORPUS_VERSION, CODE_RULES } from "./rules/index.js";
import type { CodeRule } from "./rule.js";
import { CODE_SUPPRESSORS, formatSuppressions, pruneArtifact } from "./suppression.js";
import type { SuppressionRecord, Suppressor } from "./suppression.js";

export const CODE_DETECTOR_ID = "code.static-rules";

/**
 * Turn repository observations into findings. Pure: no filesystem, no network, no model.
 *
 * A rule whose probe returned nothing usable is SKIPPED and named in `warnings`, never
 * silently treated as "did not fire". "We could not look" and "we looked and it was fine"
 * produce the same empty finding list and opposite meanings, and keeping them apart is the
 * whole product.
 *
 * PHASE 2 IS SUPPRESSION, and it runs against SIGNAL rules only.
 *
 * Each signal rule is detected twice: once against the artifact as scanned, and once against
 * the artifact with self-referential observations withdrawn (see `suppression.ts`). The
 * second result is the one that reaches the receipt, and the difference between the two is
 * recorded, named and printed. Running the rule again rather than filtering its evidence
 * array is what makes thresholds behave: a rule that needs six placeholders and had four of
 * them withdrawn must be allowed to fall below its own floor.
 *
 * Counter rules are never pruned. A suppressor exists to stop the product accusing someone
 * on the strength of its own pattern table; withdrawing EXCULPATORY evidence would be the
 * same bug pointed the other way. The invariant, asserted in the suite, is that suppression
 * can only lower a score or leave it unchanged.
 */
export function analyzeRepoArtifact(
  artifact: RepoArtifact,
  input: Input,
  opts: {
    readonly rules?: readonly CodeRule[];
    readonly now?: () => Date;
    /** Defaults to `CODE_SUPPRESSORS`. Pass `[]` to see the unsuppressed reading. */
    readonly suppressors?: readonly Suppressor[];
  } = {},
): DetectorResult {
  const rules = opts.rules ?? CODE_RULES;
  const now = opts.now ?? (() => new Date());
  const startedAt = now().toISOString();
  const suppressors = opts.suppressors ?? CODE_SUPPRESSORS;
  const pruned = pruneArtifact(artifact, suppressors);
  const suppressions: SuppressionRecord[] = [];

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
      const raw = rule.detect(artifact, { priorFindings: findings });
      const evidence =
        rule.polarity === "counter" || pruned.bySuppressor.size === 0
          ? raw
          : rule.detect(pruned.artifact, { priorFindings: findings });

      // Attribute the difference. A suppressor that withdrew nothing this rule was citing
      // produces no note, so the receipt only ever carries reasons that actually applied.
      const notes: string[] = [];
      // Compared by CITATION, not by count. A rule that prints at most eight of its hits
      // shows the same eight before and after, and a length comparison would call that
      // unchanged while the score moved underneath it.
      const key = (list: readonly { locator: string; observed: string }[]): string =>
        list.map((e) => `${e.locator}=${e.observed}`).join("");
      if (key(raw) !== key(evidence)) {
        const citedFiles = new Set(
          raw.flatMap((e) => e.locator.split(",").map((part) => part.trim().split(":")[0] ?? part.trim())),
        );
        // A rule whose evidence is a metric ("24 functions, cv 0.19") cites no file, so the
        // file match finds nothing. The reading still changed, so it is attributed to every
        // suppressor that withdrew something rather than left unexplained.
        const byFile = suppressors.filter((s) =>
          (pruned.bySuppressor.get(s.id) ?? []).some((r) => citedFiles.has(r.file)),
        );
        const candidates = byFile.length > 0 ? byFile : suppressors.filter((s) => pruned.bySuppressor.has(s.id));
        for (const s of candidates) {
          const all = pruned.bySuppressor.get(s.id) ?? [];
          const removed = byFile.length > 0 ? all.filter((r) => citedFiles.has(r.file)) : all;
          if (removed.length === 0) continue;
          const record: SuppressionRecord = {
            ruleId: rule.id,
            suppressorId: s.id,
            hitsBefore: raw.length,
            hitsAfter: evidence.length,
            stillFires: evidence.length > 0,
            files: [...new Set(removed.map((r) => r.file))],
            reason: s.reason(removed),
          };
          suppressions.push(record);
          notes.push(`Suppressed by ${s.id}: ${record.reason}`);
        }
      }

      if (evidence.length === 0) continue;
      const descriptor = descriptorOf(rule);
      findings.push(
        makeFinding(
          {
            ...descriptor,
            ...(notes.length > 0 ? { falsePositiveNote: `${descriptor.falsePositiveNote} ${notes.join(" ")}` } : {}),
            maxHits: rule.maxHits,
            counterScope: rule.counterScope,
          },
          evidence,
        ),
      );
    }
  }

  if (suppressions.length > 0) {
    warnings.push(
      `${suppressions.length} suppression(s) applied. Evidence that is about this detector rather than about the ` +
        `repository was withdrawn before scoring, and the rule was re-run against what was left:\n${formatSuppressions(
          suppressions,
        )}`,
    );
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
