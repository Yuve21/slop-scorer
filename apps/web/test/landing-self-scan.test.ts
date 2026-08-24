import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import Home from "@/app/page";
import { SelfScanCard } from "@/components/landing/self-scan-card";
import { capturedSelfScan, scanHost } from "@/lib/self-scan";
import capture from "@/lib/self-scan-capture.json";
import type { ScanView } from "@/lib/view";

/**
 * THE FOLD HAS TO CARRY A RESULT. The hole this file closes.
 *
 * Production spent a release rendering "Running… rendering this page in a real browser" in the
 * fold, under a headline that says the page has already been scanned by the thing it sells.
 * The runtime has no browser, the detector refused to fake one, and the card had no terminal
 * state, so the promise in the largest type on the site was visibly unkept and every gate in
 * the repository was green while it happened.
 *
 * These tests fail if the shipped page's fold does not contain a scored reading, if the build
 * did not capture one, or if any reachable state of the card is a spinner with no end.
 */

const foldOf = (html: string): string => html.slice(0, html.indexOf("A real receipt"));

describe("the landing fold ships a real reading", () => {
  it("the build captured an artifact, not a promise of one", async () => {
    const record = capture as { artifact: unknown; capturedAt: string; target: string | null };
    expect(record.artifact, "no artifact in self-scan-capture.json: the build never rendered the site").toBeTruthy();
    expect(Date.parse(record.capturedAt)).not.toBeNaN();
    expect(record.target).toMatch(/^https?:\/\//);

    const { view } = await capturedSelfScan();
    expect(view.status).not.toBe("not_assessed");
    // Every rule in the shipped corpus was evaluated against the capture. A capture that can
    // only feed some of them is a capture that quietly shrinks the denominator.
    expect(view.evaluated.length).toBe(view.corpusSize);
  });

  it("renders the score, the finding count and the checks that ran, server-side", async () => {
    const fold = foldOf(renderToStaticMarkup(await Home()));
    const { view } = await capturedSelfScan();

    expect(fold).toContain("scan_ui");
    expect(fold).toContain(`${view.evaluated.length} of ${view.corpusSize} checks`);
    const findings = view.findings.length + view.counterEvidence.length;
    expect(fold).toContain(`${findings} ${findings === 1 ? "finding" : "findings"}`);

    // NO SCORE ABOVE THE FOLD. design/SURFACES.md forbids the 0-100 readout as the face of
    // the product, and "0 / 100" was in this card for exactly one revision.
    expect(fold).not.toMatch(/\d+\s*\/\s*100/);
    // Nor the withheld figure, which the engine's own abstention sentence spells out. A
    // number the engine refused to publish is not a number this page gets to quote.
    expect(fold).not.toContain(`computed ${view.computedScore}`);

    // The rows are the card. A header with an empty body is the defect this file was
    // written after: four rows, and every one of them citing a rule that ran.
    expect(fold.match(/data-slot="item"/g) ?? []).toHaveLength(4);
    // Every rule the fold cites is a rule the detector actually evaluated on this artifact.
    for (const finding of [...view.findings, ...view.counterEvidence].slice(0, 4)) {
      expect(fold).toContain(finding.ruleId);
      expect(view.evaluated).toContain(finding.ruleId);
    }
  });

  it("publishes the finding that is about us, rather than the clean version", async () => {
    const { view } = await capturedSelfScan();
    const ownGoal = view.findings.find((f) => f.ruleId === "builder.bare-platform-domain");
    // This is a real defect of this deployment and the whole point is that we do not get to
    // hide it. If the domain is ever bought, this assertion inverts rather than being deleted.
    if (!ownGoal) {
      const fold = foldOf(renderToStaticMarkup(await Home()));
      expect(fold).not.toContain("The finding in that card is about us");
      return;
    }
    expect(ownGoal.evidence[0]?.observed).toContain("vercel.app");
    const fold = foldOf(renderToStaticMarkup(await Home()));
    expect(fold).toContain("builder.bare-platform-domain");
    expect(fold).toContain("The finding in that card is about us");
  });

  it("never ships a loading state in the fold", async () => {
    const fold = foldOf(renderToStaticMarkup(await Home()));
    // Not a status of "Running", and not the sentence that used to sit under it forever.
    // (The regex is anchored to a tag boundary on purpose: the card's own footer contains
    // the word "running", and a check that cannot tell those apart is not a check.)
    expect(fold).not.toMatch(/>\s*Running\b/);
    expect(fold).not.toContain("rendering this page in a real browser");
    expect(fold).not.toContain("Running a live scan");
    // The age and its provenance are stated rather than implied, and the old "nothing is
    // cached" claim is gone: it was false the moment the reading came from the build.
    expect(fold).toContain("at build");
    expect(fold).not.toContain("Nothing is cached");
  });

  it("a target that is not a URL degrades to a sentence, not a 500", () => {
    // `vercel build` hands a locally-pulled sensitive variable through as the literal string
    // "[SENSITIVE]". That reached `new URL()` in the page once and took the whole landing
    // page down with it, which is a worse failure than the one it was reporting.
    expect(scanHost("https://slop-scorer.vercel.app")).toBe("slop-scorer.vercel.app");
    expect(scanHost("[SENSITIVE]")).toBe("[SENSITIVE]");
    expect(scanHost("")).toBe("this deployment");
  });

  it("an unassessed reading renders its reason, terminally, instead of spinning", () => {
    const abstained = {
      target: "https://slop-scorer.vercel.app",
      ranAt: new Date().toISOString(),
      elapsedMs: 0,
      evaluated: [],
      corpusSize: 39,
      status: "not_assessed",
      score: null,
      bandLabel: "we did not examine this",
      verdict: "no",
      corpusVersion: "corpus-2026.09",
      coverageRatio: 0,
      coverageExamined: "nothing",
      abstention: [{ code: "detector_unavailable", detail: "THE STATED REASON." }],
      findings: [],
      counterEvidence: [],
      families: [],
      priorPoints: 0,
      computedScore: 0,
      disclaimer: "",
      warnings: [],
      inferredCount: 0,
    } satisfies ScanView;

    const html = renderToStaticMarkup(
      createElement(SelfScanCard, {
        initial: abstained,
        ruleTitles: {},
        target: "slop-scorer.vercel.app",
        commit: null,
        capturedAt: abstained.ranAt,
      }),
    );

    expect(html).toContain("THE STATED REASON.");
    expect(html).toContain("Not assessed");
    expect(html).not.toMatch(/>\s*Running\b/);
    expect(html).not.toContain("Running a live scan");
    // A count nobody measured is never printed next to a reason we could not measure.
    expect(html).not.toContain("0 findings");
  });
});
