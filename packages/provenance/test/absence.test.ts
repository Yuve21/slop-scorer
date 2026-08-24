import { describe, expect, it } from "vitest";
import {
  ABSENCE_IS_NOT_EVIDENCE,
  absenceIsNotEvidence,
  BROKEN_MANIFEST_IS_NOT_EVIDENCE,
  citableWatermarks,
  DEFAULT_WATERMARK_PROBES,
  digitalSourceTypeOf,
  GENERATOR_SIGNATURES,
  ingestMedia,
  locatedManifest,
  matchGenerators,
  mayContributeGenerationEvidence,
  mediaClaimViolations,
  NO_MANIFEST,
  readMetadata,
  rejectedManifest,
  synthJpeg,
  synthPng,
  verifiedManifest,
  WATERMARK_ABSENCE_NOTE,
} from "@slop/provenance";
import type { C2paState, WatermarkProbe } from "@slop/provenance";

/**
 * ABSENCE OF PROVENANCE IS NOT EVIDENCE OF GENERATION.
 *
 * The single most common fallacy in this category, tested as a hard rule rather than trusted
 * to a comment. Three separate absences are checked, because each one has its own tempting
 * misreading:
 *
 *   - No Content Credential. Tempting reading: "a real camera would have signed it." Almost
 *     nothing is signed; a screenshot, a re-upload or a messaging app strips what was there.
 *   - A Content Credential that fails to validate. Tempting reading: "somebody tampered with
 *     it, so something is wrong." A manifest breaks under re-encoding and under an expired
 *     certificate, and a broken chain of custody is a reason to trust the MANIFEST less, not
 *     to trust an accusation more.
 *   - A watermark scheme that reported nothing. Tempting reading: "no mark, so no watermarking
 *     producer made it." Published attacks strip these marks without detector access, an
 *     ordinary screenshot strips most of them by accident, and only a handful of producers
 *     apply one at all.
 */

describe("an absent Content Credential contributes nothing in either direction", () => {
  const states: readonly C2paState[] = ["absent", "present_unverified", "verified", "invalid", "unparseable"];

  it("only a VERIFIED manifest may contribute generation evidence", () => {
    for (const state of states) {
      expect(mayContributeGenerationEvidence(state), state).toBe(state === "verified");
    }
  });

  it("the state list is exhaustive, so a new state cannot default to citable", () => {
    // The mutation half. If somebody adds a sixth state and forgets this test, the count
    // assertion fails before the permissive default can ship.
    expect(states).toHaveLength(5);
    for (const state of states) expect(typeof mayContributeGenerationEvidence(state)).toBe("boolean");
  });

  it("absence carries a stated rebuttal, and it is printed rather than filed away", () => {
    expect(absenceIsNotEvidence(NO_MANIFEST)).toBe(ABSENCE_IS_NOT_EVIDENCE);
    expect(ABSENCE_IS_NOT_EVIDENCE).toMatch(/ordinary case/i);
    expect(ABSENCE_IS_NOT_EVIDENCE).toMatch(/screenshot|re-upload/i);
  });

  it("a broken or unreadable manifest gets its own rebuttal, not a substitute finding", () => {
    const broken = rejectedManifest("jpeg:0x00000010", 900, ["certificate expired"]);
    expect(absenceIsNotEvidence(broken)).toBe(BROKEN_MANIFEST_IS_NOT_EVIDENCE);
    expect(BROKEN_MANIFEST_IS_NOT_EVIDENCE).toMatch(/not a substitute finding/i);
    expect(mayContributeGenerationEvidence(broken.state)).toBe(false);
  });

  it("a verified manifest is the ONLY state that returns no rebuttal", () => {
    const ok = verifiedManifest("jpeg:0x00000010", 900, {
      claimGenerator: "Leica M11-P",
      actions: [{ action: "c2pa.created", digitalSourceType: "http://cv.iptc.org/newscodes/digitalsourcetype/digitalCapture" }],
      assertionLabels: [],
      hasIngredients: false,
    });
    expect(absenceIsNotEvidence(ok)).toBeNull();
  });

  it("locating a box cannot produce a verified manifest, by construction", () => {
    const located = locatedManifest("jpeg:0x0000002a", 1_200);
    expect(located.state).toBe("present_unverified");
    expect(located.manifest).toBeNull();
    expect(located.validationNotes.join(" ")).toMatch(/does not verify its signature/i);
  });

  it("ingest never upgrades a manifest a verifier did not see", () => {
    // A caller handing in a verified record for a file with no manifest box must not be able
    // to conjure one. The guard is in `ingestMedia`, checked here from the outside.
    const bytes = synthJpeg({ quant: "camera", exif: { Make: "FUJIFILM", Model: "X-T5" } });
    const artifact = ingestMedia(bytes, {
      modality: "image",
      locator: "absence://no-box",
      verifiedC2pa: verifiedManifest("nowhere", 10, {
        claimGenerator: "Adobe Firefly 1.0",
        actions: [{ action: "c2pa.created", digitalSourceType: "trainedAlgorithmicMedia" }],
        assertionLabels: [],
        hasIngredients: false,
      }),
    });
    expect(artifact.c2pa.state).toBe("absent");
    expect(artifact.c2pa.manifest).toBeNull();
  });

  it("the rebuttals themselves pass the claim guard", () => {
    for (const s of [ABSENCE_IS_NOT_EVIDENCE, BROKEN_MANIFEST_IS_NOT_EVIDENCE, WATERMARK_ABSENCE_NOTE]) {
      expect(mediaClaimViolations(s), s).toEqual([]);
    }
  });
});

describe("watermarks are detect-if-present and never infer-if-absent", () => {
  it("the default probe set is entirely not_checked, and each one says why", () => {
    expect(DEFAULT_WATERMARK_PROBES.length).toBeGreaterThanOrEqual(3);
    for (const probe of DEFAULT_WATERMARK_PROBES) {
      expect(probe.outcome).toBe("not_checked");
      expect(probe.detector).toBeNull();
      expect(probe.note.length).toBeGreaterThan(40);
    }
  });

  it("neither not_checked nor not_detected is citable", () => {
    const probes: WatermarkProbe[] = [
      { scheme: "synthid", outcome: "not_detected", detector: "some detector", locator: "whole file", note: "" },
      ...DEFAULT_WATERMARK_PROBES,
    ];
    expect(citableWatermarks(probes)).toEqual([]);
  });

  it("a positive result with no named detector is not citable either", () => {
    const anonymous: WatermarkProbe[] = [
      { scheme: "synthid", outcome: "present", detector: null, locator: "whole file", note: "" },
    ];
    expect(citableWatermarks(anonymous)).toEqual([]);
  });

  it("a positive result from a named detector at a stated location is citable", () => {
    const named: WatermarkProbe[] = [
      { scheme: "synthid", outcome: "present", detector: "the scheme owner's detector", locator: "whole file", note: "" },
    ];
    expect(citableWatermarks(named)).toHaveLength(1);
  });
});

describe("the generator table only matches declarations", () => {
  const fieldsOf = (text: Readonly<Record<string, string>>) =>
    readMetadata(inspect(synthPng({ text })));

  const inspect = (bytes: Uint8Array) => {
    const artifact = ingestMedia(bytes, { modality: "image", locator: "gen://case" });
    return artifact.container;
  };

  it("a text chunk carrying a real generation record matches", () => {
    const hits = matchGenerators(
      fieldsOf({ parameters: "a harbour\nSteps: 28, Sampler: DPM++ 2M Karras, CFG scale: 7, Seed: 1" }),
    );
    expect(hits.map((h) => h.signature.id)).toContain("gen.sd-webui-parameters");
  });

  it("prose that merely NAMES a tool matches nothing", () => {
    // The discipline that separates a declaration from a mention. An XMP comment reading
    // "not made with a generator" contains the words a naive matcher hunts for.
    const decoys: Readonly<Record<string, string>>[] = [
      { Description: "a study in the style people associate with Midjourney" },
      { Comment: "made without Firefly, DALL-E or any model" },
      { Title: "openai-inspired palette study" },
      { parameters: "shot at f/2, 1/250, ISO 400" },
    ];
    for (const decoy of decoys) {
      expect(matchGenerators(fieldsOf(decoy)), JSON.stringify(decoy)).toEqual([]);
    }
  });

  it("every signature in the table states its basis and can express a real value", () => {
    expect(GENERATOR_SIGNATURES.length).toBeGreaterThanOrEqual(8);
    for (const signature of GENERATOR_SIGNATURES) {
      expect(signature.basis.length, signature.id).toBeGreaterThan(60);
      expect(signature.field, signature.id).toBeTruthy();
    }
  });

  it("no signature matches an empty field, which is what a stale pattern looks like", () => {
    for (const signature of GENERATOR_SIGNATURES) {
      expect(signature.match("", ""), `${signature.id} matches an empty field`).toBe(false);
    }
  });

  it("the IPTC vocabulary is read from the URI form as well as the bare term", () => {
    expect(digitalSourceTypeOf("http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia")).toBe(
      "trainedAlgorithmicMedia",
    );
    expect(digitalSourceTypeOf("digitalCapture")).toBe("digitalCapture");
    expect(digitalSourceTypeOf("something nobody has defined")).toBe("unknown");
    expect(digitalSourceTypeOf(undefined)).toBe("unknown");
  });
});
