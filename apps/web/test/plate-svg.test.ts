/**
 * The plate markup in the bundle is the plate markup on the wire.
 *
 * `lib/sample-plates.ts` carries the two sample SVGs as source text so the export route never
 * has to read `public/` at request time. That is a copy, and a copy drifts: somebody edits the
 * SVG the page serves, the export keeps drawing the old artwork, and the PNG that travels stops
 * being a picture of the receipt it names. This test is the thing that stops that being silent.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PLATE_SVG_BY_SRC } from "@/lib/sample-plates";
import { UnsupportedPlateShapeError, rasterizeFlatSvg } from "@/lib/plate-raster";

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("the bundled plate markup matches the files the browser is served", () => {
  it("covers both plates, which is the denominator for everything below", () => {
    expect(Object.keys(PLATE_SVG_BY_SRC).sort()).toEqual([
      "/samples/4F2A-9C-recreation.svg",
      "/samples/4F2A-9C-submitted.svg",
    ]);
  });

  for (const [src, markup] of Object.entries(PLATE_SVG_BY_SRC)) {
    it(`${src} is byte for byte the file in public/`, () => {
      const onDisk = readFileSync(path.join(webRoot, "public", src), "utf8");
      expect(markup).toBe(onDisk);
    });
  }
});

describe("the flat-rect rasteriser draws the artifact or refuses to draw at all", () => {
  it("produces a raster at the declared size, with the gradient band and the card row in it", () => {
    const raster = rasterizeFlatSvg(PLATE_SVG_BY_SRC["/samples/4F2A-9C-submitted.svg"] as string);
    expect(raster.width).toBe(1024);
    expect(raster.height).toBe(640);

    const at = (x: number, y: number): readonly number[] => {
      const i = (y * raster.width + x) * 4;
      return [raster.data[i], raster.data[i + 1], raster.data[i + 2]];
    };
    // Top-left of the hero band is the gradient's first stop, #6366F1.
    expect(at(2, 2)).toEqual([99, 102, 241]);
    // Bottom-right of the band has travelled towards the second stop, #3B82F6: bluer, less red.
    const [r1, , b1] = at(1020, 296) as [number, number, number];
    expect(r1).toBeLessThan(99);
    expect(b1).toBeGreaterThan(241);
    // Below the band the page is white, and the card row is drawn on it.
    expect(at(20, 340)).toEqual([255, 255, 255]);
    // Inside the first card: white fill with an #E5E7EB stroke on its edge.
    expect(at(200, 380)).toEqual([255, 255, 255]);
    expect(at(200, 368)).toEqual([229, 231, 235]);
  });

  it("refuses a shape it cannot draw rather than dropping it", () => {
    // The failure being designed against: an element the rasteriser does not know is skipped, and
    // the export ships a plate that is not the artifact. Silence is the defect, so this throws.
    const svg = '<svg width="10" height="10"><circle cx="5" cy="5" r="4" fill="#000000"/></svg>';
    expect(() => rasterizeFlatSvg(svg)).toThrow(UnsupportedPlateShapeError);
  });

  it("refuses a paint it cannot resolve", () => {
    const svg = '<svg width="10" height="10"><rect x="0" y="0" width="4" height="4" fill="url(#nope)"/></svg>';
    expect(() => rasterizeFlatSvg(svg)).toThrow(UnsupportedPlateShapeError);
  });
});
