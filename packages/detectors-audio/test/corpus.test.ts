import { describe, expect, it } from "vitest";
import {
  analyzeAudioArtifact,
  AUDIO_CONFIG,
  AUDIO_OUT_OF_SCOPE,
  AUDIO_PROBE_WEIGHTS,
  AUDIO_RULE_DESCRIPTORS,
  AUDIO_RULES,
  AUDIO_SCOPE_STATEMENT,
  audioDetector,
  neutralAudio,
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

  it("declares provenance evidence and has no probabilistic rule at all", () => {
    expect(audioDetector.evidenceKind).toBe("provenance");
    expect(analyzeAudioArtifact(neutralAudio(), input).evidenceKind).toBe("provenance");
    expect(AUDIO_RULES.filter((r) => r.family === "stream-consistency")).toEqual([]);
  });

  it("contains no rule that reads the signal", () => {
    const banned = /\b(spectro|mel|mfcc|waveform|fft|formant|embedding|speaker|similarity|classif|logits)\b/i;
    for (const rule of AUDIO_RULES) {
      expect(banned.test(rule.detect.toString()), `${rule.id} reads the signal`).toBe(false);
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
    const strings = [
      AUDIO_SCOPE_STATEMENT,
      ...AUDIO_OUT_OF_SCOPE,
      ...AUDIO_RULES.flatMap((r) => [r.title, r.explanation, r.falsePositiveNote, r.prevention ?? ""]),
      ...analyzeAudioArtifact(neutralAudio(), input).warnings ?? [],
      ...(analyzeAudioArtifact(neutralAudio(), input).abstention ?? []).map((a) => a.detail),
    ];
    expect(strings.length).toBeGreaterThan(10);
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
