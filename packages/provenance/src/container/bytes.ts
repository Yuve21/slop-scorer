/**
 * Byte-reading primitives for the container parsers.
 *
 * Everything in this directory reads real file bytes. That is a deliberate cost: a
 * media detector whose "container fingerprint" comes from a hand-written object is a
 * fixture-shaped shell that can never be wrong, and the whole point of the provenance line
 * is that a reader can open the file at the offset we cite and see the same value.
 *
 * So every observation carries a BYTE OFFSET. `container.ts:offset 0x0014` is a locator a
 * stranger can follow with a hex editor and no trust in us at all, which is the standard
 * `@slop/core`'s Evidence type is asking for.
 */

/** A bounded cursor. Every read is range-checked; a truncated file must not read garbage. */
export class Reader {
  #pos = 0;

  constructor(
    readonly bytes: Uint8Array,
    start = 0,
  ) {
    this.#pos = start;
  }

  get pos(): number {
    return this.#pos;
  }

  get remaining(): number {
    return this.bytes.length - this.#pos;
  }

  seek(pos: number): void {
    this.#pos = pos;
  }

  skip(n: number): void {
    this.#pos += n;
  }

  /** True when `n` more bytes can be read without running off the end. */
  has(n: number): boolean {
    return this.#pos + n <= this.bytes.length;
  }

  u8(): number {
    if (!this.has(1)) throw new TruncatedError(this.#pos, 1, this.bytes.length);
    return this.bytes[this.#pos++]!;
  }

  u16be(): number {
    const hi = this.u8();
    return (hi << 8) | this.u8();
  }

  u32be(): number {
    // `>>> 0` because a 32-bit box size with the top bit set is a length, not a negative.
    return ((this.u16be() << 16) | this.u16be()) >>> 0;
  }

  u16le(): number {
    const lo = this.u8();
    return lo | (this.u8() << 8);
  }

  u32le(): number {
    const lo = this.u16le();
    return (lo | (this.u16le() << 16)) >>> 0;
  }

  take(n: number): Uint8Array {
    if (!this.has(n)) throw new TruncatedError(this.#pos, n, this.bytes.length);
    const out = this.bytes.subarray(this.#pos, this.#pos + n);
    this.#pos += n;
    return out;
  }

  /** Fixed-length ASCII, used for four-character codes and chunk names. */
  ascii(n: number): string {
    return latin1(this.take(n));
  }
}

export class TruncatedError extends Error {
  constructor(
    readonly at: number,
    readonly wanted: number,
    readonly length: number,
  ) {
    super(`truncated at byte ${at}: wanted ${wanted} more byte(s) from a ${length}-byte buffer`);
    this.name = "TruncatedError";
  }
}

/** Latin-1 decode. Deliberate: container tag values are byte strings, not UTF-8 text. */
export function latin1(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) out += String.fromCharCode(b);
  return out;
}

/** UTF-8 decode with replacement, for text chunks that genuinely are UTF-8 (iTXt, XMP). */
export function utf8(bytes: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

export const startsWith = (bytes: Uint8Array, prefix: readonly number[]): boolean =>
  prefix.every((b, i) => bytes[i] === b);

/** Hex offset in the form every locator in these packages uses. */
export const at = (offset: number): string => `0x${offset.toString(16).padStart(8, "0")}`;

/** Trim a value for display without losing the fact that it was trimmed. */
export function clip(value: string, max = 160): string {
  const flat = value.replace(/[\r\n\t]+/g, " ").trim();
  return flat.length <= max ? flat : `${flat.slice(0, max)}...(+${flat.length - max} bytes)`;
}

/** Find the first occurrence of an ASCII needle. Returns -1 when absent. */
export function indexOfAscii(bytes: Uint8Array, needle: string, from = 0): number {
  const n = needle.length;
  outer: for (let i = from; i + n <= bytes.length; i += 1) {
    for (let j = 0; j < n; j += 1) {
      if (bytes[i + j] !== needle.charCodeAt(j)) continue outer;
    }
    return i;
  }
  return -1;
}
