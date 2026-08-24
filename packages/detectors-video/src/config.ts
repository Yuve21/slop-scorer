import { MEDIA_CONFIG } from "@slop/provenance";
import type { ScoringConfig } from "@slop/core";

/** The video scoring config. Shared families and caps; only the corpus version differs. */
export const VIDEO_CONFIG: ScoringConfig = { ...MEDIA_CONFIG, corpusVersion: "video-corpus-2026.09" };
