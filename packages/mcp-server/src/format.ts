/**
 * Tool output shaping.
 *
 * The consumer of this server is an AGENT, and the thing an agent can act on is not a
 * number: it is the list of prevention hints attached to the findings. So every tool returns
 * the receipt AND a machine-readable `structuredContent` object, and the `prevention` field
 * is promoted to the top of both.
 *
 * Three constraints this module enforces on every payload:
 *
 *  1. `status` is always present and is one of assessed / inconclusive / not_assessed. An
 *     agent that only reads `score` gets `null` for both abstentions rather than a zero.
 *  2. No finding appears without its evidence array. The type makes this impossible to
 *     violate; this module just refuses to drop it for brevity.
 *  3. No accuracy claim, ever. The only numbers in here are the ones this run computed.
 */

import { applicabilityOf, formatReceipt, isDestructive, MAX_SCORE } from "@slop/core";
import type { Applicability, RemediationKind, Report } from "@slop/core";

export interface ToolFinding {
  readonly ruleId: string;
  readonly family: string;
  readonly title: string;
  readonly severity: string;
  readonly polarity: string;
  readonly points: number;
  readonly evidence: readonly {
    readonly kind: string;
    readonly locator: string;
    readonly observed: string;
    readonly expected?: string;
    readonly excerpt?: string;
  }[];
  readonly whyItReadsAsGenerated: string;
  readonly counterEvidenceThatWouldRebutIt: string;
  readonly prevention?: string;
  /**
   * Whether this finding has a proposed edit waiting behind `propose_fixes`.
   *
   * Advertised on every finding rather than only on the ones that have one, because "there is
   * nothing to apply here" is the useful half of that answer: it tells an agent which findings
   * to stop trying to close.
   */
  readonly remediable: boolean;
  readonly remediationKinds: readonly RemediationKind[];
  readonly remediationApplicability: readonly Applicability[];
  readonly destructiveFixProposed: boolean;
}

export interface ToolPayload {
  readonly status: Report["status"];
  readonly verdict: string;
  readonly score: number | null;
  readonly scoreCeiling: typeof MAX_SCORE;
  readonly band: string | null;
  readonly corpusVersion: string;
  readonly coverage: { readonly ratio: number; readonly examined: string };
  readonly abstention: readonly { readonly code: string; readonly detail: string }[];
  readonly findings: readonly ToolFinding[];
  readonly counterEvidence: readonly ToolFinding[];
  readonly familyCaps: readonly {
    readonly family: string;
    readonly points: number;
    readonly rawLogit: number;
    readonly capLogit: number;
    readonly atCap: boolean;
    readonly caveat: string;
  }[];
  readonly whatWouldChangeThisScore: readonly { readonly ruleId: string; readonly points: number; readonly prevention?: string }[];
  /**
   * The bridge from a report to a change. Counts only: the proposals themselves live in
   * `propose_fixes`, so a scan stays a scan and nobody gets a patch they did not ask for.
   */
  readonly remediation: {
    readonly findings: number;
    readonly remediable: number;
    readonly readyToApply: number;
    readonly needsConfirmation: number;
    readonly needsSourceLocation: number;
    readonly decideYourself: number;
    readonly nextStep: string;
  };
  readonly warnings: readonly string[];
  readonly disclaimer: string;
  readonly receipt: string;
}

const toFinding = (l: Report["receipt"]["lines"][number]): ToolFinding => ({
  ruleId: l.ruleId,
  family: l.family,
  title: l.title,
  severity: l.severity,
  polarity: l.polarity,
  points: l.points,
  evidence: l.evidence.map((e) => ({
    kind: e.kind,
    locator: e.locator,
    observed: e.observed,
    ...(e.expected ? { expected: e.expected } : {}),
    ...(e.excerpt ? { excerpt: e.excerpt } : {}),
  })),
  whyItReadsAsGenerated: l.explanation,
  counterEvidenceThatWouldRebutIt: l.falsePositiveNote,
  ...(l.prevention ? { prevention: l.prevention } : {}),
  remediable: (l.remediation ?? []).some((r) => applicabilityOf(r) !== "manual"),
  remediationKinds: (l.remediation ?? []).map((r) => r.kind),
  remediationApplicability: (l.remediation ?? []).map((r) => applicabilityOf(r)),
  destructiveFixProposed: (l.remediation ?? []).some(isDestructive),
});

const countBy = (report: Report, kind: Applicability): number =>
  report.receipt.lines
    .filter((l) => l.polarity === "signal")
    .flatMap((l) => l.remediation ?? [])
    .filter((r) => applicabilityOf(r) === kind).length;

function remediationSummary(report: Report): ToolPayload["remediation"] {
  const signals = report.receipt.lines.filter((l) => l.polarity === "signal");
  const remediable = signals.filter((l) => (l.remediation ?? []).some((r) => applicabilityOf(r) !== "manual")).length;
  return {
    findings: signals.length,
    remediable,
    readyToApply: countBy(report, "auto"),
    needsConfirmation: countBy(report, "confirm"),
    needsSourceLocation: countBy(report, "locate"),
    decideYourself: countBy(report, "manual"),
    nextStep:
      signals.length === 0
        ? "Nothing fired, so there is nothing to propose."
        : "Call propose_fixes on the same target for the exact edits, each with its locator, the observed text, the proposed replacement and the condition under which it should not be applied. Apply them with the editing tools in this session, then call verify_fix on the same target to see which findings are no longer present.",
  };
}

export function toToolPayload(report: Report): ToolPayload {
  return {
    status: report.status,
    verdict: report.verdict,
    score: report.score,
    scoreCeiling: MAX_SCORE,
    band: report.band,
    corpusVersion: report.corpusVersion,
    coverage: { ratio: Number(report.coverage.ratio.toFixed(3)), examined: report.coverage.examined },
    abstention: report.abstention.map((a) => ({ code: a.code, detail: a.detail })),
    findings: report.receipt.lines.filter((l) => l.polarity === "signal").map(toFinding),
    counterEvidence: report.counterEvidence.map(toFinding),
    familyCaps: report.receipt.families.map((f) => ({
      family: f.title,
      points: f.points,
      rawLogit: Number(f.rawLogit.toFixed(3)),
      capLogit: Number(f.capLogit.toFixed(3)),
      atCap: f.atCap,
      caveat: f.caveat,
    })),
    whatWouldChangeThisScore: report.whatWouldChangeThisScore,
    remediation: remediationSummary(report),
    warnings: report.warnings,
    disclaimer: report.disclaimer,
    receipt: formatReceipt(report),
  };
}
