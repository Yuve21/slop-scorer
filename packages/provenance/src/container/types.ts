/**
 * What a container parse produces.
 *
 * One shape for every format, because the rules downstream are about PROVENANCE, not about
 * JPEG. A rule that reads `container.encoder` works identically over a JPEG APP1 Software
 * tag, an ISO-BMFF `©too` atom, a RIFF `ISFT` chunk and an MP3 LAME header, and that is the
 * only reason three modalities can share one rule corpus.
 *
 * `segments` is the citation index. Every finding these packages emit points at one of these
 * entries by offset, so "we saw a Lavf encoder tag" always comes with the byte you can open
 * the file at and read it yourself.
 */

export type ContainerFormat =
  | "jpeg"
  | "png"
  | "gif"
  | "webp"
  | "iso-bmff"
  | "riff-wave"
  | "mpeg-audio"
  | "unknown";

/** One marker, box, chunk or atom, named and located. */
export interface SegmentRecord {
  /** The format's own name for it: "APP1", "moov/udta/©too", "IHDR", "LIST/INFO/ISFT". */
  readonly name: string;
  readonly offset: number;
  readonly length: number;
  /** A short, printable summary of the payload. Never the payload itself. */
  readonly summary: string;
}

/** A declared writer. Deterministic: the file says this about itself, in a defined field. */
export interface EncoderRecord {
  /** The field that carried it: "EXIF:Software", "ISO-BMFF:©too", "RIFF:ISFT", "LAME". */
  readonly field: string;
  readonly value: string;
  readonly offset: number;
}

/**
 * JPEG-specific observations.
 *
 * `qualityEstimate` is derived from the quantisation tables by the standard IJG inverse, so
 * it is arithmetic over bytes in the file rather than a model output. It is the single most
 * useful re-encode indicator available without touching a pixel: a camera original and a
 * platform re-save do not share a quality ladder.
 */
export interface JpegRecord {
  readonly progressive: boolean;
  /** Every quantisation table, 64 coefficients each. The encoder's own fingerprint. */
  readonly quantTables: readonly (readonly number[])[];
  /** Table sums, for display. The quality inverse uses the full tables, never these. */
  readonly quantTableSums: readonly number[];
  /** 1..100 by the IJG inverse, or null when the tables are not IJG-shaped. */
  readonly qualityEstimate: number | null;
  /** "4:4:4", "4:2:2", "4:2:0", or the raw factors when it is none of those. */
  readonly chromaSubsampling: string | null;
  /** True when a JFIF APP0 is present. Written by libjpeg-family encoders, not by most cameras. */
  readonly jfif: boolean;
  /** True when the entropy-coded scan is followed by bytes after EOI. */
  readonly trailingBytes: number;
}

export interface MediaShape {
  readonly width?: number;
  readonly height?: number;
  readonly durationSeconds?: number;
  readonly sampleRate?: number;
  readonly channels?: number;
  readonly bitDepth?: number;
  /** Codec four-character code or name: "avc1", "hvc1", "mp4a", "pcm", "mpeg-1 layer 3". */
  readonly codec?: string;
  /** ISO-BMFF movie timescale. 90000 and 1000 are transcoder conventions, not camera ones. */
  readonly timescale?: number;
  /** ISO-BMFF compatible brands, in file order. */
  readonly brands?: readonly string[];
}

export interface ContainerRecord {
  readonly format: ContainerFormat;
  readonly byteLength: number;
  readonly segments: readonly SegmentRecord[];
  readonly encoder: EncoderRecord | null;
  readonly shape: MediaShape;
  readonly jpeg: JpegRecord | null;
  /**
   * Raw metadata payloads the parser found and handed on, keyed by kind. The metadata layer
   * decodes these; the container layer only locates them.
   */
  readonly payloads: readonly MetadataPayload[];
  /**
   * Parse problems, named. A container we could not fully walk is a COVERAGE fact, not a
   * finding: it must lower what we claim to have examined, never raise a suspicion.
   */
  readonly parseErrors: readonly string[];
}

export type PayloadKind = "exif" | "xmp" | "iptc-iim" | "png-text" | "c2pa" | "id3" | "riff-info" | "quicktime-udta";

export interface MetadataPayload {
  readonly kind: PayloadKind;
  readonly offset: number;
  readonly length: number;
  /** Latin-1 or UTF-8 text of the payload where it is textual; empty for binary blocks. */
  readonly text: string;
  /** Key/value pairs the container layer could read without a format-specific decoder. */
  readonly fields: Readonly<Record<string, string>>;
}

export const emptyContainer = (byteLength: number, parseErrors: readonly string[]): ContainerRecord => ({
  format: "unknown",
  byteLength,
  segments: [],
  encoder: null,
  shape: {},
  jpeg: null,
  payloads: [],
  parseErrors,
});
