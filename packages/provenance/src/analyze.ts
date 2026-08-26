/**
 * The shared media analyze loop, and the gate that sits in front of it.
 *
 * ORDER OF OPERATIONS, which is the whole design:
 *
 *   1. THE RE-ENCODING GATE RUNS FIRST. If the artifact reached us re-encoded, resampled,
 *      screenshotted or platform-processed, NO rule runs, NO finding is produced, and the
 *      result carries a coded `artifact_re_encoded` abstention that `buildReport` turns into
 *      `status: "inconclusive"` with the score withheld. The laundering indicators are
 *      printed as warnings rather than findings, because a finding moves a number and there
 *      is not going to be a number.
 *   2. Rules run in two phases, exactly as the code corpus does.
 *   3. If the gate was open and nothing at all fired, the result carries a
 *      `no_declared_provenance` abstention. That is not a low score and not a clean bill: a
 *      provenance-first detector that met silence has nothing to report, and saying so is
 *      the honest output. It is also, by design, the MOST COMMON outcome of this detector.
 *
 * Step 3 is the one people find surprising, so it is worth being blunt about it: these
 * detectors abstain most of the time, on purpose, and the abstention rate is a headline
 * metric we publish rather than a defect we are working on.
 */

import { makeFinding } from "@slop/core";
import type {
  AbstentionReason,
  Coverage,
  DetectorResult,
  EvidenceKind,
  Finding,
  Input,
  Modality,
  ProbeStatus,
} from "@slop/core";
import type { MediaArtifact, MediaProbeId } from "./artifact.js";
import { MEDIA_PROBE_WEIGHTS } from "./artifact.js";
import { launderingDetail } from "./reencode.js";
import type { MediaRule } from "./rules.js";
import { MEDIA_CORPUS_VERSION } from "./rules.js";
import { absenceIsNotEvidence } from "./c2pa.js";
import { assertMediaSafe } from "./claims.js";

export interface AnalyzeMediaOptions<A extends MediaArtifact, P extends string> {
  readonly detectorId: string;
  readonly modality: Modality;
  readonly evidenceKind: EvidenceKind;
  readonly rules: readonly MediaRule<A, P>[];
  /** Probe weights for this modality, including any it added on top of the shared five. */
  readonly probeWeights: Readonly<Record<string, number>>;
  readonly corpusVersion?: string;
  readonly now?: () => Date;
  /**
   * Run the modality rules even when the gate says the artifact was laundered.
   *
   * There is exactly one legitimate caller: a test proving the gate is what suppressed the
   * findings rather than the rules being dead. It is not exposed through the `Detector`
   * interface and no product path sets it.
   */
  readonly bypassLaunderingGateForTesting?: boolean;
}

export function analyzeMedia<A extends MediaArtifact, P extends string>(
  artifact: A,
  input: Input,
  opts: AnalyzeMediaOptions<A, P>,
): DetectorResult {
  const now = opts.now ?? (() => new Date());
  const startedAt = now().toISOString();
  const warnings: string[] = [];
  const abstention: AbstentionReason[] = [];
  const evaluated: string[] = [];
  const findings: Finding[] = [];

  const coverage = coverageOfMedia(artifact, opts.probeWeights);

  // ---- 1. THE GATE ------------------------------------------------------------------------
  const gateClosed = artifact.laundering.laundered && !opts.bypassLaunderingGateForTesting;
  if (gateClosed) {
    abstention.push({ code: "artifact_re_encoded", detail: assertMediaSafe(launderingDetail(artifact.laundering)) });
    warnings.push(
      `The re-encoding gate is closed (triage score ${artifact.laundering.score}, threshold ${artifact.laundering.threshold}). ` +
        `No rule was evaluated and no score will be produced. Indicators: ` +
        artifact.laundering.indicators.map((i) => `${i.code} at ${i.locator} (${i.observed})`).join("; ") +
        ". Send the file as it left the tool that wrote it and we can read it properly.",
    );
  } else {
    // ---- 2. RULES -------------------------------------------------------------------------
    const probeIndex = new Map<string, ProbeStatus>(artifact.probes.map((p) => [p.id, p]));
    const usable = (id: string): boolean => {
      const p = probeIndex.get(id);
      return !!p && p.ran && (!p.expectsNonEmpty || (p.denominator ?? 0) > 0);
    };
    const skipped: string[] = [];

    for (const phase of [1, 2] as const) {
      for (const rule of opts.rules.filter((r) => r.phase === phase)) {
        if (!usable(rule.requiresProbe)) {
          skipped.push(rule.id);
          continue;
        }
        evaluated.push(rule.id);
        const evidence = rule.detect(artifact, { priorFindings: findings });
        if (evidence.length === 0) continue;
        findings.push(
          makeFinding(
            {
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
              maxHits: rule.maxHits,
              ...(rule.counterScope ? { counterScope: rule.counterScope } : {}),
            },
            evidence,
          ),
        );
      }
    }

    if (skipped.length > 0) {
      warnings.push(
        `${skipped.length} rule(s) were not evaluated because the probe they depend on collected nothing: ${skipped.join(", ")}. ` +
          `They are absent from the receipt rather than counted as clean.`,
      );
    }

    // ---- 3. SILENCE ----------------------------------------------------------------------
    if (findings.length === 0 && skipped.length === 0) {
      abstention.push({
        code: "no_declared_provenance",
        detail: assertMediaSafe(
          `We read the container, the metadata and the Content Credential slot and found no declaration in either ` +
            `direction: nothing asserting a trained-algorithmic source and nothing asserting a capture. ` +
            `${absenceIsNotEvidence(artifact.c2pa) ?? ""} This detector reads declarations only. It has no opinion ` +
            `about content and will not manufacture one, so the honest result here is no result.`,
        ),
      });
    }
  }

  const parseErrors = artifact.container.parseErrors;
  if (parseErrors.length > 0) {
    warnings.push(
      `The container walk reported ${parseErrors.length} problem(s): ${parseErrors.join("; ")}. These lower what we ` +
        `claim to have examined; they are not findings about the file's origin.`,
    );
  }

  return {
    detectorId: opts.detectorId,
    modality: opts.modality,
    evidenceKind: opts.evidenceKind,
    corpusVersion: opts.corpusVersion ?? MEDIA_CORPUS_VERSION,
    input,
    startedAt,
    finishedAt: now().toISOString(),
    findings,
    coverage,
    rulesEvaluated: evaluated,
    warnings,
    ...(abstention.length > 0 ? { abstention } : {}),
    artifact,
  };
}

/**
 * Coverage is the share of PLANNED probe weight that came back usable.
 *
 * A probe declared `expectsNonEmpty` that collected nothing counts as ZERO, which is what
 * stops an unrecognised container from reading as a file with no declarations in it.
 *
 * So does a probe that reports `complete: false`, and that is the second half of the same
 * idea. A count of things collected cannot express "there was a region I could not read":
 * a PNG whose compressed text chunk failed to decompress produced four container segments
 * and zero metadata fields, and reported coverage 1.0, exactly like a PNG that genuinely
 * carries no metadata (LEARNINGS L-16). Coverage has to mean what was READ, or it means
 * nothing at all.
 */
export function coverageOfMedia(
  artifact: MediaArtifact,
  weights: Readonly<Record<string, number>> = MEDIA_PROBE_WEIGHTS,
): Coverage {
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  let got = 0;
  const examined: string[] = [];
  for (const id of Object.keys(weights)) {
    const p = artifact.probes.find((x) => x.id === id);
    const ok = !!p && p.ran && p.complete !== false && (!p.expectsNonEmpty || (p.denominator ?? 0) > 0);
    if (ok) {
      got += weights[id] ?? 0;
      examined.push(`${id}(${p?.denominator ?? 0})`);
    } else if (p?.complete === false) {
      examined.push(`${id}(partial)`);
    }
  }
  return {
    ratio: total === 0 ? 0 : got / total,
    probes: artifact.probes,
    examined: `${artifact.container.format} container, ${artifact.container.byteLength} bytes: ${examined.join(", ") || "nothing"}`,
  };
}

export type { MediaProbeId };
