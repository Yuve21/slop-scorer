/**
 * THE EXPORT PATH. One function, and it is allowed to say no.
 *
 * `design/SELF-AUDIT.md` risk 3 is the reason this module is shaped the way it is: the artifact
 * that travels is a PNG, and it is emitted by a code path that a legal review never opens. The
 * mitigation is not a careful renderer. It is that the renderer and the checked renderer are the
 * SAME renderer, and that the check runs on the bytes on their way out of the door.
 *
 * So `renderFigureExport` is the only way to obtain figure bytes, and it does four things in an
 * order that matters:
 *
 *   1. compose, through `composeFigure` - the compositor the OCR suite already validates. There
 *      is no second compositor in this product, and adding one would be the exact drift this
 *      module exists to prevent;
 *   2. check the LAYOUT for panel symmetry, because an asymmetric figure makes an accusation the
 *      copy underneath cannot retract (`publicity-defamation-risk.md` §2);
 *   3. encode to PNG, then decode those same bytes back and require them to be pixel-identical to
 *      what was composed, so an encoder bug cannot ship a figure nobody checked;
 *   4. run `checkDisclaimerProminence` on the DECODED bytes. Not on the composed raster: on the
 *      file. That is the artifact a reader sees.
 *
 * Any failure throws `ExportRefusedError`. Not a warning, not a fallback, not a smaller band: no
 * bytes at all. A refused export is a support ticket. An unverified one is an exhibit.
 */

import type { ExportSize, FigureLayout, FigureSpec, ProminenceReport, SymmetryReport } from "./compose.js";
import { EXPORT_SIZES, FigureTooSmallError, checkDisclaimerProminence, checkPanelSymmetry, composeFigure } from "./compose.js";
import { decodePng, encodePng } from "./png.js";
import { rastersEqual } from "./raster.js";

/**
 * Why an export was refused. A caller switches on this; nobody parses the sentence.
 *
 * Every arm is a real defect rather than a category of one, so a client can say something true
 * and specific to the person who pressed the button.
 */
export type ExportRefusalCode =
  | "unknown_export_size"
  | "figure_does_not_fit"
  | "panels_not_symmetric"
  | "bytes_do_not_match_the_figure"
  | "disclaimer_not_prominent";

export class ExportRefusedError extends Error {
  readonly code: ExportRefusalCode;
  readonly sizeId: string;
  readonly problems: readonly string[];

  constructor(code: ExportRefusalCode, sizeId: string, problems: readonly string[]) {
    super(
      `we refused to emit this figure at size "${sizeId}" [${code}]. ` +
        `The band that qualifies the two panels could not be verified in the finished bytes, so there are no bytes:\n` +
        problems.map((p) => `  - ${p}`).join("\n"),
    );
    this.name = "ExportRefusedError";
    this.code = code;
    this.sizeId = sizeId;
    this.problems = problems;
  }
}

export interface FigureExport {
  /** The PNG. Verified after encoding, never before. */
  readonly bytes: Uint8Array;
  readonly mediaType: "image/png";
  readonly size: ExportSize;
  readonly layout: FigureLayout;
  /** The measurement, carried out of the function so a caller can print or log it. */
  readonly prominence: ProminenceReport;
  readonly symmetry: SymmetryReport;
}

/** Resolve a size id against the one list. Returns undefined rather than inventing a size. */
export const exportSizeById = (id: string): ExportSize | undefined => EXPORT_SIZES.find((s) => s.id === id);

/**
 * Compose, encode, and verify the encoded bytes. Throws `ExportRefusedError` if any gate fails.
 *
 * The gates are ordered cheapest-first, but every one of them is fatal, so the order is an
 * efficiency detail and not a policy: there is no gate here that only logs.
 */
export function renderFigureExport(spec: FigureSpec, size: ExportSize): FigureExport {
  let composed;
  try {
    composed = composeFigure(spec, size);
  } catch (error) {
    if (error instanceof FigureTooSmallError) {
      throw new ExportRefusedError("figure_does_not_fit", size.id, [error.message]);
    }
    throw error;
  }

  const symmetry = checkPanelSymmetry(composed.layout);
  if (!symmetry.ok) throw new ExportRefusedError("panels_not_symmetric", size.id, symmetry.problems);

  const bytes = encodePng(composed.raster);
  const decoded = decodePng(bytes);
  if (!rastersEqual(decoded, composed.raster)) {
    throw new ExportRefusedError("bytes_do_not_match_the_figure", size.id, [
      `the ${bytes.length}-byte file does not decode back to the figure it was encoded from, so what a reader would see is not what was checked`,
    ]);
  }

  const prominence = checkDisclaimerProminence(decoded);
  if (!prominence.ok) throw new ExportRefusedError("disclaimer_not_prominent", size.id, prominence.problems);

  return { bytes, mediaType: "image/png", size, layout: composed.layout, prominence, symmetry };
}
