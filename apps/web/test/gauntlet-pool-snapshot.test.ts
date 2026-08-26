import { describe, expect, it } from "vitest";

import { NEGATIVE_CORPUS } from "@slop/detectors-web";
import { poolRowsFromCorpus, presentRepo, presentWeb } from "@slop/gauntlet";
import { CODE_CORPUS } from "../../../packages/detectors-code/test/corpus/index.js";
import { WEB_GENERATED_CORPUS } from "../../../packages/detectors-web/test/corpus/index.js";
import POOL from "@/lib/gauntlet/pool.json";

/**
 * THE SNAPSHOT MUST NOT DRIFT FROM THE CORPUS.
 *
 * `apps/web/lib/gauntlet/pool.json` is committed, because a serverless runtime cannot read the
 * corpus JSON out of `packages/*&#47;test/corpus` at request time. The cost of committing it is
 * that it can go stale in silence: a corpus member added, a presenter changed, a redaction rule
 * tightened, and the site keeps serving last month's cards while every other gate stays green.
 *
 * So this rebuilds the pool from the same loaders `scripts/build-gauntlet-pool.mjs` uses and
 * compares. The comparison deliberately excludes the detector reports, which carry a
 * `generatedAt` from the clock and would make this a diff of the wall time; what is compared is
 * everything a round is actually built from — membership, labels, the stated basis for each
 * label, and the rendered card.
 *
 * When this fails, the fix is `node scripts/build-gauntlet-pool.mjs` and a commit, not an edit
 * to the expectation.
 */

const ADDED_AT = "2026-08-24T00:00:00.000Z";

const fresh = [
  ...poolRowsFromCorpus({ corpus: "code", cases: CODE_CORPUS, present: presentRepo, addedAt: ADDED_AT }).rows,
  ...poolRowsFromCorpus({
    corpus: "web",
    cases: [...NEGATIVE_CORPUS, ...WEB_GENERATED_CORPUS],
    present: presentWeb,
    addedAt: ADDED_AT,
  }).rows,
];

const snapshot = POOL as unknown as {
  readonly artifacts: readonly {
    readonly artifactId: string;
    readonly label: string;
    readonly source: string;
    readonly provenance: string;
    readonly presentation: unknown;
  }[];
};

describe("the committed gauntlet pool matches the corpus it was built from", () => {
  it("has the same membership", () => {
    expect(fresh.length).toBeGreaterThanOrEqual(15);
    expect(snapshot.artifacts.map((a) => a.artifactId).sort()).toEqual(fresh.map((r) => r.artifactId).sort());
  });

  it("has the same label, stated basis and card for every member", () => {
    const byId = new Map(snapshot.artifacts.map((a) => [a.artifactId, a]));
    for (const row of fresh) {
      const stored = byId.get(row.artifactId);
      expect(stored, `${row.artifactId} is not in the snapshot`).toBeDefined();
      expect(stored!.label, `${row.artifactId} label`).toBe(row.label);
      expect(stored!.source, `${row.artifactId} source`).toBe(row.source);
      expect(stored!.provenance, `${row.artifactId} provenance`).toBe(row.provenance);
      // The card, byte for byte. A presenter change or a tightened redaction lands here.
      expect(stored!.presentation, `${row.artifactId} card`).toEqual(row.presentation);
    }
  });

  it("would notice a stale card", () => {
    // Mutation of the check itself: the comparison above passes trivially if `presentation`
    // were undefined on both sides.
    const one = snapshot.artifacts[0]!;
    expect(one.presentation).toBeTruthy();
    expect(one.presentation).not.toEqual({ ...(one.presentation as object), summary: "changed" });
  });
});
