import { MEDIA_CORPUS_VERSION, provenanceRules } from "@slop/provenance";
import type { MediaProbeId, MediaRule } from "@slop/provenance";
import type { RuleDescriptor } from "@slop/core";
import { audioVariant } from "./artifact.js";
import type { AudioArtifact, AudioProbeId } from "./artifact.js";
import { streamRules } from "./stream.js";

export const AUDIO_CORPUS_VERSION = "audio-corpus-2026.09";

export type AudioRule = MediaRule<AudioArtifact, AudioProbeId>;

const PROBES: Readonly<Record<MediaProbeId, AudioProbeId>> = {
  container: "container",
  metadata: "metadata",
  "content-credential": "content-credential",
  watermark: "watermark",
  laundering: "laundering",
};

export const STREAM_PROBE = "stream" as const satisfies AudioProbeId;

export const AUDIO_PROBE_IDS: readonly AudioProbeId[] = [...Object.values(PROBES), STREAM_PROBE];

/** The shared provenance corpus, minus the one rule a RIFF file cannot express. */
export const AUDIO_PROVENANCE_RULES: readonly AudioRule[] = provenanceRules<AudioArtifact, AudioProbeId>(PROBES, {
  variant: audioVariant,
  inapplicable: {
    "prov.camera-capture-metadata":
      "reads an EXIF MakerNote, and a RIFF file has no EXIF. Excluded rather than carried and left permanently " +
      "silent, because a rule that fires on nothing anywhere is indistinguishable from a rule that broke.",
  },
});

/** The five measurement rules. Probabilistic, capped, and silent unless somebody listened. */
export const AUDIO_STREAM_RULES: readonly AudioRule[] = streamRules(STREAM_PROBE);

/**
 * The audio corpus: the shared declaration rules, plus five that read a measurement.
 *
 * THE SECOND GROUP IS NEW AND THE OLD COMMENT HERE SAID IT NEVER WOULD BE, so the change of
 * mind is recorded rather than quietly made. What the old comment refused was "a statistic
 * over the waveform", on the ground that perceptual coding destroys the fine structure such a
 * statistic reads. That argument is still correct and is still enforced, in two places: the
 * re-encoding gate stops every rule below from running on a transcoded file at all, and the
 * one rule that reads the spectrum declines to fire unless the samples are stored losslessly,
 * because a ceiling in a lossy file is the codec's own lowpass.
 *
 * What the old comment got wrong was treating "reads the signal" as one category. A speaker
 * embedding and a noise floor are not the same kind of claim. One asks who this is and
 * answers with a number nobody can re-derive; the other asks how quiet the pauses are and
 * answers with a number anybody can re-derive in one command. `listen/reading.ts` sets out
 * the distinction and `scope.ts` states it in the words a user reads.
 *
 * The refusals that remain, and that a test enforces over these rules' own source: no
 * spectrogram feature, no MFCC, no formant, no speaker embedding, no similarity score, no
 * classifier, no per-generator fingerprint.
 */
export const AUDIO_RULES: readonly AudioRule[] = [...AUDIO_PROVENANCE_RULES, ...AUDIO_STREAM_RULES];

export const AUDIO_RULE_DESCRIPTORS: readonly RuleDescriptor[] = AUDIO_RULES.map((r) => ({
  id: r.id,
  family: r.family,
  title: r.title,
  polarity: r.polarity,
  baseWeight: r.baseWeight,
  severity: r.severity,
  explanation: r.explanation,
  falsePositiveNote: r.falsePositiveNote,
  ...(r.prevention ? { prevention: r.prevention } : {}),
  since: r.since,
}));

export const audioRuleById = (id: string): AudioRule | undefined => AUDIO_RULES.find((r) => r.id === id);

export { MEDIA_CORPUS_VERSION };
