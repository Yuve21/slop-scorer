/**
 * THE END-TO-END EXPORT TEST. The one that made the button shippable.
 *
 * `packages/reproduce/test/export-figure.test.ts` proves the LIBRARY composes a figure that
 * carries its disclaimer at every export size. That was never the risk. `design/SELF-AUDIT.md`
 * risk 3 is specifically that the artifact which travels is produced by a code path legal review
 * never opens - a route, a handler, a share card - and a library test says nothing about a route
 * that resizes, re-encodes, crops, or serves a different figure entirely.
 *
 * So this file goes through the door a user goes through. It imports the SHIPPED handler from
 * `app/api/receipt/[id]/export/route.ts`, calls it with a real `Request`, takes the bytes off the
 * `Response`, decodes the PNG, and OCRs it. Nothing here reaches into the compositor. If the
 * route ever grew its own renderer, or downscaled the output, or swapped the size list, these
 * assertions would go red without anybody having to remember to update them.
 *
 * The mutation proof lives beside this file in `export-route-mutation.test.ts`, where the
 * compositor is broken on purpose and the route is required to refuse.
 */

import { describe, expect, it } from "vitest";
import {
  DISCLAIMER_BODY,
  DISCLAIMER_HEADING,
  EXPORT_SIZES,
  RECREATION_LABEL,
  SUBMITTED_LABEL,
  checkDisclaimerProminence,
  decodePng,
  findEnclosingBorder,
  ocrLines,
} from "@slop/reproduce";
import { GET } from "@/app/api/receipt/[id]/export/route";
import { hasExportableFigure } from "@/lib/export-figure";

/** The sample receipt that HAS a side-by-side. The button only appears on this shape. */
const WITH_FIGURE = "4F2A-9C";
/** The three that do not: could-not-reproduce, refused, not-configured. */
const WITHOUT_FIGURE = ["8B10-2D", "C7E3-51", "A05E-13"];

const call = (id: string, size?: string): Promise<Response> =>
  GET(
    new Request(`https://example.test/api/receipt/${id}/export${size === undefined ? "" : `?size=${size}`}`),
    { params: Promise.resolve({ id }) },
  );

async function pngFrom(response: Response) {
  expect(response.headers.get("content-type")).toBe("image/png");
  const bytes = new Uint8Array(await response.arrayBuffer());
  expect(bytes.length).toBe(Number(response.headers.get("content-length")));
  return decodePng(bytes);
}

describe("the shipped export endpoint carries the disclaimer at every size it will emit", () => {
  it("has sizes to iterate and a receipt that actually has a figure", () => {
    // The denominator, twice over. Without this the whole file could pass having exported
    // nothing: an empty size list, or a fixture that quietly stopped having a reproduction.
    expect(EXPORT_SIZES.length).toBeGreaterThan(4);
    expect(hasExportableFigure(WITH_FIGURE)).toBe(true);
    for (const id of WITHOUT_FIGURE) expect(hasExportableFigure(id)).toBe(false);
  });

  for (const size of EXPORT_SIZES) {
    it(`${size.id} (${size.width}x${size.height}): the bytes the route returns carry the whole band at >= the panel-label height`, async () => {
      const response = await call(WITH_FIGURE, size.id);
      expect(response.status).toBe(200);
      const raster = await pngFrom(response);

      // The file really is the size the route claims, so nothing was resized on the way out.
      expect(raster.width).toBe(size.width);
      expect(raster.height).toBe(size.height);
      expect(response.headers.get("x-figure-size")).toBe(`${size.width}x${size.height}`);

      const report = checkDisclaimerProminence(raster);
      expect(report.problems.join("\n")).toBe("");
      expect(report.ok).toBe(true);
      expect(report.labelHeightPx).not.toBeNull();
      expect(report.disclaimerHeightPx).not.toBeNull();
      expect(report.disclaimerHeightPx as number).toBeGreaterThanOrEqual(report.labelHeightPx as number);
      // The whole body, not its opening words. The last sentence is what a clipped band loses.
      expect(report.recoveredDisclaimer).toContain(DISCLAIMER_BODY.toUpperCase());
      expect(report.recoveredDisclaimer).toContain("CHEAP FOR US TO REMAKE");

      // Both panels are labelled on one line, inside the same border as the band.
      const labels = ocrLines(raster).find((l) => l.text.includes(SUBMITTED_LABEL));
      expect(labels?.text).toContain(RECREATION_LABEL);
      const border = findEnclosingBorder(raster);
      expect(border.found).toBe(true);
      expect(labels?.top).toBeGreaterThan(border.y);

      // The measurement the route publishes in its headers is the measurement we just took, so
      // `curl -I` is a real check and not a decorative header.
      expect(response.headers.get("x-disclaimer-height-px")).toBe(String(report.disclaimerHeightPx));
      expect(response.headers.get("x-panel-label-height-px")).toBe(String(report.labelHeightPx));
    });
  }

  it("names the file after the receipt and the size, so a saved export is identifiable", async () => {
    const response = await call(WITH_FIGURE, "portrait");
    expect(response.headers.get("content-disposition")).toContain(`slop-scorer-${WITH_FIGURE}-portrait.png`);
  });

  it("defaults to a size that exists when none is asked for", async () => {
    const response = await call(WITH_FIGURE);
    expect(response.status).toBe(200);
    const raster = await pngFrom(response);
    expect(checkDisclaimerProminence(raster).ok).toBe(true);
  });
});

describe("the endpoint refuses everything it cannot verify", () => {
  for (const id of WITHOUT_FIGURE) {
    it(`${id}: 404, because there is no two-panel figure to export`, async () => {
      const response = await call(id, "square");
      expect(response.status).toBe(404);
      const body = (await response.json()) as { refused: string; detail: string };
      expect(body.refused).toBe("no_figure_on_this_receipt");
      expect(body.detail).toContain("no side-by-side figure");
    });
  }

  it("refuses a size that is not on the list, rather than inventing one", async () => {
    const response = await call(WITH_FIGURE, "1200x628-for-the-campaign");
    expect(response.status).toBe(400);
    const body = (await response.json()) as { refused: string; detail: string };
    expect(body.refused).toBe("unknown_export_size");
    // A new size has to be added to EXPORT_SIZES, which adds it to every OCR assertion above.
    expect(body.detail).toContain("never had its disclaimer measured");
  });

  it("refuses an unknown receipt", async () => {
    const response = await call("ZZZZ-99", "square");
    expect(response.status).toBe(404);
  });
});

/**
 * MUTATION, on the bytes. `export-route-mutation.test.ts` breaks the composition; this breaks the
 * FILE, which proves the assertion above is capable of going red on this exact pipeline's output
 * rather than passing on a checker that no longer checks anything.
 */
describe("the assertion this file rests on can fail", () => {
  it("goes red when the band is cropped off the bytes the route returned", async () => {
    const raster = await pngFrom(await call(WITH_FIGURE, "square"));
    const cut = Math.floor(raster.height * 0.55);
    const cropped = {
      width: raster.width,
      height: cut,
      data: raster.data.slice(0, raster.width * cut * 4),
    };
    const report = checkDisclaimerProminence(cropped);
    expect(report.ok).toBe(false);
    expect(report.problems.join(" ")).toContain(DISCLAIMER_HEADING);
  });

  it("goes red when the band is painted out of the bytes the route returned", async () => {
    const raster = await pngFrom(await call(WITH_FIGURE, "square"));
    // Erase the bottom third: the band, and nothing above it. A layout assertion would still pass.
    for (let y = Math.floor(raster.height * 0.72); y < raster.height - 20; y += 1) {
      for (let x = 20; x < raster.width - 20; x += 1) {
        const i = (y * raster.width + x) * 4;
        raster.data[i] = 255;
        raster.data[i + 1] = 255;
        raster.data[i + 2] = 255;
      }
    }
    expect(checkDisclaimerProminence(raster).ok).toBe(false);
  });
});
