import { describe, expect, it } from "vitest";

import { CODE_RULE_DESCRIPTORS } from "@slop/detectors-code";
import { RULE_DESCRIPTORS } from "@slop/detectors-web";
import { listRules } from "slop-scorer-mcp";

/**
 * `list_rules` IS PRICED, AND THE PRICE IS A FEATURE OF IT.
 *
 * The server's instructions ask an agent to call this BEFORE generating code. The full listing
 * measured 63,110 characters, about 15,800 tokens at the usual four-characters-per-token
 * estimate — a fifth of a small context window, spent speculatively. No agent pays that, so the
 * tool that is the point of the product was the one tool nobody would call.
 *
 * These tests hold both halves of the fix:
 *
 *  - THE COMPACT FORM IS ACTUALLY CHEAP, with a budget that fails if it creeps back up.
 *  - NOTHING WAS LOST. Every rule is still listed, and every field the old payload carried is
 *    still reachable through `verbose` or `ruleIds`. That is asserted field by field against
 *    the corpus descriptors rather than against a snapshot, so a new field on a rule that never
 *    reaches the verbose payload fails here.
 *
 * The token figure is an estimate and is labelled as one everywhere it appears. A real BPE
 * count would not change any decision this file encodes.
 */

const tokens = (value: unknown): number => Math.round(JSON.stringify(value, null, 2).length / 4);

const ALL = [...RULE_DESCRIPTORS, ...CODE_RULE_DESCRIPTORS];

describe("the default listing is cheap enough to call speculatively", () => {
  it("costs several times less than the full one", () => {
    const compact = tokens(listRules());
    const verbose = tokens(listRules({ verbose: true }));

    // The denominator, so neither figure is being measured over an empty object.
    expect(listRules().index.length).toBe(ALL.length);
    expect(verbose).toBeGreaterThan(10_000);

    // The budget. 3,200 is above today's measurement and below the point at which an agent
    // starts weighing whether to call it at all. If this fails, something moved back into the
    // default payload that belongs behind `verbose`.
    expect(compact, `the compact listing is ~${compact} tokens`).toBeLessThan(3_200);
    expect(verbose / compact).toBeGreaterThan(4);
  });

  it("indexes every rule on one line, in the format it publishes", () => {
    const listing = listRules();
    expect(listing.indexFormat).toBe("id | family | polarity/severity | weight | one-line rationale");
    const byId = new Map(ALL.map((r) => [r.id, r]));
    for (const line of listing.index) {
      expect(line).not.toContain("\n");
      const parts = line.split(" | ");
      expect(parts).toHaveLength(5);
      const rule = byId.get(parts[0] as string);
      expect(rule, `${parts[0]} is not a rule`).toBeDefined();
      expect(parts[1]).toBe(rule!.family);
      expect(parts[2]).toBe(`${rule!.polarity}/${rule!.severity}`);
      expect(Number(parts[3])).toBe(rule!.baseWeight);
      expect(parts[4]).toBe(rule!.title);
    }
  });

  it("tells the caller how to get what it left out", () => {
    // An agent that reads only the compact form still has to know the rest exists, or the
    // information is not retrievable, it is just gone.
    const listing = listRules();
    expect(listing.retrieval).toContain("ruleIds");
    expect(listing.retrieval).toContain("verbose");
    expect(listRules({ verbose: true }).retrieval).toBe(listing.retrieval);
    // And the membership list is on every response, so no rule is ever invisible.
    expect(listing.index.length).toBe(ALL.length);
    expect(listRules({ verbose: true }).index.length).toBe(ALL.length);
  });

  it("omits the rebuttal and the prevention note, which is the whole saving", () => {
    const json = JSON.stringify(listRules());
    expect(json).not.toContain("counterEvidenceThatWouldRebutIt");
    expect(json).not.toContain("whyItReadsAsGenerated");
    expect(listRules().fullEntries).toEqual([]);
    for (const rule of ALL) {
      expect(json, `${rule.id} still ships its explanation`).not.toContain(rule.explanation);
      expect(json, `${rule.id} still ships its rebuttal`).not.toContain(rule.falsePositiveNote);
    }
  });
});

describe("nothing was lost, it moved", () => {
  it("verbose:true carries every field of every rule in the corpus", () => {
    const byId = new Map(listRules({ verbose: true }).fullEntries.map((r) => [r.id, r]));
    expect(byId.size).toBe(ALL.length);
    for (const rule of ALL) {
      const full = byId.get(rule.id);
      expect(full, `${rule.id} is missing from the verbose listing`).toBeDefined();
      if (full === undefined) continue;
      expect(full.rationale).toBe(rule.title);
      expect(full.family).toBe(rule.family);
      expect(full.severity).toBe(rule.severity);
      expect(full.baseWeight).toBe(rule.baseWeight);
      expect(full.polarity).toBe(rule.polarity);
      expect(full.since).toBe(rule.since);
      expect(full.whyItReadsAsGenerated).toBe(rule.explanation);
      expect(full.counterEvidenceThatWouldRebutIt).toBe(rule.falsePositiveNote);
      if (rule.prevention) expect(full.prevention).toBe(rule.prevention);
    }
  });

  it("verbose:true carries the family caveats the compact form drops", () => {
    const verbose = listRules({ verbose: true });
    const compact = listRules();
    expect(verbose.scoring.families.length).toBe(compact.scoring.families.length);
    expect(verbose.scoring.families.every((f) => (f.caveat ?? "").length > 0)).toBe(true);
    expect(compact.scoring.families.every((f) => f.caveat === undefined)).toBe(true);
    // The note is on both forms: it is what stops a family cap being read as a ranking.
    expect(compact.scoring.note).toBe(verbose.scoring.note);
    // No ceiling on either form. There is no published number for one to bound.
    expect(compact.scoring).not.toHaveProperty("ceiling");
    expect(verbose.scoring).not.toHaveProperty("ceiling");
  });

  it("ruleIds returns full entries for the named rules and indexes all the rest", () => {
    const named = [ALL[0]!.id, ALL[ALL.length - 1]!.id];
    const listing = listRules({ ruleIds: named });
    // Every rule is still listed; only the named ones cost their full entry.
    expect(listing.index.length).toBe(ALL.length);
    expect(listing.fullEntries.map((r) => r.id).sort()).toEqual([...named].sort());
    for (const entry of listing.fullEntries) {
      expect(entry.counterEvidenceThatWouldRebutIt.length).toBeGreaterThan(0);
    }

    // And it is still cheap: this is the shape an agent uses after a scan, with the handful of
    // ids that actually fired.
    expect(tokens(listing)).toBeLessThan(3_500);
  });

  it("still filters by modality and family, on both shapes", () => {
    expect(listRules({ modality: "web", verbose: true }).fullEntries.every((r) => r.modality === "web")).toBe(true);
    expect(listRules({ modality: "code" }).index.length).toBe(CODE_RULE_DESCRIPTORS.length);
    const family = ALL[0]!.family;
    const filtered = listRules({ family, verbose: true });
    expect(filtered.fullEntries.length).toBeGreaterThan(0);
    expect(filtered.fullEntries.every((r) => r.family === family)).toBe(true);
    expect(filtered.index.length).toBe(filtered.fullEntries.length);
  });
});
