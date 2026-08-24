/**
 * Read text back out of a finished raster.
 *
 * This module exists for exactly one test, and that test is the one whose failure is legal
 * exposure rather than a bug (`design/SELF-AUDIT.md` risk 3): render EVERY export size, OCR the
 * output, and assert the disclaimer is present at >= the panel-label pixel height.
 *
 * The point is that it reads PIXELS. A check against the layout object would pass on a figure
 * whose disclaimer was clipped, drawn off-canvas, painted in the background colour, or laid out
 * under the panels. Every one of those is a real way a share card loses its disclaimer, and the
 * only observer that catches all of them is one that looks at the finished image the way a
 * reader does.
 *
 * The decoder is deliberately dumb and deliberately strict:
 *   - ink is `luma < 128`; there is no adaptive threshold to tune and therefore none to fool;
 *   - columns that are ink for most of the image height are structural (card border, rules) and
 *     are removed before decoding, so a border cannot glue two text bands into one;
 *   - a text band's height must be an exact multiple of the 7-row glyph grid, which recovers the
 *     rendered scale from the pixels rather than taking it from the caller;
 *   - glyphs are decoded on a fixed 6-cell pitch, so a leading glyph with a blank first column
 *     ('1', 'J') cannot shift the whole line;
 *   - a band that decodes to mostly unknown glyphs is discarded rather than reported, which is
 *     what keeps arbitrary panel imagery from inventing lines of text.
 */

import { ADVANCE, FONT, GLYPH_H, GLYPH_W } from "./font.js";
import type { Raster } from "./raster.js";
import { getPixel, luma } from "./raster.js";

export interface OcrLine {
  /** Decoded text, uppercase, single-spaced. */
  readonly text: string;
  /** Measured from the pixels: the height of one glyph cell-grid, in device pixels. */
  readonly glyphHeightPx: number;
  readonly top: number;
  readonly left: number;
}

const INK_THRESHOLD = 128;
/** A column this often inky over the full image is a rule, not type. */
const STRUCTURAL_COLUMN_RATIO = 0.8;
/** A band this dense is picture content, not a line of type. */
const MAX_TEXT_BAND_DENSITY = 0.5;
const MAX_SCALE = 24;
/** Cells that may differ before a glyph is called unknown. */
const GLYPH_TOLERANCE = 3;
/** Above this share of unknown glyphs the band is discarded entirely. */
const MAX_UNKNOWN_SHARE = 0.25;

interface Mask {
  readonly width: number;
  readonly height: number;
  readonly bits: Uint8Array;
}

function inkMask(r: Raster): Mask {
  const bits = new Uint8Array(r.width * r.height);
  for (let y = 0; y < r.height; y += 1) {
    for (let x = 0; x < r.width; x += 1) {
      bits[y * r.width + x] = luma(getPixel(r, x, y)) < INK_THRESHOLD ? 1 : 0;
    }
  }
  // Drop structural columns in place: they are the card border and any full-height rule.
  for (let x = 0; x < r.width; x += 1) {
    let count = 0;
    for (let y = 0; y < r.height; y += 1) count += bits[y * r.width + x] ?? 0;
    if (count >= r.height * STRUCTURAL_COLUMN_RATIO) {
      for (let y = 0; y < r.height; y += 1) bits[y * r.width + x] = 0;
    }
  }
  return { width: r.width, height: r.height, bits };
}

const at = (m: Mask, x: number, y: number): boolean =>
  x >= 0 && y >= 0 && x < m.width && y < m.height && m.bits[y * m.width + x] === 1;

interface Band {
  readonly top: number;
  readonly height: number;
}

function bands(m: Mask): Band[] {
  const out: Band[] = [];
  let start = -1;
  for (let y = 0; y <= m.height; y += 1) {
    let inky = false;
    if (y < m.height) {
      for (let x = 0; x < m.width; x += 1) {
        if (at(m, x, y)) {
          inky = true;
          break;
        }
      }
    }
    if (inky && start < 0) start = y;
    if (!inky && start >= 0) {
      out.push({ top: start, height: y - start });
      start = -1;
    }
  }
  return out;
}

function glyphCells(m: Mask, x0: number, y0: number, scale: number): boolean[] {
  const half = Math.floor(scale / 2);
  const cells: boolean[] = [];
  for (let row = 0; row < GLYPH_H; row += 1) {
    for (let col = 0; col < GLYPH_W; col += 1) {
      cells.push(at(m, x0 + col * scale + half, y0 + row * scale + half));
    }
  }
  return cells;
}

const FONT_ENTRIES: readonly (readonly [string, readonly boolean[]])[] = Object.entries(FONT).map(
  ([ch, rows]) => {
    const cells: boolean[] = [];
    for (let row = 0; row < GLYPH_H; row += 1) {
      const line = rows[row] ?? "";
      for (let col = 0; col < GLYPH_W; col += 1) cells.push(line[col] === "#");
    }
    return [ch, cells] as const;
  },
);

function matchGlyph(cells: readonly boolean[]): { ch: string; distance: number } {
  let best = "?";
  let bestD = Number.POSITIVE_INFINITY;
  for (const [ch, ref] of FONT_ENTRIES) {
    let d = 0;
    for (let i = 0; i < cells.length; i += 1) {
      if (cells[i] !== ref[i]) d += 1;
      if (d >= bestD) break;
    }
    if (d < bestD) {
      bestD = d;
      best = ch;
    }
  }
  return { ch: best, distance: bestD };
}

interface Decoded {
  readonly text: string;
  readonly unknown: number;
  readonly total: number;
  readonly left: number;
}

function decodeBand(m: Mask, band: Band, scale: number): Decoded | null {
  let first = -1;
  let last = -1;
  let ink = 0;
  for (let y = band.top; y < band.top + band.height; y += 1) {
    for (let x = 0; x < m.width; x += 1) {
      if (!at(m, x, y)) continue;
      ink += 1;
      if (first < 0 || x < first) first = x;
      if (x > last) last = x;
    }
  }
  if (first < 0) return null;
  if (ink > band.height * (last - first + 1) * MAX_TEXT_BAND_DENSITY) return null;

  let best: Decoded | null = null;
  // A glyph may have up to two blank leading columns ('1', 'J'), so the true cell origin can
  // sit left of the first inked pixel. Try each candidate origin and keep the cleanest read.
  for (let k = 0; k <= 2; k += 1) {
    const x0 = first - k * scale;
    const pitch = ADVANCE * scale;
    const count = Math.floor((last - x0) / pitch) + 1;
    if (count <= 0 || count > 4096) continue;
    let text = "";
    let unknown = 0;
    for (let i = 0; i < count; i += 1) {
      const { ch, distance } = matchGlyph(glyphCells(m, x0 + i * pitch, band.top, scale));
      if (distance > GLYPH_TOLERANCE) {
        text += "?";
        unknown += 1;
      } else {
        text += ch;
      }
    }
    const decoded: Decoded = { text, unknown, total: count, left: x0 };
    if (best === null || decoded.unknown < best.unknown) best = decoded;
  }
  return best;
}

/**
 * Decode every line of type in a raster.
 *
 * Returns measured heights, not requested ones. A caller comparing two lines' `glyphHeightPx`
 * is comparing what a reader would actually see.
 */
export function ocrLines(r: Raster): OcrLine[] {
  const m = inkMask(r);
  const out: OcrLine[] = [];
  for (const band of bands(m)) {
    if (band.height % GLYPH_H !== 0) continue;
    const scale = band.height / GLYPH_H;
    if (scale < 1 || scale > MAX_SCALE) continue;
    const decoded = decodeBand(m, band, scale);
    if (decoded === null) continue;
    if (decoded.unknown > decoded.total * MAX_UNKNOWN_SHARE) continue;
    const text = decoded.text.replace(/\s+/g, " ").trim();
    if (text.length === 0) continue;
    out.push({ text, glyphHeightPx: band.height, top: band.top, left: decoded.left });
  }
  return out.sort((a, b) => a.top - b.top || a.left - b.left);
}

/** Convenience for assertions: every decoded line joined, for a whole-image substring search. */
export const ocrText = (r: Raster): string => ocrLines(r).map((l) => l.text).join("\n");
