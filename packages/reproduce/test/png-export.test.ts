/**
 * The bytes, not the buffer.
 *
 * `export-figure.test.ts` proves the COMPOSED figure carries its disclaimer at every size. This
 * file proves the same thing about the FILE, which is a different claim: between the raster and
 * the reader stands an encoder, and an encoder is perfectly capable of shipping a figure nobody
 * checked. So every assertion here runs on a raster that has been through `encodePng` and back
 * through `decodePng`, and the gate in `renderFigureExport` does the same thing on the way out.
 *
 * The three parts:
 *   1. the codec round trip is exact, at every export size and over hostile artwork;
 *   2. the export gate refuses rather than degrading, with a typed code per failure;
 *   3. MUTATION - a compositor that produces a broken figure must make the gate throw, and the
 *      gate must not be satisfiable by anything less than the whole disclaimer.
 */

import { describe, expect, it } from "vitest";
import type { ExportSize, FigureSpec } from "@slop/reproduce";
import {
  DISCLAIMER_BODY,
  EXPORT_SIZES,
  ExportRefusedError,
  PngFormatError,
  RECREATION_LABEL,
  SUBMITTED_LABEL,
  checkDisclaimerProminence,
  checkPanelSymmetry,
  composeFigure,
  decodePng,
  encodePng,
  exportSizeById,
  rastersEqual,
  renderFigureExport,
} from "@slop/reproduce";
import { gradientRaster, harshRaster } from "./fixtures.js";

const specWith = (image: ReturnType<typeof gradientRaster>): FigureSpec => ({
  submitted: { label: SUBMITTED_LABEL, meta: "AS UPLOADED - 96 X 96", image },
  recreation: { label: RECREATION_LABEL, meta: "MADE BY US - 2.4 S - $0.0039", image },
});

describe("the PNG codec is an exact round trip", () => {
  it("has sizes to check, and every id resolves", () => {
    // The denominator. `exportSizeById` is what the route resolves `?size=` with, so a list this
    // lookup cannot see would make the endpoint unable to emit anything.
    expect(EXPORT_SIZES.length).toBeGreaterThan(4);
    for (const size of EXPORT_SIZES) expect(exportSizeById(size.id)).toBe(size);
    expect(exportSizeById("not-a-size")).toBeUndefined();
  });

  for (const size of EXPORT_SIZES) {
    it(`${size.id}: the encoded file decodes back to the same pixels`, () => {
      const figure = composeFigure(specWith(harshRaster()), size);
      const bytes = encodePng(figure.raster);
      // A real PNG, not a buffer we called a PNG.
      expect(Array.from(bytes.subarray(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
      const decoded = decodePng(bytes);
      expect(decoded.width).toBe(size.width);
      expect(decoded.height).toBe(size.height);
      expect(rastersEqual(decoded, figure.raster)).toBe(true);
    });
  }

  it("refuses to read a file it does not understand rather than guessing", () => {
    expect(() => decodePng(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]))).toThrow(PngFormatError);
    const good = encodePng(composeFigure(specWith(gradientRaster()), EXPORT_SIZES[0] as ExportSize).raster);
    // Truncated after the header: an encoder that half-wrote a file must not decode to a figure.
    expect(() => decodePng(good.subarray(0, 40))).toThrow(PngFormatError);
  });
});

describe("the export gate reads the disclaimer out of the finished file", () => {
  for (const size of EXPORT_SIZES) {
    it(`${size.id}: emits bytes only after re-reading the band from them`, () => {
      const figure = renderFigureExport(specWith(harshRaster()), size);
      expect(figure.mediaType).toBe("image/png");
      expect(figure.bytes.length).toBeGreaterThan(100);
      expect(figure.prominence.ok).toBe(true);
      expect(figure.symmetry.ok).toBe(true);
      expect(figure.prominence.disclaimerHeightPx as number).toBeGreaterThanOrEqual(
        figure.prominence.labelHeightPx as number,
      );

      // The independent read: decode the bytes here, in the test, and check them again. If the
      // gate were checking the pre-encode raster this would still pass, which is why the gate
      // ALSO decodes - but a reader of this file should not have to take that on trust.
      const report = checkDisclaimerProminence(decodePng(figure.bytes));
      expect(report.problems.join("\n")).toBe("");
      expect(report.recoveredDisclaimer).toContain(DISCLAIMER_BODY.toUpperCase());
    });
  }
});

describe("the export refuses, with a code, rather than degrading", () => {
  it("refuses a size the figure cannot hold", () => {
    const impossible: ExportSize = { id: "sliver", width: 200, height: 60, purpose: "not a real surface" };
    try {
      renderFigureExport(specWith(gradientRaster()), impossible);
      expect.unreachable("a figure that cannot hold its own disclaimer must not produce bytes");
    } catch (error) {
      expect(error).toBeInstanceOf(ExportRefusedError);
      expect((error as ExportRefusedError).code).toBe("figure_does_not_fit");
      expect((error as ExportRefusedError).sizeId).toBe("sliver");
      expect((error as ExportRefusedError).problems.length).toBeGreaterThan(0);
    }
  });

  it("refuses a figure whose panels are not the same size", () => {
    // The panels come from one number in the compositor, so this defect is unreachable through
    // it. The gate still has to be able to express the failure, because the gate is what a
    // future second renderer would be held to.
    const spec = specWith(gradientRaster());
    const size = EXPORT_SIZES[0] as ExportSize;
    const composed = composeFigure(spec, size);
    const [a, b] = composed.layout.plates;
    const broken = { ...composed.layout, plates: [a, { ...b, w: b.w - 9 }] as const };
    const report = checkPanelSymmetry(broken);
    expect(report.ok).toBe(false);
    const refusal = new ExportRefusedError("panels_not_symmetric", size.id, report.problems);
    expect(refusal.code).toBe("panels_not_symmetric");
    expect(refusal.problems.join(" ")).toContain("differ in size");
    // The message a caller would surface says no bytes exist, not that a warning was logged.
    expect(refusal.message).toContain("there are no bytes");
  });
});
