/**
 * Drawing text into a raster, at integer scale, with a word-wrapper.
 *
 * `scale` is the only size control and it is an integer, so "the disclaimer is at least as
 * large as the panel labels" reduces to `disclaimerScale >= labelScale` at layout time AND to a
 * measured pixel comparison after the fact. Both are checked; the second is the one that counts,
 * because it is the one a cropped export can fail.
 */

import { ADVANCE, FONT, GLYPH_H, GLYPH_W, normalizeForRender } from "./font.js";
import type { Raster, Rgb } from "./raster.js";
import { setPixel } from "./raster.js";

/** Pixel height of a glyph drawn at `scale`. This is the number the OCR recovers. */
export const glyphHeightPx = (scale: number): number => GLYPH_H * scale;

/** Pixel width of a rendered string, excluding the trailing inter-glyph gap. */
export function measureText(text: string, scale: number): number {
  const n = normalizeForRender(text).length;
  return n === 0 ? 0 : n * ADVANCE * scale - scale;
}

export function drawText(r: Raster, text: string, x: number, y: number, scale: number, color: Rgb): void {
  const s = normalizeForRender(text);
  for (let i = 0; i < s.length; i += 1) {
    const rows = FONT[s[i] as string] ?? FONT["?"];
    if (!rows) continue;
    const gx = x + i * ADVANCE * scale;
    for (let row = 0; row < GLYPH_H; row += 1) {
      const line = rows[row] ?? "";
      for (let col = 0; col < GLYPH_W; col += 1) {
        if (line[col] !== "#") continue;
        for (let dy = 0; dy < scale; dy += 1) {
          for (let dx = 0; dx < scale; dx += 1) {
            setPixel(r, gx + col * scale + dx, y + row * scale + dy, color);
          }
        }
      }
    }
  }
}

/** Greedy word wrap to a pixel width. Returns the lines, never a truncation. */
export function wrapText(text: string, scale: number, maxWidthPx: number): string[] {
  const words = normalizeForRender(text).split(" ").filter((w) => w.length > 0);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current === "" ? word : `${current} ${word}`;
    if (measureText(candidate, scale) <= maxWidthPx || current === "") {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current !== "") lines.push(current);
  return lines;
}

export interface ParagraphMetrics {
  readonly lines: readonly string[];
  readonly lineHeight: number;
  readonly height: number;
}

/** Lay a paragraph out without drawing it, so the layout can reserve the space FIRST. */
export function layoutParagraph(text: string, scale: number, maxWidthPx: number): ParagraphMetrics {
  const lines = wrapText(text, scale, maxWidthPx);
  const lineHeight = glyphHeightPx(scale) + Math.max(2, scale * 2);
  return { lines, lineHeight, height: lines.length * lineHeight };
}

export function drawParagraph(
  r: Raster,
  metrics: ParagraphMetrics,
  x: number,
  y: number,
  scale: number,
  color: Rgb,
): void {
  metrics.lines.forEach((line, i) => drawText(r, line, x, y + i * metrics.lineHeight, scale, color));
}
