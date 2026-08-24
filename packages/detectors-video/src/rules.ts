import { assertMediaSafe, MEDIA_CORPUS_VERSION, provenanceRules } from "@slop/provenance";
import type { MediaProbeId, MediaRule } from "@slop/provenance";
import { ev } from "@slop/core";
import type { Evidence, RuleDescriptor } from "@slop/core";
import { videoVariant, withStreamMeasurement } from "./artifact.js";
import type { VideoArtifact, VideoProbeId } from "./artifact.js";

export const VIDEO_CORPUS_VERSION = "video-corpus-2026.09";

export type VideoRule = MediaRule<VideoArtifact, VideoProbeId>;

const PROBES: Readonly<Record<MediaProbeId, VideoProbeId>> = {
  container: "container",
  metadata: "metadata",
  "content-credential": "content-credential",
  watermark: "watermark",
  laundering: "laundering",
};

export const VIDEO_PROBE_IDS: readonly VideoProbeId[] = [...Object.values(PROBES), "tracks"];

/**
 * The prefix every probabilistic rule's title must carry.
 *
 * Enforced by a test over the whole corpus rather than left to care. The receipt prints the
 * title, so this is what makes "this line is a statistic, not a fact you can re-read" visible
 * to a reader who never opens the documentation. `evidenceKind` on the result says the same
 * thing to a machine; a human needs it in the sentence.
 */
export const PROBABILISTIC_TITLE_PREFIX = "Probabilistic signal: ";
export const PROBABILISTIC_NOTE_PREFIX = "PROBABILISTIC. ";

/** The desync threshold, in milliseconds. */
const DESYNC_THRESHOLD_MS = 120;

/**
 * The only probabilistic rule in this product.
 *
 * It fires on a measurement SOMEBODY ELSE made, never one we computed, and it says so in its
 * own evidence. Its weight is a fifth of a provenance declaration's and its family cap is the
 * smallest in the config, so it cannot carry a verdict, cannot reach the top band, and cannot
 * on its own move an artifact out of the lowest one.
 *
 * Why it is allowed to exist at all when nothing else probabilistic is: the measurement is of
 * a RELATIONSHIP BETWEEN TWO STREAMS, not of the appearance of one of them. There is no model
 * looking at a face and forming an opinion, which is the failure mode the Tow Center
 * documented and the reason this corpus has no other statistical rule in it.
 */
const desyncRule: VideoRule = {
  id: "vid.audio-video-desync",
  family: "stream-consistency",
  title: `${PROBABILISTIC_TITLE_PREFIX}the audio and video tracks are measurably out of alignment`,
  polarity: "signal",
  severity: "low",
  baseWeight: 0.8,
  maxHits: 2,
  requiresProbe: "tracks",
  phase: 1,
  since: VIDEO_CORPUS_VERSION,
  explanation: assertMediaSafe(
    `An external measurer reported the audio and video tracks drifting by more than ${DESYNC_THRESHOLD_MS} ` +
      "milliseconds. That is a statistic over two streams, not a fact a reader can re-read at a byte offset, and " +
      "this rule is the only line in the whole product of that kind. We print who measured it.",
  ),
  falsePositiveNote: assertMediaSafe(
    `${PROBABILISTIC_NOTE_PREFIX}Drift of this size turns up routinely in a variable-frame-rate file, in one whose ` +
      "muxer rounded a timescale, in a dubbed or re-voiced track, in a live broadcast capture and on a slow phone. It " +
      "is weighted below every other line in this corpus and capped so it can never carry a result on its own.",
  ),
  detect: (a): readonly Evidence[] => {
    const { audioVideoOffsetMs, measuredBy } = a.streams;
    if (audioVideoOffsetMs === null || !measuredBy) return [];
    if (Math.abs(audioVideoOffsetMs) <= DESYNC_THRESHOLD_MS) return [];
    return [
      ev("metric", `streams:audio-video-offset`, `${audioVideoOffsetMs} ms, measured by ${measuredBy}`, {
        expected: `within ${DESYNC_THRESHOLD_MS} ms`,
        excerpt: a.streams.note,
      }),
    ];
  },
  fixtures: {
    positive: (base) => ({ artifact: withStreamMeasurement(base, 480, "the caller's alignment measurer") }),
    mutated: (base) => ({ artifact: withStreamMeasurement(base, 12, "the caller's alignment measurer") }),
    extra: [
      {
        name: "a large offset with nobody named as the measurer",
        shouldFire: false,
        build: (base) => ({
          artifact: { ...base, streams: { ...base.streams, audioVideoOffsetMs: 480, measuredBy: null } },
        }),
      },
    ],
  },
};

export const VIDEO_RULES: readonly VideoRule[] = [
  ...provenanceRules<VideoArtifact, VideoProbeId>(PROBES, {
    variant: videoVariant,
    inapplicable: {
      "prov.camera-capture-metadata":
        "reads an EXIF MakerNote, and no ISO base media file carries one. Excluded rather than carried and left " +
        "permanently silent, because a rule that fires on nothing is indistinguishable from a rule that broke.",
    },
  }),
  desyncRule,
];

export const VIDEO_RULE_DESCRIPTORS: readonly RuleDescriptor[] = VIDEO_RULES.map((r) => ({
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

export const videoRuleById = (id: string): VideoRule | undefined => VIDEO_RULES.find((r) => r.id === id);

export { MEDIA_CORPUS_VERSION };
