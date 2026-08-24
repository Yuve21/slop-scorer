/**
 * THE OCR EXPORT TEST. The highest-priority test in this package.
 *
 * `design/SELF-AUDIT.md` risk 3 asks for it by name and says why it comes before everything else:
 * "an automated test that renders every export size, OCRs the output, and asserts the disclaimer
 * text is present at >= the panel-label pixel height ... this should be the first test in the repo,
 * before any detector logic, because it is the only one whose failure is a legal exposure rather
 * than a bug."
 *
 * It reads PIXELS. A check against the layout object would pass on a figure whose disclaimer was
 * clipped, drawn off the canvas, painted in the background colour, or laid out under the panels -
 * and each of those is a real way a share card loses its disclaimer.
 *
 * The suite is in four parts:
 *   1. every export size, over two very different panel images, passes the full prominence check;
 *   2. the panels are symmetric, asserted from the layout AND byte for byte from the pixels;
 *   3. MUTATION - four deliberately broken figures, each of which must make the checker go red.
 *      Without this the whole file could be passing on a checker that no longer checks anything,
 *      which is the exact failure this repository's meta-suite exists to catch;
 *   4. the figure refuses to exist at a size where the disclaimer would have to shrink.
 */

import { describe, expect, it } from "vitest";
import type { ExportSize, FigureSpec } from "@slop/reproduce";
import {
  DISCLAIMER_BODY,
  DISCLAIMER_HEADING,
  EXPORT_SIZES,
  FigureTooSmallError,
  INK,
  RECREATION_LABEL,
  SUBMITTED_LABEL,
  checkDisclaimerProminence,
  checkPanelSymmetry,
  composeFigure,
  createRaster,
  crop,
  drawText,
  findEnclosingBorder,
  glyphHeightPx,
  ocrLines,
  rastersEqual,
} from "@slop/reproduce";
import { gradientRaster, harshRaster } from "./fixtures.js";

const specWith = (image: ReturnType<typeof gradientRaster>): FigureSpec => ({
  submitted: { label: SUBMITTED_LABEL, meta: "AS UPLOADED - 96 X 96", image },
  recreation: { label: RECREATION_LABEL, meta: "MADE BY US - 2.4 S - $0.0039", image },
});

describe("the export figure carries its disclaimer at every size", () => {
  it("has a non-empty set of export sizes to check", () => {
    // The denominator. Every assertion below iterates this list, so an empty list would make the
    // whole file vacuously green.
    expect(EXPORT_SIZES.length).toBeGreaterThan(4);
    expect(new Set(EXPORT_SIZES.map((s) => s.id)).size).toBe(EXPORT_SIZES.length);
  });

  for (const size of EXPORT_SIZES) {
    for (const [artwork, image] of [
      ["a pale gradient", gradientRaster()],
      ["near-black high-contrast artwork", harshRaster()],
    ] as const) {
      it(`${size.id} (${size.width}x${size.height}) over ${artwork}: the disclaimer is in the pixels, inside the same border, at >= the panel-label height`, () => {
        const figure = composeFigure(specWith(image), size);
        const report = checkDisclaimerProminence(figure.raster);

        expect(report.problems.join("\n")).toBe("");
        expect(report.ok).toBe(true);
        // The measurement the legal requirement is actually about, asserted explicitly rather than
        // left implicit in `ok`.
        expect(report.labelHeightPx).not.toBeNull();
        expect(report.disclaimerHeightPx).not.toBeNull();
        expect(report.disclaimerHeightPx as number).toBeGreaterThanOrEqual(report.labelHeightPx as number);
        expect(report.recoveredDisclaimer).toContain(DISCLAIMER_BODY.toUpperCase());
      });
    }
  }

  it("recovers the whole disclaimer, not merely its opening words", () => {
    const figure = composeFigure(specWith(gradientRaster()), EXPORT_SIZES[0] as ExportSize);
    const report = checkDisclaimerProminence(figure.raster);
    // The last sentence is the one a clipped band loses first.
    expect(report.recoveredDisclaimer).toContain("CHEAP FOR US TO REMAKE");
    expect(report.recoveredDisclaimer.length).toBeGreaterThanOrEqual(DISCLAIMER_BODY.length);
  });
});

describe("the two panels are interchangeable as objects", () => {
  for (const size of EXPORT_SIZES) {
    it(`${size.id}: the layout is symmetric and the two plates are byte-identical for identical input`, () => {
      const image = harshRaster();
      const figure = composeFigure(specWith(image), size);
      const symmetry = checkPanelSymmetry(figure.layout);
      expect(symmetry.problems.join("\n")).toBe("");

      // The strong form: the same artwork into both panels must produce the same pixels. This is
      // what catches a highlight, a different plate fill, or a badge on the recreation.
      const [a, b] = figure.layout.plates;
      expect(rastersEqual(crop(figure.raster, a), crop(figure.raster, b))).toBe(true);
    });
  }

  it("catches an asymmetric layout rather than passing it", () => {
    const figure = composeFigure(specWith(gradientRaster()), EXPORT_SIZES[0] as ExportSize);
    const [a, b] = figure.layout.plates;
    const skewed = checkPanelSymmetry({
      ...figure.layout,
      plates: [a, { ...b, w: b.w - 12 }] as const,
    });
    expect(skewed.ok).toBe(false);
    expect(skewed.problems.join(" ")).toContain("differ in size");
  });
});

/**
 * MUTATION. Each case breaks one real thing and the checker must go red for it.
 *
 * A checker that cannot express its own failure mode is decoration, and the source corpus this
 * project inherited shipped exactly that bug three times in one day.
 */
describe("the prominence checker fails on figures that are actually broken", () => {
  const size = EXPORT_SIZES[0] as ExportSize;

  it("a crop that removes the band is caught", () => {
    const figure = composeFigure(specWith(gradientRaster()), size);
    const cropped = crop(figure.raster, { x: 0, y: 0, w: size.width, h: Math.floor(size.height * 0.55) });
    const report = checkDisclaimerProminence(cropped);
    expect(report.ok).toBe(false);
    expect(report.problems.join(" ")).toContain(DISCLAIMER_HEADING);
  });

  it("a disclaimer smaller than the panel labels is caught", () => {
    // Hand-built rather than produced by `composeFigure`, on purpose: the compositor cannot express
    // this defect, and a checker is only worth having if it catches figures the compositor did not
    // make - the og:image route, a designer's export, a future renderer.
    const r = createRaster(900, 500);
    const labelScale = 3;
    const smallScale = 1;
    for (let x = 20; x < 880; x += 1) {
      drawText(r, "", 0, 0, 1, INK);
      r.data[(20 * 900 + x) * 4] = 17;
      r.data[(20 * 900 + x) * 4 + 1] = 17;
      r.data[(20 * 900 + x) * 4 + 2] = 17;
      r.data[(479 * 900 + x) * 4] = 17;
      r.data[(479 * 900 + x) * 4 + 1] = 17;
      r.data[(479 * 900 + x) * 4 + 2] = 17;
    }
    for (let y = 20; y < 480; y += 1) {
      for (const x of [20, 879]) {
        r.data[(y * 900 + x) * 4] = 17;
        r.data[(y * 900 + x) * 4 + 1] = 17;
        r.data[(y * 900 + x) * 4 + 2] = 17;
      }
    }
    drawText(r, `${SUBMITTED_LABEL}   ${RECREATION_LABEL}`, 40, 60, labelScale, INK);
    drawText(r, DISCLAIMER_HEADING, 40, 300, smallScale, INK);
    let y = 300 + glyphHeightPx(smallScale) + 4;
    for (const line of DISCLAIMER_BODY.toUpperCase().match(/.{1,120}(\s|$)/g) ?? []) {
      drawText(r, line.trim(), 40, y, smallScale, INK);
      y += glyphHeightPx(smallScale) + 4;
    }

    const report = checkDisclaimerProminence(r);
    expect(report.labelHeightPx).toBe(glyphHeightPx(labelScale));
    expect(report.disclaimerHeightPx).toBe(glyphHeightPx(smallScale));
    expect(report.ok).toBe(false);
    expect(report.problems.join(" ")).toContain("must never be smaller than the labels");
  });

  it("a disclaimer painted in the background colour is caught", () => {
    const image = gradientRaster();
    const figure = composeFigure(specWith(image), size);
    const box = figure.layout.disclaimerBox;
    // Erase the band, leaving the layout untouched. A DOM assertion would still pass here.
    for (let y = box.y; y < box.y + box.h; y += 1) {
      for (let x = box.x; x < box.x + box.w; x += 1) {
        const i = (y * figure.raster.width + x) * 4;
        figure.raster.data[i] = 255;
        figure.raster.data[i + 1] = 255;
        figure.raster.data[i + 2] = 255;
      }
    }
    const report = checkDisclaimerProminence(figure.raster);
    expect(report.ok).toBe(false);
  });

  it("panels with no enclosing border at all are caught", () => {
    const r = createRaster(900, 500);
    drawText(r, `${SUBMITTED_LABEL}   ${RECREATION_LABEL}`, 40, 40, 3, INK);
    drawText(r, DISCLAIMER_HEADING, 40, 200, 3, INK);
    const report = checkDisclaimerProminence(r);
    expect(report.ok).toBe(false);
    expect(findEnclosingBorder(r).found).toBe(false);
  });
});

describe("the figure refuses rather than shrinking", () => {
  it("throws at a size where the band would not fit", () => {
    const impossible: ExportSize = { id: "sliver", width: 200, height: 60, purpose: "not a real surface" };
    expect(() => composeFigure(specWith(gradientRaster()), impossible)).toThrow(FigureTooSmallError);
  });

  it("chooses one scale for every line of type, so there is no independent size to shrink", () => {
    for (const size of EXPORT_SIZES) {
      const { layout } = composeFigure(specWith(gradientRaster()), size);
      expect(layout.disclaimerHeightPx, size.id).toBe(layout.labelHeightPx);
      expect(layout.labelHeightPx, size.id).toBe(glyphHeightPx(layout.textScale));
    }
  });

  it("keeps the band inside the card border in the layout as well as in the pixels", () => {
    for (const size of EXPORT_SIZES) {
      const { layout, raster } = composeFigure(specWith(gradientRaster()), size);
      const { card, disclaimerBox: d } = layout;
      expect(d.y, size.id).toBeGreaterThan(card.y);
      expect(d.y + d.h, size.id).toBeLessThanOrEqual(card.y + card.h);
      const border = findEnclosingBorder(raster);
      expect(border.found, size.id).toBe(true);
      expect(border.y, size.id).toBe(card.y);
      expect(border.y + border.h, size.id).toBe(card.y + card.h);
      // And the band rule really is inside the card, not the card's own bottom edge.
      expect(layout.bandRule.y, size.id).toBeLessThan(d.y);
      expect(layout.bandRule.y, size.id).toBeGreaterThan(layout.plates[0].y);
    }
  });

  it("reads the panel labels back as one line, which is what the height comparison rests on", () => {
    const figure = composeFigure(specWith(gradientRaster()), EXPORT_SIZES[1] as ExportSize);
    const line = ocrLines(figure.raster).find((l) => l.text.includes(SUBMITTED_LABEL));
    expect(line?.text).toContain(RECREATION_LABEL);
  });
});
