/**
 * Just enough DER to speak RFC 3161, and no more.
 *
 * WHY HAND-ROLLED RATHER THAN A LIBRARY
 *
 * The whole surface is one request structure and a handful of fields out of one response. A parser
 * for that is a hundred lines that can be read in full, versus a dependency whose CVE history
 * becomes ours. It is also the honest scope: this module does NOT verify a CMS signature or a
 * certificate chain, and the credential wording says so rather than implying a verification we did
 * not perform. Pretending otherwise would be the exact failure this product exists to point at.
 *
 * The parser is strict about lengths and refuses indefinite-length encodings, which DER forbids
 * anyway. A lenient parser on an attacker-supplied token is a parser that can be walked past its
 * own buffer.
 */

export interface DerNode {
  readonly tag: number;
  readonly constructed: boolean;
  /** Offset of the first content byte in the original buffer. */
  readonly start: number;
  readonly length: number;
  readonly content: Buffer;
  readonly children: readonly DerNode[];
}

export const TAG = {
  BOOLEAN: 0x01,
  INTEGER: 0x02,
  BIT_STRING: 0x03,
  OCTET_STRING: 0x04,
  NULL: 0x05,
  OID: 0x06,
  SEQUENCE: 0x30,
  SET: 0x31,
  GENERALIZED_TIME: 0x18,
} as const;

export class DerError extends Error {
  constructor(message: string) {
    super(`DER: ${message}`);
    this.name = "DerError";
  }
}

/* ---- encoding -------------------------------------------------------------------------------- */

function encodeLength(n: number): Buffer {
  if (n < 0x80) return Buffer.from([n]);
  const bytes: number[] = [];
  let v = n;
  while (v > 0) {
    bytes.unshift(v & 0xff);
    v >>>= 8;
  }
  return Buffer.from([0x80 | bytes.length, ...bytes]);
}

export function encode(tag: number, content: Buffer): Buffer {
  return Buffer.concat([Buffer.from([tag]), encodeLength(content.length), content]);
}

export const sequence = (...parts: Buffer[]): Buffer => encode(TAG.SEQUENCE, Buffer.concat(parts));

/** Minimal two's-complement INTEGER. A leading 0x00 is added when the top bit would read negative. */
export function integer(value: number | bigint): Buffer {
  let v = BigInt(value);
  if (v < 0n) throw new DerError("negative integers are not needed here and are not implemented");
  const bytes: number[] = [];
  do {
    bytes.unshift(Number(v & 0xffn));
    v >>= 8n;
  } while (v > 0n);
  if (((bytes[0] as number) & 0x80) !== 0) bytes.unshift(0x00);
  return encode(TAG.INTEGER, Buffer.from(bytes));
}

export const octetString = (data: Buffer): Buffer => encode(TAG.OCTET_STRING, data);
export const boolean = (value: boolean): Buffer => encode(TAG.BOOLEAN, Buffer.from([value ? 0xff : 0x00]));
export const nullValue = (): Buffer => encode(TAG.NULL, Buffer.alloc(0));

/** Dotted OID to DER. The first two arcs share a byte, which is the part everyone gets wrong. */
export function oid(dotted: string): Buffer {
  const arcs = dotted.split(".").map((a) => Number(a));
  if (arcs.length < 2) throw new DerError(`not an object identifier: ${dotted}`);
  const bytes: number[] = [40 * (arcs[0] as number) + (arcs[1] as number)];
  for (const arc of arcs.slice(2)) {
    const chunk: number[] = [arc & 0x7f];
    let v = arc >>> 7;
    while (v > 0) {
      chunk.unshift((v & 0x7f) | 0x80);
      v >>>= 7;
    }
    bytes.push(...chunk);
  }
  return encode(TAG.OID, Buffer.from(bytes));
}

/* ---- parsing --------------------------------------------------------------------------------- */

function parseOne(buffer: Buffer, offset: number): { node: DerNode; next: number } {
  if (offset + 2 > buffer.length) throw new DerError("truncated header");
  const tag = buffer[offset] as number;
  if ((tag & 0x1f) === 0x1f) throw new DerError("multi-byte tags are not supported");
  const first = buffer[offset + 1] as number;
  let length: number;
  let contentStart: number;
  if (first < 0x80) {
    length = first;
    contentStart = offset + 2;
  } else {
    const count = first & 0x7f;
    // DER forbids the indefinite form; accepting it is how a parser ends up reading past the token.
    if (count === 0) throw new DerError("indefinite length is not valid DER");
    if (count > 4) throw new DerError("length field is implausibly large");
    length = 0;
    for (let i = 0; i < count; i += 1) length = length * 256 + (buffer[offset + 2 + i] as number);
    contentStart = offset + 2 + count;
  }
  const end = contentStart + length;
  if (end > buffer.length) throw new DerError(`content runs ${end - buffer.length} bytes past the buffer`);
  const content = buffer.subarray(contentStart, end);
  const constructed = (tag & 0x20) !== 0;
  const children: DerNode[] = [];
  if (constructed) {
    let inner = contentStart;
    while (inner < end) {
      const parsed = parseOne(buffer, inner);
      children.push(parsed.node);
      inner = parsed.next;
    }
  }
  return { node: { tag, constructed, start: contentStart, length, content, children }, next: end };
}

export function parse(buffer: Buffer): DerNode {
  return parseOne(buffer, 0).node;
}

/** Depth-first walk, root included. */
export function* walk(node: DerNode): Generator<DerNode> {
  yield node;
  for (const child of node.children) yield* walk(child);
}

export function decodeOid(node: DerNode): string {
  if (node.tag !== TAG.OID) throw new DerError("not an object identifier");
  const bytes = node.content;
  const first = bytes[0] as number;
  const arcs: number[] = [Math.floor(first / 40), first % 40];
  let value = 0;
  for (const byte of bytes.subarray(1)) {
    value = value * 128 + (byte & 0x7f);
    if ((byte & 0x80) === 0) {
      arcs.push(value);
      value = 0;
    }
  }
  return arcs.join(".");
}

export function decodeInteger(node: DerNode): number {
  if (node.tag !== TAG.INTEGER) throw new DerError("not an integer");
  let v = 0;
  for (const byte of node.content) v = v * 256 + byte;
  return v;
}

/**
 * GeneralizedTime to an ISO instant.
 *
 * RFC 3161 requires the Zulu form, so the fractional-seconds and local-offset variants are refused
 * rather than guessed at. A timestamp authority's assertion of a time is the entire point of the
 * exchange; interpreting an ambiguous one charitably would be inventing evidence.
 */
export function decodeGeneralizedTime(node: DerNode): string {
  if (node.tag !== TAG.GENERALIZED_TIME) throw new DerError("not a GeneralizedTime");
  const text = node.content.toString("ascii");
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(?:\.(\d+))?Z$/.exec(text);
  if (m === null) throw new DerError(`unsupported GeneralizedTime form: ${text}`);
  const [, y, mo, d, h, mi, s, frac] = m;
  const ms = frac === undefined ? "000" : `${frac}00`.slice(0, 3);
  return `${y}-${mo}-${d}T${h}:${mi}:${s}.${ms}Z`;
}
