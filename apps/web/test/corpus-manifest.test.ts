import { describe, expect, it } from "vitest";

import { CODE_CONFIG, CODE_RULE_DESCRIPTORS } from "@slop/detectors-code";
import { CORPUS_VERSION, RULE_DESCRIPTORS } from "@slop/detectors-web";
import CORPUS from "@/lib/corpus.json";

/**
 * `lib/corpus.json` IS A COPY, SO IT NEEDS A GUARD.
 *
 * The web app used to import `@slop/detectors-code` to count its rules. That drags the repository
 * SCANNER into the bundle, and the scanner reads files off a path it computes at runtime, which
 * makes Turbopack trace the entire project — source tree and public folder — into the serverless
 * output of every route that touches it. The build says so out loud, and the fix is not to ship a
 * repository scanner to answer a web request.
 *
 * So the rule membership is generated into a small JSON file instead, and generated data that
 * nothing re-derives is data that goes stale. This re-derives it. When it fails, the fix is
 * `node scripts/build-gauntlet-pool.mjs` and a commit.
 */

const manifest = CORPUS as unknown as Record<string, { readonly corpusVersion: string; readonly ruleIds: readonly string[] }>;

describe("the generated corpus manifest matches the packages", () => {
  it("has the same rule ids, in the same order, for both corpora", () => {
    expect(manifest.code?.ruleIds).toEqual(CODE_RULE_DESCRIPTORS.map((r) => r.id));
    expect(manifest.web?.ruleIds).toEqual(RULE_DESCRIPTORS.map((r) => r.id));
    // The denominator: two empty arrays would satisfy the equality above.
    expect(CODE_RULE_DESCRIPTORS.length).toBeGreaterThan(5);
    expect(RULE_DESCRIPTORS.length).toBeGreaterThan(20);
  });

  it("has the same corpus versions", () => {
    expect(manifest.code?.corpusVersion).toBe(CODE_CONFIG.corpusVersion);
    expect(manifest.web?.corpusVersion).toBe(CORPUS_VERSION);
  });

  it("carries rule membership and nothing else", () => {
    // No artifact, no label, no provenance: this file is imported from routes that render
    // before anybody has answered anything.
    //
    // CHECKED ON THE SHAPE, NOT ON A SUBSTRING OF THE WHOLE FILE. The first version of this
    // asserted the serialised JSON did not contain "provenance", which the corpus falsified the
    // moment it was run: `provenance.disclosed` is a rule id, it is exactly the membership data
    // this file is supposed to carry, and the assertion could not tell a leak from the payload.
    // A guard whose pattern cannot express its own input fails on the honest case and would go
    // on passing if a `label` key were nested one level deeper than the string it looked for.
    const KEYS_ALLOWED = new Set(["corpusVersion", "ruleIds"]);
    const FORBIDDEN = ["label", "presentation", "artifact", "answer", "provenance"];
    // `note` is the generator's own provenance line about the FILE, which is the one string in
    // here that is allowed not to be a rule id.
    expect(Object.keys(manifest).sort()).toEqual(["code", "note", "web"]);
    expect(typeof (manifest as unknown as { note: string }).note).toBe("string");
    for (const [corpus, entry] of Object.entries(manifest)) {
      if (corpus === "note") continue;
      for (const key of Object.keys(entry)) {
        expect(KEYS_ALLOWED.has(key), `${corpus}.${key} is not rule membership`).toBe(true);
        expect(FORBIDDEN, `${corpus}.${key} names answer data`).not.toContain(key.toLowerCase());
      }
      // Rule ids are `family.name`, and nothing in this file may be an object with its own keys.
      for (const id of entry.ruleIds) expect(typeof id).toBe("string");
    }
    expect(JSON.stringify(manifest).length).toBeLessThan(8_000);
  });
});
