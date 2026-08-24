import { MEDIA_CORPUS_VERSION, provenanceRules } from "@slop/provenance";
import type { MediaProbeId, MediaRule } from "@slop/provenance";
import type { RuleDescriptor } from "@slop/core";
import { imageVariant } from "./artifact.js";
import type { ImageArtifact, ImageProbeId } from "./artifact.js";

export const IMAGE_CORPUS_VERSION = "image-corpus-2026.09";

export type ImageRule = MediaRule<ImageArtifact, ImageProbeId>;

/**
 * The image probe map.
 *
 * The image modality runs the five shared probes and nothing else, so the mapping is the
 * identity. It is written out rather than inferred because it is the thing a type checker can
 * use to prove no shared rule was orphaned when a probe was renamed.
 */
const PROBES: Readonly<Record<MediaProbeId, ImageProbeId>> = {
  container: "container",
  metadata: "metadata",
  "content-credential": "content-credential",
  watermark: "watermark",
  laundering: "laundering",
};

export const IMAGE_PROBE_IDS: readonly ImageProbeId[] = Object.values(PROBES);

/**
 * The image corpus IS the shared provenance corpus.
 *
 * There is no image-specific rule and that is the finding, not a gap. Every image-specific
 * signal anybody has published is a pixel read, and `image-detection-reality.md` closes off
 * pixel reads for this product. What is left that is honest is what a file declares, and a
 * declaration is not image-shaped.
 */
export const IMAGE_RULES: readonly ImageRule[] = provenanceRules<ImageArtifact, ImageProbeId>(PROBES, {
  variant: imageVariant,
});

export const IMAGE_RULE_DESCRIPTORS: readonly RuleDescriptor[] = IMAGE_RULES.map((r) => ({
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

export const imageRuleById = (id: string): ImageRule | undefined => IMAGE_RULES.find((r) => r.id === id);

export { MEDIA_CORPUS_VERSION };
