import { describe, expect, it } from "vitest";
import { analyzeArtifact, neutralArtifact } from "@slop/detectors-web";
import { buildReport } from "@slop/core";

/**
 * The other half of calibration.
 *
 * `calibration.test.ts` proves the corpus does not flag human work. On its own that is
 * satisfiable by a corpus that flags NOTHING, which is the vacuous-pass shape pointed at the
 * opposite wall: every rule could be dead and both the negative set and the unit tests would
 * still be green, because a dead rule fires on nothing and human work is nothing-shaped.
 *
 * So this file asserts the corpus can still discriminate. The artifact below is SYNTHETIC and
 * is labelled as such: it is not a measured generated page and it is deliberately excluded
 * from `NEGATIVE_CORPUS` and from every distribution the calibration module reports. It
 * establishes a floor on sensitivity, not a recall figure. Nothing computed here is published.
 */

const templateShaped = () => {
  const base = neutralArtifact();
  return neutralArtifact({
    url: "https://my-app-final-v2.lovable.app/",
    finalUrl: "https://my-app-final-v2.lovable.app/",
    head: {
      ...base.head,
      title: "Create Next App",
      generator: "Lovable",
      description: null,
      ogImage: null,
      canonical: null,
      jsonLd: false,
    },
    type: {
      faces: [{ family: "Inter", src: "https://fonts.gstatic.com/s/inter/v13/inter.woff2", weight: "100 900" }],
      familiesInUse: ["Inter"],
      hero: { selector: "h1", family: "Inter", weightNum: 800, sizePx: 58, letterSpacingEm: -0.04 },
      body: { selector: "p", family: "Inter", weightNum: 400, sizePx: 16, letterSpacingEm: 0 },
    },
    color: {
      bodyBackground: "#ffffff",
      heroGradient: "linear-gradient(135deg, rgb(99, 102, 241) 0%, rgb(59, 130, 246) 100%)",
    },
    dom: {
      ...base.dom,
      images: [{ src: "/hero.svg", alt: null, photographic: false }],
      eyebrows: [
        { selector: "section:nth-child(1) .eyebrow", text: "EARLY ACCESS" },
        { selector: "section:nth-child(2) .eyebrow", text: "HOW IT WORKS" },
        { selector: "section:nth-child(3) .eyebrow", text: "WHY IT MATTERS" },
        { selector: "section:nth-child(4) .eyebrow", text: "READY WHEN YOU ARE" },
      ],
      pingDots: [{ selector: ".status-dot", animation: "ping" }],
      numberedLabels: [
        { selector: ".step-1", text: "01" },
        { selector: ".step-2", text: "02" },
        { selector: ".step-3", text: "03" },
      ],
      cards: Array.from({ length: 8 }, (_, i) => ({
        selector: `.card:nth-child(${i + 1})`,
        radius: "16px",
        border: "1px solid rgba(0,0,0,0.06)",
        shadow: "rgba(0,0,0,0.04) 0px 1px 2px 0px, rgba(0,0,0,0.06) 0px 6px 16px 0px",
      })),
      iconTiles: Array.from({ length: 6 }, (_, i) => ({ selector: `.icon-tile-${i}` })),
      sections: Array.from({ length: 6 }, (_, i) => ({ selector: `section:nth-child(${i + 1})`, heightPx: 600 + i })),
    },
    assets: {
      chunks: [{ url: "/_next/static/chunks/main.js", bytes: 2_400_000, sourceMappingURL: true, mapReachable: true }],
      totalJsBytes: 2_400_000,
      thirdPartyHosts: ["cdn.lovable.dev"],
    },
    wellKnown: [
      { path: "/robots.txt", status: 404, contentType: "text/html" },
      { path: "/sitemap.xml", status: 404, contentType: "text/html" },
      { path: "/CLAUDE.md", status: 200, contentType: "text/markdown", excerpt: "# CLAUDE.md\n\nGuidance for the agent" },
      { path: "/AGENTS.md", status: 200, contentType: "text/markdown", excerpt: "# AGENTS.md" },
      { path: "/.cursorrules", status: 404, contentType: "text/html" },
      { path: "/llms.txt", status: 404, contentType: "text/html" },
    ],
    routes: ["/", "/about", "/features", "/pricing", "/contact"],
    notFound: { status: 200, bodyBytes: 41_000 },
    text: {
      innerText:
        "Unlock the power of your workflow. Seamlessly elevate your team's productivity in the ever-evolving landscape of modern work. Join the waitlist -> Learn more ->",
      wordCount: 26,
    },
  });
};

describe("the corpus can still tell things apart", () => {
  const report = buildReport([analyzeArtifact(templateShaped(), { kind: "url", url: "https://synthetic.invalid/" })]);

  it("a synthetic template-shaped page scores far above every measured human artifact", () => {
    expect(report.status).toBe("assessed");
    // The human corpus tops out at single digits. This is the sensitivity floor: if a change
    // makes the corpus stop discriminating, both sides of the calibration go quiet together.
    expect(report.score ?? 0).toBeGreaterThan(50);
  });

  it("it fires across several independent families, not one", () => {
    expect(report.familiesFired).toBeGreaterThanOrEqual(3);
  });

  it("every finding on it still carries a followable citation", () => {
    for (const line of report.receipt.lines) {
      expect(line.evidence.length, `${line.ruleId} has no evidence`).toBeGreaterThan(0);
      for (const e of line.evidence) {
        expect(e.locator, `${line.ruleId} evidence locator`).toBeTruthy();
        expect(e.observed, `${line.ruleId} evidence observed`).toBeTruthy();
      }
    }
  });

  it("and it still reconciles", () => {
    const sum = report.receipt.lines.reduce((a, l) => a + l.points, 0);
    expect(report.receipt.priorPoints + sum).toBe(report.receipt.computedScore);
  });
});
