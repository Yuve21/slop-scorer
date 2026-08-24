import { MEDIA_CONFIG } from "@slop/provenance";
import type { ScoringConfig } from "@slop/core";

/**
 * The image scoring config.
 *
 * Identical to the shared media config apart from the corpus version. There is deliberately
 * no image-specific loosening: the families, the caps and the coverage floor are the ones
 * argued for in `@slop/provenance/families.ts`, and a modality that quietly relaxed them
 * would make a multi-modal report's numbers incomparable with each other.
 */
export const IMAGE_CONFIG: ScoringConfig = { ...MEDIA_CONFIG, corpusVersion: "image-corpus-2026.09" };
