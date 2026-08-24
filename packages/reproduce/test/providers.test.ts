/**
 * The provider layer: the contract, the refusals, and what a real provider would actually need.
 *
 * The refusal list is the interesting part. In twelve months somebody will propose the fastest
 * image model on it, and the only thing that will stop them is the sentence explaining why it was
 * excluded plus a registry that throws. Both are asserted here, by id, with the reason.
 */

import { describe, expect, it } from "vitest";
import type { ReproductionProvider } from "@slop/reproduce";
import {
  DEFERRED_MODALITIES,
  FORBIDDEN_PROVIDERS,
  ForbiddenProviderError,
  MockProvider,
  ProviderRegistry,
  REAL_PROVIDER_SPECS,
  V1_MODALITIES,
  findForbidden,
  realProviders,
  requiredEnvByModality,
} from "@slop/reproduce";
import { imageInput, textInput } from "./fixtures.js";

describe("the forbidden list is enforced, not documented", () => {
  const expected: readonly { readonly id: string; readonly because: RegExp }[] = [
    { id: "azure-openai", because: /copyright commitment requires mitigations/i },
    { id: "flux-1-dev", because: /non-commercial and bars end-user interactions/i },
    { id: "gemini-developer-api-free-tier", because: /training rights in inputs/i },
    { id: "sora", because: /discontinued/i },
    { id: "midjourney", because: /no API and automating the service is prohibited/i },
  ];

  it("names every provider the research closed, with a reason and a citation", () => {
    expect(FORBIDDEN_PROVIDERS.map((f) => f.id).sort()).toEqual(expected.map((e) => e.id).sort());
    for (const e of expected) {
      const entry = FORBIDDEN_PROVIDERS.find((f) => f.id === e.id);
      expect(entry, e.id).toBeDefined();
      expect(entry?.reason, e.id).toMatch(e.because);
      expect(entry?.source.length, `${e.id} has no citation`).toBeGreaterThan(10);
    }
  });

  for (const e of expected) {
    it(`throws when "${e.id}" is registered, at registration rather than at call time`, () => {
      const provider = new MockProvider({ modality: "image", id: e.id });
      expect(() => new ProviderRegistry().register(provider)).toThrow(ForbiddenProviderError);
      // The thrown message carries the reason, so the person who hits it learns why.
      try {
        new ProviderRegistry().register(provider);
      } catch (error) {
        expect((error as Error).message).toContain(e.id);
        expect((error as Error).message.length).toBeGreaterThan(60);
      }
    });
  }

  it("catches a forbidden id embedded in a longer one", () => {
    expect(findForbidden("fal-ai/flux-1-dev-lora")?.id).toBe("flux-1-dev");
    expect(() => new ProviderRegistry().register(new MockProvider({ modality: "image", id: "my-sora-wrapper" }))).toThrow(
      ForbiddenProviderError,
    );
  });

  it("does not fire on unrelated ids", () => {
    // The mutation. A guard that matches everything gets deleted the first time it is inconvenient.
    for (const id of ["fal-flux-schnell", "anthropic-text", "bfl-flux-commercial", "v0-site", "mock-image"]) {
      expect(findForbidden(id), id).toBeUndefined();
    }
    expect(() => new ProviderRegistry().register(new MockProvider({ modality: "image", id: "fal-flux-schnell" }))).not.toThrow();
  });

  it("marks the one that is unreachable rather than disallowed", () => {
    // "Could not reproduce" has to be a first-class honest outcome precisely because of this entry:
    // the most likely source of a widely shared image cannot be called at all.
    const unreachable = FORBIDDEN_PROVIDERS.filter((f) => f.unreachable === true);
    expect(unreachable.map((f) => f.id)).toEqual(["midjourney"]);
  });
});

describe("the provider contract", () => {
  it("prices a call before making it, without doing any I/O", () => {
    const provider = new MockProvider({ modality: "image" });
    const a = provider.estimateCost(imageInput());
    const b = provider.estimateCost(imageInput());
    expect(a).toBe(b);
    expect(a).toBeGreaterThan(0);
    expect(provider.declaredCostUsdPerCall).toBeGreaterThan(0);
    expect(provider.hardTimeoutMs).toBeGreaterThan(0);
  });

  it("scales the estimate with the input", () => {
    const provider = new MockProvider({ modality: "text" });
    const short = provider.estimateCost(textInput("a b c"));
    const long = provider.estimateCost(textInput("a b c ".repeat(4_000)));
    expect(long).toBeGreaterThan(short);
  });

  it("rejects a duplicate registration", () => {
    const registry = new ProviderRegistry().register(new MockProvider({ modality: "text" }));
    expect(() => registry.register(new MockProvider({ modality: "text" }))).toThrow(/already registered/);
  });

  it("indexes by modality", () => {
    const registry = new ProviderRegistry()
      .register(new MockProvider({ modality: "text" }))
      .register(new MockProvider({ modality: "image" }));
    expect(registry.for("text")).toHaveLength(1);
    expect(registry.for("website-from-screenshot")).toHaveLength(0);
    expect(registry.all()).toHaveLength(2);
  });
});

describe("real providers are absent by default", () => {
  it("reports every one as unconfigured with no transport, whatever the environment says", () => {
    const env = Object.fromEntries(
      REAL_PROVIDER_SPECS.flatMap((s) => s.requiredEnv).map((k) => [k, "present"]),
    );
    for (const provider of realProviders()) {
      expect(provider.isConfigured(env), provider.id).toBe(false);
    }
  });

  it("requires BOTH a key and a transport", () => {
    const transport = { id: "t", send: async () => ({ status: 200, body: {} }) };
    const withTransport = realProviders(transport);
    const anthropic = withTransport.find((p) => p.id === "anthropic-text") as ReproductionProvider;
    expect(anthropic.isConfigured({})).toBe(false);
    expect(anthropic.isConfigured({ SLOP_ANTHROPIC_API_KEY: "" })).toBe(false);
    expect(anthropic.isConfigured({ SLOP_ANTHROPIC_API_KEY: "sk-x" })).toBe(true);
  });

  it("never fabricates a result when it is reached without a transport", async () => {
    const provider = realProviders().find((p) => p.id === "anthropic-text") as ReproductionProvider;
    const attempt = await provider.reproduce(textInput(), {
      attemptId: "att_1",
      maxCostUsd: 1,
      deadlineAtMs: Number.MAX_SAFE_INTEGER,
      signal: new AbortController().signal,
      clock: { now: () => 0, iso: () => "1970-01-01T00:00:00.000Z" },
      sleep: async () => undefined,
      checkpoint: () => undefined,
    });
    expect(attempt.outcome).toBe("error");
    expect(attempt.output).toBeUndefined();
    expect(attempt.costUsd).toBe(0);
    expect(attempt.refusalNote).toContain("no transport is wired");
  });

  it("declares the environment variables each modality needs", () => {
    const env = requiredEnvByModality();
    expect(env.text).toEqual(["SLOP_ANTHROPIC_API_KEY", "SLOP_OPENAI_API_KEY"]);
    expect(env.image).toEqual([
      "SLOP_FAL_KEY",
      "SLOP_BFL_API_KEY",
      "SLOP_BFL_CONTENT_LICENCE_OPTOUT_CONFIRMED",
    ]);
    expect(env["website-from-screenshot"]).toEqual(["SLOP_V0_API_KEY"]);
  });

  it("registers cleanly, which is the standing proof that none of them is on the forbidden list", () => {
    const registry = new ProviderRegistry();
    expect(() => {
      for (const p of realProviders()) registry.register(p);
    }).not.toThrow();
    expect(registry.all()).toHaveLength(REAL_PROVIDER_SPECS.length);
  });

  it("carries the benchmarking restriction as data rather than as a memory", () => {
    const unpublishable = REAL_PROVIDER_SPECS.filter((s) => !s.publishableInComparisons);
    expect(unpublishable.length).toBeGreaterThan(0);
    for (const spec of unpublishable) expect(spec.note).toMatch(/benchmark/i);
  });

  it("covers every shipping modality and nothing else", () => {
    expect([...new Set(REAL_PROVIDER_SPECS.map((s) => s.modality))].sort()).toEqual([...V1_MODALITIES].sort());
  });
});

describe("scope is a decision on the record, not an omission", () => {
  it("ships three modalities and defers two, each with a reason and a citation", () => {
    expect(V1_MODALITIES).toEqual(["text", "image", "website-from-screenshot"]);
    expect(DEFERRED_MODALITIES.map((d) => d.modality)).toEqual(["video", "voice"]);
    for (const d of DEFERRED_MODALITIES) {
      expect(d.reason.length, d.modality).toBeGreaterThan(80);
      expect(d.source, d.modality).toContain("market-check-reproduction.md");
    }
  });

  it("ships no stub implementation for a deferred modality", () => {
    // A provider returning a plausible placeholder for a modality we cannot serve is worse than the
    // absence, because the placeholder is what ends up in a screenshot.
    for (const spec of REAL_PROVIDER_SPECS) {
      expect(["video", "voice"]).not.toContain(spec.modality as string);
    }
  });
});
