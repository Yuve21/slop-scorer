/**
 * The stream-consistency rules: the only probabilistic rules in this product.
 *
 * They read a `StreamReading` — numbers a local decoder measured, with the command that
 * produced each one — and they are fenced in five ways at once. Every fence is here because
 * `image-detection-reality.md` documents what happens to a detector without it.
 *
 *  1. THEY CANNOT RUN ON A LAUNDERED FILE. The gate in `@slop/provenance` runs before any
 *     rule and these are no exception. A noise floor measured after a platform transcode is
 *     a measurement of the platform's encoder.
 *  2. THEY CANNOT RUN WITHOUT A READING. `state !== "read"` means every rule below returns
 *     nothing, so a host with no decoder produces silence rather than a clean bill.
 *  3. THEY ARE CAPPED AT THE FAMILY LEVEL, below every other positive family, and
 *     `stream-consistency` "can never on its own move an artifact out of the lowest band"
 *     (`MEDIA_FAMILIES`). A file whose only evidence is a quiet noise floor does not get
 *     accused of anything.
 *  4. EVERY TITLE SAYS "probabilistic" IN IT, and the result's `evidenceKind` flips to
 *     `"probabilistic"` when one of them fires. A test asserts both.
 *  5. THE COUNTER RULE IS WEIGHTED HARDER THAN ANY OF THE SIGNALS. Room tone in the gaps
 *     argues that a microphone was in a place, and in a category whose documented failures
 *     are all false accusations the exonerating measurement gets the bigger number.
 *
 * WHAT NONE OF THEM DOES. No rule here has a person as its subject. There is no speaker
 * statistic, no embedding, no similarity score, no per-generator fingerprint, and no rule
 * that would license a sentence about whose voice this is. `../scope.ts` states the line and
 * `@slop/provenance`'s claim guard makes the sentence on the wrong side of it unsayable.
 */

import { ev } from "@slop/core";
import type { Evidence } from "@slop/core";
import { assertMediaSafe } from "@slop/provenance";
import {
  dispersion,
  durationDisagreement,
  gapLengths,
  spanLength,
  STREAM_THRESHOLDS as T,
  steepestStep,
  usableBands,
} from "./listen/reading.js";
import type { StreamReading } from "./listen/reading.js";
import type { AudioArtifact, AudioProbeId } from "./artifact.js";
import type { AudioRule } from "./rules.js";

export const STREAM_CORPUS_VERSION = "audio-stream-corpus-2026.09";

const say = assertMediaSafe;

/** Only a completed reading is readable. Everything else is silence, by construction. */
const reading = (a: AudioArtifact): StreamReading | null => (a.stream.state === "read" ? a.stream : null);

/** The rebuttal every rule in this family carries in addition to its own. */
export const STREAM_FAMILY_CAVEAT = say(
  "This is a statistic over the samples rather than a field somebody filled in, so it is the weakest kind of " +
    "evidence in this product and it is capped to stay that way. It cannot rule anything in on its own, and a " +
    "quiet, close-miked, noise-reduced, heavily edited studio read measures very much like the thing this line " +
    "describes. Where it disagrees with a declaration in the file, the declaration wins.",
);

const cite = (r: StreamReading, locator: string, observed: string, extra: Record<string, unknown> = {}): Evidence =>
  ev("metric", locator, observed, { excerpt: r.commands[0] ?? r.tool, ...extra });

/**
 * The stream rules.
 *
 * A factory so the corpus and the tests share one list, and so the reading-fixture helpers
 * below are the only way to build a case for them.
 */
export function streamRules(probe: AudioProbeId): readonly AudioRule[] {
  const SINCE = STREAM_CORPUS_VERSION;

  return [
    // -------------------------------------------------------------- the digitally clean floor
    {
      id: "stream.silence-has-no-room-in-it",
      family: "stream-consistency",
      title: "Probabilistic: the quiet passages measure below the noise floor of a microphone",
      polarity: "signal",
      severity: "low",
      baseWeight: 1.1,
      maxHits: 3,
      requiresProbe: probe,
      phase: 1,
      since: SINCE,
      explanation: say(
        `A local decoder measured this file's quietest sustained passages at or below ${T.cleanFloorDb} dBFS, with ` +
          `pauses long enough to measure. That is below the self-noise of a microphone at working gain: a treated ` +
          `studio with a quiet preamp sits in the -60s and an ordinary room with a consumer capsule in the -45 to ` +
          `-55 range. The pauses in this file contain the absence of signal rather than the sound of a place.`,
      ),
      falsePositiveNote: say(
        `Noise reduction produces this, and so does a gate, and both are standard in podcast and audiobook ` +
          `post-production. So does an isolated stem, a punch-in dropped into an existing take, and any file whose ` +
          `pauses an editor trimmed and replaced with digital silence. ${STREAM_FAMILY_CAVEAT}`,
      ),
      detect: (a): readonly Evidence[] => {
        const r = reading(a);
        if (!r || !r.levels || r.silences.length < 2) return [];
        if (r.levels.noiseFloorDb > T.cleanFloorDb) return [];
        const quietest = [...r.silences].sort((x, y) => spanLength(y) - spanLength(x))[0]!;
        return [
          cite(
            r,
            `${a.source.locator}#astats`,
            `noise floor ${r.levels.noiseFloorDb} dBFS over ${r.levels.sampleCount} samples, against a threshold of ${T.cleanFloorDb} dBFS`,
          ),
          cite(
            r,
            `${a.source.locator}#${timecode(quietest.startSec)}`,
            `${spanLength(quietest).toFixed(3)} s below ${r.silenceThresholdDb} dBFS, the longest of ${r.silences.length} measured pauses`,
            { atSeconds: quietest.startSec },
          ),
        ];
      },
      fixtures: {
        positive: (base) => ({ artifact: withReading(base, CLEAN_FLOOR_READING) }),
        mutated: (base) => ({ artifact: withReading(base, ROOM_TONE_READING) }),
        extra: [
          {
            name: "no reading was taken at all",
            shouldFire: false,
            build: (base) => ({ artifact: base }),
          },
          {
            name: "a clean floor with no measurable pauses to attribute it to",
            shouldFire: false,
            build: (base) => ({ artifact: withReading(base, { ...CLEAN_FLOOR_READING, silences: [] }) }),
          },
        ],
      },
    },

    // ------------------------------------------------------------------- uniform phrase gaps
    {
      id: "stream.pauses-are-uniform",
      family: "stream-consistency",
      title: "Probabilistic: the pauses between phrases are all close to the same length",
      polarity: "signal",
      severity: "low",
      baseWeight: 0.9,
      maxHits: 4,
      requiresProbe: probe,
      phase: 1,
      since: SINCE,
      explanation: say(
        `A local decoder measured the pauses in this file and their lengths vary by less than a coefficient of ` +
          `variation of ${T.uniformGapCv}. Someone reading aloud varies their pauses by far more than that: they ` +
          `breathe, they lose the line, they pause for sense. What we measured here is a single pause length ` +
          `repeated to within a few per cent across a whole file, which is the shape of a duration set once rather ` +
          `than of a person timing their own breath.`,
      ),
      falsePositiveNote: say(
        `A rehearsed read, a teleprompter, an audiobook narrator working to a script, and above all an EDITOR ` +
          `normalising pauses to a house length all produce this. A file assembled line by line, with a fixed gap ` +
          `laid between the takes, produces it exactly. ${STREAM_FAMILY_CAVEAT}`,
      ),
      detect: (a): readonly Evidence[] => {
        const r = reading(a);
        if (!r || r.silences.length < T.minSilentSpans) return [];
        const gaps = gapLengths(r.silences);
        const d = dispersion(gaps);
        if (!d || d.coefficientOfVariation > T.uniformGapCv) return [];
        return [
          cite(
            r,
            `${a.source.locator}#silencedetect`,
            `${d.count} pauses averaging ${d.mean.toFixed(3)} s, standard deviation ${d.stdDev.toFixed(3)} s, ` +
              `coefficient of variation ${d.coefficientOfVariation} against a threshold of ${T.uniformGapCv}`,
          ),
          ...r.silences.slice(0, 3).map((s) =>
            cite(r, `${a.source.locator}#${timecode(s.startSec)}`, `pause of ${spanLength(s).toFixed(3)} s`, {
              atSeconds: s.startSec,
            }),
          ),
        ];
      },
      fixtures: {
        positive: (base) => ({ artifact: withReading(base, UNIFORM_GAPS_READING) }),
        mutated: (base) => ({ artifact: withReading(base, VARIED_GAPS_READING) }),
        extra: [
          {
            name: "too few pauses to describe a distribution",
            shouldFire: false,
            build: (base) => ({
              artifact: withReading(base, { ...UNIFORM_GAPS_READING, silences: UNIFORM_GAPS_READING.silences.slice(0, 2) }),
            }),
          },
        ],
      },
    },

    // ---------------------------------------------------------------------- spectral ceiling
    {
      id: "stream.spectral-ceiling-below-the-container",
      family: "stream-consistency",
      title: "Probabilistic: uncompressed audio whose energy stops well below what the container allows",
      polarity: "signal",
      severity: "low",
      baseWeight: 1,
      maxHits: 2,
      requiresProbe: probe,
      phase: 1,
      since: SINCE,
      explanation: say(
        `The samples in this file are stored uncompressed, so nothing in the container is throwing away high ` +
          `frequencies, and a local decoder still measured a cliff of at least ${T.spectralDropDb} dB between two ` +
          `adjacent probe bands with effectively nothing above it. Uncompressed audio carrying the bandwidth of a ` +
          `much lower sample rate was upsampled into this container from something narrower.`,
      ),
      falsePositiveNote: say(
        `Every telephone recording, every archive transfer, every voice memo upsampled for an edit, and every file ` +
          `a producer resampled to match a session measures this way, and none of that says anything about how the ` +
          `sound was made. It is an observation about a resampling step and nothing more. ${STREAM_FAMILY_CAVEAT}`,
      ),
      detect: (a): readonly Evidence[] => {
        const r = reading(a);
        if (!r || !r.facts || !r.facts.lossless) return [];
        // The Nyquist fence, applied HERE as well as in the probe. A band above Nyquist is
        // not a measurement, and the cliff down to it is a property of the sample rate rather
        // than of the source: every file ever recorded at a lower rate has one. Fencing it in
        // one place only would leave a replayed artifact, captured before this fence existed,
        // firing the rule on exactly those files.
        const bands = usableBands(r.bands, r.facts.sampleRateHz);
        if (bands.length < 2) return [];
        const step = steepestStep(bands);
        if (!step || step.dropDb < T.spectralDropDb || step.upperDb > T.spectralUpperCeilingDb) return [];
        return [
          cite(
            r,
            `${a.source.locator}#highpass`,
            `${step.lowerDb} dBFS above ${step.lowerHz} Hz, ${step.upperDb} dBFS above ${step.upperHz} Hz: ` +
              `a drop of ${step.dropDb} dB, in a ${r.facts.sampleRateHz} Hz ${r.facts.codec} stream`,
          ),
        ];
      },
      fixtures: {
        positive: (base) => ({ artifact: withReading(base, UPSAMPLED_READING) }),
        mutated: (base) => ({ artifact: withReading(base, FULL_BAND_READING) }),
        extra: [
          {
            name: "the same cliff in a perceptually coded file, where it is the codec's lowpass",
            shouldFire: false,
            build: (base) => ({
              artifact: withReading(base, {
                ...UPSAMPLED_READING,
                facts: { ...UPSAMPLED_READING.facts!, codec: "mp3", lossless: false },
              }),
            }),
          },
        ],
      },
    },

    // ------------------------------------------------------------------- duration disagreement
    {
      id: "stream.declared-duration-disagrees-with-decoded",
      family: "stream-consistency",
      title: "Probabilistic: the container's declared length disagrees with what actually decoded",
      polarity: "signal",
      severity: "info",
      baseWeight: 0.7,
      maxHits: 2,
      requiresProbe: probe,
      phase: 1,
      since: SINCE,
      explanation: say(
        `The header states one duration and the decoder produced another, by more than ` +
          `${T.durationMismatchSec} s and more than ${Math.round(T.durationMismatchShare * 100)}% of the declared ` +
          `length. A recorder writes its header from the samples it just wrote, so the two agree. They come apart ` +
          `when a file is assembled, concatenated, truncated or written by a program that filled the header in ` +
          `before it knew the answer.`,
      ),
      falsePositiveNote: say(
        `Streaming muxers routinely write a placeholder duration, a growing file has a stale header by definition, ` +
          `and gapless-playback padding legitimately makes the two figures differ. This is the weakest line in the ` +
          `weakest family and it is weighted to match. ${STREAM_FAMILY_CAVEAT}`,
      ),
      detect: (a): readonly Evidence[] => {
        const r = reading(a);
        if (!r || !r.facts) return [];
        const d = durationDisagreement(r.facts);
        if (!d || d.absSec < T.durationMismatchSec || d.share < T.durationMismatchShare) return [];
        return [
          cite(
            r,
            `${a.source.locator}#duration`,
            `header declares ${r.facts.declaredDurationSec} s, the decoder produced ${r.facts.decodedDurationSec} s: ` +
              `a difference of ${d.absSec} s (${Math.round(d.share * 1000) / 10}%)`,
          ),
        ];
      },
      fixtures: {
        positive: (base) => ({ artifact: withReading(base, DURATION_MISMATCH_READING) }),
        mutated: (base) => ({ artifact: withReading(base, ROOM_TONE_READING) }),
      },
    },

    // ------------------------------------------------------------------------- the counter rule
    {
      id: "stream.room-tone-in-the-pauses",
      family: "counter-evidence",
      title: "The pauses carry room tone",
      polarity: "counter",
      counterScope: "global",
      severity: "info",
      baseWeight: -1.5,
      maxHits: 3,
      requiresProbe: probe,
      phase: 2,
      since: SINCE,
      explanation: say(
        `A local decoder measured pauses in this file and found their floor above ${T.roomToneFloorDb} dBFS. That ` +
          `residual is a room: air, a preamp, a building. It is the one measurement in this family that argues in ` +
          `the artifact's favour, so it is weighted harder than any of the signals above it and it bypasses the ` +
          `family caps.`,
      ),
      falsePositiveNote: say(
        `Room tone can be added to a file in one step, and several synthesis products offer exactly that as a ` +
          `feature, so this lowers the score and settles nothing. It also fires on any noisy file, including one ` +
          `that is noisy because it was badly transcoded. ${STREAM_FAMILY_CAVEAT}`,
      ),
      detect: (a): readonly Evidence[] => {
        const r = reading(a);
        if (!r || !r.levels || r.silences.length < 2) return [];
        if (r.levels.noiseFloorDb < T.roomToneFloorDb) return [];
        return [
          cite(
            r,
            `${a.source.locator}#astats`,
            `noise floor ${r.levels.noiseFloorDb} dBFS across ${r.silences.length} measured pauses, above the ` +
              `${T.roomToneFloorDb} dBFS threshold this rule uses`,
          ),
        ];
      },
      fixtures: {
        positive: (base) => ({ artifact: withReading(base, ROOM_TONE_READING) }),
        mutated: (base) => ({ artifact: withReading(base, CLEAN_FLOOR_READING) }),
      },
    },
  ];
}

/** `mm:ss.mmm`, for evidence a player can be scrubbed to. */
export function timecode(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  return `${String(m).padStart(2, "0")}:${s.toFixed(3).padStart(6, "0")}`;
}

/** Attach a reading to an artifact and recompute the probe row that describes it. */
export function withReading(base: AudioArtifact, stream: StreamReading): AudioArtifact {
  return { ...base, stream, probes: base.probes.map((p) => (p.id === "stream" ? streamProbeRow(stream) : p)) };
}

/**
 * The probe row for a reading.
 *
 * `expectsNonEmpty: false`, deliberately, and the reason is the same one `metadata` gives:
 * NO READING IS THE ORDINARY CASE. Listening is opt-in, most callers will not switch it on,
 * and a detector that treated a missing reading as a broken probe would abstain on almost
 * every file for a reason that is about our configuration rather than about the file. The
 * denominator still counts the measurements taken, so a report says how much was heard.
 */
export function streamProbeRow(stream: StreamReading): {
  readonly id: "stream";
  readonly ran: boolean;
  readonly denominator: number;
  readonly expectsNonEmpty: false;
  readonly weight: number;
  readonly note: string;
} {
  const measurements =
    (stream.facts ? 1 : 0) + (stream.levels ? 1 : 0) + stream.silences.length + stream.bands.length;
  return {
    id: "stream",
    ran: true,
    denominator: stream.state === "read" ? measurements : 0,
    expectsNonEmpty: false,
    weight: 2,
    note:
      "measurements a local decoder produced from the samples. Zero is the ordinary case: listening is opt-in and " +
      "runs no model, no network and no vendor API, so a build with no decoder installed reports nothing here " +
      "rather than reporting that it listened and heard nothing unusual.",
  };
}

// ---------------------------------------------------------------------------------------
// FIXTURE READINGS.
//
// These are CONSTRUCTED READINGS: tables of numbers written to exercise one threshold each.
// They are NOT recordings and nothing here is presented as one. A reading is a row of
// measurements, so writing one by hand fakes nothing — unlike writing a waveform and calling
// it a voice, which this package will not do. The numbers are chosen either side of the
// thresholds in `listen/reading.ts`, and the measured readings taken from real files live
// separately in `fixtures/measured.json` with their provenance attached.
// ---------------------------------------------------------------------------------------

const FIXTURE_TOOL = "constructed reading (no decoder was run)";

const baseFacts = {
  codec: "pcm_s24le",
  sampleRateHz: 48_000,
  channels: 1,
  channelLayout: "mono",
  bitRateBps: 1_152_000,
  bitrateMode: null,
  declaredDurationSec: 12,
  decodedDurationSec: 12,
  lossless: true,
  encoderTag: null,
  writerChain: [] as readonly string[],
};

const evenly = (count: number, length: number, jitter: number): readonly { startSec: number; endSec: number }[] =>
  Array.from({ length: count }, (_, i) => {
    const start = 1 + i * 2;
    const wobble = jitter === 0 ? 0 : ((i % 3) - 1) * jitter;
    return { startSec: start, endSec: Math.round((start + length + wobble) * 1000) / 1000 };
  });

const readingOf = (over: Partial<StreamReading>): StreamReading => ({
  state: "read",
  tool: FIXTURE_TOOL,
  commands: ["(constructed for this suite; see fixtures/measured.json for readings taken from real files)"],
  note: "A table of numbers we set down to exercise one threshold. It is not a recording of anybody and it is not presented as one.",
  facts: baseFacts,
  levels: { peakDb: -6, rmsDb: -22, noiseFloorDb: -60, noiseFloorIsDigitalZero: false, flatFactor: 0, zeroCrossingsRate: 0.1, sampleCount: 576_000 },
  silences: evenly(6, 0.5, 0.28),
  silenceThresholdDb: -50,
  bands: [],
  ...over,
});

/** A floor below any microphone's self-noise, with pauses to attribute it to. */
export const CLEAN_FLOOR_READING: StreamReading = readingOf({
  levels: { peakDb: -5, rmsDb: -24, noiseFloorDb: -84.2, noiseFloorIsDigitalZero: false, flatFactor: 0, zeroCrossingsRate: 0.1, sampleCount: 576_000 },
  silences: evenly(6, 0.5, 0.28),
});

/** The same file with a room in it. Mutation partner for the rule above, positive for the counter. */
export const ROOM_TONE_READING: StreamReading = readingOf({
  levels: { peakDb: -5, rmsDb: -24, noiseFloorDb: -48.7, noiseFloorIsDigitalZero: false, flatFactor: 0, zeroCrossingsRate: 0.1, sampleCount: 576_000 },
  silences: evenly(6, 0.5, 0.28),
});

/** Six pauses within a few per cent of each other. */
export const UNIFORM_GAPS_READING: StreamReading = readingOf({
  levels: { peakDb: -5, rmsDb: -24, noiseFloorDb: -62, noiseFloorIsDigitalZero: false, flatFactor: 0, zeroCrossingsRate: 0.1, sampleCount: 576_000 },
  silences: evenly(6, 0.42, 0.008),
});

/** Six pauses a person might leave. */
export const VARIED_GAPS_READING: StreamReading = readingOf({
  levels: { peakDb: -5, rmsDb: -24, noiseFloorDb: -62, noiseFloorIsDigitalZero: false, flatFactor: 0, zeroCrossingsRate: 0.1, sampleCount: 576_000 },
  silences: [
    { startSec: 1, endSec: 1.18 },
    { startSec: 3.4, endSec: 4.32 },
    { startSec: 6.1, endSec: 6.38 },
    { startSec: 8.9, endSec: 10.15 },
    { startSec: 12.2, endSec: 12.55 },
    { startSec: 15, endSec: 16.4 },
  ],
});

/** Uncompressed at 48 kHz, carrying the bandwidth of something much narrower. */
export const UPSAMPLED_READING: StreamReading = readingOf({
  bands: [
    { aboveHz: 4_000, meanDb: -38, peakDb: -14 },
    { aboveHz: 7_000, meanDb: -44, peakDb: -19 },
    { aboveHz: 11_000, meanDb: -96, peakDb: -71 },
    { aboveHz: 15_000, meanDb: -98, peakDb: -74 },
    { aboveHz: 19_000, meanDb: -99, peakDb: -76 },
  ],
});

/** The same container with energy all the way up. */
export const FULL_BAND_READING: StreamReading = readingOf({
  bands: [
    { aboveHz: 4_000, meanDb: -38, peakDb: -14 },
    { aboveHz: 7_000, meanDb: -44, peakDb: -19 },
    { aboveHz: 11_000, meanDb: -51, peakDb: -25 },
    { aboveHz: 15_000, meanDb: -58, peakDb: -31 },
    { aboveHz: 19_000, meanDb: -66, peakDb: -38 },
  ],
});

/** A header that disagrees with the samples behind it. */
export const DURATION_MISMATCH_READING: StreamReading = readingOf({
  facts: { ...baseFacts, declaredDurationSec: 12, decodedDurationSec: 9.4 },
});
