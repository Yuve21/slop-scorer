/**
 * Bounded decompression for container metadata, and the reason it is its own module.
 *
 * THE UNIFYING DEFECT THIS REPAIRS. A parser that cannot read a region, does not say so to
 * anybody who is listening, and then reports full coverage over that region is a guarantee
 * that reports success without doing its job. That is the disqualifying class at the top of
 * `docs/agents/HOUSE-KNOWLEDGE.md`, and coverage 1.0 over bytes nobody read is its purest
 * form. `zTXt` was the instance: two PNGs carrying byte-identical AUTOMATIC1111 parameter
 * strings scored differently and BOTH reported coverage 1.0 (LEARNINGS L-16).
 *
 * Reading compressed metadata means running a decompressor over bytes a stranger chose, so
 * the two rules from HOUSE-KNOWLEDGE's untrusted-input section apply without exception:
 *
 *  1. EVERY DECOMPRESSION IS BOUNDED BEFORE IT RUNS. `maxOutputLength` is passed to zlib, so
 *     the bound is enforced by the decompressor as it works rather than by a length check
 *     after the fact. A size check that runs AFTER inflation is not a check: the allocation
 *     it was meant to prevent has already happened. A 1 KB deflate stream expands to about a
 *     gigabyte at zlib's ratio, which is why the argument is not "nobody would do that".
 *  2. EVERY LENGTH IS UNTRUSTED. Nothing here derives a buffer size from a number in the
 *     file. L-01 is the scar: a missing `>>> 0` let a chunk length decode negative and hung
 *     the scanner forever on a 20-byte PNG.
 *
 * The failure mode is a RESULT, never a throw and never an empty string. A caller has to
 * decide what to tell the reader, and the difference between "there was nothing there" and
 * "there was something there and we could not read it" is the whole point of this repair.
 */

import { inflateSync } from "node:zlib";

/**
 * The ceiling on any single decompressed metadata payload, in bytes.
 *
 * One megabyte is far above anything legitimate: the largest real payload in this class is a
 * ComfyUI workflow graph, which runs to tens of kilobytes, and an A1111 parameter string is a
 * few hundred bytes. It is far below anything that threatens a scan: the process budget is
 * 256 MB and a scan already has a byte budget of its own. A payload that needs more than this
 * is reported as unreadable, which is an honest outcome, rather than being read at any cost.
 */
export const MAX_METADATA_INFLATE_BYTES = 1_048_576;

export type Inflated = { readonly ok: true; readonly bytes: Uint8Array } | { readonly ok: false; readonly reason: string };

/**
 * Inflate a zlib (RFC 1950) stream with a hard output bound.
 *
 * Used for PNG `zTXt` and compressed `iTXt` (PNG specification, compression method 0 is
 * zlib/deflate) and for ID3v2 compressed frames (ID3v2.3 and 2.4 both specify zlib).
 */
export function inflateBounded(bytes: Uint8Array, max: number = MAX_METADATA_INFLATE_BYTES): Inflated {
  if (bytes.length === 0) return { ok: false, reason: "the compressed payload is empty" };
  try {
    const out = inflateSync(bytes, { maxOutputLength: max });
    return { ok: true, bytes: new Uint8Array(out.buffer, out.byteOffset, out.byteLength) };
  } catch (err) {
    // zlib reports the bound as ERR_BUFFER_TOO_LARGE. Name it separately from corruption,
    // because "this expanded past the ceiling" and "these bytes are not a deflate stream" are
    // different facts about the file and a reader is entitled to know which one we hit.
    const code = (err as { code?: string } | null)?.code;
    if (code === "ERR_BUFFER_TOO_LARGE") {
      return { ok: false, reason: `it expanded past the ${max}-byte ceiling this parser allows` };
    }
    return { ok: false, reason: `it is not a readable deflate stream (${err instanceof Error ? err.message : String(err)})` };
  }
}
