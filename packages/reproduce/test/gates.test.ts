/**
 * The two gates in front of every provider call: consent, then faces.
 *
 * Both are Tier-1 items in `publicity-defamation-risk.md`. The consent gate is called "the cheapest
 * defence in the memo, defends against the most statutes" (#5); refusing to regenerate identifiable
 * faces "removes the publicity head almost entirely" (#6). Neither is a setting. Both are tested
 * here through the real pipeline rather than by calling the checker directly, because the property
 * that matters is not "the function returns false" but "no provider was called".
 */

import { describe, expect, it } from "vitest";
import type { ConsentRecord, ReproductionInput } from "@slop/reproduce";
import {
  CONSENT_DEFINITION,
  CONSENT_STATEMENT_TEXT,
  HeuristicFaceDetector,
  MockProvider,
  NoFacesDetector,
  PERMITTED_VERBATIM_QUOTATIONS,
  ProviderRegistry,
  REGENERATION_SCOPE,
  ReproductionPipeline,
  SubstantiationLog,
  checkConsent,
  deterministicRuntime,
  excludeFaceRegions,
  grantConsent,
} from "@slop/reproduce";
import { consentFor, faceLikeRaster, gradientRaster, imageInput, textInput } from "./fixtures.js";

/**
 * A provider that records whether it was ever reached.
 *
 * This is the assertion the gate tests actually rest on. "The result says refused" is satisfiable
 * by a pipeline that calls the provider first and refuses afterwards, which would leak the artifact
 * to a third party and then apologise.
 */
class Tripwire extends MockProvider {
  called = 0;
  override async reproduce(...args: Parameters<MockProvider["reproduce"]>) {
    this.called += 1;
    return super.reproduce(...args);
  }
}

function harness(detector: HeuristicFaceDetector | NoFacesDetector | undefined, modality: "text" | "image") {
  const runtime = deterministicRuntime();
  const provider = new Tripwire({ modality });
  const log = new SubstantiationLog();
  const pipeline = new ReproductionPipeline({
    registry: new ProviderRegistry().register(provider),
    ...(detector === undefined ? {} : { faceDetector: detector }),
    runtime,
    log,
  });
  return { runtime, provider, pipeline, log };
}

describe("the consent gate: no consent, no call", () => {
  const cases: readonly {
    readonly name: string;
    readonly code: string;
    readonly consent: (nowMs: number, input: ReproductionInput) => ConsentRecord | undefined;
  }[] = [
    { name: "no record at all", code: "consent_missing", consent: () => undefined },
    {
      name: "a record that does not cover regeneration",
      code: "consent_scope_insufficient",
      consent: (nowMs, input) =>
        grantConsent({
          consentId: "cns_1",
          artifactId: input.artifact.artifactId,
          nowMs,
          ttlMs: 60_000,
          scopes: ["transmit_to_provider"],
          submitterAssertsRights: true,
        }),
    },
    {
      name: "a record for a different upload",
      code: "consent_artifact_mismatch",
      consent: (nowMs) => consentFor("some-other-artifact", nowMs),
    },
    {
      name: "an expired record",
      code: "consent_expired",
      consent: (nowMs, input) =>
        grantConsent({
          consentId: "cns_2",
          artifactId: input.artifact.artifactId,
          nowMs: nowMs - 120_000,
          ttlMs: 60_000,
          scopes: ["transmit_to_provider", "regenerate"],
          submitterAssertsRights: true,
        }),
    },
    {
      name: "a record with no representation of rights",
      code: "consent_not_freely_given",
      consent: (nowMs, input) =>
        grantConsent({
          consentId: "cns_3",
          artifactId: input.artifact.artifactId,
          nowMs,
          ttlMs: 60_000,
          scopes: ["transmit_to_provider", "regenerate"],
          submitterAssertsRights: false,
        }),
    },
    {
      name: "a record whose authorization was not freely given",
      code: "consent_not_freely_given",
      consent: (nowMs, input) => ({
        ...consentFor(input.artifact.artifactId, nowMs),
        voluntary: false,
      }),
    },
  ];

  for (const c of cases) {
    it(`refuses on ${c.name}, and the provider is never reached`, async () => {
      const { pipeline, provider, runtime, log } = harness(new NoFacesDetector(), "text");
      const input = textInput();
      const consent = c.consent(runtime.clock.now(), input);
      const result = await pipeline.run(consent === undefined ? { input } : { input, consent });
      expect(result.status).toBe("refused");
      if (result.status === "refused") expect(result.refusal).toBe(c.code);
      expect(provider.called, "a provider was called despite the consent gate refusing").toBe(0);
      expect(log.entries()).toHaveLength(0);
      expect(result.totals.costUsd).toBe(0);
    });
  }

  it("lets a well-formed record through", async () => {
    const { pipeline, provider, runtime } = harness(new NoFacesDetector(), "text");
    const input = textInput();
    const result = await pipeline.run({
      input,
      consent: consentFor(input.artifact.artifactId, runtime.clock.now()),
    });
    expect(result.status).toBe("succeeded");
    expect(provider.called).toBe(1);
  });

  it("uses the TAKE IT DOWN definition verbatim, in the clickwrap and in the record", () => {
    expect(CONSENT_DEFINITION).toBe(
      "affirmative, conscious, and voluntary authorization, free from force, fraud, duress, misrepresentation, or coercion",
    );
    expect(CONSENT_STATEMENT_TEXT).toContain(CONSENT_DEFINITION);
    expect(PERMITTED_VERBATIM_QUOTATIONS).toContain(CONSENT_DEFINITION);
    // The clickwrap names the operation being consented to, in its first line, in plain words.
    expect(CONSENT_STATEMENT_TEXT.split("\n")[0]).toContain("Regeneration");
    const record = consentFor("a", 0);
    expect(record.method).toBe("clickwrap");
    expect(record.statementText).toBe(CONSENT_STATEMENT_TEXT);
    expect(record.scopes).toContain(REGENERATION_SCOPE);
  });

  it("treats each of the four statutory elements as load-bearing", () => {
    const nowMs = 1_000;
    const base = consentFor("a", nowMs);
    for (const field of ["affirmative", "conscious", "voluntary", "freeFromCoercion"] as const) {
      const broken = { ...base, [field]: false };
      const check = checkConsent(broken, "a", nowMs);
      expect(check.ok, `${field} was allowed to be false`).toBe(false);
    }
    expect(checkConsent(base, "a", nowMs).ok).toBe(true);
  });
});

describe("the face gate: detected before any regeneration, and it fails closed", () => {
  it("refuses when a face is present, and the provider is never reached", async () => {
    const { pipeline, provider, runtime } = harness(new HeuristicFaceDetector(), "image");
    const input = imageInput(faceLikeRaster(), "art_face");
    const result = await pipeline.run({
      input,
      consent: consentFor(input.artifact.artifactId, runtime.clock.now()),
    });
    expect(result.status).toBe("refused");
    if (result.status === "refused") {
      expect(result.refusal).toBe("identifiable_face_present");
      // The result SAYS SO, which is the requirement. A silent refusal is a bug report from a user.
      expect(result.detail).toContain("region(s) using");
      expect(result.statement).toContain("face");
    }
    expect(provider.called).toBe(0);
  });

  it("refuses when no detector is configured at all, rather than proceeding unchecked", async () => {
    const { pipeline, provider, runtime } = harness(undefined, "image");
    const input = imageInput();
    const result = await pipeline.run({
      input,
      consent: consentFor(input.artifact.artifactId, runtime.clock.now()),
    });
    expect(result.status).toBe("refused");
    if (result.status === "refused") expect(result.refusal).toBe("face_check_unavailable");
    expect(provider.called).toBe(0);
  });

  it("excludes the region and says so when the policy is exclude", async () => {
    const runtime = deterministicRuntime();
    const provider = new Tripwire({ modality: "image" });
    const pipeline = new ReproductionPipeline({
      registry: new ProviderRegistry().register(provider),
      faceDetector: new HeuristicFaceDetector(),
      runtime,
      facePolicy: "exclude",
    });
    const input = imageInput(faceLikeRaster(), "art_face");
    const result = await pipeline.run({
      input,
      consent: consentFor(input.artifact.artifactId, runtime.clock.now()),
    });
    expect(result.status).toBe("succeeded");
    if (result.status === "succeeded") {
      expect(result.faceRegionsExcluded).toBe(true);
      expect(result.attempt.faceRegionsExcluded).toBe(true);
    }
    expect(provider.called).toBe(1);
  });

  it("masks flat rather than blurring, so the region a provider sees carries no likeness", async () => {
    const raster = faceLikeRaster();
    const detection = await new HeuristicFaceDetector().detect(raster);
    expect(detection.regions.length).toBeGreaterThan(0);
    const masked = excludeFaceRegions(raster, detection.regions);
    // The original is untouched, and the masked copy has one flat value where the region was.
    expect(masked).not.toBe(raster);
    const r = detection.regions[0];
    if (r === undefined) throw new Error("no region");
    const first = [masked.data[(r.y * masked.width + r.x) * 4], masked.data[(r.y * masked.width + r.x) * 4 + 1]];
    for (let y = r.y; y < r.y + r.h; y += 3) {
      for (let x = r.x; x < r.x + r.w; x += 3) {
        const i = (y * masked.width + x) * 4;
        expect([masked.data[i], masked.data[i + 1]]).toEqual(first);
      }
    }
  });

  it("does not fire on an image with no face-like region", async () => {
    // The mutation. A gate that refuses everything is not a gate, and every test above would still
    // pass with one.
    const detection = await new HeuristicFaceDetector().detect(gradientRaster());
    expect(detection.regions).toEqual([]);
    const { pipeline, provider, runtime } = harness(new HeuristicFaceDetector(), "image");
    const input = imageInput();
    const result = await pipeline.run({
      input,
      consent: consentFor(input.artifact.artifactId, runtime.clock.now()),
    });
    expect(result.status).toBe("succeeded");
    expect(provider.called).toBe(1);
  });

  it("declares the stand-in detector as not production grade", () => {
    // So the substantiation record can never rest on it silently.
    expect(new HeuristicFaceDetector().productionGrade).toBe(false);
    expect(new NoFacesDetector().productionGrade).toBe(false);
  });
});
