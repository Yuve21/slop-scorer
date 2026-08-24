/**
 * The face gate. Nothing reaches a provider until this has run and cleared it.
 *
 * `publicity-defamation-risk.md` Tier 1 #6: refusing to regenerate identifiable faces "removes
 * the publicity head almost entirely, plus Washington's 'indistinguishable', Arizona's 'would
 * believe', and Tennessee's 'readily identifiable'". It is the single highest-leverage control in
 * the product and it is one function call, so it is a hard gate in the pipeline rather than a
 * setting somebody can forget.
 *
 * THE GATE FAILS CLOSED. If no detector is configured, the pipeline refuses with
 * `face_check_unavailable`. That is the whole reason this is an interface with a required
 * implementation instead of an optional dependency: an unchecked image is not a cleared image,
 * and "we had no detector so we went ahead" is exactly the sentence a plaintiff wants.
 */

import type { Box, Raster } from "./raster.js";
import { PLATE, fillRect, getPixel } from "./raster.js";

export interface FaceRegion extends Box {
  /** 0..1. Reported, never used as a threshold by the pipeline: any region at all is a stop. */
  readonly strength: number;
}

export interface FaceDetection {
  readonly detectorId: string;
  readonly regions: readonly FaceRegion[];
  /** How the detector reached its answer, printed in the substantiation record. */
  readonly method: string;
}

export interface FaceDetector {
  readonly id: string;
  /**
   * False for anything not validated for production use. The pipeline still uses it - a weak
   * check is better than none and the gate must fail closed - but the substantiation record says
   * which detector cleared the image, so a claim can never rest on an unvalidated one silently.
   */
  readonly productionGrade: boolean;
  detect(raster: Raster): Promise<FaceDetection>;
}

/** What the pipeline does when a face is found. */
export type FacePolicy =
  /** Decline the whole request and say so. The default. */
  | "refuse"
  /** Mask the region flat and proceed, recording that the region was excluded. */
  | "exclude";

/**
 * A deterministic stand-in, for tests and for local development.
 *
 * It looks for a dense rectangular run of pixels in a coarse skin-tone band. That is a real,
 * inspectable rule and it is emphatically NOT a face detector: it will miss most faces and it
 * will fire on a wooden table. It exists so the gate can be exercised end to end with no network
 * and no model, and it declares `productionGrade: false` so nothing can quietly ship behind it.
 */
export class HeuristicFaceDetector implements FaceDetector {
  readonly id = "heuristic-skin-tone-block";
  readonly productionGrade = false;

  constructor(
    /** Share of a cell's pixels that must fall in the band before the cell counts. */
    private readonly cellDensity = 0.6,
    /** Grid resolution. Coarse on purpose: this is a blob finder, not a landmark model. */
    private readonly grid = 16,
  ) {}

  async detect(raster: Raster): Promise<FaceDetection> {
    const cw = Math.max(1, Math.floor(raster.width / this.grid));
    const ch = Math.max(1, Math.floor(raster.height / this.grid));
    const hits: boolean[][] = [];
    for (let gy = 0; gy < this.grid; gy += 1) {
      const row: boolean[] = [];
      for (let gx = 0; gx < this.grid; gx += 1) {
        let inBand = 0;
        let total = 0;
        for (let y = gy * ch; y < Math.min(raster.height, (gy + 1) * ch); y += 1) {
          for (let x = gx * cw; x < Math.min(raster.width, (gx + 1) * cw); x += 1) {
            total += 1;
            if (isSkinToneBand(getPixel(raster, x, y))) inBand += 1;
          }
        }
        row.push(total > 0 && inBand / total >= this.cellDensity);
      }
      hits.push(row);
    }

    const regions: FaceRegion[] = [];
    const seen = new Set<string>();
    for (let gy = 0; gy < this.grid; gy += 1) {
      for (let gx = 0; gx < this.grid; gx += 1) {
        if (!hits[gy]?.[gx] || seen.has(`${gx},${gy}`)) continue;
        // Grow a rectangle right and down over contiguous hit cells.
        let x1 = gx;
        while (x1 + 1 < this.grid && hits[gy]?.[x1 + 1] === true) x1 += 1;
        let y1 = gy;
        while (y1 + 1 < this.grid && rowRunIsHit(hits, y1 + 1, gx, x1)) y1 += 1;
        for (let y = gy; y <= y1; y += 1) for (let x = gx; x <= x1; x += 1) seen.add(`${x},${y}`);
        const cells = (x1 - gx + 1) * (y1 - gy + 1);
        // A single cell is noise. Two or more contiguous cells is a blob worth stopping for.
        if (cells < 2) continue;
        regions.push({
          x: gx * cw,
          y: gy * ch,
          w: (x1 - gx + 1) * cw,
          h: (y1 - gy + 1) * ch,
          strength: Math.min(1, cells / (this.grid * this.grid * 0.25)),
        });
      }
    }
    return { detectorId: this.id, regions, method: "coarse skin-tone cell grid, contiguous blocks of 2+ cells" };
  }
}

function rowRunIsHit(hits: readonly (readonly boolean[])[], y: number, x0: number, x1: number): boolean {
  const row = hits[y];
  if (!row) return false;
  for (let x = x0; x <= x1; x += 1) if (row[x] !== true) return false;
  return true;
}

function isSkinToneBand(c: readonly [number, number, number]): boolean {
  const [r, g, b] = c;
  return r > 95 && g > 40 && b > 20 && r > g && g > b && r - Math.min(g, b) > 15 && Math.abs(r - g) > 15;
}

/** A detector that finds nothing, for text-only paths and for tests that need a cleared image. */
export class NoFacesDetector implements FaceDetector {
  readonly id = "no-faces-stub";
  readonly productionGrade = false;
  async detect(): Promise<FaceDetection> {
    return { detectorId: this.id, regions: [], method: "declares no regions; for cleared-input tests only" };
  }
}

/**
 * Mask every detected region with a flat fill.
 *
 * Flat, not blurred. A blur is still the person's face at a lower frequency, and the whole point
 * of the `exclude` policy is that the region a provider sees carries no likeness at all.
 */
export function excludeFaceRegions(raster: Raster, regions: readonly FaceRegion[]): Raster {
  const copy: Raster = { width: raster.width, height: raster.height, data: new Uint8ClampedArray(raster.data) };
  for (const region of regions) fillRect(copy, region, PLATE);
  return copy;
}
