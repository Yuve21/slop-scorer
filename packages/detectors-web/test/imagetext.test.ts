import { describe, expect, it } from "vitest";
import { buildReport } from "@slop/core";
import { IMAGE_TEXT_RULES, NEGATIVE_CORPUS, analyzeArtifact, neutralArtifact } from "@slop/detectors-web";
import type { WebArtifact } from "@slop/detectors-web";
import { WEB_GENERATED_CORPUS } from "./corpus/index.js";

/**
 * Typography inside an image, and the honest size of the hole it closes.
 *
 * WHAT THE LIVE CORPUS ACTUALLY CONTAINS, stated here because it is the least flattering fact
 * about this family and it belongs in the tests rather than in a footnote. Of the nine pages in
 * the calibration set, the four generated ones ship no `<img>` at all (their graphics are inline
 * SVG, which lands in `innerText` and is already read by the copy rules), and every image on the
 * five human pages came back abstained: palette PNGs, WebP and JPEG, none of which this build
 * decodes. So the number of live findings this family currently produces is ZERO, and the
 * assertions below are about the machinery being honest rather than about it being loaded.
 *
 * That is not a reason to leave the family out. It is the reason the family reports abstentions
 * as records with stated causes: the difference between "there was nothing to read" and "we
 * could not read it" is the whole product, and until this test can point at a live finding, the
 * only defensible claim is the second one, in writing, per image.
 */

const report = (artifact: WebArtifact, id: string) =>
  buildReport([analyzeArtifact(artifact, { kind: "url", url: `https://imagetext.invalid/${id}` })]);

const IMAGE_TEXT_IDS = new Set(IMAGE_TEXT_RULES.map((r) => r.id));

const withImageText = (records: WebArtifact["imageText"]) => neutralArtifact({ imageText: records });

describe("text recovered from an image is scored as a weaker claim", () => {
  it("every rule in the family declares itself probabilistic", () => {
    for (const rule of IMAGE_TEXT_RULES) {
      expect(rule.evidenceKind, `${rule.id} does not declare an evidence kind`).toBe("probabilistic");
      expect(rule.family).toBe("image-text");
    }
  });

  it("a finding from an image makes the whole report say part of it was inferred", () => {
    const artifact = withImageText({
      records: [{ src: "/hero.svg", method: "svg-text", text: "Your headline here", confidence: 1 }],
      attempted: 1,
    });
    const r = report(artifact, "placeholder");
    expect(r.receipt.lines.map((l) => l.ruleId)).toContain("imgtext.scaffold-placeholder");
    // The web detector declares itself deterministic. The report must still say that one line
    // in it is not, or a surface counting inferred lines counts zero.
    expect(r.evidenceKinds).toContain("deterministic");
    expect(r.evidenceKinds).toContain("probabilistic");
  });

  it("quotes the recovered string verbatim, so the read itself can be argued with", () => {
    const artifact = withImageText({
      records: [{ src: "/badge.png", method: "raster-ocr", text: "DASHBOARD\nMADE WITH LOVABLE", confidence: 0.96 }],
      attempted: 1,
    });
    const line = report(artifact, "badge").receipt.lines.find((l) => l.ruleId === "imgtext.generator-signature");
    expect(line, "the generator signature rule did not fire").toBeTruthy();
    expect(line!.evidence[0]!.locator).toContain("/badge.png");
    expect(line!.evidence[0]!.locator).toContain("raster-ocr");
    expect(line!.evidence[0]!.observed).toBe("MADE WITH LOVABLE");
    expect(line!.evidence[0]!.excerpt).toContain("DASHBOARD");
  });

  it("proposes nothing a machine may apply, because the read is a guess about pixels", () => {
    for (const rule of IMAGE_TEXT_RULES) {
      const artifact = rule.fixtures.positive(neutralArtifact()).artifact;
      const proposals = rule.remediate?.(rule.detect(artifact, { priorFindings: [] }), artifact) ?? [];
      expect(proposals.length, `${rule.id} fired and proposed nothing`).toBeGreaterThan(0);
      for (const p of proposals) expect(p.kind, `${rule.id} proposed an applicable ${p.kind}`).toBe("manual");
    }
  });
});

describe("an image that could not be read is never an image with no words in it", () => {
  it("an abstained record produces no finding at all", () => {
    const artifact = withImageText({
      records: [
        {
          src: "/hero.png",
          method: "raster-ocr",
          text: "Y0UR H?ADL?N? H?R?",
          confidence: 0.6,
          abstained: "60% of the decoded glyphs matched, below the 75% floor",
        },
      ],
      attempted: 1,
    });
    const fired = report(artifact, "partial").receipt.lines.map((l) => l.ruleId);
    for (const id of IMAGE_TEXT_IDS) expect(fired).not.toContain(id);
  });

  it("every unread image in the corpus carries a stated reason, not silence", () => {
    let abstentions = 0;
    for (const c of [...NEGATIVE_CORPUS, ...WEB_GENERATED_CORPUS]) {
      for (const record of c.artifact.imageText?.records ?? []) {
        if (record.text.trim().length > 0 && !record.abstained) continue;
        abstentions += 1;
        expect(record.abstained, `${c.id}: ${record.src} recovered nothing and said why not`).toBeTruthy();
        expect((record.abstained ?? "").length, `${c.id}: ${record.src} gave a one-word reason`).toBeGreaterThan(30);
      }
    }
    // The denominator. If nothing in the corpus abstained, this test proved nothing about the
    // abstention path, which is the only path the corpus currently exercises.
    expect(abstentions, "no image in the corpus abstained, so this assertion measured nothing").toBeGreaterThan(0);
  });

  it("attempts are counted even where none of them succeeded", () => {
    // `attempted` is the denominator for the whole family: a page whose images were never
    // fetched and a page whose images were fetched and refused must not look the same.
    for (const c of NEGATIVE_CORPUS) {
      expect(c.artifact.imageText, `${c.id} has no imageText block`).toBeTruthy();
      expect(c.artifact.imageText!.attempted, `${c.id} attempted no image`).toBeGreaterThan(0);
    }
  });
});
