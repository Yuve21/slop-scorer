import { describe, expect, it } from "vitest";
import {
  analyzeAudioArtifact,
  AUDIO_CONFIG,
  AUDIO_CORPUS,
  AUDIO_CORPUS_REFUSAL,
  AUDIO_DEFAULT_WATERMARKS,
  AUDIO_MEASUREMENT_CAVEAT,
  AUDIO_OUT_OF_SCOPE,
  AUDIO_PROBE_WEIGHTS,
  AUDIO_RULE_DESCRIPTORS,
  AUDIO_RULES,
  AUDIO_SCOPE_STATEMENT,
  audioDetector,
  CLEAN_FLOOR_READING,
  LOSSY_BANDS_NOTE,
  neutralAudio,
  NO_TRANSCRIPT,
  NOT_ATTEMPTED,
  STREAM_FAMILY_CAVEAT,
  TRANSCRIPT_CAVEAT,
  VENDOR_TRANSCRIPT_REFUSAL,
  withReading,
} from "@slop/detectors-audio";
import type { AudioArtifact, AudioProbeId, AudioRule } from "@slop/detectors-audio";
import { buildReport } from "@slop/core";
import type { DetectorResult } from "@slop/core";
import { mediaClaimViolations } from "@slop/provenance";
import {
  expectDescriptorsAreComplete,
  expectNeutralSilence,
  expectProbeRegistryIsHonest,
  expectRuleIsAlive,
  expectStaleProbeFailsLoudly,
  zeroed,
} from "../../core/test/meta.js";
import type { CorpusUnderTest } from "../../core/test/meta.js";

const input = { kind: "file", path: "/tmp/x.wav", mediaType: "audio/wav" } as const;

const corpus: CorpusUnderTest<AudioArtifact, AudioProbeId> = {
  name: "audio corpus",
  rules: AUDIO_RULES,
  neutral: () => neutralAudio(),
  probeIds: Object.keys(AUDIO_PROBE_WEIGHTS) as AudioProbeId[],
  analyze: (artifact, rules): DetectorResult =>
    analyzeAudioArtifact(artifact, input, { ...(rules ? { rules: rules as readonly AudioRule[] } : {}) }),
  zeroProbe: (artifact, probe) => ({ ...artifact, probes: zeroed(artifact.probes, probe) }),
};

describe("the audio corpus is honest about itself", () => {
  it("the neutral untagged PCM recording fires nothing at all", () => expectNeutralSilence(corpus));
  it("every declared probe is read by at least one rule", () => expectProbeRegistryIsHonest(corpus));
  it("every rule ships an explanation, a rebuttal and a version", () => expectDescriptorsAreComplete(corpus));

  it("the published descriptors match the live rules exactly", () => {
    expect(AUDIO_RULE_DESCRIPTORS.map((r) => r.id).sort()).toEqual(AUDIO_RULES.map((r) => r.id).sort());
    expect(audioDetector.rules.length).toBe(AUDIO_RULES.length);
  });

  it("declares provenance evidence, and a file nobody listened to stays provenance", () => {
    expect(audioDetector.evidenceKind).toBe("provenance");
    // The neutral artifact carries no reading, so no measurement rule can fire and the
    // result keeps the stronger, declaration-shaped evidence kind. The downgrade path is
    // proved in stream.test.ts, in both directions.
    expect(analyzeAudioArtifact(neutralAudio(), input).evidenceKind).toBe("provenance");
    expect(AUDIO_RULES.filter((r) => r.family === "stream-consistency").length).toBeGreaterThan(0);
  });

  it("contains no rule that characterises a speaker or names a generator", () => {
    /**
     * The refusal that survived the arrival of the listening layer, narrowed to what it
     * always actually meant.
     *
     * The old version of this pattern banned "waveform" and "fft" alongside "speaker" and
     * "embedding", which lumped a noise floor in with a voiceprint. The rules now measure
     * the file, so the ban is on the statistics whose subject is a PERSON or a MODEL:
     * spectrograms, cepstral features, formants, embeddings, similarity, classifiers,
     * logits. Those are the reads that collapse under a re-encode and the ones that would
     * license the sentence `scope.ts` refuses.
     *
     * `spectral` is deliberately NOT in the list and `spectro` is: one rule measures energy
     * above a set of frequencies with `highpass`, which is a bandwidth measurement, and a
     * pattern that could not tell those apart would have banned the honest one too.
     *
     * THERE IS NO TRAILING WORD BOUNDARY, and that is the whole reason the mutation cases
     * below exist. The first version of this pattern ended in `\b` and could not match
     * `speakerEmbedding`, because camelCase puts no boundary after "speaker": the ban would
     * have passed a voiceprint written in the house naming convention. Same silent-pattern
     * failure as the `[a-z_]+` column check this repository's meta suite was built around.
     */
    const banned = /\b(spectro|mfcc|cepstr|formant|embedding|voiceprint|speaker|similarit|classif|logits|softmax)/i;
    for (const rule of AUDIO_RULES) {
      expect(banned.test(rule.detect.toString()), `${rule.id} characterises a speaker`).toBe(false);
      expect(banned.test(rule.explanation), `${rule.id}'s explanation characterises a speaker`).toBe(false);
    }
    // Mutation check on the pattern itself. A pattern that can no longer express the thing
    // it hunts fails silently, which is the exact failure this repository is built around.
    for (const bad of [
      "return speakerEmbedding(a) > 0.9;",
      "const mfcc = cepstralCoefficients(a);",
      "classifier.logits",
      "formantDrift(a)",
    ]) {
      expect(banned.test(bad), `the ban pattern does not match "${bad}", so it is not guarding anything`).toBe(true);
    }
  });
});

describe.each(AUDIO_RULES.map((r) => [r.id, r] as const))("%s", (_id, rule) => {
  it("fires on its positive fixture, dies on its mutation, and cites something followable", () =>
    expectRuleIsAlive(corpus, rule));
  it("disappears loudly when the probe it depends on collects nothing", () =>
    expectStaleProbeFailsLoudly(corpus, rule));
});

describe("the voice-cloning claim is unsayable, not merely unsaid", () => {
  /**
   * The permanent tripwire for this modality.
   *
   * Voice cloning is contractually closed to the reproduction side, so a claim that a
   * recording is a copy of somebody's voice could not be substantiated even in principle.
   * It is also the single most defamatory sentence this product could form and the one with
   * a criminal tool-liability statute attached in at least one state. So the test is not
   * "we did not write it": it is that the guard REJECTS it if anyone ever does.
   */
  const attempts = [
    "This is a cloned voice.",
    "A voice clone of the speaker was detected.",
    "The recording sounds like the person named in the filename.",
    "This is the voice of a public figure.",
    "The speaker is impersonating someone.",
  ];

  it.each(attempts)("rejects: %s", (sentence) => {
    expect(mediaClaimViolations(sentence).length).toBeGreaterThan(0);
  });

  it("every string this package can emit passes the guard", () => {
    // EVERY new sentence the listening layer added is in here, and that is the point of the
    // list rather than a detail of it. The guard is only worth having if the surface it
    // covers grows whenever the package's vocabulary does, so the reading notes, the
    // measurement caveats, the corpus refusal, the transcription terms strings and the
    // findings a measurement rule actually emits are all enumerated.
    const listened = analyzeAudioArtifact(withReading(neutralAudio(), CLEAN_FLOOR_READING), input);
    const strings = [
      AUDIO_SCOPE_STATEMENT,
      AUDIO_MEASUREMENT_CAVEAT,
      AUDIO_CORPUS_REFUSAL,
      STREAM_FAMILY_CAVEAT,
      LOSSY_BANDS_NOTE,
      NOT_ATTEMPTED.note,
      NO_TRANSCRIPT.kind === "not_available" ? NO_TRANSCRIPT.reason : "",
      VENDOR_TRANSCRIPT_REFUSAL,
      TRANSCRIPT_CAVEAT,
      CLEAN_FLOOR_READING.note,
      ...AUDIO_DEFAULT_WATERMARKS.map((w) => w.note),
      ...AUDIO_CORPUS.map((c) => c.provenance),
      ...AUDIO_OUT_OF_SCOPE,
      ...AUDIO_RULES.flatMap((r) => [r.title, r.explanation, r.falsePositiveNote, r.prevention ?? ""]),
      ...analyzeAudioArtifact(neutralAudio(), input).warnings ?? [],
      ...(analyzeAudioArtifact(neutralAudio(), input).abstention ?? []).map((a) => a.detail),
      ...(listened.warnings ?? []),
      ...listened.findings.flatMap((f) => [f.title, f.explanation, ...f.evidence.map((e) => e.observed)]),
    ];
    expect(strings.length).toBeGreaterThan(60);
    expect(
      listened.findings.some((f) => f.ruleId.startsWith("stream.")),
      "the listened-to case fired no measurement rule, so this check covers none of the new sentences",
    ).toBe(true);
    for (const s of strings) expect(mediaClaimViolations(s), s).toEqual([]);
  });

  it("the scope statement says what the modality cannot do, in words", () => {
    expect(AUDIO_SCOPE_STATEMENT).toMatch(/does not analyse the sound/i);
    expect(AUDIO_SCOPE_STATEMENT).toMatch(/no way to identify a speaker/i);
    expect(AUDIO_OUT_OF_SCOPE.length).toBeGreaterThanOrEqual(4);
  });

  it("states no cost figure anywhere in the package's own strings", () => {
    // A price is a substantiation-bearing claim held at the moment it is made. The
    // reproduction pipeline measures it per run; nothing here hardcodes one.
    for (const s of [AUDIO_SCOPE_STATEMENT, ...AUDIO_OUT_OF_SCOPE]) {
      expect(s, s).not.toMatch(/\$\s*\d|\d+\s*cents?/i);
    }
  });
});

describe("an audio file whose writer field names a synthesis service", () => {
  const declared = AUDIO_RULES.find((r) => r.id === "prov.encoder-declares-generative-tool")!.fixtures.positive(
    neutralAudio(),
  ).artifact;

  it("is assessed, cites the chunk, and the receipt reconciles", () => {
    const report = buildReport([analyzeAudioArtifact(declared, input)], { config: AUDIO_CONFIG });
    expect(report.status).toBe("assessed");
    const line = report.receipt.lines.find((l) => l.ruleId === "prov.encoder-declares-generative-tool");
    expect(line?.evidence[0]?.locator).toBeTruthy();
    const sum = report.receipt.lines.reduce((a, l) => a + l.points, 0);
    expect(report.receipt.priorPoints + sum).toBe(report.receipt.computedScore);
  });
});
