/**
 * @slop/ocr-text
 *
 * "What does this picture SAY?", answered with the recovered string, a confidence, and a
 * refusal when there is no honest answer. It exists because a page can pass every copy rule in
 * the corpus by putting its slop in a JPEG, and because the alternative to reading images is
 * listing them as a permanent blind spot.
 *
 * TWO RECOVERY PATHS, AND THEY ARE NOT EQUALLY GOOD. This is stated here rather than in a
 * footnote because a caller has to choose what to do with each one:
 *
 *  - `svg-text` is byte-exact. The words are character data in the file. What it cannot
 *    establish is that a reader SEES them.
 *  - `raster-ocr` reuses the pixel decoder in `@slop/reproduce/ocr.ts`, the one that reads a
 *    finished PNG export back to prove its disclaimer survived. That decoder is exact and
 *    mutation-tested, and it is exact BECAUSE it is narrow: ink is a fixed threshold, glyphs
 *    sit on a fixed 5x7 cell grid at integer scale, and a band that does not decode cleanly is
 *    discarded rather than guessed at. Pointed at arbitrary web imagery it therefore ABSTAINS
 *    most of the time, and that is the correct behaviour for it. It is not a general OCR and
 *    nothing here pretends it is: what it buys is a read that is either right or absent, with
 *    no third case where it invents a headline out of a photograph of a beach.
 *
 * The consequence, said plainly for whoever ships the next version of this: closing the
 * typography-inside-an-image hole for photographic and antialiased type needs a real OCR
 * engine, which is a dependency and a model, not an afternoon. What is here closes the SVG
 * half completely and the raster half only where the type is drawn on a pixel grid. The
 * records this module returns carry `abstained` with a reason for everything else, so the
 * blind spot is a value in a report rather than a sentence on a marketing page.
 */

export type { SvgTextRead } from "./svg.js";
export { decodeEntities, extractSvgText } from "./svg.js";
export type { RasterTextRead } from "./raster-text.js";
export { MIN_USABLE_CONFIDENCE, readRasterText } from "./raster-text.js";
export type { RecoveredText, RecoverInput } from "./recover.js";
export { recoverText, SUPPORTED_MEDIA_TYPES } from "./recover.js";
