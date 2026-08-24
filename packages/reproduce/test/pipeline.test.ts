/**
 * The pipeline, end to end, with no keys and no network.
 *
 * Everything the product promises is exercised here against `MockProvider`: a measured elapsed
 * time, a measured cost, the prompt we wrote, a hard timeout that aborts rather than hangs, a
 * budget checked before the call, and four result arms that a renderer can switch on. If any of
 * this needed credentials it would be untested on every ordinary day, which is the whole reason the
 * mock is the reference implementation of the contract rather than a placeholder for one.
 */

import { describe, expect, it } from "vitest";
import type { ReproductionResult } from "@slop/reproduce";
import {
  CONFOUNDER_ORDER,
  DEFAULT_BUDGETS,
  EphemeralStore,
  HeuristicFaceDetector,
  MockProvider,
  NoFacesDetector,
  ProviderRegistry,
  ReproductionPipeline,
  deterministicRuntime,
  realProviders,
} from "@slop/reproduce";
import { consentFor, gradientRaster, imageInput, siteInput, textInput } from "./fixtures.js";

const pipelineWith = (
  providers: readonly MockProvider[],
  extra: { readonly store?: EphemeralStore } = {},
) => {
  const runtime = deterministicRuntime();
  const registry = new ProviderRegistry();
  for (const p of providers) registry.register(p);
  return {
    runtime,
    pipeline: new ReproductionPipeline({
      registry,
      faceDetector: new NoFacesDetector(),
      runtime,
      ...extra,
    }),
  };
};

const expectStatus = <S extends ReproductionResult["status"]>(
  result: ReproductionResult,
  status: S,
): Extract<ReproductionResult, { status: S }> => {
  expect(result.status, `expected ${status}, got ${result.status}: ${result.statement}`).toBe(status);
  return result as Extract<ReproductionResult, { status: S }>;
};

describe("succeeded: the mock provider across all three shipping modalities", () => {
  it("text", async () => {
    const { pipeline, runtime } = pipelineWith([new MockProvider({ modality: "text" })]);
    const input = textInput();
    const result = await pipeline.run({
      input,
      consent: consentFor(input.artifact.artifactId, runtime.clock.now()),
    });
    const ok = expectStatus(result, "succeeded");
    expect(ok.attempt.outcome).toBe("produced");
    expect(ok.attempt.output?.kind).toBe("text");
    // Elapsed is MEASURED against the injected clock, not returned by the provider as a number it
    // made up. The mock's sleep advances that clock, so a simulated 1.2 s is a real 1.2 s here.
    expect(ok.totals.elapsedMs).toBe(1_200);
    expect(ok.totals.costUsd).toBeGreaterThan(0);
    expect(ok.statement).toContain("1.2 s");
    expect(ok.attempt.prompt.length).toBeGreaterThan(20);
    expect(ok.faceRegionsExcluded).toBe(false);
  });

  it("image", async () => {
    const { pipeline, runtime } = pipelineWith([new MockProvider({ modality: "image" })]);
    const input = imageInput();
    const result = await pipeline.run({
      input,
      consent: consentFor(input.artifact.artifactId, runtime.clock.now()),
    });
    const ok = expectStatus(result, "succeeded");
    expect(ok.attempt.output?.kind).toBe("raster");
    if (ok.attempt.output?.kind === "raster") {
      expect(ok.attempt.output.raster.width).toBe(gradientRaster().width);
    }
    expect(ok.totals.elapsedMs).toBe(2_400);
  });

  it("website-from-screenshot", async () => {
    const { pipeline, runtime } = pipelineWith([new MockProvider({ modality: "website-from-screenshot" })]);
    const input = siteInput();
    const result = await pipeline.run({
      input,
      consent: consentFor(input.artifact.artifactId, runtime.clock.now()),
    });
    const ok = expectStatus(result, "succeeded");
    expect(ok.attempt.output?.kind).toBe("html");
    if (ok.attempt.output?.kind === "html") {
      expect(ok.attempt.output.html).toContain("<!doctype html>");
      expect(ok.attempt.output.preview.width).toBeGreaterThan(0);
    }
  });

  it("is deterministic: the same artifact produces the same remake, twice", async () => {
    const run = async (): Promise<ReproductionResult> => {
      const { pipeline, runtime } = pipelineWith([new MockProvider({ modality: "text" })]);
      const input = textInput();
      return pipeline.run({ input, consent: consentFor(input.artifact.artifactId, runtime.clock.now()) });
    };
    const a = expectStatus(await run(), "succeeded");
    const b = expectStatus(await run(), "succeeded");
    expect(a.attempt.prompt).toBe(b.attempt.prompt);
    expect(a.attempt.output).toEqual(b.attempt.output);
    expect(a.statement).toBe(b.statement);
  });

  it("holds the upload, the prompt and the remake with the derivation edges intact", async () => {
    const store = new EphemeralStore();
    const { pipeline, runtime } = pipelineWith([new MockProvider({ modality: "text" })], { store });
    const input = textInput();
    const result = await pipeline.run({
      input,
      consent: consentFor(input.artifact.artifactId, runtime.clock.now()),
    });
    const ok = expectStatus(result, "succeeded");
    expect(store.ids()).toContain(input.artifact.artifactId);
    expect(store.ids()).toContain(`${ok.requestId}:recreation`);

    // A takedown of the upload has to take the remake with it, or the compliance record shows we
    // were told, acted, and the material stayed up.
    const event = store.deleteOnNotice(input.artifact.artifactId, runtime.clock.now(), "notice");
    expect(event.deletedIds).toContain(`${ok.requestId}:recreation`);
    expect(store.ids()).toEqual([]);
  });
});

describe("could_not_reproduce: a receipt of our attempt, never a verdict", () => {
  it("records a provider safety refusal without paraphrasing it into a claim", async () => {
    const { pipeline, runtime } = pipelineWith([
      new MockProvider({ modality: "image", behaviour: "safety_refusal" }),
    ]);
    const input = imageInput();
    const result = await pipeline.run({
      input,
      consent: consentFor(input.artifact.artifactId, runtime.clock.now()),
    });
    const fail = expectStatus(result, "could_not_reproduce");
    expect(fail.tried).toHaveLength(1);
    expect(fail.tried[0]?.outcome).toBe("refused");
    expect(fail.tried[0]?.note).toContain("content safety filter");
    expect(fail.statement).toContain("could not remake this");
    expect(fail.caveat).toContain("Absence of a finding here is not a finding");
  });

  it("lists all five confounders, because a failed remake rules none of them out", async () => {
    const { pipeline, runtime } = pipelineWith([
      new MockProvider({ modality: "image", behaviour: "capability_gap" }),
    ]);
    const input = imageInput();
    const result = await pipeline.run({
      input,
      consent: consentFor(input.artifact.artifactId, runtime.clock.now()),
    });
    const fail = expectStatus(result, "could_not_reproduce");
    expect(fail.confounders).toEqual(CONFOUNDER_ORDER);
    expect(fail.confounders).toHaveLength(5);
    // The interesting one is last and must never be promoted.
    expect(fail.confounders[4]).toBe("expensive_human_work");
  });

  it("falls through to a second provider and reports what each one did", async () => {
    const { pipeline, runtime } = pipelineWith([
      new MockProvider({ modality: "image", id: "mock-a", behaviour: "safety_refusal" }),
      new MockProvider({ modality: "image", id: "mock-b", behaviour: "capability_gap" }),
    ]);
    const input = imageInput();
    const result = await pipeline.run({
      input,
      consent: consentFor(input.artifact.artifactId, runtime.clock.now()),
    });
    const fail = expectStatus(result, "could_not_reproduce");
    expect(fail.tried.map((t) => t.providerId)).toEqual(["mock-a", "mock-b"]);
    expect(fail.totals.attempts).toBe(2);
    // The attempt cost is reported on failure too: "we spent this and could not get close" is
    // itself the honest number.
    expect(fail.statement).toMatch(/\$\d/);
  });

  it("stops at the second provider when the first one succeeds", async () => {
    const { pipeline, runtime } = pipelineWith([
      new MockProvider({ modality: "image", id: "mock-a" }),
      new MockProvider({ modality: "image", id: "mock-b" }),
    ]);
    const input = imageInput();
    const ok = expectStatus(
      await pipeline.run({ input, consent: consentFor(input.artifact.artifactId, runtime.clock.now()) }),
      "succeeded",
    );
    expect(ok.attempts).toHaveLength(1);
    expect(ok.attempt.providerId).toBe("mock-a");
  });
});

describe("the budget is enforced before the call, and the timeout aborts rather than hangs", () => {
  it("never calls a provider whose estimate would cross the cost ceiling", async () => {
    const { pipeline, runtime } = pipelineWith([
      new MockProvider({ modality: "image", costUsd: 5 }),
    ]);
    const input = imageInput();
    const result = await pipeline.run({
      input,
      consent: consentFor(input.artifact.artifactId, runtime.clock.now()),
      budget: { maxCostUsd: 0.01, maxElapsedMs: 60_000, maxAttempts: 3 },
    });
    const fail = expectStatus(result, "could_not_reproduce");
    expect(fail.attempts).toHaveLength(0);
    expect(fail.tried[0]?.outcome).toBe("budget_exceeded");
    expect(fail.tried[0]?.note).toContain("only $0.0100 of the ceiling was left");
    expect(fail.totals.costUsd).toBe(0);
  });

  it("stops at the attempt ceiling", async () => {
    const { pipeline, runtime } = pipelineWith([
      new MockProvider({ modality: "image", id: "a", behaviour: "capability_gap" }),
      new MockProvider({ modality: "image", id: "b", behaviour: "capability_gap" }),
      new MockProvider({ modality: "image", id: "c", behaviour: "capability_gap" }),
    ]);
    const input = imageInput();
    const fail = expectStatus(
      await pipeline.run({
        input,
        consent: consentFor(input.artifact.artifactId, runtime.clock.now()),
        budget: { maxCostUsd: 10, maxElapsedMs: 600_000, maxAttempts: 2 },
      }),
      "could_not_reproduce",
    );
    expect(fail.attempts).toHaveLength(2);
    expect(fail.tried[2]?.note).toContain("attempt ceiling reached (2)");
  });

  it("records a provider that runs past its deadline as a timeout, and charges for it", async () => {
    const { pipeline, runtime } = pipelineWith([
      new MockProvider({ modality: "image", behaviour: "overrun", latencyMs: 3_000 }),
    ]);
    const input = imageInput();
    const fail = expectStatus(
      await pipeline.run({ input, consent: consentFor(input.artifact.artifactId, runtime.clock.now()) }),
      "could_not_reproduce",
    );
    expect(fail.attempts[0]?.outcome).toBe("timeout");
    expect(fail.attempts[0]?.refusalNote).toContain("passed its deadline");
    // A call we aborted may still be billed by the vendor, so it is charged rather than treated
    // as free. Understating our own spend would be the wrong direction to be wrong in.
    expect(fail.totals.costUsd).toBeGreaterThan(0);
  });

  it("takes the smaller of the provider's ceiling and the time left in the request", async () => {
    const { pipeline, runtime } = pipelineWith([
      new MockProvider({ modality: "website-from-screenshot", behaviour: "overrun", latencyMs: 30_000 }),
    ]);
    const input = siteInput();
    const fail = expectStatus(
      await pipeline.run({
        input,
        consent: consentFor(input.artifact.artifactId, runtime.clock.now()),
        budget: { maxCostUsd: 5, maxElapsedMs: 5_000, maxAttempts: 2 },
      }),
      "could_not_reproduce",
    );
    expect(fail.attempts[0]?.outcome).toBe("timeout");
    // Aborted at the request ceiling, not at the provider's much larger one.
    expect(fail.attempts[0]?.elapsedMs).toBe(5_001);
  });

  it("ships a default budget for every shipping modality", () => {
    expect(Object.keys(DEFAULT_BUDGETS).sort()).toEqual(["image", "text", "website-from-screenshot"]);
    for (const [modality, budget] of Object.entries(DEFAULT_BUDGETS)) {
      expect(budget.maxCostUsd, modality).toBeGreaterThan(0);
      expect(budget.maxAttempts, modality).toBeGreaterThan(0);
    }
  });
});

describe("not_configured: a statement about our build, never a crash and never a fake result", () => {
  it("names the environment variables a real text provider would need", async () => {
    const registry = new ProviderRegistry();
    for (const p of realProviders()) registry.register(p);
    const runtime = deterministicRuntime();
    const pipeline = new ReproductionPipeline({ registry, faceDetector: new NoFacesDetector(), runtime });
    const input = textInput();
    const result = await pipeline.run({
      input,
      consent: consentFor(input.artifact.artifactId, runtime.clock.now()),
    });
    const nc = expectStatus(result, "not_configured");
    expect(nc.missingEnv).toEqual(["SLOP_ANTHROPIC_API_KEY", "SLOP_OPENAI_API_KEY"]);
    expect(nc.attempts).toHaveLength(0);
    expect(nc.totals.costUsd).toBe(0);
    expect(nc.statement).toContain("SLOP_ANTHROPIC_API_KEY");
  });

  it("stays unconfigured when the keys are present but no transport is wired", async () => {
    const registry = new ProviderRegistry();
    for (const p of realProviders()) registry.register(p);
    const runtime = deterministicRuntime();
    const pipeline = new ReproductionPipeline({ registry, faceDetector: new NoFacesDetector(), runtime });
    const input = imageInput();
    const result = await pipeline.run({
      input,
      consent: consentFor(input.artifact.artifactId, runtime.clock.now()),
      env: { SLOP_FAL_KEY: "sk-not-real", SLOP_BFL_API_KEY: "x", SLOP_BFL_CONTENT_LICENCE_OPTOUT_CONFIRMED: "1" },
    });
    const nc = expectStatus(result, "not_configured");
    // The keys satisfy the env half, so nothing is reported missing; the transport half does not,
    // so no call is made. A half-configured provider must not reach the network.
    expect(nc.missingEnv).toEqual([]);
    expect(nc.statement).toContain("No provider is wired up");
  });

  it("returns not_configured rather than throwing when the registry is empty", async () => {
    const runtime = deterministicRuntime();
    const pipeline = new ReproductionPipeline({ registry: new ProviderRegistry(), runtime });
    const input = textInput();
    const result = await pipeline.run({
      input,
      consent: consentFor(input.artifact.artifactId, runtime.clock.now()),
    });
    expectStatus(result, "not_configured");
  });
});

describe("scope", () => {
  it("refuses a modality this build does not ship, even if it arrives past the type system", async () => {
    const runtime = deterministicRuntime();
    const pipeline = new ReproductionPipeline({
      registry: new ProviderRegistry().register(new MockProvider({ modality: "text" })),
      faceDetector: new HeuristicFaceDetector(),
      runtime,
    });
    const input = { ...textInput(), modality: "video" } as unknown as Parameters<typeof pipeline.run>[0]["input"];
    const result = await pipeline.run({
      input,
      consent: consentFor("art_text", runtime.clock.now()),
    });
    const refused = expectStatus(result, "refused");
    expect(refused.refusal).toBe("modality_out_of_scope");
    expect(refused.attempts).toHaveLength(0);
  });
});
