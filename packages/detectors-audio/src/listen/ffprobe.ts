/**
 * The listening layer: a local decoder, invoked as a subprocess, or nothing.
 *
 * THREE PROPERTIES THIS MODULE IS BUILT TO HAVE, in order of how much they matter.
 *
 * 1. IT IS OFF UNLESS ASKED. `listenToAudio` returns `NOT_ATTEMPTED` unless a caller passes
 *    `enabled: true`. No environment variable turns it on implicitly, no "helpful" auto
 *    detection runs it because a binary happens to be present. The default build of this
 *    package reads containers and tags with nothing installed, and the test suite never
 *    reaches this file's subprocess path at all.
 *
 * 2. THERE IS NO NETWORK AND NO KEY IN IT. It runs `ffprobe` and `ffmpeg` against a local
 *    path, both of which are general-purpose decoders under LGPL/GPL that we neither pay for
 *    nor send anything to. No vendor API is contacted, no audio leaves the host, and there is
 *    nothing here to configure with a secret. That is a deliberate choice over the commercial
 *    synthetic-speech detection APIs: those return a probability we could not reproduce, over
 *    audio we would have to upload, under terms that in at least one case forbid using the
 *    output to build anything competing with it. See the README's tool table.
 *
 * 3. A MISSING TOOL IS A REPORTED STATE, NEVER A THROW AND NEVER A SILENT ZERO. If ffmpeg is
 *    not installed the reading comes back `tool_unavailable` with a sentence saying so, and
 *    every rule downstream declines to fire. The failure this guards against is the one this
 *    repository is organised around: a measurement that silently comes back empty, and a
 *    report that reads as "we listened and heard nothing unusual".
 *
 * Every number the reading carries is accompanied by the command that produced it. A user who
 * disputes a finding does not have to trust us; they run the line we printed.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { DIGITAL_ZERO_FLOOR_DB, NOT_ATTEMPTED, round, unread, usableBandCeilingHz } from "./reading.js";
import type { BandEnergy, LevelReading, SilentSpan, StreamFacts, StreamReading } from "./reading.js";

const run = promisify(execFile);

/** Probe bands, in Hz. Only used on lossless audio; see `LOSSY_BANDS_NOTE`. */
const PROBE_BANDS: readonly number[] = [4_000, 7_000, 11_000, 15_000, 19_000];

/**
 * Why bands are not measured on a lossy file, stated where somebody would otherwise add it.
 *
 * A perceptual codec applies its own lowpass as part of doing its job: 128 kbit/s MP3 rolls
 * off somewhere around 16 kHz whatever went into it. So a spectral ceiling measured on an MP3
 * is a measurement of the ENCODER'S SETTINGS and carries no information about the source at
 * all. Measuring it anyway and fencing the rule would leave a number in the report that
 * looks like evidence, so it is not measured.
 */
export const LOSSY_BANDS_NOTE =
  "Band energies were not measured: the samples are perceptually coded, so any high-frequency ceiling in them is " +
  "the codec's own lowpass rather than anything about the source. Measuring it would put a number in the report " +
  "that looks like evidence and is not.";

/** Codecs whose samples are stored without perceptual coding. */
const LOSSLESS_CODECS = /^(pcm_|flac$|alac$|wavpack$|tta$|truehd$|mlp$)/;

/** Silence threshold, in dBFS. Deliberately generous: this finds PAUSES, not pure digital zero. */
const SILENCE_THRESHOLD_DB = -50;
/** Shortest span counted as a pause. Below this, ordinary stop consonants qualify. */
const SILENCE_MIN_SEC = 0.15;

export interface ListenOptions {
  /** Nothing happens unless this is true. There is no implicit enablement. */
  readonly enabled: boolean;
  /** Override the binaries, for a host that installs them under another name or behind a shim. */
  readonly ffprobePath?: string;
  readonly ffmpegPath?: string;
  /** Wall-clock ceiling per subprocess. A decoder that hangs must not hang the scan. */
  readonly timeoutMs?: number;
}

/**
 * Measure a local audio file, or report why not.
 *
 * Never throws. Every failure path returns a reading whose `state` is not `"read"` and whose
 * `note` says what happened in a sentence.
 */
export async function listenToAudio(path: string, options: ListenOptions): Promise<StreamReading> {
  if (!options.enabled) return NOT_ATTEMPTED;

  const ffprobe = options.ffprobePath ?? "ffprobe";
  const ffmpeg = options.ffmpegPath ?? "ffmpeg";
  const timeout = options.timeoutMs ?? 30_000;
  const exec = async (bin: string, args: readonly string[]): Promise<string> => {
    const { stdout, stderr } = await run(bin, [...args], { timeout, maxBuffer: 16 * 1024 * 1024 });
    return `${stdout}\n${stderr}`;
  };

  let version: string;
  try {
    const out = await exec(ffprobe, ["-hide_banner", "-version"]);
    version = out.split(/\r?\n/)[0]?.trim() ?? "ffprobe";
  } catch {
    return unread(
      "tool_unavailable",
      "Listening was requested and no local decoder was found on this host, so nothing in this file's samples was " +
        "measured. Install ffmpeg to enable it. Nothing about the file follows from this: it is a fact about the " +
        "machine the scan ran on.",
    );
  }

  const commands: string[] = [];
  const q = (bin: string, args: readonly string[]): string => `${bin} ${args.join(" ")}`;

  // ---- 1. container and stream facts ----------------------------------------------------
  const probeArgs = [
    "-v",
    "error",
    "-show_format",
    "-show_streams",
    "-select_streams",
    "a:0",
    "-of",
    "default=noprint_wrappers=0",
    path,
  ];
  let facts: StreamFacts | null;
  try {
    const out = await exec(ffprobe, probeArgs);
    commands.push(q(ffprobe, probeArgs));
    facts = parseFacts(out);
  } catch (err) {
    return unread(
      "failed",
      `A local decoder ran and could not read this file (${String(err).slice(0, 160)}). No measurement of the ` +
        `samples is reported, and no conclusion is drawn from the failure.`,
    );
  }
  if (!facts) {
    return unread(
      "failed",
      "A local decoder ran and reported no audio stream in this file, so there was nothing to measure. That is a " +
        "statement about what the decoder found, not about the file's origin.",
    );
  }

  // ---- 2. levels and silences, in one pass ----------------------------------------------
  const statsArgs = [
    "-hide_banner",
    "-nostats",
    "-i",
    path,
    "-map",
    "0:a:0",
    "-af",
    `astats=metadata=1:reset=0,silencedetect=n=${SILENCE_THRESHOLD_DB}dB:d=${SILENCE_MIN_SEC}`,
    "-f",
    "null",
    "-",
  ];
  let levels: LevelReading | null = null;
  let silences: readonly SilentSpan[] = [];
  try {
    const out = await exec(ffmpeg, statsArgs);
    commands.push(q(ffmpeg, statsArgs));
    levels = parseLevels(out);
    silences = parseSilences(out);
  } catch {
    // Deliberately not fatal: the container facts above are already worth reporting, and a
    // reading that carries facts and no levels is honest about exactly that.
  }

  // ---- 3. band energies, lossless only --------------------------------------------------
  const bands: BandEnergy[] = [];
  if (facts.lossless) {
    // Only bands below Nyquist are measured. A highpass above it has no passband and returns
    // a meaningless figure, and the drop to it would read as a spectral cliff on every file
    // recorded at a lower sample rate.
    const ceiling = usableBandCeilingHz(facts.sampleRateHz);
    for (const aboveHz of PROBE_BANDS.filter((hz) => hz < ceiling)) {
      const args = [
        "-hide_banner",
        "-nostats",
        "-i",
        path,
        "-map",
        "0:a:0",
        "-af",
        `highpass=f=${aboveHz}:poles=2,volumedetect`,
        "-f",
        "null",
        "-",
      ];
      try {
        const out = await exec(ffmpeg, args);
        commands.push(q(ffmpeg, args));
        const meanDb = number(out, /mean_volume:\s*(-?[\d.]+) dB/);
        const peakDb = number(out, /max_volume:\s*(-?[\d.]+) dB/);
        if (meanDb !== null && peakDb !== null) bands.push({ aboveHz, meanDb: round(meanDb), peakDb: round(peakDb) });
      } catch {
        // One band failing is not the run failing; the steepest-step derivation reads
        // whichever bands came back and the rule requires at least two.
      }
    }
  }

  return {
    state: "read",
    tool: version,
    commands,
    note:
      `Measured on this host by ${version} against the local file. ` +
      (facts.lossless ? "" : `${LOSSY_BANDS_NOTE} `) +
      "Every number here is re-derivable by running the commands listed alongside it.",
    facts,
    levels,
    silences,
    silenceThresholdDb: SILENCE_THRESHOLD_DB,
    bands,
  };
}

// ---------------------------------------------------------------------------------------
// Parsers. Exported for test: a parser only exercised through a subprocess is a parser that
// is never exercised in a suite that refuses to shell out.
// ---------------------------------------------------------------------------------------

const number = (text: string, re: RegExp): number | null => {
  const m = re.exec(text);
  if (!m || m[1] === undefined) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
};

/**
 * A decibel figure, including the `-inf` a decoder prints for literal digital silence.
 *
 * Mapped onto the finite sentinel rather than onto `-Infinity`, because the reading is
 * serialised to JSON for replay and `JSON.stringify(-Infinity)` is `null`. `+inf` is folded
 * to 0 dBFS, which is where a full-scale reading actually sits.
 */
export const decibels = (text: string, re: RegExp): number | null => {
  const m = re.exec(text);
  if (!m || m[1] === undefined) return null;
  const raw = m[1].trim();
  if (/^-inf$/i.test(raw)) return DIGITAL_ZERO_FLOOR_DB;
  if (/^\+?inf$/i.test(raw)) return 0;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
};

const nullableRound = (n: number | null): number | null => (n === null ? null : round(n));

const str = (text: string, re: RegExp): string | null => {
  const m = re.exec(text);
  return m && m[1] !== undefined && m[1] !== "N/A" ? m[1].trim() : null;
};

/** ffprobe `default=` key/value output for one audio stream plus the format block. */
export function parseFacts(out: string): StreamFacts | null {
  const codec = str(out, /^codec_name=(.*)$/m);
  if (!codec) return null;
  const sampleRateHz = number(out, /^sample_rate=(\d+)$/m) ?? 0;
  const channels = number(out, /^channels=(\d+)$/m) ?? 0;
  if (sampleRateHz === 0 || channels === 0) return null;

  // The stream `duration=` comes first in the output and the format `duration=` second, so
  // the stream one is matched with `m` (first hit) and the format one after the FORMAT
  // marker. Two durations that disagree is one of the things worth reporting, so they are
  // read as two values rather than collapsed into whichever ffprobe printed last.
  const formatBlock = out.slice(Math.max(0, out.indexOf("[FORMAT]")));
  const decodedDurationSec = number(out, /^duration=([\d.]+)$/m);
  const declaredDurationSec = number(formatBlock, /^duration=([\d.]+)$/m) ?? decodedDurationSec;

  const writerChain = [...out.matchAll(/^TAG:(?:encoder|ENCODER|TSSE|comment)=(.+)$/gm)]
    .map((m) => m[1]!.trim())
    .filter((v) => v.length > 0);

  return {
    codec,
    sampleRateHz,
    channels,
    channelLayout: str(out, /^channel_layout=(.*)$/m) ?? `${channels} channel(s)`,
    bitRateBps: number(out, /^bit_rate=(\d+)$/m),
    // ffprobe does not report a bitrate mode. Reported as unknown rather than inferred from
    // a single frame header, which is what "CBR" would actually mean if we claimed it here.
    bitrateMode: null,
    declaredDurationSec,
    decodedDurationSec,
    lossless: LOSSLESS_CODECS.test(codec),
    encoderTag: writerChain[0] ?? null,
    writerChain: [...new Set(writerChain)],
  };
}

/** ffmpeg `astats` overall block. */
export function parseLevels(out: string): LevelReading | null {
  // astats prints a per-channel block and then an "Overall" block. The overall one is the
  // one to read, so the tail of the output after the last "Overall" marker is scanned.
  const idx = out.lastIndexOf("Overall");
  const tail = idx >= 0 ? out.slice(idx) : out;
  const peakDb = decibels(tail, /Peak level dB:\s*(-?[\d.]+|-?inf)/);
  const rmsDb = decibels(tail, /RMS level dB:\s*(-?[\d.]+|-?inf)/);
  const floor = decibels(tail, /Noise floor dB:\s*(-?[\d.]+|-?inf)/);
  if (peakDb === null || rmsDb === null || floor === null) return null;
  return {
    peakDb: round(peakDb),
    rmsDb: round(rmsDb),
    noiseFloorDb: round(floor),
    // `-inf` came back from the very first real file this was pointed at, and the old regex
    // could not express it, so the whole level record was dropped in silence. That is the
    // exact failure shape this repository is organised around: not a crash, an empty result
    // that reads downstream as "measured, nothing unusual".
    noiseFloorIsDigitalZero: floor <= DIGITAL_ZERO_FLOOR_DB,
    flatFactor: nullableRound(number(tail, /Flat factor:\s*([\d.]+)/)),
    zeroCrossingsRate: nullableRound(number(tail, /Zero crossings rate:\s*([\d.]+)/)),
    sampleCount: number(tail, /Number of samples:\s*(\d+)/) ?? 0,
  };
}

/** ffmpeg `silencedetect` start/end pairs, in order, unpaired trailing starts dropped. */
export function parseSilences(out: string): readonly SilentSpan[] {
  const spans: SilentSpan[] = [];
  let start: number | null = null;
  for (const m of out.matchAll(/silence_(start|end):\s*(-?[\d.]+)/g)) {
    const value = Number(m[2]);
    if (!Number.isFinite(value)) continue;
    if (m[1] === "start") start = value;
    else if (start !== null) {
      if (value > start) spans.push({ startSec: round(start), endSec: round(value) });
      start = null;
    }
  }
  return spans;
}
