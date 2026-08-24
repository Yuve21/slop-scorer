/**
 * The receipt -> figure seam.
 *
 * `lib/reproduction.ts` holds what the PAGE renders: two SVG plates and the caption under each.
 * `@slop/reproduce` composes what TRAVELS: one bordered PNG with both panels and the disclaimer
 * band inside the same frame. This module is the only place the first becomes the second, and it
 * is deliberately small, because every extra decision made here is a decision the compositor's
 * guarantees do not cover.
 *
 * Two properties are worth stating because they are load-bearing rather than incidental:
 *
 *   ONLY A SUCCEEDED REPRODUCTION HAS A FIGURE. The other three states have no second panel, and
 *   a one-panel export with a side-by-side disclaimer under it would be a document making a claim
 *   about a comparison it does not contain. `figureSpecFor` returns null and the route answers
 *   404. The button does not render at all.
 *
 *   THE LABELS COME FROM THE PACKAGE, not from this file. `checkDisclaimerProminence` finds the
 *   panel-label line in the finished pixels by looking for those two exact strings, and measures
 *   the disclaimer against it. A label typed by hand here that drifted by one character would not
 *   fail: it would make the checker unable to find its own denominator, and the report the route
 *   trusts would be measuring nothing. Importing the constants makes that class of failure
 *   unrepresentable.
 */

import type { FigureSpec, Raster } from "@slop/reproduce";
import { RECREATION_LABEL, SUBMITTED_LABEL } from "@slop/reproduce";
import { rasterizeFlatSvg } from "./plate-raster";
import { reproductionFor, type Plate } from "./reproduction";
import { PLATE_SVG_BY_SRC } from "./sample-plates";
import { seconds } from "./view";

/**
 * Rasterising a 1024x640 plate is a few million integer writes. It is the same answer every time
 * for the same input, so it is computed once per plate per process.
 */
const CACHE = new Map<string, Raster>();

export class NoPlateSourceError extends Error {
  constructor(src: string) {
    super(`there is no plate source for ${JSON.stringify(src)}, so no figure can be composed for it`);
    this.name = "NoPlateSourceError";
  }
}

function plateRaster(src: string): Raster {
  const cached = CACHE.get(src);
  if (cached) return cached;
  const svg = PLATE_SVG_BY_SRC[src];
  if (svg === undefined) throw new NoPlateSourceError(src);
  const raster = rasterizeFlatSvg(svg);
  CACHE.set(src, raster);
  return raster;
}

/**
 * The one mono line under each plate, and why it is not the page's caption.
 *
 * The page sets its captions in a proportional column that reflows. The figure sets one line per
 * panel, in a 5x7 bitmap face, at the same integer scale as every other line in the frame, and it
 * does not wrap or clip: a line longer than its panel simply runs into the other panel's line. The
 * narrowest panel this product composes is 173px at scale 1 on the 390px mobile export, which is
 * 29 glyphs. So the figure's captions are written to that budget rather than trimmed to it, and
 * the budget is ASSERTED rather than trusted, because the failure it prevents is silent.
 */
const MAX_META_CHARS = 29;

function metaLine(text: string): string {
  if (text.length > MAX_META_CHARS) {
    throw new MetaTooLongError(text);
  }
  return text;
}

export class MetaTooLongError extends Error {
  constructor(text: string) {
    super(
      `the panel caption ${JSON.stringify(text)} is ${text.length} glyphs, over the ${MAX_META_CHARS} ` +
        `the narrowest export panel can hold. A longer line would run into the other panel rather than wrap.`,
    );
    this.name = "MetaTooLongError";
  }
}

/** "1024 x 640 as submitted". Geometry and nothing else: the plate's own measurements. */
const submittedMeta = (plate: Plate): string => metaLine(`${plate.width} x ${plate.height} as submitted`);

/** "made by us in 8.4 s". Our action, our clock. The only kind of sentence this product makes. */
const recreationMeta = (elapsedMs: number): string => metaLine(`made by us in ${seconds(elapsedMs)} s`);

/** The figure for a receipt, or null when that receipt has no side-by-side to export. */
export function figureSpecFor(receiptId: string): FigureSpec | null {
  const reproduction = reproductionFor(receiptId);
  if (reproduction.state !== "succeeded") return null;
  return {
    submitted: {
      label: SUBMITTED_LABEL,
      meta: submittedMeta(reproduction.submitted),
      image: plateRaster(reproduction.submitted.src),
    },
    recreation: {
      label: RECREATION_LABEL,
      meta: recreationMeta(reproduction.elapsedMs),
      image: plateRaster(reproduction.recreation.src),
    },
  };
}

/** True when a receipt has a figure to export. The button asks this and nothing else. */
export const hasExportableFigure = (receiptId: string): boolean => figureSpecFor(receiptId) !== null;
