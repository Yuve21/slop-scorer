/**
 * The finding-level backtest: does a rule change make the corpus better, asked WITHOUT a score.
 *
 * WHY THIS EXISTS. `backtest()` decides pass or fail on BAND MOVEMENT: a human negative moving up a
 * band, a generated positive falling one. That is a good gate and it is defined in terms of a number
 * the product is retiring. Deleting the score without replacing the gate would remove the only
 * instrument in this repository that measures rule quality, at the moment the product's whole claim
 * becomes that its agents are senior. That is the vacuous-guarantee shape this house exists to
 * catch, and it would be self-inflicted.
 *
 * So the same question is asked one level down, where it was always really being asked:
 *
 *   a rule that NEWLY FIRES on verified human work        is a new false positive
 *   a rule that STOPS FIRING on generated work            is lost recall
 *
 * Both are properties of a rule and an artifact. Neither needs a score, a band or an aggregate to
 * exist, which is the point: the corpus-quality question survives the score's removal because it was
 * never really a question about the score.
 *
 * NO NEW DATA IS REQUIRED. `BaselineEntry.firedRules` has been recorded since the baseline format was
 * written, so this runs against the committed baseline as it stands. The baseline is not re-derived,
 * and a window where the baseline describes something that no longer runs never opens.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO. It produces no accuracy, precision or recall figure. Every
 * member of these corpora is constructed or hand-labelled, so a rate derived from them would
 * describe the corpus rather than the world, and publishing one is the exact defect `claims-officer`
 * exists to refuse (README, "No accuracy claim, anywhere"). The counts here are denominators for a
 * DIFF between two runs of the same corpus, and they are only ever reported that way.
 */

import type { BaselineEntry, Baseline } from "./backtest.js";

export type FindingVerdict = "pass" | "fail";

export interface RuleMovement {
  readonly ruleId: string;
  /** Human artifacts this rule fires on now, and how many were compared. Always both. */
  readonly humanFires: number;
  readonly generatedFires: number;
  /** Artifact ids where the rule newly fired on work a person verifiably made. */
  readonly newOnHuman: readonly string[];
  /** Artifact ids where the rule stopped firing on generated work. */
  readonly lostOnGenerated: readonly string[];
  /** Movement on `unknown`-labelled members: reported, never failed on. */
  readonly movedOnUnknown: readonly string[];
}

export interface FindingBacktestResult {
  readonly verdict: FindingVerdict;
  readonly rules: readonly RuleMovement[];
  /** The denominators. A comparison that examined nothing must never read as a pass. */
  readonly humanCompared: number;
  readonly generatedCompared: number;
  readonly unknownCompared: number;
  readonly rulesSeen: number;
  readonly added: readonly string[];
  readonly removed: readonly string[];
  readonly failures: readonly string[];
}

const key = (e: { corpus: string; id: string }) => `${e.corpus}/${e.id}`;

/**
 * Compare a committed baseline against a fresh run, rule by rule.
 *
 * Members present on one side only are reported rather than skipped: a corpus that shrank silently
 * is a regression too, and a rule can look like it stopped producing false positives simply because
 * the artifact that tripped it was removed.
 */
export function findingBacktest(
  baseline: Baseline,
  current: readonly BaselineEntry[],
): FindingBacktestResult {
  const before = new Map(baseline.entries.map((e) => [key(e), e]));
  const after = new Map(current.map((e) => [key(e), e]));

  const added = [...after.keys()].filter((k) => !before.has(k)).sort();
  const removed = [...before.keys()].filter((k) => !after.has(k)).sort();

  const movements = new Map<string, {
    humanFires: number;
    generatedFires: number;
    newOnHuman: string[];
    lostOnGenerated: string[];
    movedOnUnknown: string[];
  }>();
  const touch = (ruleId: string) => {
    const found = movements.get(ruleId);
    if (found) return found;
    const fresh = { humanFires: 0, generatedFires: 0, newOnHuman: [], lostOnGenerated: [], movedOnUnknown: [] };
    movements.set(ruleId, fresh);
    return fresh;
  };

  let humanCompared = 0;
  let generatedCompared = 0;
  let unknownCompared = 0;

  for (const [k, now] of after) {
    // Count the CURRENT population whatever happens next, so the denominator describes the run
    // rather than the subset that happened to move.
    if (now.label === "human") humanCompared += 1;
    else if (now.label === "generated") generatedCompared += 1;
    else unknownCompared += 1;

    for (const ruleId of now.firedRules) {
      const m = touch(ruleId);
      if (now.label === "human") m.humanFires += 1;
      else if (now.label === "generated") m.generatedFires += 1;
    }

    const was = before.get(k);
    if (!was) continue; // a new member has nothing to have moved against

    const gained = now.firedRules.filter((r) => !was.firedRules.includes(r));
    const lost = was.firedRules.filter((r) => !now.firedRules.includes(r));

    for (const ruleId of gained) {
      const m = touch(ruleId);
      if (now.label === "human") m.newOnHuman.push(k);
      else if (now.label === "unknown") m.movedOnUnknown.push(k);
    }
    for (const ruleId of lost) {
      const m = touch(ruleId);
      if (now.label === "generated") m.lostOnGenerated.push(k);
      else if (now.label === "unknown") m.movedOnUnknown.push(k);
    }
  }

  const rules: RuleMovement[] = [...movements.entries()]
    .map(([ruleId, m]) => ({
      ruleId,
      humanFires: m.humanFires,
      generatedFires: m.generatedFires,
      newOnHuman: [...m.newOnHuman].sort(),
      lostOnGenerated: [...m.lostOnGenerated].sort(),
      movedOnUnknown: [...m.movedOnUnknown].sort(),
    }))
    .sort((a, b) => a.ruleId.localeCompare(b.ruleId));

  const failures: string[] = [];
  for (const r of rules) {
    for (const id of r.newOnHuman) {
      failures.push(`${r.ruleId} newly fires on ${id}, which is verified human work. That is a new false positive.`);
    }
    for (const id of r.lostOnGenerated) {
      failures.push(`${r.ruleId} stopped firing on ${id}, which is generated. That is lost recall.`);
    }
  }
  for (const id of removed) {
    failures.push(`${id} is in the baseline and not in this run. A corpus that shrinks quietly hides every false positive the missing member was catching.`);
  }

  /*
   * THE ZERO-DENOMINATOR REFUSAL. A comparison over an empty corpus produces no failures and would
   * otherwise print a pass, which is the defect this product sells the detection of and which this
   * repository has shipped more than once (L-06). It is a failure, not a pass with a small number.
   */
  if (after.size === 0) {
    failures.push("the run produced zero corpus members, so this comparison examined nothing. A gate that scanned nothing must never report a pass.");
  }
  if (humanCompared === 0) {
    failures.push("zero human-labelled members were compared, so nothing here could have detected a new false positive, which is half of what this gate is for.");
  }

  return {
    verdict: failures.length === 0 ? "pass" : "fail",
    rules,
    humanCompared,
    generatedCompared,
    unknownCompared,
    rulesSeen: rules.length,
    added,
    removed,
    failures,
  };
}

/** Human-readable report. Denominators first, because a count with no denominator is the house defect. */
export function formatFindingBacktest(result: FindingBacktestResult): string {
  const lines: string[] = [];
  lines.push(
    `Finding-level backtest: ${result.rulesSeen} rule(s) fired across ` +
      `${result.humanCompared} human, ${result.generatedCompared} generated and ` +
      `${result.unknownCompared} unknown member(s).`,
  );

  const moved = result.rules.filter(
    (r) => r.newOnHuman.length || r.lostOnGenerated.length || r.movedOnUnknown.length,
  );
  if (moved.length === 0) {
    lines.push("No rule changed which artifacts it fires on.");
  } else {
    for (const r of moved) {
      lines.push(
        `  ${r.ruleId}: fires on ${r.humanFires} human / ${r.generatedFires} generated now` +
          (r.newOnHuman.length ? `; NEW on human: ${r.newOnHuman.join(", ")}` : "") +
          (r.lostOnGenerated.length ? `; LOST on generated: ${r.lostOnGenerated.join(", ")}` : "") +
          (r.movedOnUnknown.length ? `; moved on unknown (reported, not failed): ${r.movedOnUnknown.join(", ")}` : ""),
      );
    }
  }

  if (result.added.length) lines.push(`New corpus members, not compared: ${result.added.join(", ")}`);
  if (result.failures.length) {
    lines.push("", "FAIL:");
    for (const f of result.failures) lines.push(`  - ${f}`);
  } else {
    lines.push("", "PASS: no rule gained a false positive and none lost recall.");
  }
  return lines.join("\n");
}
