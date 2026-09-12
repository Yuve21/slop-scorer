/**
 * The other half of the loop: propose, and then verify.
 *
 * `scan_*` says what is there. `propose_fixes` says what to change, with the locator, the
 * observed text, the proposed replacement and the reason not to. `verify_fix` re-scans and
 * reports the two finding sets side by side. Between the second and the third step sits the
 * host agent, which is the only thing in this picture that writes a file.
 *
 * THREE RULES THIS MODULE HOLDS, AND THEY ARE THE PRODUCT RATHER THAN THE PLUMBING.
 *
 *  1. NOTHING HERE WRITES ANYTHING. No fs import, no exec, no network beyond the scan the
 *     detectors already do. A proposal is data. The agent that called this tool already has
 *     edit tools, an approval prompt and a user who trusts them; a second, worse copy of that
 *     machinery inside an MCP server would be more code, more risk and less control.
 *
 *  2. `verify_fix` DOES NOT REPORT SUCCESS. It reports the before set, the after set, and the
 *     difference. "This finding is no longer present" is a fact about a re-scan. "Fixed" is a
 *     claim about intent, and the same corpus that refuses to say who wrote something is not
 *     going to start saying whether somebody's edit was correct.
 *
 *  3. A NEW FINDING IS THE HEADLINE. A change that resolves two findings and introduces one is
 *     not two thirds of a success, it is a change that broke something. Introduced findings
 *     are surfaced first, counted separately, and set `regression: true`, which is the field
 *     an agent should branch on before telling anyone the work is done.
 */

import {
  applicabilityOf,
  assertWellFormedRemediation,
  isDestructive,
  sanitizeUntrusted,
  UNTRUSTED_CONTENT_WARNING,
  UNTRUSTED_EVIDENCE_FIELDS,
} from "@slop/core";
import type { Applicability, BlastRadius, Remediation, Report } from "@slop/core";
import { formatReceipt } from "@slop/core";
import { untrusted } from "./format.js";
import { codeReport, codeTargetKey, resolveTarget, uiReport, uiTargetKey } from "./targets.js";
import type { CodeTarget, UiTarget } from "./targets.js";

export interface ProposedEvidence {
  readonly locator: string;
  readonly observed: string;
  readonly expected?: string;
  /** Always true. These three values are quotes from the artifact. See `format.ts`. */
  readonly untrusted: true;
}

const evidenceOf = (e: { locator: string; observed: string; expected?: string }): ProposedEvidence => ({
  locator: untrusted(e.locator),
  observed: untrusted(e.observed),
  ...(e.expected ? { expected: untrusted(e.expected) } : {}),
  untrusted: true as const,
});

/**
 * The last gate a proposal passes before it leaves this process, and it is a REPEAT.
 *
 * `makeFinding` already validates every remediation a rule builds, which is where the check
 * belongs and where it catches the honest mistakes. This runs the same assertion again, at the
 * boundary, because that first call is only reached by findings built through `makeFinding`.
 * A detector that assembles a `Finding` object literally, a package compiled against an older
 * copy of the type, or a result that arrived as replayed JSON all skip it, and what they skip
 * is the containment check on a union that contains `delete_file`. Validating twice costs
 * microseconds; validating once costs whatever is at `../../../.ssh/authorized_keys`.
 */
function sanitizeRemediation(ruleId: string, r: Remediation): Remediation {
  assertWellFormedRemediation(ruleId, r);
  // `before`, `after` and `text` are NOT collapsed: an applier matches `before` against the
  // real file, and a patch whose whitespace has been rewritten either fails to apply or, with
  // a looser applier, applies to the wrong place. Control characters and credentials still go,
  // and a redacted `before` simply stops matching, which is the safe direction to fail in.
  const keep = { keepNewlines: true, cap: 8_000 } as const;
  switch (r.kind) {
    case "replace_range":
      return { ...r, before: sanitizeUntrusted(r.before, keep), after: sanitizeUntrusted(r.after, keep) };
    case "replace_file":
      return {
        ...r,
        ...(r.before === undefined ? {} : { before: sanitizeUntrusted(r.before, keep) }),
        after: sanitizeUntrusted(r.after, keep),
      };
    case "insert":
      return { ...r, text: sanitizeUntrusted(r.text, keep) };
    case "ui_change":
      return {
        ...r,
        selector: untrusted(r.selector),
        before: untrusted(r.before),
        after: untrusted(r.after),
      };
    case "manual":
      return { ...r, locator: untrusted(r.locator) };
    case "delete_file":
      return r;
  }
}

export interface FixProposal {
  /** Stable within one response, so an agent can answer "apply 1, 3 and 4". */
  readonly id: string;
  readonly ruleId: string;
  readonly family: string;
  readonly familyTitle: string;
  readonly title: string;
  readonly severity: string;
  /** Points this finding contributed to the score. What applying the fix argues with. */
  readonly points: number;
  readonly applicability: Applicability;
  readonly destructive: boolean;
  readonly blastRadius: BlastRadius;
  readonly remediation: Remediation;
  readonly evidence: readonly ProposedEvidence[];
  readonly caveat: {
    /** Why this finding may be wrong. The rule's own note, carried onto the fix. */
    readonly thisMayBeAFalsePositive: string;
    /** The condition under which applying this would be the wrong thing to do. */
    readonly doNotApplyIf: string;
  };
}

export interface FixGroup {
  readonly family: string;
  readonly familyTitle: string;
  /** The family's own caveat from the scoring config, so the group is read in context. */
  readonly caveat: string;
  readonly points: number;
  readonly fixes: readonly FixProposal[];
}

export interface ProposeFixesPayload {
  readonly status: Report["status"];
  readonly target: string;
  readonly corpusVersion: string;
  readonly generatedAt: string;
  readonly verdict: string;
  readonly summary: {
    readonly findings: number;
    readonly proposals: number;
    /** Locator and replacement both determined. Apply with an edit tool. */
    readonly readyToApply: number;
    /** Deletion. Distinct kind, and it should cost an explicit confirmation. */
    readonly needsConfirmation: number;
    /** The change is exact; the file that declares it is not known to a rendered read. */
    readonly needsSourceLocation: number;
    /** A person decides. We say what is wrong and what a good answer looks like. */
    readonly decideYourself: number;
    /** Findings that proposed nothing at all, if a detector ever ships one. */
    readonly noProposal: number;
  };
  /** Ids, so the response can be presented as "apply these N, skip these M". */
  readonly readyToApply: readonly string[];
  readonly needsConfirmation: readonly string[];
  readonly needsSourceLocation: readonly string[];
  readonly decideYourself: readonly string[];
  readonly groups: readonly FixGroup[];
  readonly howToApply: string;
  readonly verifyWith: { readonly tool: string; readonly arguments: Record<string, unknown> };
  readonly disclaimer: string;
  /** See `format.ts`. Every quoted value in every proposal below came from the artifact. */
  readonly untrustedContent: { readonly warning: string; readonly fields: readonly string[] };
}

const APPLICABILITY_ORDER: readonly Applicability[] = ["auto", "confirm", "locate", "manual"];

/**
 * How to read a patch, stated once, in the response.
 *
 * The substring clause is load-bearing. Excerpts in this codebase are capped and normalised,
 * so `before` is what the scanner recorded rather than a byte range, and an applier that
 * demands equality will refuse valid patches while one that ignores it will edit a file that
 * has moved on since the scan.
 */
const HOW_TO_APPLY =
  "Apply these with the editing tools already available in this session, under the same approval flow as any other edit; this server never writes a file. " +
  "`replace_range` replaces the given 1-based inclusive line range, and an empty `after` deletes those lines. " +
  "`insert` inserts before `atLine`, or appends when `atLine` is 0. " +
  "`delete_file` removes a tracked file and is the only destructive kind: confirm it explicitly before running it. " +
  "`ui_change` is a rendered-page observation, so the selector and the property are exact and the file that declares them has to be found in the source first. " +
  "`manual` has no patch on purpose. " +
  "Treat every `before` value as text the target must still CONTAIN rather than as a byte-for-byte match: excerpts are capped at 200 characters and comment bodies are recorded without their markers. If it no longer matches, stop and re-scan. " +
  "Read `doNotApplyIf` on each one before applying it, then call verify_fix on the same target.";

const DISCLAIMER =
  "Each proposal is an assertion that something is wrong, and each carries the rule's own rebuttal next to it for that reason. " +
  "Nothing here is a judgement of any person, and applying every fix in this list would change the score without necessarily improving anything.";

function proposalsFrom(report: Report): FixProposal[] {
  const out: FixProposal[] = [];
  for (const line of report.receipt.lines) {
    // Counter-evidence is skipped here rather than filtered later: a counter finding has no
    // remediation by construction, and a "fix" for one would argue for removing the strongest
    // thing about the artifact.
    if (line.polarity === "counter") continue;
    const remedies = line.remediation ?? [];
    remedies.forEach((raw, i) => {
      const remediation = sanitizeRemediation(line.ruleId, raw);
      out.push({
        id: `${line.ruleId}#${i + 1}`,
        ruleId: line.ruleId,
        family: line.family,
        familyTitle: line.familyTitle,
        title: line.title,
        severity: line.severity,
        points: line.points,
        applicability: applicabilityOf(remediation),
        destructive: isDestructive(remediation),
        blastRadius: remediation.blastRadius,
        remediation,
        evidence: line.evidence
          .filter((e) => remediation.addresses.length === 0 || remediation.addresses.includes(e.locator))
          .map(evidenceOf),
        caveat: {
          thisMayBeAFalsePositive: remediation.rebuttal || line.falsePositiveNote,
          doNotApplyIf: remediation.doNotApplyIf,
        },
      });
    });
    if (remedies.length === 0) {
      // Recorded rather than dropped. A finding with nothing attached is a hole in the corpus
      // and should be visible as one, not absent from the count.
      out.push({
        id: `${line.ruleId}#0`,
        ruleId: line.ruleId,
        family: line.family,
        familyTitle: line.familyTitle,
        title: line.title,
        severity: line.severity,
        points: line.points,
        applicability: "manual",
        destructive: false,
        blastRadius: "none",
        remediation: {
          kind: "manual",
          locator: untrusted(line.evidence[0]?.locator ?? line.ruleId),
          summary: "This rule proposed no remediation.",
          guidance: `${line.prevention ?? "No prevention hint is recorded for this rule either."} No remediation was attached to this finding, so there is nothing here to apply.`,
          doNotApplyIf: "always, since there is nothing to apply.",
          rebuttal: line.falsePositiveNote,
          blastRadius: "none",
          addresses: line.evidence.map((e) => e.locator),
        },
        evidence: line.evidence.map(evidenceOf),
        caveat: { thisMayBeAFalsePositive: line.falsePositiveNote, doNotApplyIf: "always, since there is nothing to apply." },
      });
    }
  }
  return out;
}

function groupsFrom(report: Report, proposals: readonly FixProposal[]): FixGroup[] {
  const byFamily = new Map<string, FixProposal[]>();
  for (const p of proposals) byFamily.set(p.family, [...(byFamily.get(p.family) ?? []), p]);
  const summaries = new Map(report.receipt.families.map((f) => [f.id, f] as const));
  return [...byFamily.entries()].map(([family, fixes]) => {
    const summary = summaries.get(family);
    return {
      family,
      familyTitle: fixes[0]?.familyTitle ?? family,
      caveat: summary?.caveat ?? "This family is not in the scoring config, so it is capped at the minimum.",
      points: summary?.points ?? 0,
      fixes: [...fixes].sort(
        (a, b) =>
          APPLICABILITY_ORDER.indexOf(a.applicability) - APPLICABILITY_ORDER.indexOf(b.applicability) ||
          b.points - a.points ||
          a.id.localeCompare(b.id),
      ),
    };
  });
}

function assemble(report: Report, target: string, verifyArgs: Record<string, unknown>): ProposeFixesPayload {
  const proposals = proposalsFrom(report);
  const ids = (kind: Applicability): string[] => proposals.filter((p) => p.applicability === kind).map((p) => p.id);
  const readyToApply = ids("auto");
  const needsConfirmation = ids("confirm");
  const needsSourceLocation = ids("locate");
  const decideYourself = ids("manual");
  const signals = report.receipt.lines.filter((l) => l.polarity === "signal");
  return {
    status: report.status,
    target,
    corpusVersion: report.corpusVersion,
    generatedAt: report.generatedAt,
    verdict: report.verdict,
    summary: {
      findings: signals.length,
      proposals: proposals.length,
      readyToApply: readyToApply.length,
      needsConfirmation: needsConfirmation.length,
      needsSourceLocation: needsSourceLocation.length,
      decideYourself: decideYourself.length,
      noProposal: proposals.filter((p) => p.id.endsWith("#0")).length,
    },
    readyToApply,
    needsConfirmation,
    needsSourceLocation,
    decideYourself,
    groups: groupsFrom(report, proposals),
    howToApply: HOW_TO_APPLY,
    verifyWith: { tool: "verify_fix", arguments: verifyArgs },
    disclaimer: DISCLAIMER,
    untrustedContent: { warning: UNTRUSTED_CONTENT_WARNING, fields: UNTRUSTED_EVIDENCE_FIELDS },
  };
}

export async function proposeCodeFixes(t: CodeTarget): Promise<ProposeFixesPayload> {
  const report = await codeReport(t);
  rememberBaseline(codeTargetKey(t), report);
  return assemble(report, t.path, {
    path: t.path,
    ...(t.include ? { include: t.include } : {}),
    ...(t.readHistory === undefined ? {} : { readHistory: t.readHistory }),
  });
}

export async function proposeUiFixes(t: UiTarget): Promise<ProposeFixesPayload> {
  const report = await uiReport(t);
  const target = resolveTarget(t);
  rememberBaseline(uiTargetKey(t), report);
  return assemble(report, target, { url: target });
}

/* ------------------------------------------------------------------------------------- *
 * verify_fix
 * ------------------------------------------------------------------------------------- */

interface Baseline {
  readonly at: string;
  readonly report: Report;
}

/**
 * The last reading of each target, in memory, for the life of the process.
 *
 * Deliberately not persisted. A baseline is only meaningful against the working tree it was
 * read from, and a stale one on disk would let `verify_fix` compare today's repository to a
 * scan from last week and call the difference progress. When there is no baseline the tool
 * says so and asks for a scan; it never invents one, and it never treats "first run" as "all
 * clear".
 */
const baselines = new Map<string, Baseline>();

export function rememberBaseline(key: string, report: Report): void {
  baselines.set(key, { at: report.generatedAt, report });
}

export function forgetBaselines(): void {
  baselines.clear();
}

export interface FindingSnapshot {
  readonly ruleId: string;
  readonly title: string;
  readonly severity: string;
  readonly citations: number;
  readonly evidence: readonly ProposedEvidence[];
}

export interface VerifyFixPayload {
  readonly target: string;
  /** True when a baseline existed to compare against. False means nothing is being claimed. */
  readonly compared: boolean;
  readonly baselineAt: string | null;
  readonly verifiedAt: string;
  readonly corpusVersion: string;
  readonly before: { readonly status: string; readonly score: number | null; readonly findings: number; readonly ruleIds: readonly string[] } | null;
  readonly after: { readonly status: string; readonly score: number | null; readonly findings: number; readonly ruleIds: readonly string[] };
  /** Present before, absent now. The disappearance is the evidence; nothing else is claimed. */
  readonly noLongerPresent: readonly FindingSnapshot[];
  /** Still firing, with what it cites NOW. */
  readonly stillPresent: readonly (FindingSnapshot & { readonly citationsBefore: number })[];
  /** Not present before and present now. Read this first. */
  readonly newlyPresent: readonly FindingSnapshot[];
  /** True when anything is newly present. A change that introduces a finding has regressed. */
  readonly regression: boolean;
  /**
   * True when the re-scan EXAMINED MATERIALLY LESS than the reading it is being compared to.
   *
   * The obvious way to pass a verification is to fix the code. The cheap way is to delete the
   * evidence, and this tool proposes deletions, so the cheap way is one accepted `delete_file`
   * away. A finding whose file no longer exists is "no longer present" by exactly the same
   * test as a finding that was genuinely resolved, and nothing in a rule-id diff can tell the
   * two apart. What CAN tell them apart is the denominator: a scan that parsed 40 source files
   * and now parses 12 did not fix 28 files.
   *
   * Set from the probe denominators, which every collection in this product already reports
   * for an unrelated reason. When it is true, `noLongerPresent` is not evidence of anything.
   */
  readonly evidenceMayHaveBeenRemoved: boolean;
  /** Which probes shrank, and by how much. Empty when nothing did. */
  readonly coverageLost: readonly { readonly probeId: string; readonly before: number; readonly after: number }[];
  readonly scoreDelta: number | null;
  readonly headline: string;
  readonly warnings: readonly string[];
  readonly receipt: string;
  readonly disclaimer: string;
}

const snapshot = (report: Report): Map<string, FindingSnapshot> =>
  new Map(
    report.receipt.lines
      .filter((l) => l.polarity === "signal")
      .map((l) => [
        l.ruleId,
        {
          ruleId: l.ruleId,
          title: l.title,
          severity: l.severity,
          citations: l.evidence.length,
          evidence: l.evidence.slice(0, 5).map(evidenceOf),
        } satisfies FindingSnapshot,
      ]),
  );

/**
 * How much a probe may shrink between two readings before the comparison stops meaning
 * anything.
 *
 * Not zero: an accepted fix legitimately removes files, and `agent.instruction-file-committed`
 * proposing a deletion is the whole point of that rule. A tenth of the tree is the line
 * between "a file went" and "the thing being measured went".
 */
const COVERAGE_LOSS_TOLERANCE = 0.1;

/** Probes whose denominator IS the amount of artifact examined, rather than a count of hits. */
const COVERAGE_BEARING_PROBES = new Set(["tree", "source", "tests", "dom-survey", "computed-style", "text", "motion"]);

function coverageLost(before: Report, after: Report): { probeId: string; before: number; after: number }[] {
  const afterByeId = new Map(after.coverage.probes.map((p) => [p.id, p.denominator ?? 0] as const));
  const lost: { probeId: string; before: number; after: number }[] = [];
  for (const p of before.coverage.probes) {
    if (!COVERAGE_BEARING_PROBES.has(p.id)) continue;
    const was = p.denominator ?? 0;
    if (was === 0) continue;
    const now = afterByeId.get(p.id) ?? 0;
    if (now < was * (1 - COVERAGE_LOSS_TOLERANCE)) lost.push({ probeId: p.id, before: was, after: now });
  }
  return lost;
}

const VERIFY_DISCLAIMER =
  "This is a re-scan, not a review. A finding that is no longer present is a finding this corpus no longer matches at that locator, which is not the same as a problem being solved, and a finding that persists may be a rule this artifact was always going to trip.";

function compare(target: string, before: Baseline | undefined, after: Report): VerifyFixPayload {
  const afterSet = snapshot(after);
  const beforeSet = before ? snapshot(before.report) : null;

  const noLongerPresent = beforeSet ? [...beforeSet.values()].filter((f) => !afterSet.has(f.ruleId)) : [];
  const newlyPresent = beforeSet ? [...afterSet.values()].filter((f) => !beforeSet.has(f.ruleId)) : [];
  const stillPresent = beforeSet
    ? [...afterSet.values()]
        .filter((f) => beforeSet.has(f.ruleId))
        .map((f) => ({ ...f, citationsBefore: beforeSet.get(f.ruleId)?.citations ?? 0 }))
    : [];

  const scoreDelta =
    before && before.report.score !== null && after.score !== null ? after.score - before.report.score : null;

  const lost = before ? coverageLost(before.report, after) : [];
  const evidenceMayHaveBeenRemoved = lost.length > 0;

  const headline = !beforeSet
    ? `No earlier reading of ${target} is held in this session, so there is nothing to compare against. This run found ${afterSet.size} finding(s). Scan first, apply changes, then verify.`
    : [
        evidenceMayHaveBeenRemoved
          ? `EVIDENCE MAY HAVE BEEN REMOVED: this run examined less than the earlier one (${lost
              .map((l) => `${l.probeId} ${l.before} -> ${l.after}`)
              .join(", ")}). A finding cannot be counted as resolved when the thing it was measured on is no longer being read. Read the rest of this against that.`
          : "",
        `Before: ${beforeSet.size} finding(s). After: ${afterSet.size}.`,
        `${noLongerPresent.length} no longer present, ${stillPresent.length} still present, ${newlyPresent.length} newly present.`,
        newlyPresent.length > 0
          ? `REGRESSION: ${newlyPresent.map((f) => f.ruleId).join(", ")} ${newlyPresent.length === 1 ? "was" : "were"} not present in the earlier reading. A change that introduces a finding has not resolved anything on its own.`
          : "",
        stillPresent.length > 0 ? `Persisting: ${stillPresent.map((f) => f.ruleId).join(", ")}.` : "",
        scoreDelta === null ? "" : `Score moved by ${scoreDelta > 0 ? "+" : ""}${scoreDelta} point(s).`,
      ]
        .filter(Boolean)
        .join(" ");

  return {
    target,
    compared: beforeSet !== null,
    baselineAt: before?.at ?? null,
    verifiedAt: after.generatedAt,
    corpusVersion: after.corpusVersion,
    before: before
      ? {
          status: before.report.status,
          score: before.report.score,
          findings: beforeSet?.size ?? 0,
          ruleIds: [...(beforeSet?.keys() ?? [])],
        }
      : null,
    after: { status: after.status, score: after.score, findings: afterSet.size, ruleIds: [...afterSet.keys()] },
    noLongerPresent,
    stillPresent,
    newlyPresent,
    regression: newlyPresent.length > 0,
    evidenceMayHaveBeenRemoved,
    coverageLost: lost,
    scoreDelta,
    headline,
    warnings: evidenceMayHaveBeenRemoved
      ? [
          `The re-scan examined less of the target than the earlier reading did (${lost
            .map((l) => `${l.probeId}: ${l.before} -> ${l.after}`)
            .join(", ")}). Findings listed as no longer present may simply no longer be readable.`,
          ...after.warnings,
        ]
      : after.warnings,
    receipt: formatReceipt(after),
    disclaimer: VERIFY_DISCLAIMER,
  };
}

export async function verifyCodeFix(t: CodeTarget): Promise<VerifyFixPayload> {
  const key = codeTargetKey(t);
  const before = baselines.get(key);
  const after = await codeReport(t);
  const payload = compare(t.path, before, after);
  // The re-scan becomes the new baseline, so a second round of edits is measured against the
  // state this run actually observed rather than against the original scan.
  rememberBaseline(key, after);
  return payload;
}

export async function verifyUiFix(t: UiTarget): Promise<VerifyFixPayload> {
  const key = uiTargetKey(t);
  const before = baselines.get(key);
  const after = await uiReport(t);
  const payload = compare(resolveTarget(t), before, after);
  rememberBaseline(key, after);
  return payload;
}
