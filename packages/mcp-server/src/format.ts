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

import {
  applicabilityOf,
  formatReceipt,
  isDestructive,
  sanitizeUntrusted,
  UNTRUSTED_CONTENT_WARNING,
  UNTRUSTED_EVIDENCE_FIELDS,
} from "@slop/core";
import type { Applicability, RemediationKind, Report } from "@slop/core";

/**
 * The one transformation every attacker-controlled string in this package passes through.
 *
 * `locator`, `observed`, `expected` and `excerpt` are QUOTES FROM THE SCANNED ARTIFACT. On the
 * code side that artifact is somebody's private source tree, read from disk; on the web side
 * it is a page from an arbitrary URL, including the body of `/.env` if the site serves one.
 * Both are then handed to a model that has file-editing tools, which makes every one of those
 * fields an input channel from whoever wrote the thing being scanned.
 *
 * Exported and used in exactly one place per field, so "which strings are untrusted" is a
 * question with a grep-able answer rather than a convention.
 */
export const untrusted = (value: string): string => sanitizeUntrusted(value, { cap: 400 });

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
    /**
     * Always `true`, and present for exactly that reason.
     *
     * The values above are copied out of the scanned artifact. A flag that is only set
     * sometimes is a flag whose absence means "trusted", and nothing on this object ever is.
     * An agent can branch on this without parsing the warning prose.
     */
    readonly untrusted: true;
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
  /*
   * NO score, scoreCeiling OR band. Retirement step 2, docs/POSITIONING-2026-09-11.md.
   *
   * This payload IS the product now: it goes to an agent running on somebody else's machine, and
   * what that agent can do with it is act on a finding or quote a number. The number was the half
   * nobody could check. Every field below is a citation, the coverage it was read at, or the reason
   * something was withheld.
   */
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
  /**
   * The standing instruction about every quoted value in this payload.
   *
   * Present on every response rather than only on the ones that quote something hostile,
   * because there is no way to tell the difference and a warning that appears conditionally
   * teaches a reader to trust its absence.
   */
  readonly untrustedContent: { readonly warning: string; readonly fields: readonly string[] };
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
    locator: untrusted(e.locator),
    observed: untrusted(e.observed),
    ...(e.expected ? { expected: untrusted(e.expected) } : {}),
    ...(e.excerpt ? { excerpt: untrusted(e.excerpt) } : {}),
    untrusted: true as const,
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
    untrustedContent: { warning: UNTRUSTED_CONTENT_WARNING, fields: UNTRUSTED_EVIDENCE_FIELDS },
    receipt: formatReceipt(report),
  };
}
