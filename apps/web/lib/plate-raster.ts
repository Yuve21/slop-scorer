/**
 * Turn one of our own flat-rectangle sample SVGs into a pixel raster.
 *
 * WHY THIS EXISTS. The export route composes a real PNG through `@slop/reproduce`, and that
 * compositor takes pixels, not markup. The plates on the receipt page are SVG documents we drew
 * for this site, so something has to rasterise them, and it has to do it with no browser, no
 * network and no native dependency: the guard test for the export renders the same figure the
 * route returns, in plain Node, on every run. A rasteriser that needed a headless Chrome is a
 * rasteriser the guard test would be quietly skipped for.
 *
 * WHAT IT SUPPORTS, and this list is the whole of it: `<svg>`, `<g>` (for inherited `fill` and
 * `fill-opacity`), `<rect>` with a solid or two-stop linear-gradient fill, `fill-opacity`, and a
 * 1px `stroke`. That is exactly the subset our fixtures use.
 *
 * WHAT IT DOES NOT SUPPORT is more interesting, because the handling is the point: anything else
 * THROWS. It does not skip the element and carry on. A rasteriser that silently dropped shapes
 * would hand the compositor a plate that is not the artifact the page shows, and the export would
 * then be checked, verified, signed and wrong. Two attributes are deliberately ignored rather
 * than fatal, and both only soften edges without moving anything: `rx` (corners render square)
 * and `filter` (the two-layer card shadow is not drawn). Both are noted here so the omission is
 * a decision on the record rather than a surprise.
 */

import type { Raster, Rgb } from "@slop/reproduce";
import { createRaster, getPixel, setPixel } from "@slop/reproduce";

export class UnsupportedPlateShapeError extends Error {
  constructor(detail: string) {
    super(
      `this plate cannot be rasterised faithfully, so it is not rasterised at all: ${detail}. ` +
        `The export figure has to show the same artifact the page shows.`,
    );
    this.name = "UnsupportedPlateShapeError";
  }
}

const ATTR = /([a-zA-Z-]+)="([^"]*)"/g;

function attrs(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  ATTR.lastIndex = 0;
  let m: RegExpExecArray | null = ATTR.exec(text);
  while (m !== null) {
    out[m[1] as string] = m[2] as string;
    m = ATTR.exec(text);
  }
  return out;
}

function parseColor(value: string): Rgb {
  const hex = value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(hex)) {
    return [
      Number.parseInt(hex.slice(1, 3), 16),
      Number.parseInt(hex.slice(3, 5), 16),
      Number.parseInt(hex.slice(5, 7), 16),
    ];
  }
  if (/^#[0-9a-fA-F]{3}$/.test(hex)) {
    const r = Number.parseInt(hex[1] as string, 16);
    const g = Number.parseInt(hex[2] as string, 16);
    const b = Number.parseInt(hex[3] as string, 16);
    return [r * 17, g * 17, b * 17];
  }
  throw new UnsupportedPlateShapeError(`the colour ${JSON.stringify(value)} is not a hex literal`);
}

interface Stop {
  readonly offset: number;
  readonly color: Rgb;
}

interface Gradient {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  readonly stops: readonly Stop[];
}

function gradients(svg: string): Map<string, Gradient> {
  const out = new Map<string, Gradient>();
  const blocks = svg.matchAll(/<linearGradient\b([^>]*)>([\s\S]*?)<\/linearGradient>/g);
  for (const block of blocks) {
    const head = attrs(block[1] as string);
    const stops: Stop[] = [];
    for (const stop of (block[2] as string).matchAll(/<stop\b([^>]*)\/?>/g)) {
      const a = attrs(stop[1] as string);
      const raw = a["offset"] ?? "0";
      const offset = raw.endsWith("%") ? Number.parseFloat(raw) / 100 : Number.parseFloat(raw);
      stops.push({ offset, color: parseColor(a["stop-color"] ?? "#000000") });
    }
    if (stops.length < 2) throw new UnsupportedPlateShapeError("a gradient carries fewer than two stops");
    out.set(head["id"] ?? "", {
      x1: Number.parseFloat(head["x1"] ?? "0"),
      y1: Number.parseFloat(head["y1"] ?? "0"),
      x2: Number.parseFloat(head["x2"] ?? "1"),
      y2: Number.parseFloat(head["y2"] ?? "0"),
      stops,
    });
  }
  return out;
}

function sampleGradient(g: Gradient, u: number, v: number): Rgb {
  const dx = g.x2 - g.x1;
  const dy = g.y2 - g.y1;
  const len = dx * dx + dy * dy;
  const t = len === 0 ? 0 : Math.min(1, Math.max(0, ((u - g.x1) * dx + (v - g.y1) * dy) / len));
  const stops = g.stops;
  let lo = stops[0] as Stop;
  let hi = stops[stops.length - 1] as Stop;
  for (let i = 0; i < stops.length - 1; i += 1) {
    const a = stops[i] as Stop;
    const b = stops[i + 1] as Stop;
    if (t >= a.offset && t <= b.offset) {
      lo = a;
      hi = b;
      break;
    }
  }
  const span = hi.offset - lo.offset;
  const k = span === 0 ? 0 : (t - lo.offset) / span;
  return [
    Math.round(lo.color[0] + (hi.color[0] - lo.color[0]) * k),
    Math.round(lo.color[1] + (hi.color[1] - lo.color[1]) * k),
    Math.round(lo.color[2] + (hi.color[2] - lo.color[2]) * k),
  ];
}

const blend = (over: Rgb, under: Rgb, alpha: number): Rgb => [
  Math.round(over[0] * alpha + under[0] * (1 - alpha)),
  Math.round(over[1] * alpha + under[1] * (1 - alpha)),
  Math.round(over[2] * alpha + under[2] * (1 - alpha)),
];

/** Elements we walk past without drawing. Anything not here and not drawable is fatal. */
const INERT = new Set(["svg", "g", "title", "desc", "metadata", "defs"]);

export function rasterizeFlatSvg(svg: string): Raster {
  const root = attrs(/<svg\b([^>]*)>/.exec(svg)?.[1] ?? "");
  const width = Math.round(Number.parseFloat(root["width"] ?? "0"));
  const height = Math.round(Number.parseFloat(root["height"] ?? "0"));
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new UnsupportedPlateShapeError("the root element declares no usable width and height");
  }

  const paints = gradients(svg);
  // Definitions are consumed above; walking them again would draw the gradient stops as shapes.
  const body = svg.replace(/<defs\b[\s\S]*?<\/defs>/g, "").replace(/<!--[\s\S]*?-->/g, "");

  const raster = createRaster(width, height, [255, 255, 255]);
  const stack: { fill?: string; fillOpacity?: string }[] = [];

  for (const tag of body.matchAll(/<(\/?)([a-zA-Z]+)\b([^>]*?)(\/?)>/g)) {
    const closing = tag[1] === "/";
    const name = (tag[2] as string).toLowerCase();
    const a = attrs(tag[3] as string);
    const selfClosing = tag[4] === "/";

    if (name === "g") {
      if (closing) stack.pop();
      else if (!selfClosing) {
        const frame: { fill?: string; fillOpacity?: string } = {};
        if (a["fill"] !== undefined) frame.fill = a["fill"];
        if (a["fill-opacity"] !== undefined) frame.fillOpacity = a["fill-opacity"];
        stack.push(frame);
      }
      continue;
    }
    if (name === "rect") {
      drawRect(raster, a, stack, paints);
      continue;
    }
    if (INERT.has(name)) continue;
    throw new UnsupportedPlateShapeError(`the element <${name}> is outside the supported subset`);
  }

  return raster;
}

function inherited(stack: readonly { fill?: string; fillOpacity?: string }[], key: "fill" | "fillOpacity"): string | undefined {
  for (let i = stack.length - 1; i >= 0; i -= 1) {
    const value = stack[i]?.[key];
    if (value !== undefined) return value;
  }
  return undefined;
}

function drawRect(
  raster: Raster,
  a: Record<string, string>,
  stack: readonly { fill?: string; fillOpacity?: string }[],
  paints: ReadonlyMap<string, Gradient>,
): void {
  const x = Math.round(Number.parseFloat(a["x"] ?? "0"));
  const y = Math.round(Number.parseFloat(a["y"] ?? "0"));
  const w = Math.round(Number.parseFloat(a["width"] ?? "0"));
  const h = Math.round(Number.parseFloat(a["height"] ?? "0"));
  if (w <= 0 || h <= 0) return;

  const fill = a["fill"] ?? inherited(stack, "fill") ?? "#000000";
  const opacityText = a["fill-opacity"] ?? inherited(stack, "fillOpacity") ?? "1";
  const alpha = Math.min(1, Math.max(0, Number.parseFloat(opacityText)));

  if (fill !== "none") {
    const ref = /^url\(#([^)]+)\)$/.exec(fill.trim());
    if (ref) {
      const gradient = paints.get(ref[1] as string);
      if (!gradient) throw new UnsupportedPlateShapeError(`the paint ${JSON.stringify(fill)} is not defined in this file`);
      for (let py = y; py < y + h; py += 1) {
        for (let px = x; px < x + w; px += 1) {
          const tone = sampleGradient(gradient, (px - x) / w, (py - y) / h);
          setPixel(raster, px, py, alpha >= 1 ? tone : blend(tone, getPixel(raster, px, py), alpha));
        }
      }
    } else {
      const tone = parseColor(fill);
      for (let py = y; py < y + h; py += 1) {
        for (let px = x; px < x + w; px += 1) {
          setPixel(raster, px, py, alpha >= 1 ? tone : blend(tone, getPixel(raster, px, py), alpha));
        }
      }
    }
  }

  const stroke = a["stroke"];
  if (stroke !== undefined && stroke !== "none") {
    const tone = parseColor(stroke);
    for (let px = x; px < x + w; px += 1) {
      setPixel(raster, px, y, tone);
      setPixel(raster, px, y + h - 1, tone);
    }
    for (let py = y; py < y + h; py += 1) {
      setPixel(raster, x, py, tone);
      setPixel(raster, x + w - 1, py, tone);
    }
  }
}
