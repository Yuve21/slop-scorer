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

import { formatReceipt, MAX_SCORE } from "@slop/core";
import type { Report } from "@slop/core";

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
});

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
    warnings: report.warnings,
    disclaimer: report.disclaimer,
    receipt: formatReceipt(report),
  };
}
