import { MAX_SCORE } from "./assessment.js";
import { fenceUntrusted, UNTRUSTED_CONTENT_WARNING } from "./untrusted.js";
import type { Report } from "./score.js";

const sign = (n: number): string => (n > 0 ? `+${n}` : `${n}`);

/**
 * Every quoted value on an evidence line comes from the artifact, and the artifact is not
 * ours. This is the one output format with no structure to hide behind: it is a wall of text
 * a model reads, so a `locator` containing a newline could previously forge an entire extra
 * receipt line, complete with a rule id, a point contribution and a running total that a
 * reader would have no way to distinguish from the real ones.
 *
 * `fenceUntrusted` strips the control characters that make that possible, redacts anything
 * credential-shaped, caps the length, and wraps what is left in a delimiter it has already
 * removed from the body. The header sentence says out loud what the fences mean.
 */
const quote = (value: string): string => fenceUntrusted(value, { cap: 240 });

/**
 * Render the receipt as plain text.
 *
 * Deliberately shows the arithmetic. Every line, its citation, and the running total, so a
 * reader can check the number themselves rather than take it. The last line is the
 * reconciliation, and it is the point of the whole format.
 */
export function formatReceipt(report: Report): string {
  const out: string[] = [];
  const head =
    report.score === null ? `${report.status.toUpperCase()} (score withheld)` : `${report.score} / ${MAX_SCORE}`;
  out.push(`SLOP RECEIPT  ${head}   band: ${report.bandLabel}`);
  out.push(`corpus ${report.corpusVersion}  |  coverage ${Math.round(report.coverage.ratio * 100)}%  |  families fired ${report.familiesFired}`);
  out.push(`evidence kind: ${report.evidenceKinds.join(", ") || "none"}  |  detectors: ${report.detectors.join(", ") || "none"}`);
  out.push("");
  out.push(report.verdict);
  out.push("");

  if (report.abstention.length > 0) {
    out.push("WHY NO SCORE");
    for (const r of report.abstention) out.push(`  - [${r.code}] ${r.detail}`);
    out.push("");
  }
  if (report.bandDemotedFrom) {
    out.push(
      `Band held at "${report.bandLabel}": the top band additionally requires ${report.familiesFired} independent families and at least one builder fingerprint. Look alone does not get there.`,
    );
    out.push("");
  }

  out.push(`  ${String(report.receipt.priorPoints).padStart(5)}  base rate before any evidence`);
  let running = report.receipt.priorPoints;
  for (const l of report.receipt.lines) {
    running += l.points;
    const mark = l.polarity === "counter" ? "counter" : l.severity;
    out.push(
      `  ${sign(l.points).padStart(5)}  ${l.ruleId}  [${l.family} / ${mark}]${l.cappedOut ? "  (family already at cap)" : ""}  -> ${running}`,
    );
    out.push(`         ${l.title}`);
    for (const e of l.evidence.slice(0, 3)) {
      out.push(
        `         evidence: ${e.kind} ${quote(e.locator)} = ${quote(e.observed)}${e.expected ? ` (expected ${quote(e.expected)})` : ""}`,
      );
    }
    if (l.evidence.length > 3) out.push(`         ... and ${l.evidence.length - 3} more, ${l.hitsCounted} counted toward the weight`);
    out.push(`         caveat: ${l.falsePositiveNote}`);
  }
  out.push("");
  out.push(`  ${String(report.receipt.computedScore).padStart(5)}  TOTAL (base ${report.receipt.priorPoints} + ${report.receipt.lines.length} contribution(s))`);
  out.push("");

  out.push("FAMILY CAPS");
  for (const f of report.receipt.families) {
    out.push(
      `  ${f.title.padEnd(28)} ${f.points >= 0 ? "+" : ""}${f.points} pts   logit ${f.rawLogit.toFixed(2)} of ${f.capLogit.toFixed(2)} allowed${f.atCap ? "  AT CAP" : ""}`,
    );
    out.push(`      ${f.caveat}`);
  }
  if (report.receipt.globalCounterLogit !== 0) {
    out.push(
      `  ${"Global counter-evidence".padEnd(28)} logit ${report.receipt.globalCounterLogit.toFixed(2)}${
        report.receipt.globalCounterAtCap ? "  AT CAP" : ""
      }   (bypasses family caps: it argues with the whole verdict)`,
    );
  }
  out.push("");

  if (report.whatWouldChangeThisScore.length > 0) {
    out.push("WHAT WOULD CHANGE THIS SCORE");
    for (const w of report.whatWouldChangeThisScore) {
      out.push(`  -${w.points}  ${w.ruleId}${w.prevention ? `: ${w.prevention}` : ""}`);
    }
    out.push("");
  }

  out.push(report.disclaimer);
  if (report.receipt.lines.some((l) => l.evidence.length > 0)) out.push(UNTRUSTED_CONTENT_WARNING);
  return out.join("\n");
}
