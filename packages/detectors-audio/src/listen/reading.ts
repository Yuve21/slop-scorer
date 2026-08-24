/**
 * A STREAM READING: what a local decoder measured, as data.
 *
 * This module is PURE. It defines the shape of a reading and derives observations from one,
 * and it contains no subprocess, no file system and no network. The subprocess lives next
 * door in `ffprobe.ts`, and the split is load-bearing rather than tidy: every rule in
 * `../stream.ts` and every test in this package operates on a reading, so the whole
 * signal-reading half of this detector is exercised with no binary installed, no key set and
 * no network reachable.
 *
 * WHY THERE IS A SIGNAL LAYER HERE AT ALL, given that the first version of this package said
 * there would never be one.
 *
 * The original sentence was "vocoder or codec artifact statistics, spectrogram features,
 * speaker embeddings, similarity scores" — and every one of those is still refused, for the
 * reason `../scope.ts` gives. What was wrong was the boundary, not the refusal. Those four
 * are statistics whose subject is A PERSON or a MODEL: they ask "who is this" or "which
 * generator made this", they answer with a number nobody can re-derive, and they collapse
 * under the re-encode that most audio has already been through.
 *
 * A NOISE FLOOR IS NOT ONE OF THOSE. "The quietest 200 ms window in this file measures
 * -84 dBFS" is a number a reader can reproduce with one ffmpeg command, whose subject is the
 * file, and which is true whether or not anybody agrees with what we infer from it. Same for
 * a gap length, a declared-versus-decoded duration, a channel layout, a bitrate mode. Those
 * are MEASUREMENTS OF THE FILE, they are citable in the sense this repository means, and
 * refusing to make them was refusing to listen at all.
 *
 * So the line this module draws, and `../scope.ts` states in words:
 *
 *   Measurements whose subject is the FILE are allowed, fenced as probabilistic in what they
 *   are taken to MEAN, and capped. Statistics whose subject is a PERSON are refused, and the
 *   claim guard makes the sentence they would license unsayable.
 *
 * Everything derived below carries the command that produced it, so a disputed reading is
 * settled by running the command rather than by trusting us.
 */

/** Why there is, or is not, a reading. `not_attempted` is the default and the common case. */
export type StreamReadingState =
  /** A local decoder ran and produced numbers. */
  | "read"
  /** Listening was not switched on. THE DEFAULT: this package works with no binary at all. */
  | "not_attempted"
  /** Listening was asked for and no local decoder was found. Not a fault of the file. */
  | "tool_unavailable"
  /** A decoder ran and could not produce a usable reading. */
  | "failed";

/** One measured silent span. Half-open, seconds from the start of the decoded stream. */
export interface SilentSpan {
  readonly startSec: number;
  readonly endSec: number;
}

export const spanLength = (s: SilentSpan): number => Math.max(0, s.endSec - s.startSec);

/** Energy remaining above a probe frequency, in dBFS. One row per band we asked about. */
export interface BandEnergy {
  readonly aboveHz: number;
  readonly meanDb: number;
  readonly peakDb: number;
}

/**
 * The value recorded when the decoder reports a noise floor of `-inf`.
 *
 * `-inf` is what astats prints when the quiet passages contain literally zero-valued samples,
 * which is the most digitally clean a file can possibly be, and it turned up on the first real
 * file this package was pointed at. It cannot be stored as `-Infinity`: the artifact is
 * serialised to JSON for replay and `JSON.stringify(-Infinity)` is `null`, so the reading
 * would come back from storage with its most extreme measurement missing.
 *
 * So it is recorded as a finite sentinel BELOW the floor of any real format — 24-bit PCM
 * bottoms out around -144 dBFS — with `noiseFloorIsDigitalZero` set alongside it, so nothing
 * downstream mistakes a sentinel for a measurement.
 */
export const DIGITAL_ZERO_FLOOR_DB = -150;

/**
 * Levels measured over the whole decoded stream.
 *
 * `noiseFloorDb` is the one that matters and it is the one most easily misread, so: it is
 * ffmpeg `astats`'s noise floor, an estimate of the level of the quietest sustained content
 * in the stream. It is NOT the level of the quietest sample and it is not a room-noise
 * measurement. A file with no quiet passage at all has a high one for an uninteresting
 * reason, which is why the rule that reads it also requires measured silent spans.
 */
export interface LevelReading {
  readonly peakDb: number;
  readonly rmsDb: number;
  readonly noiseFloorDb: number;
  /** True when the decoder said `-inf` and `noiseFloorDb` is therefore the sentinel above. */
  readonly noiseFloorIsDigitalZero: boolean;
  /**
   * astats' flat factor and zero-crossing rate, `null` when the decoder did not print them.
   *
   * Nullable rather than defaulted to zero, and no rule reads either of them yet. A field
   * that quietly becomes 0 when a parse misses is the silent-empty-collection failure in
   * miniature: the number looks measured, it is not, and a rule added later would read it.
   * ffmpeg prints both per channel and only some builds repeat them in the overall block,
   * which is exactly the kind of drift that produces a confident zero.
   */
  readonly flatFactor: number | null;
  readonly zeroCrossingsRate: number | null;
  readonly sampleCount: number;
}

/** Container and stream facts, as the decoder reports them rather than as the tag claims. */
export interface StreamFacts {
  readonly codec: string;
  readonly sampleRateHz: number;
  readonly channels: number;
  readonly channelLayout: string;
  readonly bitRateBps: number | null;
  /**
   * Whether the bitrate is constant. `null` when the decoder cannot say, which is most of
   * the time and is reported as unknown rather than guessed at.
   */
  readonly bitrateMode: "cbr" | "vbr" | null;
  /** Duration the container header declares. */
  readonly declaredDurationSec: number | null;
  /** Duration the decoder actually produced. */
  readonly decodedDurationSec: number | null;
  /** Whether the samples are stored without perceptual coding. Fences the spectral rule. */
  readonly lossless: boolean;
  /** The writer the decoder read out of the container, verbatim. */
  readonly encoderTag: string | null;
  /** Every distinct writer string the decoder found, in the order found. */
  readonly writerChain: readonly string[];
}

export interface StreamReading {
  readonly state: StreamReadingState;
  /** Which local tool produced this, with its version. Empty unless `state === "read"`. */
  readonly tool: string;
  /** The exact commands run, so any number below can be re-derived by hand. */
  readonly commands: readonly string[];
  /** Why, in a sentence a reader can act on. Always populated, including on success. */
  readonly note: string;
  readonly facts: StreamFacts | null;
  readonly levels: LevelReading | null;
  readonly silences: readonly SilentSpan[];
  /** The threshold `silences` was measured at, in dBFS. Without it the spans mean nothing. */
  readonly silenceThresholdDb: number | null;
  readonly bands: readonly BandEnergy[];
}

export const NOT_ATTEMPTED: StreamReading = {
  state: "not_attempted",
  tool: "",
  commands: [],
  note:
    "No local decoder was run, so nothing in this file's samples was measured. This is the default: the detector " +
    "reads the container and the tags with no binary installed and no network reachable, and listening is a " +
    "separate opt-in because it shells out to a decoder on the host.",
  facts: null,
  levels: null,
  silences: [],
  silenceThresholdDb: null,
  bands: [],
};

export const unread = (state: Exclude<StreamReadingState, "read">, note: string): StreamReading => ({
  ...NOT_ATTEMPTED,
  state,
  note,
});

// ---------------------------------------------------------------------------------------
// Derived observations. Pure arithmetic over a reading, each one citable and re-derivable.
// ---------------------------------------------------------------------------------------

/** The gaps between measured silent spans: the phrases. */
export function gapLengths(silences: readonly SilentSpan[]): readonly number[] {
  return silences.map(spanLength).filter((n) => n > 0);
}

export interface Dispersion {
  readonly count: number;
  readonly mean: number;
  readonly stdDev: number;
  /** stdDev / mean. Unitless, so a fast reader and a slow one are compared on equal terms. */
  readonly coefficientOfVariation: number;
}

export function dispersion(values: readonly number[]): Dispersion | null {
  if (values.length < 2) return null;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  if (mean <= 0) return null;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  const stdDev = Math.sqrt(variance);
  return {
    count: values.length,
    mean: round(mean),
    stdDev: round(stdDev),
    coefficientOfVariation: round(stdDev / mean),
  };
}

/**
 * The biggest drop between two adjacent probe bands, and where it happened.
 *
 * A hard ceiling shows up as a cliff: a lot of energy below some frequency and effectively
 * none above it. Reported as a step between two bands we actually measured rather than as a
 * single "bandwidth" number, because the step is the observation and the bandwidth would be
 * an interpolation between two of them.
 */
export interface SpectralStep {
  readonly lowerHz: number;
  readonly upperHz: number;
  readonly lowerDb: number;
  readonly upperDb: number;
  readonly dropDb: number;
}

/**
 * The highest probe frequency that means anything in a stream at this sample rate.
 *
 * 45% of the sample rate, so comfortably under Nyquist. Found the hard way on the first real
 * file: a 22.05 kHz WAVE has a Nyquist of 11.025 kHz, so a highpass at 15 kHz has no passband
 * at all and the filter returned a number (-24.5 dBFS) that looked like a lot of energy where
 * there was none. Worse, the drop from 7 kHz to 11 kHz in such a file is REAL and means
 * nothing: a 22.05 kHz stream necessarily has no content above 11 kHz, so reading that cliff
 * as evidence of upsampling would flag every file recorded at a lower rate, which is the
 * entire archive of the twentieth century.
 */
export const usableBandCeilingHz = (sampleRateHz: number): number => sampleRateHz * 0.45;

/** The bands that sit below the usable ceiling for this stream. The rest are discarded. */
export function usableBands(bands: readonly BandEnergy[], sampleRateHz: number): readonly BandEnergy[] {
  const ceiling = usableBandCeilingHz(sampleRateHz);
  return bands.filter((b) => b.aboveHz < ceiling);
}

export function steepestStep(bands: readonly BandEnergy[]): SpectralStep | null {
  const sorted = [...bands].sort((a, b) => a.aboveHz - b.aboveHz);
  let best: SpectralStep | null = null;
  for (let i = 0; i + 1 < sorted.length; i += 1) {
    const lower = sorted[i]!;
    const upper = sorted[i + 1]!;
    const dropDb = round(lower.meanDb - upper.meanDb);
    if (!best || dropDb > best.dropDb) {
      best = { lowerHz: lower.aboveHz, upperHz: upper.aboveHz, lowerDb: lower.meanDb, upperDb: upper.meanDb, dropDb };
    }
  }
  return best;
}

/** Absolute and relative disagreement between the declared and the decoded duration. */
export function durationDisagreement(facts: StreamFacts): { readonly absSec: number; readonly share: number } | null {
  const { declaredDurationSec: declared, decodedDurationSec: decoded } = facts;
  if (declared === null || decoded === null || declared <= 0) return null;
  const absSec = round(Math.abs(declared - decoded));
  return { absSec, share: round(absSec / declared) };
}

export const round = (n: number): number => Math.round(n * 1000) / 1000;

/**
 * THE THRESHOLDS, in one place, each with the reason it sits where it does.
 *
 * They are triage boundaries on measurements, not probabilities, and no rule that reads them
 * states a rate. They are exported so a caller can print them next to a finding: a threshold
 * a reader cannot see is a threshold they cannot argue with.
 */
export const STREAM_THRESHOLDS = {
  /**
   * -70 dBFS. Below the self-noise of essentially any microphone at working gain: a treated
   * studio with a quiet preamp lands in the -60s, an ordinary room with a consumer capsule
   * in the -45 to -55 range. A file whose quietest sustained passage measures below -70 has
   * had the room removed from it or never had one.
   */
  cleanFloorDb: -70,
  /**
   * -55 dBFS. The other side of the same measurement, used by the COUNTER rule. A floor
   * above this in the quiet passages is room tone, and room tone is an argument for a
   * microphone having been in a place.
   */
  roomToneFloorDb: -55,
  /** Fewer silent spans than this and there is no gap distribution to describe. */
  minSilentSpans: 4,
  /**
   * 0.35. Read speech varies its pauses by much more than this; a fixed inter-sentence pause
   * lands far below it. Deliberately loose, because the failure mode to avoid is a rule that
   * fires on a careful reader.
   */
  uniformGapCv: 0.35,
  /** A spectral cliff worth mentioning, in dB between two adjacent probe bands. */
  spectralDropDb: 30,
  /** ...and the upper band has to be genuinely empty, not merely quieter. */
  spectralUpperCeilingDb: -80,
  /** Duration disagreement worth mentioning: both an absolute and a relative floor. */
  durationMismatchSec: 0.25,
  durationMismatchShare: 0.01,
} as const;
