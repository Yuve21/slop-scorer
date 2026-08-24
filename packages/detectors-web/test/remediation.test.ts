import { describe, expect, it } from "vitest";
import { analyzeArtifact, neutralArtifact, WEB_RULES } from "@slop/detectors-web";
import type { ProbeId, WebArtifact } from "@slop/detectors-web";
import { applicabilityOf } from "@slop/core";
import { expectRemediationsAreHonest, zeroed } from "../../core/test/meta.js";

const corpus = {
  name: "web corpus",
  rules: WEB_RULES,
  neutral: () => neutralArtifact(),
  probeIds: [] as readonly ProbeId[],
  analyze: (artifact: WebArtifact, rules?: typeof WEB_RULES) =>
    analyzeArtifact(artifact, { kind: "url", url: "https://example.test/" }, rules ? { rules } : {}),
  zeroProbe: (artifact: WebArtifact, probe: ProbeId) => ({ ...artifact, probes: zeroed(artifact.probes, probe) }),
};

const proposalsFor = (id: string) => {
  const rule = WEB_RULES.find((r) => r.id === id);
  if (!rule) throw new Error(`${id} is gone from the corpus`);
  const artifact = rule.fixtures.positive(neutralArtifact()).artifact;
  return { rule, proposals: rule.remediate?.(rule.detect(artifact, { priorFindings: [] }), artifact) ?? [] };
};

describe("every web rule says what to change, and nothing else does", () => {
  it("the whole corpus proposes honestly", () => {
    expectRemediationsAreHonest(corpus);
  });

  it("no web rule proposes a file edit, because a rendered read does not know which file", () => {
    // The methodological line the whole modality lives on, asserted as a property of the
    // fixes rather than restated in prose. This detector renders a page; it never sees the
    // repository that produced it, so it is in no position to name a path.
    let seen = 0;
    for (const rule of WEB_RULES.filter((r) => r.polarity === "signal")) {
      const artifact = rule.fixtures.positive(neutralArtifact()).artifact;
      for (const p of rule.remediate?.(rule.detect(artifact, { priorFindings: [] }), artifact) ?? []) {
        seen += 1;
        expect(["ui_change", "manual"], `${rule.id} proposed a ${p.kind} from a rendered-page read`).toContain(p.kind);
      }
    }
    expect(seen, "no proposal was examined, so this proves nothing").toBeGreaterThan(0);
  });

  it("a ui_change only appears where the observation determines the replacement", () => {
    const canonical = proposalsFor("craft.no-canonical").proposals[0];
    expect(canonical?.kind).toBe("ui_change");
    if (canonical?.kind !== "ui_change") throw new Error("expected a ui change");
    expect(canonical.property).toBe("href");
    // The replacement is the URL this read resolved to, which is a fact we already hold
    // rather than a value invented for the patch.
    expect(canonical.after).toBe(neutralArtifact().finalUrl);
    expect(canonical.sourceHint.length).toBeGreaterThan(10);

    const arrow = proposalsFor("copy.arrow-cta").proposals[0];
    if (arrow?.kind !== "ui_change") throw new Error("expected a ui change");
    expect(arrow.before).toContain("→");
    expect(arrow.after).not.toContain("→");
    expect(arrow.after.length).toBeGreaterThan(0);

    const tracking = proposalsFor("css.crushed-tracking").proposals[0];
    if (tracking?.kind !== "ui_change") throw new Error("expected a ui change");
    expect(tracking.property).toBe("letter-spacing");
    expect(tracking.after).toBe("-0.02em");
  });

  it("the rules whose fix is a sentence, an image or a palette refuse to write one", () => {
    // The whole point of the line this corpus holds. A machine-written page title, meta
    // description or alt attribute would satisfy the checker and produce exactly the filler
    // this corpus exists to measure, so these four propose guidance and no value.
    for (const id of ["craft.scaffold-title", "craft.no-meta-description", "craft.missing-alt", "css.violet-blue-gradient"]) {
      const { proposals } = proposalsFor(id);
      expect(proposals.length, `${id} proposed nothing at all`).toBeGreaterThan(0);
      for (const p of proposals) expect(applicabilityOf(p), `${id} invented a value`).toBe("manual");
    }
  });

  it("no counter finding produced by the corpus carries a remediation", () => {
    let counters = 0;
    for (const rule of WEB_RULES.filter((r) => r.polarity === "counter")) {
      const artifact = rule.fixtures.positive(neutralArtifact()).artifact;
      for (const f of corpus.analyze(artifact, [rule]).findings) {
        counters += 1;
        expect(f.remediation, `${f.ruleId} is counter-evidence and carried a fix`).toBeUndefined();
      }
    }
    expect(counters, "no counter rule fired, so this assertion proved nothing").toBeGreaterThan(0);
  });
});
