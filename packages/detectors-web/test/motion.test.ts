import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildReport } from "@slop/core";
import { analyzeArtifact, MOTION_RULES, NEGATIVE_CORPUS, asWebArtifact } from "@slop/detectors-web";
import type { WebArtifact } from "@slop/detectors-web";
import { WEB_GENERATED_CORPUS } from "./corpus/index.js";

/**
 * The motion family, held to the promise it made.
 *
 * `corpus.test.ts` already proves every rule here fires on its own fixture and dies on its
 * mutation. This file asserts the three things a fixture cannot:
 *
 *  1. NO MOTION SIGNAL FIRES ON A HUMAN PAGE. All five negatives now carry motion read out of
 *     the live sites on 2026-08-24, and four of them animate. If a weight or a threshold ever
 *     starts calling that a template signature, this fails and names the rule. It is the same
 *     tripwire `calibration.test.ts` is, aimed at the family most likely to trip it: funded
 *     human sites use motion, often better than generated ones do.
 *  2. THE FAMILY IS NOT VACUOUS. At least one motion rule fires on the generated half, and the
 *     motion probe returns a non-zero denominator on every member. A capture taken with the
 *     probe broken would otherwise sail through every assertion above by measuring nothing.
 *  3. THE PROBE DOES NOT SPLIT A cubic-bezier IN HALF. See the test for why a source-level
 *     assertion is the only place that bug can be caught.
 */

const report = (artifact: WebArtifact, id: string) =>
  buildReport([analyzeArtifact(artifact, { kind: "url", url: `https://motion.invalid/${id}` })]);

const MOTION_SIGNALS = new Set(MOTION_RULES.filter((r) => r.polarity === "signal").map((r) => r.id));

describe("motion signals stay off human work", () => {
  it("not one of the five hand-built pages trips a motion signal", () => {
    for (const c of NEGATIVE_CORPUS) {
      const fired = report(c.artifact, c.id).receipt.lines.map((l) => l.ruleId);
      const motionFired = fired.filter((id) => MOTION_SIGNALS.has(id));
      expect(
        motionFired,
        `${c.id} (${c.source}) tripped ${motionFired.join(", ")}. These are pages people made, several of ` +
          `them with money and a designer. A motion family that flags them is the failure mode this ` +
          `product exists to argue against.`,
      ).toEqual([]);
    }
  });

  it("the human pages were actually READ for motion, so the silence above means something", () => {
    // The vacuous-pass shape: five artifacts with no motion block would satisfy the assertion
    // above by never being examined at all.
    for (const c of NEGATIVE_CORPUS) {
      expect(c.artifact.motion, `${c.id} has no motion block`).toBeTruthy();
      expect(c.artifact.motion?.sampled ?? 0, `${c.id} sampled no elements for motion`).toBeGreaterThan(50);
    }
    const animating = NEGATIVE_CORPUS.filter((c) => (c.artifact.motion?.records.length ?? 0) > 0);
    expect(
      animating.length,
      "no human negative animates anything, so 'no motion signal fires on human work' is untested",
    ).toBeGreaterThanOrEqual(3);
  });

  it("stripe.com is credited for honouring prefers-reduced-motion", () => {
    // The one counter in this family that cannot be produced by configuration. Read live: 666
    // moving elements before the emulated preference, 172 after. Note that the media query is
    // NOT visible in the stylesheets (they are served cross-origin), so a corpus that parsed
    // for `@media (prefers-reduced-motion)` would have found nothing and credited nothing.
    const stripe = NEGATIVE_CORPUS.find((c) => c.id === "stripe");
    expect(stripe).toBeTruthy();
    expect(stripe!.artifact.motion?.reducedMotion.queryDeclared).toBe(false);
    const counters = report(stripe!.artifact, "stripe").counterEvidence.map((l) => l.ruleId);
    expect(counters).toContain("counter.reduced-motion-honoured");
  });
});

describe("motion signals do fire on generated work", () => {
  it("the generated half trips at least one motion rule, on evidence with a locator", () => {
    const fired = new Set<string>();
    for (const c of WEB_GENERATED_CORPUS) {
      for (const line of report(c.artifact, c.id).receipt.lines) {
        if (MOTION_SIGNALS.has(line.ruleId)) {
          fired.add(line.ruleId);
          for (const e of line.evidence) {
            expect(e.locator, `${c.id}/${line.ruleId} evidence locator`).toBeTruthy();
            expect(e.observed, `${c.id}/${line.ruleId} evidence observed`).toBeTruthy();
          }
        }
      }
    }
    expect(
      [...fired],
      "no motion rule fired on any captured generated page, so this family is calibrated against nothing",
    ).not.toEqual([]);
  });

  it("every captured artifact reports a motion denominator", () => {
    // A recapture taken with the motion walk broken would store zero here, every motion rule
    // would be skipped, and each of those pages would silently score LOWER with nothing said.
    for (const c of WEB_GENERATED_CORPUS) {
      const probe = c.artifact.probes.find((p) => p.id === "motion");
      expect(probe, `${c.id} has no motion probe status`).toBeTruthy();
      expect(probe?.denominator ?? 0, `${c.id} sampled nothing for motion`).toBeGreaterThan(0);
    }
  });

  it("replay of an artifact captured BEFORE the motion probe skips the rules and says so", () => {
    // The compatibility promise, asserted rather than assumed. An older capture has no motion
    // block, and the honest outcome is every motion rule ABSENT from the receipt with a warning
    // naming it, never a page credited with clean motion nobody looked at.
    const withMotion = WEB_GENERATED_CORPUS[0]!.artifact;
    const { motion: _dropped, ...rest } = withMotion as WebArtifact & { motion?: unknown };
    const older = asWebArtifact({ ...rest, probes: withMotion.probes.filter((p) => p.id !== "motion") });
    const result = analyzeArtifact(older, { kind: "url", url: "https://motion.invalid/older" });
    for (const id of MOTION_SIGNALS) expect(result.rulesEvaluated).not.toContain(id);
    expect((result.warnings ?? []).join(" ")).toContain("motion.");
  });
});

describe("the probe's own arithmetic", () => {
  it("does not split a CSS list on commas that live inside a function", () => {
    // THIS IS A SOURCE-LEVEL ASSERTION AND IT IS DELIBERATE. `readMotion` is stringified and
    // evaluated inside the browser, so it can close over nothing and cannot be imported and
    // unit tested. The bug it guards was real and silent: splitting `cubic-bezier(0.25, 1,
    // 0.5, 1)` on every comma stored the easing as `cubic-bezier(0.25`, which collapsed every
    // curve sharing a first number into one bucket. Measured against stripe.com that turned 482
    // unrelated timings into "one easing across the page". A truncated value is worse than a
    // missing one: a missing one fails a denominator, and this one just quietly agreed with
    // itself.
    const source = readFileSync(fileURLToPath(new URL("../src/probe.ts", import.meta.url)), "utf8");
    const start = source.indexOf("function readMotion()");
    const end = source.indexOf("const probe = (", start);
    expect(start, "readMotion is gone from probe.ts").toBeGreaterThan(0);
    const body = source.slice(start, end);
    expect(body).toContain("listSplit");
    expect(
      body.match(/\.split\(",",?\)/g) ?? [],
      "readMotion splits a CSS value on a bare comma again. cubic-bezier() has commas in it.",
    ).toEqual([]);
  });
});
