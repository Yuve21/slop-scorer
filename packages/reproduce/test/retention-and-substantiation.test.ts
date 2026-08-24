/**
 * Ephemeral by default, deletable on notice, and substantiated whatever the outcome.
 *
 * The two halves are related: what we keep is what can be produced against us, and what we log is
 * what defends the claim we published. The resolution is to keep almost nothing for almost no time,
 * and to make the little we do keep deletable along every derivation edge.
 */

import { describe, expect, it } from "vitest";
import {
  DEFAULT_TTL_MS,
  EphemeralStore,
  MAX_RETENTION_MS,
  MockProvider,
  NoFacesDetector,
  ProviderRegistry,
  ReproductionPipeline,
  SubstantiationLog,
  deterministicRuntime,
  formatAggregate,
  median,
} from "@slop/reproduce";
import { consentFor, imageInput, textInput } from "./fixtures.js";

describe("retention: ephemeral by default", () => {
  it("expires a record with no further action", () => {
    const store = new EphemeralStore();
    store.put({ id: "u1", kind: "upload", value: 1, nowMs: 0 });
    expect(store.get("u1", DEFAULT_TTL_MS - 1)).toBeDefined();
    expect(store.get("u1", DEFAULT_TTL_MS)).toBeUndefined();
    expect(store.ids()).toEqual([]);
  });

  it("sweeps everything past its expiry and reports what went", () => {
    const store = new EphemeralStore(1_000);
    store.put({ id: "a", kind: "upload", value: 1, nowMs: 0 });
    store.put({ id: "b", kind: "upload", value: 1, nowMs: 5_000 });
    expect(store.sweep(2_000)).toEqual(["a"]);
    expect(store.ids()).toEqual(["b"]);
  });

  it("refuses a derivation link to a record it does not hold", () => {
    // A dangling edge is a takedown that will silently miss something later.
    const store = new EphemeralStore();
    expect(() => store.put({ id: "r1", kind: "recreation", value: 1, nowMs: 0, derivedFrom: "ghost" })).toThrow(
      /would never reach it/,
    );
  });
});

describe("retention: opting in is explicit, time-boxed and recorded", () => {
  it("extends one record, on the record, with a reason and an actor", () => {
    const store = new EphemeralStore();
    store.put({ id: "u1", kind: "upload", value: 1, nowMs: 0 });
    const grant = store.retain({
      recordId: "u1",
      untilMs: 60 * 60 * 1_000,
      reason: "the submitter asked us to hold it for a dispute",
      actor: "submitter",
      nowMs: 0,
    });
    expect(grant.actor).toBe("submitter");
    expect(store.get("u1", DEFAULT_TTL_MS + 1)).toBeDefined();
    expect(store.retentionGrants()).toHaveLength(1);
  });

  it("rejects a grant with no reason, no actor, no future, or no bound", () => {
    const store = new EphemeralStore();
    store.put({ id: "u1", kind: "upload", value: 1, nowMs: 0 });
    const base = { recordId: "u1", untilMs: 10_000, reason: "r", actor: "a", nowMs: 0 };
    expect(() => store.retain({ ...base, reason: "  " })).toThrow(/reason and an actor/);
    expect(() => store.retain({ ...base, actor: "" })).toThrow(/reason and an actor/);
    expect(() => store.retain({ ...base, untilMs: 0 })).toThrow(/end in the future/);
    expect(() => store.retain({ ...base, untilMs: MAX_RETENTION_MS + 1 })).toThrow(/may not exceed/);
  });

  it("does not cascade: keeping an upload does not keep the remake", () => {
    const store = new EphemeralStore(1_000);
    store.put({ id: "u1", kind: "upload", value: 1, nowMs: 0 });
    store.put({ id: "r1", kind: "recreation", value: 1, nowMs: 0, derivedFrom: "u1" });
    store.retain({ recordId: "u1", untilMs: 500_000, reason: "asked", actor: "submitter", nowMs: 0 });
    store.sweep(2_000);
    expect(store.ids()).toEqual(["u1"]);
  });
});

describe("retention: hard delete on notice follows the derivation", () => {
  it("removes the upload and every artifact derived from it, transitively", () => {
    const store = new EphemeralStore();
    store.put({ id: "upload", kind: "upload", value: 1, nowMs: 0 });
    store.put({ id: "prompt", kind: "prompt", value: 1, nowMs: 0, derivedFrom: "upload" });
    store.put({ id: "recreation", kind: "recreation", value: 1, nowMs: 0, derivedFrom: "prompt" });
    store.put({ id: "figure", kind: "figure", value: 1, nowMs: 0, derivedFrom: "recreation" });
    store.put({ id: "export", kind: "export", value: 1, nowMs: 0, derivedFrom: "figure" });
    store.put({ id: "unrelated", kind: "upload", value: 1, nowMs: 0 });

    const event = store.deleteOnNotice("upload", 5, "notice from the submitter");
    expect(event.deletedIds).toEqual(["export", "figure", "prompt", "recreation", "upload"]);
    // Partial compliance is worse than none: the record must not show that we were told, acted, and
    // the derived material stayed.
    expect(store.ids()).toEqual(["unrelated"]);
    expect(store.deletionLog()).toHaveLength(1);
    expect(store.deletionLog()[0]?.reason).toContain("notice");
  });
});

describe("substantiation", () => {
  const buildLog = async (): Promise<SubstantiationLog> => {
    const runtime = deterministicRuntime();
    const log = new SubstantiationLog();
    const make = (behaviour: "produce" | "safety_refusal" | "capability_gap", modality: "text" | "image") =>
      new ReproductionPipeline({
        registry: new ProviderRegistry().register(new MockProvider({ modality, behaviour })),
        faceDetector: new NoFacesDetector(),
        runtime,
        log,
      });
    const t = textInput();
    const i = imageInput();
    await make("produce", "text").run({ input: t, consent: consentFor(t.artifact.artifactId, runtime.clock.now()) });
    await make("produce", "image").run({ input: i, consent: consentFor(i.artifact.artifactId, runtime.clock.now()) });
    await make("safety_refusal", "image").run({
      input: i,
      consent: consentFor(i.artifact.artifactId, runtime.clock.now()),
    });
    await make("capability_gap", "text").run({
      input: t,
      consent: consentFor(t.artifact.artifactId, runtime.clock.now()),
    });
    return log;
  };

  it("logs every attempt with everything the record needs, whatever the outcome", async () => {
    const log = await buildLog();
    expect(log.entries()).toHaveLength(4);
    for (const e of log.entries()) {
      expect(e.providerId).toBeTruthy();
      expect(e.model).toBeTruthy();
      expect(e.startedAt).toMatch(/^\d{4}-/);
      expect(e.finishedAt).toMatch(/^\d{4}-/);
      expect(e.elapsedMs).toBeGreaterThanOrEqual(0);
      expect(e.costUsd).toBeGreaterThanOrEqual(0);
      expect(e.consentId).toBeTruthy();
      expect(e.faceDetectorId).toBeTruthy();
      expect(e.artifactSha256).toHaveLength(64);
      expect(e.artifactByteLength).toBeGreaterThan(0);
      // The prompt WE wrote is on the record. There is no hidden prompt.
      if (e.outcome === "produced") expect(e.prompt.length).toBeGreaterThan(20);
    }
  });

  it("computes the aggregate rather than stating it", async () => {
    const log = await buildLog();
    const a = log.aggregate();
    expect(a.n).toBe(4);
    expect(a.byOutcome.produced).toBe(2);
    expect(a.byOutcome.refused).toBe(1);
    expect(a.byOutcome.error).toBe(1);
    expect(a.successRate).toBeCloseTo(0.5);
    expect(a.refusalRate).toBeCloseTo(0.25);
    expect(a.medianElapsedMs).not.toBeNull();
    expect(a.medianCostUsd).not.toBeNull();
    expect(a.totalCostUsd).toBeGreaterThan(0);
    // The face detector in this harness is not production grade, and the aggregate says so rather
    // than letting a published figure rest on it silently.
    expect(a.anyNonProductionFaceCheck).toBe(true);
  });

  it("filters by modality and by whether a vendor's terms allow a published comparison", async () => {
    const log = await buildLog();
    expect(log.aggregate({ modality: "text" }).n).toBe(2);
    log.record({
      requestId: "req_x",
      attempt: {
        attemptId: "att_x",
        providerId: "v0-site",
        model: "v0-latest",
        modality: "website-from-screenshot",
        prompt: "p",
        parameters: {},
        startedAt: "2026-08-23T00:00:00.000Z",
        finishedAt: "2026-08-23T00:00:01.000Z",
        elapsedMs: 1_000,
        costUsd: 0.5,
        outcome: "produced",
      },
      artifactSha256: "0".repeat(64),
      artifactMediaType: "image/png",
      artifactByteLength: 10,
      consentId: "cns_x",
      faceDetectorId: "d",
      faceDetectorProductionGrade: true,
      publishableInComparisons: false,
    });
    expect(log.aggregate().n).toBe(5);
    const publishable = log.aggregate({ publishableOnly: true });
    expect(publishable.n).toBe(4);
    expect(publishable.excludedUnpublishable).toBe(1);
  });

  it("returns null rather than zero when there is nothing to average", () => {
    const empty = new SubstantiationLog().aggregate();
    expect(empty.n).toBe(0);
    expect(empty.medianElapsedMs).toBeNull();
    expect(empty.successRate).toBeNull();
    expect(formatAggregate(empty)).toContain("no attempts recorded");
    expect(median([])).toBeNull();
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it("prints a denominator on every ratio it renders", async () => {
    const text = formatAggregate((await buildLog()).aggregate());
    expect(text).toContain("of 4");
    expect(text).toContain("median elapsed");
    expect(text).toContain("median cost");
    // No accuracy language, and nothing that reads as a performance boast.
    expect(text.toLowerCase()).not.toContain("accura");
  });
});
