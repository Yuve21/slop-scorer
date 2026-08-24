import { MEDIA_CORPUS_VERSION, provenanceRules } from "@slop/provenance";
import type { MediaProbeId, MediaRule } from "@slop/provenance";
import type { RuleDescriptor } from "@slop/core";
import { audioVariant } from "./artifact.js";
import type { AudioArtifact, AudioProbeId } from "./artifact.js";

export const AUDIO_CORPUS_VERSION = "audio-corpus-2026.09";

export type AudioRule = MediaRule<AudioArtifact, AudioProbeId>;

const PROBES: Readonly<Record<MediaProbeId, AudioProbeId>> = {
  container: "container",
  metadata: "metadata",
  "content-credential": "content-credential",
  watermark: "watermark",
  laundering: "laundering",
};

export const AUDIO_PROBE_IDS: readonly AudioProbeId[] = Object.values(PROBES);

/**
 * The audio corpus is the shared provenance corpus, minus the one rule a RIFF file cannot
 * express, plus nothing.
 *
 * There is no audio-specific rule and there is not going to be one that reads the signal.
 * Every audio-specific detection idea in the literature is a statistic over the waveform, and
 * the argument that rules those out is the same one that rules out pixel forensics, only
 * stronger: perceptual coding discards precisely the fine structure such a statistic reads,
 * and almost all audio that reaches anybody has been perceptually coded at least once.
 */
export const AUDIO_RULES: readonly AudioRule[] = provenanceRules<AudioArtifact, AudioProbeId>(PROBES, {
  variant: audioVariant,
  inapplicable: {
    "prov.camera-capture-metadata":
      "reads an EXIF MakerNote, and a RIFF file has no EXIF. Excluded rather than carried and left permanently " +
      "silent, because a rule that fires on nothing anywhere is indistinguishable from a rule that broke.",
  },
});

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
