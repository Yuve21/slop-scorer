/**
 * The chain: a hash-linked sequence of recorded steps, and a Merkle root over them.
 *
 * WHY BOTH A LINK AND A TREE
 *
 * The link (`prevSha256` inside each leaf) is what makes the ORDER attestable: a step cannot be
 * inserted between two others after the fact without changing every leaf after it. The tree is what
 * makes a single 32-byte value stand for the whole history, which is what gets timestamped - and
 * what lets a holder prove ONE step was in the record without disclosing the others. That is the
 * selective-disclosure property `left-field-additions.md` A8 says the design needs: the Genshin
 * fan-art case is somebody taking a publicly streamed work-in-progress, running it through a
 * generator and publishing first. A process log is an attack surface. Commit privately, disclose
 * one leaf at a time.
 *
 * DOMAIN SEPARATION follows RFC 6962: a leaf is `sha256(0x00 || data)` and an internal node is
 * `sha256(0x01 || left || right)`. Without the prefixes, an attacker who controls a leaf's contents
 * can present an internal node as a leaf, and the tree proves whatever they wanted. This is a known
 * attack on naive Merkle implementations, not a theoretical one, and it costs one byte to close.
 *
 * ODD NODES ARE PROMOTED, not duplicated. Duplicating the last node is the CVE-2012-2459 shape from
 * Bitcoin, where two different trees produce the same root.
 */

import { createHash } from "node:crypto";
import type { EventKind, NotaryEventRow } from "@slop/db";

export const CHAIN_FORMAT_VERSION = 1 as const;

export const sha256Hex = (data: Uint8Array | string): string =>
  createHash("sha256").update(data).digest("hex");

const hex = (s: string): Buffer => Buffer.from(s, "hex");

/** `sha256(0x00 || data)`. */
export const leafHash = (data: Uint8Array): string =>
  createHash("sha256").update(Buffer.concat([Buffer.from([0x00]), Buffer.from(data)])).digest("hex");

/** `sha256(0x01 || left || right)`. */
export const nodeHash = (left: string, right: string): string =>
  createHash("sha256").update(Buffer.concat([Buffer.from([0x01]), hex(left), hex(right)])).digest("hex");

/** What a caller hands in. Times are DECLARED by the client and labelled as such everywhere. */
export interface ProcessEvent {
  readonly kind: EventKind;
  readonly contentSha256: string;
  readonly byteLength: number;
  readonly declaredAt: string;
  readonly metadata?: Readonly<Record<string, string | number | boolean>>;
}

/**
 * The bytes a leaf commits to.
 *
 * Canonical and explicit: field order is fixed here rather than inherited from `JSON.stringify`,
 * whose key order depends on how the object was constructed. A verifier written by somebody else
 * has to be able to recompute this from the row, so the encoding is a documented string rather than
 * a serialisation of our types.
 *
 * `recordedAt` is included and `declaredAt` is included: the first is our observation, the second
 * is the client's claim, and a leaf that committed only to the client's number would let a caller
 * backdate their own history for free.
 */
export function leafPreimage(input: {
  readonly sequence: number;
  readonly kind: string;
  readonly contentSha256: string;
  readonly byteLength: number;
  readonly declaredAt: string;
  readonly recordedAt: string;
  readonly prevSha256: string | null;
}): string {
  return [
    `slop-notary/v${CHAIN_FORMAT_VERSION}`,
    input.sequence,
    input.kind,
    input.contentSha256,
    input.byteLength,
    input.declaredAt,
    input.recordedAt,
    input.prevSha256 ?? "-",
  ].join("\n");
}

export const leafOf = (input: Parameters<typeof leafPreimage>[0]): string =>
  leafHash(Buffer.from(leafPreimage(input), "utf8"));

/**
 * The root over a list of leaves.
 *
 * An empty chain has no root, and this returns null rather than the hash of nothing: a credential
 * over an empty history would be a credential over nothing, and it must not be constructible.
 */
export function merkleRoot(leaves: readonly string[]): string | null {
  if (leaves.length === 0) return null;
  let level = [...leaves];
  while (level.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i] as string;
      const right = level[i + 1];
      // Promote an odd node rather than pairing it with itself.
      next.push(right === undefined ? left : nodeHash(left, right));
    }
    level = next;
  }
  return level[0] as string;
}

export interface InclusionProof {
  readonly index: number;
  readonly treeSize: number;
  readonly path: readonly { readonly side: "left" | "right"; readonly hash: string }[];
}

export function inclusionProof(leaves: readonly string[], index: number): InclusionProof {
  if (index < 0 || index >= leaves.length) throw new RangeError(`leaf ${index} is not in a tree of ${leaves.length}`);
  const path: { side: "left" | "right"; hash: string }[] = [];
  let level = [...leaves];
  let i = index;
  while (level.length > 1) {
    const isRight = i % 2 === 1;
    const siblingIndex = isRight ? i - 1 : i + 1;
    const sibling = level[siblingIndex];
    if (sibling !== undefined) path.push({ side: isRight ? "left" : "right", hash: sibling });
    const next: string[] = [];
    for (let j = 0; j < level.length; j += 2) {
      const left = level[j] as string;
      const right = level[j + 1];
      next.push(right === undefined ? left : nodeHash(left, right));
    }
    level = next;
    i = Math.floor(i / 2);
  }
  return { index, treeSize: leaves.length, path };
}

export function verifyInclusion(leaf: string, proof: InclusionProof, root: string): boolean {
  let computed = leaf;
  for (const step of proof.path) {
    computed = step.side === "left" ? nodeHash(step.hash, computed) : nodeHash(computed, step.hash);
  }
  return computed === root;
}

export type ChainDefect =
  | { readonly kind: "sequence_gap"; readonly at: number; readonly detail: string }
  | { readonly kind: "broken_link"; readonly at: number; readonly detail: string }
  | { readonly kind: "leaf_mismatch"; readonly at: number; readonly detail: string }
  | { readonly kind: "time_reversal"; readonly at: number; readonly detail: string }
  | { readonly kind: "root_mismatch"; readonly at: number; readonly detail: string };

export interface ChainCheck {
  readonly intact: boolean;
  readonly root: string | null;
  readonly eventCount: number;
  readonly defects: readonly ChainDefect[];
}

/**
 * Re-derive everything from the rows and compare.
 *
 * Nothing here trusts a stored `leafSha256` or a stored `rootSha256`: both are recomputed from the
 * event fields, which is the only version of this check that catches an edited row. A verifier that
 * reads the stored leaf and hashes it again verifies that hashing is deterministic.
 *
 * A time reversal is a DEFECT, not an error: a client's declared timestamps going backwards is a
 * real thing that happens (clock skew, an offline editor syncing late) and the honest handling is
 * to report it on the credential rather than to reject the chain or to hide it.
 */
export function checkChain(events: readonly NotaryEventRow[], expectedRoot?: string | null): ChainCheck {
  const defects: ChainDefect[] = [];
  const ordered = [...events].sort((a, b) => a.sequence - b.sequence);
  let prev: string | null = null;
  let lastDeclared: string | null = null;
  const leaves: string[] = [];

  ordered.forEach((e, i) => {
    if (e.sequence !== i) {
      defects.push({ kind: "sequence_gap", at: i, detail: `expected sequence ${i}, found ${e.sequence}` });
    }
    if ((e.prevSha256 ?? null) !== prev) {
      defects.push({
        kind: "broken_link",
        at: e.sequence,
        detail: `prev is ${e.prevSha256 ?? "null"}, the previous leaf is ${prev ?? "null"}`,
      });
    }
    const recomputed = leafOf({
      sequence: e.sequence,
      kind: e.kind,
      contentSha256: e.contentSha256,
      byteLength: e.byteLength,
      declaredAt: e.declaredAt,
      recordedAt: e.recordedAt,
      prevSha256: e.prevSha256 ?? null,
    });
    if (recomputed !== e.leafSha256) {
      defects.push({
        kind: "leaf_mismatch",
        at: e.sequence,
        detail: `the stored leaf does not match the event fields, so a field was edited after recording`,
      });
    }
    if (lastDeclared !== null && e.declaredAt < lastDeclared) {
      defects.push({
        kind: "time_reversal",
        at: e.sequence,
        detail: `declared ${e.declaredAt} is earlier than the previous step's ${lastDeclared}`,
      });
    }
    lastDeclared = e.declaredAt;
    prev = recomputed;
    leaves.push(recomputed);
  });

  const root = merkleRoot(leaves);
  if (expectedRoot !== undefined && expectedRoot !== null && root !== expectedRoot) {
    defects.push({
      kind: "root_mismatch",
      at: ordered.length,
      detail: `the recomputed root is ${root ?? "null"}, the record says ${expectedRoot}`,
    });
  }

  return { intact: defects.length === 0, root, eventCount: ordered.length, defects };
}
