/**
 * The listening layer, under test with NO decoder, NO key and NO network.
 *
 * Every assertion in this file runs against readings held as data. Nothing here spawns a
 * subprocess, and that is the property being demonstrated as much as it is a convenience: the
 * parsers are exercised against captured decoder output held as strings, and the rules are
 * exercised against readings held as numbers, so the whole signal-reading half of this
 * detector is provable on a machine with nothing installed.
 *
 * The four things this file exists to hold down:
 *
 *  1. LISTENING IS OFF UNLESS ASKED, and a missing decoder is a reported state.
 *  2. THE EVIDENCE KIND DOWNGRADES WHEN A MEASUREMENT FIRES, in one direction only.
 *  3. THE GATE OUTRANKS THE MEASUREMENTS, exactly as it outranks the declarations.
 *  4. THE PARSERS ARE NOT VACUOUS. Each one is run against real decoder output and against a
 *     mutation of it, because a parser that returns null on everything passes any test that
 *     only checks it does not throw.
 */

import { describe, expect, it } from "vitest";
import {
  analyzeAudioArtifact,
  assertMayEnterCorpus,
  AUDIO_CONFIG,
  AUDIO_DEFAULT_WATERMARKS,
  AUDIO_RULES,
  AUDIO_STREAM_RULES,
  CLEAN_FLOOR_READING,
  DIGITAL_ZERO_FLOOR_DB,
  dispersion,
  durationDisagreement,
  ingestAudio,
  listenToAudio,
  LISTEN_ENV_VAR,
  listeningRequested,
  mayEnterCorpus,
  neutralAudio,
  NOT_ATTEMPTED,
  parseFacts,
  parseLevels,
  parseSilences,
  ROOM_TONE_READING,
  rulesForTranscript,
  spanLength,
  steepestStep,
  STREAM_THRESHOLDS,
  TRANSCRIPT_EXCLUDED_RULES,
  timecode,
  UNIFORM_GAPS_READING,
  UPSAMPLED_READING,
  usableBands,
  withReading,
} from "@slop/detectors-audio";
import type { Transcript } from "@slop/detectors-audio";
import { buildReport } from "@slop/core";
import { citableWatermarks, mediaClaimViolations, sameWriter, synthMp3, WATERMARK_ABSENCE_NOTE } from "@slop/provenance";

const input = { kind: "file", path: "/tmp/x.wav", mediaType: "audio/wav" } as const;
const score = (artifact: Parameters<typeof analyzeAudioArtifact>[0]) =>
  buildReport([analyzeAudioArtifact(artifact, input)], { config: AUDIO_CONFIG });

describe("listening is off unless it is asked for", () => {
  it("an ordinary ingest carries no reading and says so in a sentence", () => {
    const a = neutralAudio();
    expect(a.stream.state).toBe("not_attempted");
    expect(a.stream.commands).toEqual([]);
    expect(a.stream.note.length).toBeGreaterThan(80);
    expect(mediaClaimViolations(a.stream.note)).toEqual([]);
  });

  it("returns immediately, without touching the file system, when it is not enabled", async () => {
    // The path does not exist. A `listenToAudio` that tried anything at all would fail here
    // rather than return the not-attempted reading, which is what makes this an assertion
    // about the switch rather than about ffmpeg's error handling.
    const reading = await listenToAudio("/this/path/does/not/exist.wav", { enabled: false });
    expect(reading).toBe(NOT_ATTEMPTED);
  });

  it("the switch is one exact value, not a truthy-ish family", () => {
    expect(listeningRequested({ [LISTEN_ENV_VAR]: "1" })).toBe(true);
    for (const value of ["0", "true", "yes", "on", "", " 1", undefined]) {
      expect(listeningRequested({ [LISTEN_ENV_VAR]: value }), `"${String(value)}" enabled listening`).toBe(false);
    }
    expect(listeningRequested({})).toBe(false);
  });

  it("no measurement rule fires without a reading, so a decoder-less host produces silence", () => {
    const result = analyzeAudioArtifact(neutralAudio(), input);
    expect(result.findings.filter((f) => f.ruleId.startsWith("stream."))).toEqual([]);
    // ...and every stream rule was still EVALUATED. Silence has to come from the rules
    // deciding not to fire, never from the rules being skipped, or "we listened and heard
    // nothing" and "we never listened" would print identically.
    for (const rule of AUDIO_STREAM_RULES) expect(result.rulesEvaluated).toContain(rule.id);
  });

  it("a scan with no reading still clears the coverage floor", () => {
    // If the stream probe were weighted so heavily that a listen-less scan fell below
    // `minCoverage`, every caller without ffmpeg would be abstained on for a reason about
    // our configuration rather than about their file.
    const result = analyzeAudioArtifact(neutralAudio(), input);
    expect(result.coverage.ratio).toBeGreaterThan(AUDIO_CONFIG.minCoverage);
  });
});

describe("the evidence kind follows what actually fired", () => {
  it("a declaration-only result stays provenance", () => {
    const declared = AUDIO_RULES.find((r) => r.id === "prov.encoder-declares-generative-tool")!.fixtures.positive(
      neutralAudio(),
    ).artifact;
    const result = analyzeAudioArtifact(declared, input);
    expect(result.findings.length).toBeGreaterThan(0);
    expect(result.evidenceKind).toBe("provenance");
  });

  it("one measurement downgrades the WHOLE result to probabilistic", () => {
    const result = analyzeAudioArtifact(withReading(neutralAudio(), CLEAN_FLOOR_READING), input);
    expect(result.findings.some((f) => f.ruleId.startsWith("stream."))).toBe(true);
    expect(result.evidenceKind).toBe("probabilistic");
  });

  it("a measurement alongside a declaration still downgrades, never upgrades", () => {
    const declared = AUDIO_RULES.find((r) => r.id === "prov.encoder-declares-generative-tool")!.fixtures.positive(
      neutralAudio(),
    ).artifact;
    const both = withReading(declared, CLEAN_FLOOR_READING);
    const result = analyzeAudioArtifact(both, input);
    expect(result.findings.some((f) => f.ruleId.startsWith("prov."))).toBe(true);
    expect(result.findings.some((f) => f.ruleId.startsWith("stream."))).toBe(true);
    expect(result.evidenceKind).toBe("probabilistic");
  });

  it("is never deterministic, whatever fired", () => {
    for (const artifact of [
      neutralAudio(),
      withReading(neutralAudio(), CLEAN_FLOOR_READING),
      withReading(neutralAudio(), ROOM_TONE_READING),
      withReading(neutralAudio(), UPSAMPLED_READING),
    ]) {
      expect(analyzeAudioArtifact(artifact, input).evidenceKind).not.toBe("deterministic");
    }
  });

  it("the downgrade announces itself in a warning that names the rules", () => {
    const result = analyzeAudioArtifact(withReading(neutralAudio(), CLEAN_FLOOR_READING), input);
    const warning = (result.warnings ?? []).find((w) => w.includes("MEASUREMENT"));
    expect(warning, "the downgrade happened silently").toBeTruthy();
    expect(warning).toContain("stream.silence-has-no-room-in-it");
    expect(mediaClaimViolations(warning!)).toEqual([]);
  });
});

describe("measurements cannot outrank the family cap or the gate", () => {
  it("a measurement-only result cannot leave the lowest band", () => {
    // `stream-consistency` is capped at 12% of the scale and every rule in it is weighted to
    // stay under that. The assertion is on the SCORE rather than on the cap constant,
    // because the cap is only worth having if it survives every rule in the family firing at
    // once, which is what this artifact does.
    const everything = withReading(neutralAudio(), {
      ...CLEAN_FLOOR_READING,
      silences: UNIFORM_GAPS_READING.silences,
      bands: UPSAMPLED_READING.bands,
      facts: { ...UPSAMPLED_READING.facts!, declaredDurationSec: 12, decodedDurationSec: 9.4 },
    });
    const report = score(everything);
    const streamLines = report.receipt.lines.filter((l) => l.ruleId.startsWith("stream."));
    expect(streamLines.length, "not enough measurement rules fired to test the cap").toBeGreaterThanOrEqual(3);
    expect(report.score ?? 0).toBeLessThan(40);
  });

  it("the re-encoding gate suppresses measurements exactly as it suppresses declarations", () => {
    // A real two-encoder conflict, with a full reading attached. The gate runs first, so
    // NOTHING is evaluated: not the declarations, not the measurements.
    const laundered = ingestAudio(synthMp3({ id3: { TSSE: "ElevenLabs" }, lame: "LAME3.100" }), {
      locator: "test://laundered.mp3",
      mediaType: "audio/mpeg",
      stream: CLEAN_FLOOR_READING,
    });
    expect(laundered.laundering.laundered).toBe(true);
    const result = analyzeAudioArtifact(laundered, input);
    expect(result.rulesEvaluated).toEqual([]);
    expect(result.findings).toEqual([]);
    expect(result.abstention?.map((a) => a.code)).toContain("artifact_re_encoded");
    expect(score(laundered).score).toBeNull();
  });
});

describe("the thresholds are the boundary they claim to be", () => {
  it("each rule fires on one side and not the other, with the mutation one step away", () => {
    // The meta suite already runs positive/mutated for every rule. This adds the thing that
    // check cannot see: that the two fixtures differ in the MEASUREMENT the rule names, and
    // that the difference straddles the published threshold rather than being a big gap
    // chosen to make the test pass.
    expect(CLEAN_FLOOR_READING.levels!.noiseFloorDb).toBeLessThan(STREAM_THRESHOLDS.cleanFloorDb);
    expect(ROOM_TONE_READING.levels!.noiseFloorDb).toBeGreaterThan(STREAM_THRESHOLDS.cleanFloorDb);
    expect(ROOM_TONE_READING.levels!.noiseFloorDb).toBeGreaterThan(STREAM_THRESHOLDS.roomToneFloorDb);

    const uniform = dispersion(UNIFORM_GAPS_READING.silences.map(spanLength))!;
    expect(uniform.coefficientOfVariation).toBeLessThan(STREAM_THRESHOLDS.uniformGapCv);
    expect(UNIFORM_GAPS_READING.silences.length).toBeGreaterThanOrEqual(STREAM_THRESHOLDS.minSilentSpans);

    const step = steepestStep(UPSAMPLED_READING.bands)!;
    expect(step.dropDb).toBeGreaterThanOrEqual(STREAM_THRESHOLDS.spectralDropDb);
    expect(step.upperDb).toBeLessThan(STREAM_THRESHOLDS.spectralUpperCeilingDb);
  });

  it("the spectral rule refuses a lossy file, because the ceiling would be the codec's", () => {
    const lossy = withReading(neutralAudio(), {
      ...UPSAMPLED_READING,
      facts: { ...UPSAMPLED_READING.facts!, codec: "mp3", lossless: false },
    });
    const fired = analyzeAudioArtifact(lossy, input).findings.map((f) => f.ruleId);
    expect(fired).not.toContain("stream.spectral-ceiling-below-the-container");
  });

  it("ignores probe bands above Nyquist, and the cliff down to them", () => {
    /**
     * Regression test for a live false positive found on a real 22.05 kHz file.
     *
     * A highpass at 15 kHz on a 22.05 kHz stream has no passband, so the filter returned a
     * number that looked like a lot of energy where there is none. Worse, the genuine drop
     * from 7 kHz to 11 kHz in such a file means NOTHING: a 22.05 kHz stream cannot carry
     * content above 11.025 kHz, so reading that cliff as upsampling would have flagged every
     * file ever recorded at a lower rate.
     */
    const bands = [
      { aboveHz: 4_000, meanDb: -42.5, peakDb: -22.6 },
      { aboveHz: 7_000, meanDb: -50.2, peakDb: -29.9 },
      { aboveHz: 11_000, meanDb: -90.3, peakDb: -69.5 },
      { aboveHz: 15_000, meanDb: -24.5, peakDb: -9.2 },
    ];
    expect(usableBands(bands, 22_050).map((b) => b.aboveHz)).toEqual([4_000, 7_000]);
    expect(usableBands(bands, 48_000).map((b) => b.aboveHz)).toEqual([4_000, 7_000, 11_000, 15_000]);

    const lowRate = withReading(neutralAudio(), {
      ...UPSAMPLED_READING,
      facts: { ...UPSAMPLED_READING.facts!, sampleRateHz: 22_050 },
      bands,
    });
    expect(analyzeAudioArtifact(lowRate, input).findings.map((f) => f.ruleId)).not.toContain(
      "stream.spectral-ceiling-below-the-container",
    );

    // The same numbers in a 48 kHz container, where the cliff is genuinely below Nyquist,
    // still fire. Without this half, the fence above could be doing its job by disabling the
    // rule entirely and the test would not know.
    const highRate = withReading(neutralAudio(), UPSAMPLED_READING);
    expect(analyzeAudioArtifact(highRate, input).findings.map((f) => f.ruleId)).toContain(
      "stream.spectral-ceiling-below-the-container",
    );
  });

  it("a dispersion of one value is null rather than zero", () => {
    // A coefficient of variation over a single pause is 0, which would read as perfectly
    // uniform and fire the rule on any file with exactly one pause in it.
    expect(dispersion([0.5])).toBeNull();
    expect(dispersion([])).toBeNull();
    expect(dispersion([0, 0])).toBeNull();
  });

  it("a duration disagreement needs both an absolute and a relative floor", () => {
    // 0.3 s out of 600 s is a rounding difference in a long file, not a disagreement.
    const long = durationDisagreement({ ...UPSAMPLED_READING.facts!, declaredDurationSec: 600, decodedDurationSec: 599.7 })!;
    expect(long.absSec).toBeGreaterThan(STREAM_THRESHOLDS.durationMismatchSec);
    expect(long.share).toBeLessThan(STREAM_THRESHOLDS.durationMismatchShare);
  });

  it("every measurement finding cites a locator and the command behind it", () => {
    const result = analyzeAudioArtifact(withReading(neutralAudio(), CLEAN_FLOOR_READING), input);
    const measured = result.findings.filter((f) => f.ruleId.startsWith("stream."));
    expect(measured.length).toBeGreaterThan(0);
    for (const finding of measured) {
      for (const e of finding.evidence) {
        expect(e.locator, `${finding.ruleId} cited nothing`).toBeTruthy();
        expect(e.observed, `${finding.ruleId} observed nothing`).toBeTruthy();
        expect(e.excerpt, `${finding.ruleId} did not carry the command its numbers came from`).toBeTruthy();
      }
    }
  });

  it("timecodes are scrubbable", () => {
    expect(timecode(0)).toBe("00:00.000");
    expect(timecode(9.5)).toBe("00:09.500");
    expect(timecode(75.25)).toBe("01:15.250");
  });
});

describe("the decoder-output parsers are not vacuous", () => {
  /** Captured from a real ffprobe run, trimmed. Held as a string so no decoder is spawned. */
  const FFPROBE = [
    "[STREAM]",
    "codec_name=pcm_s24le",
    "sample_rate=48000",
    "channels=1",
    "channel_layout=mono",
    "bit_rate=1152000",
    "duration=12.000000",
    "[/STREAM]",
    "[FORMAT]",
    "duration=12.500000",
    "size=1728044",
    "TAG:encoder=Lavf60.16.101",
    "[/FORMAT]",
  ].join("\n");

  const FFMPEG = [
    "[Parsed_silencedetect_1 @ 0x1] silence_start: 1.015442",
    "[Parsed_silencedetect_1 @ 0x1] silence_end: 1.198481 | silence_duration: 0.183039",
    "[Parsed_silencedetect_1 @ 0x1] silence_start: 2.796077",
    "[Parsed_silencedetect_1 @ 0x1] silence_end: 2.950045 | silence_duration: 0.153968",
    "[Parsed_silencedetect_1 @ 0x1] silence_start: 13.552880",
    "[Parsed_astats_0 @ 0x2] Overall",
    "[Parsed_astats_0 @ 0x2] Peak level dB: -4.819340",
    "[Parsed_astats_0 @ 0x2] RMS level dB: -24.872344",
    "[Parsed_astats_0 @ 0x2] Noise floor dB: -78.814411",
    "[Parsed_astats_0 @ 0x2] Flat factor: 0.000000",
    "[Parsed_astats_0 @ 0x2] Zero crossings rate: 0.097356",
    "[Parsed_astats_0 @ 0x2] Number of samples: 612352",
  ].join("\n");

  it("reads the stream facts, and the two durations separately", () => {
    const facts = parseFacts(FFPROBE)!;
    expect(facts.codec).toBe("pcm_s24le");
    expect(facts.sampleRateHz).toBe(48_000);
    expect(facts.channels).toBe(1);
    expect(facts.channelLayout).toBe("mono");
    expect(facts.lossless).toBe(true);
    expect(facts.encoderTag).toBe("Lavf60.16.101");
    // The point of reading them separately: collapsing to whichever came last would make
    // the duration-disagreement rule unable to fire.
    expect(facts.decodedDurationSec).toBe(12);
    expect(facts.declaredDurationSec).toBe(12.5);
  });

  it("returns null on output with no audio stream in it, rather than a hollow record", () => {
    expect(parseFacts("[FORMAT]\nduration=12.0\n[/FORMAT]")).toBeNull();
    expect(parseFacts("")).toBeNull();
    // A codec with no sample rate is a partial read and must not become a reading, or a
    // rule downstream would compute a bandwidth against a sample rate of zero.
    expect(parseFacts("codec_name=mp3\nchannels=2")).toBeNull();
  });

  it("knows a lossy codec from a lossless one", () => {
    expect(parseFacts(FFPROBE.replace("pcm_s24le", "flac"))!.lossless).toBe(true);
    expect(parseFacts(FFPROBE.replace("pcm_s24le", "mp3"))!.lossless).toBe(false);
    expect(parseFacts(FFPROBE.replace("pcm_s24le", "aac"))!.lossless).toBe(false);
    expect(parseFacts(FFPROBE.replace("pcm_s24le", "opus"))!.lossless).toBe(false);
  });

  it("reads the overall level block rather than a per-channel one", () => {
    const levels = parseLevels(FFMPEG)!;
    expect(levels.noiseFloorDb).toBeCloseTo(-78.814, 2);
    expect(levels.peakDb).toBeCloseTo(-4.819, 2);
    expect(levels.sampleCount).toBe(612_352);
    expect(parseLevels("nothing useful here")).toBeNull();
  });

  it("reads a noise floor of -inf, which is what real digital silence prints as", () => {
    /**
     * Regression test for a silent drop found on the FIRST real file this was pointed at.
     *
     * `Noise floor dB: -inf` is what astats prints when the quiet passages hold literally
     * zero-valued samples, which is the most digitally clean a file can be and therefore the
     * single most interesting case for the rule that reads it. The first regex could not
     * express `-inf`, so `parseLevels` returned null and the WHOLE level record vanished.
     * Nothing crashed and nothing warned: the report simply had no levels in it.
     */
    const withInf = FFMPEG.replace("Noise floor dB: -78.814411", "Noise floor dB: -inf");
    const levels = parseLevels(withInf)!;
    expect(levels, "the -inf case dropped the whole level record").not.toBeNull();
    expect(levels.noiseFloorDb).toBe(DIGITAL_ZERO_FLOOR_DB);
    expect(levels.noiseFloorIsDigitalZero).toBe(true);
    // And the sentinel is a real number, so the reading survives the JSON round trip a
    // replayed artifact goes through. `-Infinity` would come back as null.
    expect(JSON.parse(JSON.stringify(levels)).noiseFloorDb).toBe(DIGITAL_ZERO_FLOOR_DB);
    expect(parseLevels(FFMPEG)!.noiseFloorIsDigitalZero).toBe(false);
  });

  it("leaves a level the decoder did not print as null rather than as zero", () => {
    // ffmpeg prints the flat factor per channel and not always in the overall block. A
    // default of 0 would look measured; null says it was not.
    const levels = parseLevels(FFMPEG.replace("Flat factor: 0.000000", ""))!;
    expect(levels.flatFactor).toBeNull();
    expect(parseLevels(FFMPEG)!.flatFactor).toBe(0);
  });

  it("pairs silence starts with ends and drops an unpaired trailing start", () => {
    const spans = parseSilences(FFMPEG);
    expect(spans).toHaveLength(2);
    expect(spans[0]).toEqual({ startSec: 1.015, endSec: 1.198 });
    // The third `silence_start` at 13.55 has no `silence_end`, because the file ended mid
    // silence. Emitting it with an invented end would put a fabricated pause length into a
    // distribution the uniformity rule then measures.
    expect(spans.every((s) => s.endSec > s.startSec)).toBe(true);
    expect(parseSilences("")).toEqual([]);
  });
});

describe("one encoder named twice is not two encoders", () => {
  /**
   * The regression test for a live false positive, found by running the parser over real
   * files rather than over fixtures.
   *
   * The Xing/Info writer field is nine bytes. A library whose name is longer appears in full
   * in the ID3 tag and truncated in the frame, so an inequality test read one writer as two
   * and reported `encoder_chain_conflict` — the heaviest indicator the gate has.
   */
  it("treats a nine-byte truncation as the same writer", () => {
    expect(sameWriter("Lavf60.16.101", "Lavf")).toBe(true);
    expect(sameWriter("Lavf", "Lavf60.16.101")).toBe(true);
    expect(sameWriter("LAME3.100", "LAME3.100")).toBe(true);
    expect(sameWriter("lavf60.16.101", "LAVF")).toBe(true);
  });

  it("still calls two different writers a conflict", () => {
    expect(sameWriter("ElevenLabs", "LAME3.100")).toBe(false);
    expect(sameWriter("LAME3.100", "Lavf58")).toBe(false);
    // A one- or two-character overlap is a coincidence, not a truncation.
    expect(sameWriter("LA", "LAME3.100")).toBe(false);
    expect(sameWriter("", "LAME3.100")).toBe(false);
  });

  it("and the gate still closes on a real two-encoder file", () => {
    const real = ingestAudio(synthMp3({ id3: { TSSE: "ElevenLabs" }, lame: "LAME3.100" }), {
      locator: "test://two-encoders.mp3",
      mediaType: "audio/mpeg",
    });
    expect(real.laundering.codes).toContain("encoder_chain_conflict");
  });
});

describe("audio watermarks: detect if present, never infer from absence", () => {
  it("the audio schemes are listed, unchecked, with a reason each", () => {
    const schemes = AUDIO_DEFAULT_WATERMARKS.map((w) => w.scheme);
    expect(schemes).toContain("audioseal");
    expect(schemes).toContain("synthid-audio");
    for (const probe of AUDIO_DEFAULT_WATERMARKS) {
      expect(probe.outcome).toBe("not_checked");
      expect(probe.note.length, `${probe.scheme} gave no reason`).toBeGreaterThan(60);
      expect(mediaClaimViolations(probe.note), probe.note).toEqual([]);
    }
  });

  it("a scheme checked and NOT found produces no finding at all", () => {
    const notFound = AUDIO_DEFAULT_WATERMARKS.map((w) => ({ ...w, outcome: "not_detected" as const }));
    expect(citableWatermarks(notFound)).toEqual([]);
    const artifact = ingestAudio(new Uint8Array(neutralAudio().source.byteLength), {
      locator: "test://x.wav",
      mediaType: "audio/wav",
      watermarks: notFound,
    });
    const fired = analyzeAudioArtifact(artifact, input).findings.map((f) => f.ruleId);
    expect(fired).not.toContain("prov.watermark-detected");
    // ...and it is not counter-evidence either. `not_detected` produces NOTHING, in either
    // direction, and this is the assertion rather than a comment.
    expect(fired.filter((id) => id.includes("watermark"))).toEqual([]);
  });

  it("the absence note says why an audio mark is worth even less than an image one", () => {
    expect(WATERMARK_ABSENCE_NOTE).toMatch(/audio/i);
    expect(mediaClaimViolations(WATERMARK_ABSENCE_NOTE)).toEqual([]);
  });

  it("a positive result still needs a named detector and a locator", () => {
    expect(citableWatermarks([{ scheme: "audioseal", outcome: "present", detector: null, locator: "x", note: "" }])).toEqual([]);
    expect(citableWatermarks([{ scheme: "audioseal", outcome: "present", detector: "d", locator: null, note: "" }])).toEqual([]);
  });
});

describe("the transcription terms line is enforced in a function, not remembered", () => {
  const vendor: Transcript = {
    source: "vendor-api",
    engine: "a speech-to-text service",
    text: "hello",
    coveredSeconds: 1,
    totalSeconds: 1,
  };
  const local: Transcript = { ...vendor, source: "local-model", engine: "whisper.cpp" };
  const user: Transcript = { ...vendor, source: "user-supplied", engine: "supplied with the file" };

  it("vendor output may not enter a corpus, a baseline or a threshold", () => {
    expect(mayEnterCorpus(vendor)).toBe(false);
    expect(() => assertMayEnterCorpus(vendor)).toThrow(/develop, test or improve/i);
  });

  it("a local model and a user's own transcript may", () => {
    expect(mayEnterCorpus(local)).toBe(true);
    expect(mayEnterCorpus(user)).toBe(true);
    expect(assertMayEnterCorpus(local)).toBe(local);
  });

  it("the permission is a fact about provenance, not a flag a caller can set", () => {
    // There is no field on the type that overrides this, and that is the design: a flag is a
    // thing somebody sets wrong once and nobody notices.
    expect(Object.keys(vendor)).not.toContain("mayTrain");
    expect(mayEnterCorpus({ ...vendor, engine: "definitely fine, honest" })).toBe(false);
  });

  it("punctuation-counting rules are excluded from a transcript outright", () => {
    // An em dash is not a sound. Every dash in a transcript was put there by the
    // transcriber, so a rule that counts them measures the transcriber.
    expect(TRANSCRIPT_EXCLUDED_RULES).toContain("copy.em-dash-density");
    const allowed = rulesForTranscript(["copy.slop-lexicon", "copy.em-dash-density"]);
    expect(allowed).toEqual(["copy.slop-lexicon"]);
  });
});
