/**
 * A dependency-free RGBA pixel buffer.
 *
 * The export figure is the legal artifact (see `design/SELF-AUDIT.md` risk 3), and the test
 * that guards it has to read PIXELS, not a DOM or a layout object. So the compositor owns its
 * own raster rather than borrowing a browser's: a canvas we cannot run headlessly in a unit
 * test is a canvas whose disclaimer band nobody checks.
 *
 * Everything here is integer arithmetic with no antialiasing, which is what makes the OCR in
 * `ocr.ts` an exact round trip rather than a fuzzy one.
 */

/** Straight RGBA, 4 bytes per pixel, row-major, no premultiplication. */
export interface Raster {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
}

export type Rgb = readonly [number, number, number];

export interface Box {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export const INK: Rgb = [17, 17, 17];
export const MUTED: Rgb = [102, 102, 102];
export const PAPER: Rgb = [255, 255, 255];
export const PLATE: Rgb = [232, 232, 230];

export function createRaster(width: number, height: number, fill: Rgb = PAPER): Raster {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new RangeError(`raster dimensions must be positive integers, got ${width}x${height}`);
  }
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = fill[0];
    data[i + 1] = fill[1];
    data[i + 2] = fill[2];
    data[i + 3] = 255;
  }
  return { width, height, data };
}

export function setPixel(r: Raster, x: number, y: number, c: Rgb): void {
  if (x < 0 || y < 0 || x >= r.width || y >= r.height) return;
  const i = (y * r.width + x) * 4;
  r.data[i] = c[0];
  r.data[i + 1] = c[1];
  r.data[i + 2] = c[2];
  r.data[i + 3] = 255;
}

export function getPixel(r: Raster, x: number, y: number): Rgb {
  const i = (y * r.width + x) * 4;
  return [r.data[i] ?? 0, r.data[i + 1] ?? 0, r.data[i + 2] ?? 0];
}

export function fillRect(r: Raster, box: Box, c: Rgb): void {
  for (let y = box.y; y < box.y + box.h; y += 1) {
    for (let x = box.x; x < box.x + box.w; x += 1) setPixel(r, x, y, c);
  }
}

/** 1px outline, drawn inside `box`. */
export function strokeRect(r: Raster, box: Box, c: Rgb): void {
  for (let x = box.x; x < box.x + box.w; x += 1) {
    setPixel(r, x, box.y, c);
    setPixel(r, x, box.y + box.h - 1, c);
  }
  for (let y = box.y; y < box.y + box.h; y += 1) {
    setPixel(r, box.x, y, c);
    setPixel(r, box.x + box.w - 1, y, c);
  }
}

export function hairline(r: Raster, x: number, y: number, w: number, c: Rgb): void {
  for (let i = 0; i < w; i += 1) setPixel(r, x + i, y, c);
}

export function vrule(r: Raster, x: number, y: number, h: number, c: Rgb): void {
  for (let i = 0; i < h; i += 1) setPixel(r, x, y + i, c);
}

/**
 * Nearest-neighbour blit, letterboxed inside `box` so aspect ratio survives.
 *
 * Letterboxing matters legally, not just visually: the two panels must be pixel-symmetric
 * (the legal risk memo (private) §2 - an asymmetric layout makes the accusation the copy then
 * has to walk back), so both panels get the SAME plate and the same fill, and the content is
 * fitted into it rather than the plate being fitted to the content.
 */
export function blitFit(dst: Raster, src: Raster, box: Box, backdrop: Rgb = PLATE): void {
  fillRect(dst, box, backdrop);
  const scale = Math.min(box.w / src.width, box.h / src.height);
  const w = Math.max(1, Math.floor(src.width * scale));
  const h = Math.max(1, Math.floor(src.height * scale));
  const ox = box.x + Math.floor((box.w - w) / 2);
  const oy = box.y + Math.floor((box.h - h) / 2);
  for (let y = 0; y < h; y += 1) {
    const sy = Math.min(src.height - 1, Math.floor((y / h) * src.height));
    for (let x = 0; x < w; x += 1) {
      const sx = Math.min(src.width - 1, Math.floor((x / w) * src.width));
      setPixel(dst, ox + x, oy + y, getPixel(src, sx, sy));
    }
  }
}

/** Rec. 601 luma. The OCR's ink test and nothing else. */
export function luma(c: Rgb): number {
  return 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
}

/** Extract a sub-raster. Used by the symmetry test to compare the two panels byte for byte. */
export function crop(r: Raster, box: Box): Raster {
  const out = createRaster(box.w, box.h);
  for (let y = 0; y < box.h; y += 1) {
    for (let x = 0; x < box.w; x += 1) setPixel(out, x, y, getPixel(r, box.x + x, box.y + y));
  }
  return out;
}

export function rastersEqual(a: Raster, b: Raster): boolean {
  if (a.width !== b.width || a.height !== b.height) return false;
  for (let i = 0; i < a.data.length; i += 1) if (a.data[i] !== b.data[i]) return false;
  return true;
}
