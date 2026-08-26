/**
 * Process recordings: the lane where the capture already exists and nothing verifies it.
 *
 * THE FINDING THIS IS BUILT ON (`left-field-additions.md` A8)
 *
 * Procreate records a time-lapse BY DEFAULT, on every canvas, and it is the most widely adopted
 * process-capture feature in existence. Clip Studio Paint stores its timelapse INSIDE the `.clip`
 * file so it survives save and reopen. Krita has a Recorder docker. None of them hash, sign or
 * timestamp anything, you can pause recording to cut sections out, and no product on the market
 * verifies an art process file. Meanwhile the enforcement vacuum is documented from both ends: an
 * artist offered his layered source files and was told "I don't believe you", and in the Genshin
 * case someone took a streamed work-in-progress, ran it through a generator, and published six
 * hours before the artist finished.
 *
 * So the ingest path exists for evidence that is already being produced by millions of people and
 * thrown away. What this package adds is the missing half: hash every frame, chain them, timestamp
 * the root, and issue something checkable.
 *
 * THE PARSERS START MINIMAL, AND SAY SO. A `.procreate` file is a zip and a `.clip` file is a
 * SQLite database, and reading the frame streams out of either is real work that is not done here.
 * What IS done: recognise the container, hash whatever frames the caller could extract, and record
 * `unparsedFields` naming exactly what this parser could not establish. A recording ingested by a
 * minimal parser and one ingested by a complete parser must not look the same in the record - that
 * is the difference between a limitation and a lie.
 */

import type { NotaryEventRow, NotaryRecordingRow, RecordingTool } from "@slop/db";
import { sha256Hex, type ProcessEvent } from "./chain.js";

export interface RecordingFrame {
  readonly index: number;
  /** Milliseconds from the start of the recording, as the container reports them. */
  readonly atMsFromStart: number;
  readonly sha256: string;
  readonly byteLength: number;
}

export interface ProcessRecording {
  readonly sourceTool: RecordingTool;
  readonly parserId: string;
  readonly frames: readonly RecordingFrame[];
  readonly durationMs: number;
  readonly finalFileSha256: string | null;
  readonly unparsedFields: readonly string[];
}

export interface RecordingInput {
  /** The container, if the caller has it. Used for recognition and for the final-file digest. */
  readonly container?: Uint8Array;
  /** Frames the caller already extracted, in order. */
  readonly frames?: readonly Uint8Array[];
  /** Nominal spacing when the container does not carry per-frame times. */
  readonly frameIntervalMs?: number;
}

export interface RecordingParser {
  readonly id: string;
  readonly tool: RecordingTool;
  /** True when this parser recognises the container. */
  recognises(container: Uint8Array): boolean;
  parse(input: RecordingInput): ProcessRecording;
}

const startsWith = (data: Uint8Array, prefix: readonly number[]): boolean =>
  prefix.every((byte, i) => data[i] === byte);

const hashFrames = (frames: readonly Uint8Array[], intervalMs: number): RecordingFrame[] =>
  frames.map((bytes, index) => ({
    index,
    atMsFromStart: index * intervalMs,
    sha256: sha256Hex(bytes),
    byteLength: bytes.length,
  }));

/** Default spacing when a container does not give one. Procreate's own capture is roughly this. */
export const DEFAULT_FRAME_INTERVAL_MS = 1_000;

/**
 * The parser that does the actual work today: the caller extracted the frames, we hash and chain.
 *
 * Not a placeholder. It is the correct shape for a plugin or an export script, and it is what the
 * two container parsers below degrade to once somebody has pulled the frames out.
 */
export class GenericFrameSequenceParser implements RecordingParser {
  readonly id = "generic-frames/v1";
  readonly tool: RecordingTool = "generic-frames";

  recognises(): boolean {
    return false;
  }

  parse(input: RecordingInput): ProcessRecording {
    const interval = input.frameIntervalMs ?? DEFAULT_FRAME_INTERVAL_MS;
    const frames = hashFrames(input.frames ?? [], interval);
    return {
      sourceTool: this.tool,
      parserId: this.id,
      frames,
      durationMs: frames.length === 0 ? 0 : (frames[frames.length - 1] as RecordingFrame).atMsFromStart,
      finalFileSha256: input.container === undefined ? null : sha256Hex(input.container),
      unparsedFields: input.frameIntervalMs === undefined ? ["frame timing came from a nominal interval, not the container"] : [],
    };
  }
}

/** A container parser that recognises its format and is honest about the rest. */
class ContainerParser implements RecordingParser {
  constructor(
    readonly id: string,
    readonly tool: RecordingTool,
    private readonly magic: readonly number[],
    private readonly cannotYet: readonly string[],
  ) {}

  recognises(container: Uint8Array): boolean {
    return startsWith(container, this.magic);
  }

  parse(input: RecordingInput): ProcessRecording {
    const interval = input.frameIntervalMs ?? DEFAULT_FRAME_INTERVAL_MS;
    const frames = hashFrames(input.frames ?? [], interval);
    return {
      sourceTool: this.tool,
      parserId: this.id,
      frames,
      durationMs: frames.length === 0 ? 0 : (frames[frames.length - 1] as RecordingFrame).atMsFromStart,
      finalFileSha256: input.container === undefined ? null : sha256Hex(input.container),
      // Named, every time, whether or not the caller supplied frames out of band.
      unparsedFields: [...this.cannotYet],
    };
  }
}

/** `.procreate` is a zip. The timelapse lives inside it as video segments. */
export const procreateParser = new ContainerParser(
  "procreate/v1-minimal",
  "procreate",
  [0x50, 0x4b, 0x03, 0x04],
  [
    "the timelapse video segments inside the archive are not extracted by this parser",
    "per-frame timing is taken from a nominal interval rather than the container",
  ],
);

/** `.clip` is a SQLite database. The timelapse is stored inside it, which is why it survives a save. */
export const clipStudioParser = new ContainerParser(
  "clip-studio/v1-minimal",
  "clip-studio",
  [0x53, 0x51, 0x4c, 0x69, 0x74, 0x65, 0x20, 0x66, 0x6f, 0x72, 0x6d, 0x61, 0x74, 0x20, 0x33, 0x00],
  [
    "the timelapse blob inside the SQLite container is not extracted by this parser",
    "per-frame timing is taken from a nominal interval rather than the container",
  ],
);

export const RECORDING_PARSERS: readonly RecordingParser[] = [procreateParser, clipStudioParser];

/** Pick a parser by container magic, falling back to the generic one. */
export function parserFor(container: Uint8Array | undefined): RecordingParser {
  if (container === undefined) return new GenericFrameSequenceParser();
  return RECORDING_PARSERS.find((p) => p.recognises(container)) ?? new GenericFrameSequenceParser();
}

export type RecordingDefect =
  | { readonly kind: "no_frames"; readonly detail: string }
  | { readonly kind: "time_reversal"; readonly at: number; readonly detail: string }
  | { readonly kind: "repeated_frame"; readonly at: number; readonly detail: string }
  | { readonly kind: "final_file_mismatch"; readonly detail: string };

/**
 * What the recording itself says, before anything is chained.
 *
 * A repeated frame digest is reported and NOT treated as fraud. Two identical frames are what a
 * pause looks like, and they are also what a cut looks like, and this package cannot tell those
 * apart - so it counts them and lets the credential carry the count. Reporting a count is
 * defensible; inferring an intention from it is not.
 */
export function checkRecording(
  recording: ProcessRecording,
  expectedFinalSha256?: string,
): readonly RecordingDefect[] {
  const defects: RecordingDefect[] = [];
  if (recording.frames.length === 0) {
    defects.push({ kind: "no_frames", detail: "the recording carries no frames, so it attests nothing" });
  }
  const seen = new Map<string, number>();
  let last = -1;
  for (const frame of recording.frames) {
    if (frame.atMsFromStart < last) {
      defects.push({ kind: "time_reversal", at: frame.index, detail: `frame ${frame.index} is earlier than frame ${frame.index - 1}` });
    }
    last = frame.atMsFromStart;
    const first = seen.get(frame.sha256);
    if (first !== undefined) {
      defects.push({
        kind: "repeated_frame",
        at: frame.index,
        detail: `frame ${frame.index} is byte-identical to frame ${first}, which is what both a pause and a cut look like`,
      });
    } else {
      seen.set(frame.sha256, frame.index);
    }
  }
  if (
    expectedFinalSha256 !== undefined &&
    recording.finalFileSha256 !== null &&
    recording.finalFileSha256 !== expectedFinalSha256
  ) {
    defects.push({
      kind: "final_file_mismatch",
      detail: "the container does not hash to the file this chain is about",
    });
  }
  return defects;
}

/**
 * Fold a recording into chain events.
 *
 * One event per frame plus a closing `export` event for the container. Frame times are DECLARED -
 * they come from the recording, which comes from the caller's machine - so they are carried as
 * `declaredAt` and the chain's own `recordedAt` is the one we stand behind. The credential never
 * conflates the two.
 */
export function recordingToEvents(
  recording: ProcessRecording,
  startedAt: string,
  options: { readonly includeContainer?: boolean } = {},
): readonly ProcessEvent[] {
  const startMs = Date.parse(startedAt);
  if (Number.isNaN(startMs)) throw new RangeError(`startedAt is not a date: ${startedAt}`);
  const events: ProcessEvent[] = recording.frames.map((frame) => ({
    kind: "recording-frame" as const,
    contentSha256: frame.sha256,
    byteLength: frame.byteLength,
    declaredAt: new Date(startMs + frame.atMsFromStart).toISOString(),
    metadata: { frameIndex: frame.index, parserId: recording.parserId, sourceTool: recording.sourceTool },
  }));
  if (options.includeContainer !== false && recording.finalFileSha256 !== null) {
    events.push({
      kind: "export",
      contentSha256: recording.finalFileSha256,
      byteLength: 0,
      declaredAt: new Date(startMs + recording.durationMs).toISOString(),
      metadata: { parserId: recording.parserId, sourceTool: recording.sourceTool },
    });
  }
  return events;
}

/** One line for the credential. Counts only, and it names what the parser could not read. */
export function summariseRecording(recording: ProcessRecording, defects: readonly RecordingDefect[]): string {
  const repeated = defects.filter((d) => d.kind === "repeated_frame").length;
  const parts = [
    `The record includes a process recording from ${recording.sourceTool}: ` +
      `${recording.frames.length} frames over ${Math.round(recording.durationMs / 1000)} seconds, read by ${recording.parserId}.`,
  ];
  if (repeated > 0) {
    parts.push(`${repeated} of those frames are byte-identical to an earlier frame, which a pause and a cut both produce.`);
  }
  if (recording.unparsedFields.length > 0) {
    parts.push(`This parser could not establish: ${recording.unparsedFields.join("; ")}.`);
  }
  return parts.join(" ");
}

/**
 * Rebuild the summary sentence from what was STORED, so verification never has to be handed it.
 *
 * The summary goes into the credential's statement at issue, which means a verifier that cannot
 * reconstruct it has two bad options: take the caller's word for it (a value supplied by whoever
 * is asking for the check, used as an input to that check), or report every untouched
 * recording-backed credential as rewritten. Both were live: `verify()` did the second, and its
 * test hid it by passing the summary back in by hand.
 *
 * The frame digests come from the EVENTS, not from the recording row, so a deleted or edited frame
 * changes the repeated-frame count and the statement stops reproducing. What only the recording row
 * carries - the tool, the parser, the duration, what the parser could not read - is read from that
 * row, which is a separate record from the credential and not a self-assertion by it.
 */
export function summariseStoredRecording(
  row: NotaryRecordingRow,
  events: readonly NotaryEventRow[],
): string {
  const frames: RecordingFrame[] = events
    .filter((e) => e.kind === "recording-frame")
    .sort((a, b) => a.sequence - b.sequence)
    .map((e, index) => ({ index, atMsFromStart: 0, sha256: e.contentSha256, byteLength: e.byteLength }));
  const recording: ProcessRecording = {
    sourceTool: row.sourceTool,
    parserId: row.parserId,
    frames,
    durationMs: row.durationMs,
    finalFileSha256: row.finalFileSha256,
    unparsedFields: row.unparsedFields,
  };
  return summariseRecording(recording, checkRecording(recording));
}
