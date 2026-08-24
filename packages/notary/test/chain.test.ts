/**
 * The chain, and the three ways a Merkle implementation is usually wrong.
 *
 *  1. NO DOMAIN SEPARATION, so an internal node can be presented as a leaf and the tree proves
 *     whatever the attacker wanted. Tested directly: a leaf hash and a node hash over the same
 *     bytes must differ.
 *  2. DUPLICATING THE LAST NODE on an odd level, which is CVE-2012-2459 - two different trees with
 *     one root. Tested by constructing the collision the duplicating version would produce.
 *  3. VERIFYING THE STORED HASH INSTEAD OF THE DATA, which verifies that hashing is deterministic
 *     and nothing else. `checkChain` recomputes every leaf from the event fields, so an edited row
 *     is caught; the test edits one.
 */

import { describe, expect, it } from "vitest";
import type { NotaryEventRow } from "@slop/db";
import {
  checkChain,
  inclusionProof,
  leafHash,
  leafOf,
  merkleRoot,
  nodeHash,
  verifyInclusion,
} from "@slop/notary";

const digest = (n: number): string => String(n).padStart(2, "0").repeat(32);

/** Build a well-formed chain of `n` events, the way the service would. */
function chainOf(n: number, recordedAt = "2026-08-24T12:00:00.000Z"): NotaryEventRow[] {
  const rows: NotaryEventRow[] = [];
  let prev: string | null = null;
  for (let i = 0; i < n; i += 1) {
    const declaredAt = new Date(Date.UTC(2026, 7, 24, 10, i)).toISOString();
    const leafSha256 = leafOf({
      sequence: i,
      kind: "draft",
      contentSha256: digest(i),
      byteLength: 100 + i,
      declaredAt,
      recordedAt,
      prevSha256: prev,
    });
    rows.push({
      eventId: `evt${i}`,
      chainId: "chn1",
      sequence: i,
      kind: "draft",
      contentSha256: digest(i),
      byteLength: 100 + i,
      declaredAt,
      recordedAt,
      leafSha256,
      prevSha256: prev,
      metadata: {},
    });
    prev = leafSha256;
  }
  return rows;
}

describe("domain separation", () => {
  it("a leaf and an internal node over the same bytes are different hashes", () => {
    const a = "aa".repeat(32);
    const b = "bb".repeat(32);
    const asNode = nodeHash(a, b);
    const asLeaf = leafHash(Buffer.concat([Buffer.from(a, "hex"), Buffer.from(b, "hex")]));
    expect(asNode).not.toBe(asLeaf);
  });
});

describe("merkleRoot", () => {
  it("has no root over nothing, rather than the hash of nothing", () => {
    // A credential over an empty history must not be constructible.
    expect(merkleRoot([])).toBeNull();
  });

  it("is the leaf itself at size one", () => {
    expect(merkleRoot(["ab".repeat(32)])).toBe("ab".repeat(32));
  });

  it("promotes an odd node instead of duplicating it", () => {
    const [a, b, c] = [digest(1), digest(2), digest(3)];
    // The duplicating implementation would compute node(node(a,b), node(c,c)).
    const duplicating = nodeHash(nodeHash(a, b), nodeHash(c, c));
    const promoting = nodeHash(nodeHash(a, b), c);
    expect(merkleRoot([a, b, c])).toBe(promoting);
    expect(merkleRoot([a, b, c])).not.toBe(duplicating);
    // And the collision the duplicating version admits does not exist here: a four-leaf tree whose
    // last two leaves are equal must not share a root with the three-leaf tree.
    expect(merkleRoot([a, b, c, c])).not.toBe(merkleRoot([a, b, c]));
  });

  it("changes when any leaf changes, at every position", () => {
    const leaves = [digest(1), digest(2), digest(3), digest(4), digest(5)];
    const base = merkleRoot(leaves);
    for (let i = 0; i < leaves.length; i += 1) {
      const mutated = [...leaves];
      mutated[i] = digest(9);
      expect(merkleRoot(mutated), `changing leaf ${i} did not move the root`).not.toBe(base);
    }
  });
});

describe("inclusion proofs", () => {
  for (const size of [1, 2, 3, 5, 8, 13]) {
    it(`every leaf of a ${size}-leaf tree proves inclusion`, () => {
      const leaves = Array.from({ length: size }, (_, i) => digest(i));
      const root = merkleRoot(leaves) as string;
      for (let i = 0; i < size; i += 1) {
        expect(verifyInclusion(leaves[i] as string, inclusionProof(leaves, i), root)).toBe(true);
      }
    });
  }

  it("refuses a proof for a leaf that is not in the tree", () => {
    const leaves = [digest(1), digest(2), digest(3)];
    const root = merkleRoot(leaves) as string;
    expect(verifyInclusion(digest(9), inclusionProof(leaves, 0), root)).toBe(false);
  });

  it("refuses a proof whose path has been altered", () => {
    const leaves = Array.from({ length: 6 }, (_, i) => digest(i));
    const root = merkleRoot(leaves) as string;
    const proof = inclusionProof(leaves, 4);
    const tampered = { ...proof, path: proof.path.map((s, i) => (i === 0 ? { ...s, hash: digest(9) } : s)) };
    expect(verifyInclusion(leaves[4] as string, tampered, root)).toBe(false);
  });

  it("lets one step be disclosed without the others", () => {
    // The selective-disclosure property: a holder shows leaf 2 and the path, and the verifier
    // learns nothing about the content of leaves 0, 1, 3 or 4.
    const leaves = Array.from({ length: 5 }, (_, i) => digest(i));
    const proof = inclusionProof(leaves, 2);
    expect(proof.path.length).toBeLessThan(leaves.length);
    expect(verifyInclusion(leaves[2] as string, proof, merkleRoot(leaves) as string)).toBe(true);
  });
});

describe("checkChain", () => {
  it("re-derives an intact chain", () => {
    const events = chainOf(6);
    const check = checkChain(events);
    expect(check.intact).toBe(true);
    expect(check.defects).toEqual([]);
    expect(check.root).toBe(merkleRoot(events.map((e) => e.leafSha256)));
  });

  it("catches an edited field even though the stored leaf still matches itself", () => {
    // The whole point of recomputing. Editing `byteLength` and leaving `leafSha256` alone is what an
    // after-the-fact edit looks like in a database.
    const events = chainOf(4);
    const tampered = events.map((e, i) => (i === 2 ? { ...e, byteLength: 999_999 } : e));
    const check = checkChain(tampered);
    expect(check.intact).toBe(false);
    expect(check.defects.some((d) => d.kind === "leaf_mismatch" && d.at === 2)).toBe(true);
  });

  it("catches a removed step", () => {
    const events = chainOf(5);
    const check = checkChain(events.filter((e) => e.sequence !== 2));
    expect(check.intact).toBe(false);
    expect(check.defects.some((d) => d.kind === "sequence_gap" || d.kind === "broken_link")).toBe(true);
  });

  it("catches a re-parented step", () => {
    const events = chainOf(4);
    const forked = events.map((e, i) => (i === 3 ? { ...e, prevSha256: (events[1] as NotaryEventRow).leafSha256 } : e));
    expect(checkChain(forked).defects.some((d) => d.kind === "broken_link")).toBe(true);
  });

  it("reports a backwards declared time as a defect rather than rejecting the chain", () => {
    // Clock skew and late-syncing offline editors are real. The honest handling is to say so on the
    // credential, not to refuse the record or to hide the reversal.
    const events = chainOf(3);
    const skewed = events.map((e, i) => (i === 1 ? { ...e, declaredAt: "2026-01-01T00:00:00.000Z" } : e));
    const check = checkChain(skewed);
    expect(check.defects.some((d) => d.kind === "time_reversal")).toBe(true);
    // The leaf commits to declaredAt, so this also shows up as a leaf mismatch. Both are reported.
    expect(check.root).not.toBeNull();
  });

  it("notices when the stored root is not the one the events produce", () => {
    const events = chainOf(3);
    const check = checkChain(events, "ff".repeat(32));
    expect(check.defects.some((d) => d.kind === "root_mismatch")).toBe(true);
  });
});
