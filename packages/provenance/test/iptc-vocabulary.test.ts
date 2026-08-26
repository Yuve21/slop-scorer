import { describe, expect, it } from "vitest";
import {
  CAPTURE_SOURCE_TYPES,
  declaredCapture,
  DIGITAL_SOURCE_KINDS,
  DIGITAL_SOURCE_TYPES,
  digitalSourceTypeOf,
  IPTC_DIGITAL_SOURCE_TYPE_CONCEPTS,
  IPTC_SCHEME_MODIFIED,
  IPTC_SCHEME_URI,
  assessLaundering,
  EMPTY_METADATA,
  emptyContainer,
  inspectContainer,
  NO_MANIFEST,
  readMetadata,
  synthPng,
  verifiedManifest,
} from "@slop/provenance";

/**
 * The vocabulary this package can NAME, checked against the vocabulary somebody else
 * PUBLISHES, in both directions.
 *
 * The defect (LEARNINGS L-17): the hand-written enumeration expressed 5 of the 17 published
 * active terms, and the two gaps that mattered failed in OPPOSITE directions. `screenCapture`
 * decoded to `unknown`, losing an abstention. `computationalCapture` decoded to `unknown`,
 * which killed `prov.c2pa-declares-capture`, the -2.2 counter that is the strongest
 * counter-evidence in the product. A DEAD COUNTER RAISES THE SCORE: an honest computational
 * photography pipeline, declaring itself in the standard field, would have looked MORE like
 * slop for having told the truth. That is a false-accusation vector aimed at exactly the
 * users this product must never accuse, and it is the same class as the two repairs beside
 * it: an enumeration that cannot express its input does not crash, it answers "unknown" and
 * the report reads like a clean result.
 *
 * WHY THIS IS NOT A LIST RESTATED IN A TEST. The house rule from the sibling project is that
 * a mechanical check must not restate a list its source owns, because then it only ever
 * agrees with itself. The two lists compared below live in two different files and are
 * written for two different purposes: `DIGITAL_SOURCE_TYPES` in `c2pa.ts` is OUR reading
 * surface, and `IPTC_DIGITAL_SOURCE_TYPE_CONCEPTS` in `iptc-vocabulary.ts` is THEIR published
 * scheme, copied with its scheme date. Neither is derived from the other. This file adds a
 * third, independent statement: absolute counts and specific ids taken from the STANDARD, so
 * that shrinking both lists together is still caught. All three have to agree.
 *
 * What this cannot do, said plainly rather than left to be assumed: it cannot tell you the
 * snapshot is current. No package here makes a network request. Refreshing the snapshot is a
 * manual step against the scheme URI, recorded in `iptc-vocabulary.ts`.
 *
 * MUTATIONS RUN AGAINST THIS FILE (each made, each seen red, each reverted):
 *   1. `c2pa.ts`, delete `"computationalCapture"` from `DIGITAL_SOURCE_TYPES`. Red: the
 *      published-terms-we-cannot-name case AND the counter case, which is the point: the
 *      divergence check and the consequence check fail independently.
 *   2. `c2pa.ts`, delete `"screenCapture"`. Red: the divergence case and the laundering case.
 *   3. `iptc-vocabulary.ts`, delete a concept from the snapshot. Red: the absolute-count case
 *      and the terms-we-name-that-they-do-not case.
 *   4. `c2pa.ts`, `computationalCapture: "capture"` -> `"algorithmic"`. Red: the counter case.
 */

// Counts taken from the published scheme itself (http://cv.iptc.org/newscodes/digitalsourcetype/,
// scheme last modified 2024-10-23, retrieved 2026-08-26 from both its HTML and JSON views,
// which agreed). They are absolute floors pinned against the STANDARD, deliberately not
// derived from either list under test: a count that agrees only with its own subject cannot
// notice that subject shrinking.
const PUBLISHED_TOTAL = 20;
const PUBLISHED_ACTIVE = 17;
const PUBLISHED_RETIRED = 3;

describe("our vocabulary and the published vocabulary agree, in both directions", () => {
  const published = new Set(IPTC_DIGITAL_SOURCE_TYPE_CONCEPTS.map((c) => c.term));
  // `unknown` is ours: it is the sentinel we return when the file said something we cannot
  // name. It is deliberately not an IPTC term and is excluded from the comparison here rather
  // than being quietly whitelisted inside the source list.
  const ours = new Set(DIGITAL_SOURCE_TYPES.filter((t) => t !== "unknown"));

  it("the snapshot is the size the standard publishes, active and retired counted separately", () => {
    expect(IPTC_DIGITAL_SOURCE_TYPE_CONCEPTS).toHaveLength(PUBLISHED_TOTAL);
    expect(IPTC_DIGITAL_SOURCE_TYPE_CONCEPTS.filter((c) => !c.retired)).toHaveLength(PUBLISHED_ACTIVE);
    expect(IPTC_DIGITAL_SOURCE_TYPE_CONCEPTS.filter((c) => c.retired)).toHaveLength(PUBLISHED_RETIRED);
    expect(new Set(IPTC_DIGITAL_SOURCE_TYPE_CONCEPTS.map((c) => c.term)).size).toBe(PUBLISHED_TOTAL);
    expect(IPTC_SCHEME_URI).toContain("cv.iptc.org/newscodes/digitalsourcetype");
    expect(IPTC_SCHEME_MODIFIED).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("names every published term, including the retired ones that are still in old files", () => {
    const cannotName = [...published].filter((t) => !ours.has(t as never)).sort();
    expect(cannotName).toEqual([]);
    expect(ours.size).toBe(PUBLISHED_TOTAL);
  });

  it("names nothing the published scheme does not define", () => {
    // The direction that catches a list copied from a draft. It caught two, and the answer
    // was not what the earlier measurement assumed: `digitalArt` and `minorHumanEdits` are
    // RETIRED concepts, not absent ones, so keeping them is right and dropping them would
    // have gone blind on files written while they were current.
    const inventedByUs = [...ours].filter((t) => !published.has(t)).sort();
    expect(inventedByUs).toEqual([]);
  });

  it("classifies every term it can name, so no term decodes successfully into no branch", () => {
    for (const t of DIGITAL_SOURCE_TYPES) expect(DIGITAL_SOURCE_KINDS[t]).toBeTruthy();
    expect(Object.keys(DIGITAL_SOURCE_KINDS)).toHaveLength(DIGITAL_SOURCE_TYPES.length);
  });

  it("decodes both namespaces' URI forms, and still refuses to guess at a term it does not know", () => {
    expect(digitalSourceTypeOf("http://cv.iptc.org/newscodes/digitalsourcetype/computationalCapture")).toBe("computationalCapture");
    expect(digitalSourceTypeOf("http://c2pa.org/digitalsourcetype/screenCapture")).toBe("screenCapture");
    expect(digitalSourceTypeOf("http://c2pa.org/digitalsourcetype/trainedAlgorithmicData")).toBe("unknown");
    expect(digitalSourceTypeOf(undefined)).toBe("unknown");
  });
});

describe("the two gaps that mattered, and they point in opposite directions", () => {
  it("computationalCapture now reaches the capture counter, which a dead enum was silently raising the score by losing", () => {
    expect(CAPTURE_SOURCE_TYPES).toContain("digitalCapture"); // the baseline that always worked
    expect(CAPTURE_SOURCE_TYPES).toContain("computationalCapture");
    const manifest = {
      claimGenerator: "Some Phone Camera 1.0",
      actions: [
        { action: "c2pa.created", digitalSourceType: "http://cv.iptc.org/newscodes/digitalsourcetype/computationalCapture" },
      ],
      assertionLabels: [],
      hasIngredients: false,
    };
    expect(declaredCapture(manifest)).toHaveLength(1);
    // And the widening is not indiscriminate: a trained-algorithmic declaration must never be
    // read as a capture, which is the direction that would exonerate the wrong file.
    expect(
      declaredCapture({
        ...manifest,
        actions: [{ action: "c2pa.created", digitalSourceType: "http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia" }],
      }),
    ).toHaveLength(0);
  });

  it("screenCapture now reaches the laundering gate through the declaration itself", () => {
    const packet = (term: string): string =>
      `<x:xmpmeta><Iptc4xmpExt:DigitalSourceType>${term}</Iptc4xmpExt:DigitalSourceType></x:xmpmeta>`;
    const read = (term: string) => {
      const container = inspectContainer(synthPng({ xmp: packet(term) }));
      const metadata = readMetadata(container);
      return { metadata, laundering: assessLaundering(container, metadata, NO_MANIFEST) };
    };

    const shot = read("screenCapture");
    expect(shot.metadata.digitalSourceType).toBe("screenCapture"); // it decodes at all, first
    expect(shot.laundering.indicators.map((i) => i.code)).toContain("declared_screen_capture");
    // A screen capture is laundered bytes, so the gate must actually trip rather than merely
    // note it: the score is withheld, which is the abstention the enum gap was losing.
    expect(shot.laundering.laundered).toBe(true);
    const cited = shot.laundering.indicators.find((i) => i.code === "declared_screen_capture")!;
    expect(cited.observed).toBe("DigitalSourceType = screenCapture");

    // The control: an ordinary capture declaration must not trip the same gate, or the test
    // above would be measuring "any XMP packet" rather than the term.
    const ordinary = read("digitalCapture");
    expect(ordinary.metadata.digitalSourceType).toBe("digitalCapture");
    expect(ordinary.laundering.indicators.map((i) => i.code)).not.toContain("declared_screen_capture");
  });

  it("widening the vocabulary did not widen what any signal rule fires on", () => {
    // The safety property behind classifying terms separately from scoring them. Terms like
    // `digitalCreation` and `dataDrivenMedia` are machine-made and newly nameable, and none of
    // them may become a trained-algorithmic declaration by being added to a list.
    const trained = DIGITAL_SOURCE_TYPES.filter((t) => DIGITAL_SOURCE_KINDS[t] === "trained-algorithmic").sort();
    expect(trained).toEqual(["compositeWithTrainedAlgorithmicMedia", "trainedAlgorithmicMedia"]);
    const captures = [...CAPTURE_SOURCE_TYPES].sort();
    expect(captures).toEqual(["computationalCapture", "digitalCapture"]);
  });

  it("an empty container still produces an empty laundering read, so none of the above fires on nothing", () => {
    const empty = assessLaundering(emptyContainer(0, []), EMPTY_METADATA, NO_MANIFEST);
    expect(empty.indicators.map((i) => i.code)).not.toContain("declared_screen_capture");
    expect(verifiedManifest("x", 1, { claimGenerator: "x", actions: [], assertionLabels: [], hasIngredients: false }).state).toBe("verified");
  });
});
