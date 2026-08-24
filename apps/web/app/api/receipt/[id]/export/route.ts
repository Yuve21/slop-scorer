import type { ExportRefusalCode } from "@slop/reproduce";
import { EXPORT_SIZES, ExportRefusedError, exportSizeById, renderFigureExport } from "@slop/reproduce";
import { figureSpecFor } from "@/lib/export-figure";

/**
 * THE EXPORT ENDPOINT. The one route on this site that can hand somebody a file.
 *
 * `design/SELF-AUDIT.md` risk 3, in one sentence: the artifact that travels is a PNG, rendered by
 * a code path legal review never opens. The web build deliberately shipped "Copy the permalink"
 * instead of an export button on exactly that reasoning, and the condition attached to shipping
 * the button was that the guarantee become testable end to end. This route is the end.
 *
 * Three properties, and they are the whole design:
 *
 *   ONE COMPOSITOR. The bytes come from `renderFigureExport`, which composes through
 *   `composeFigure` - the same function the 32-test OCR suite in `packages/reproduce` renders,
 *   OCRs and mutation-tests. There is no second renderer for the web, no canvas path, no
 *   `og:image` variant of the layout. The tested guarantee and the shipped artifact cannot drift
 *   because they are the same code.
 *
 *   IT FAILS CLOSED. If `checkDisclaimerProminence` cannot read the whole disclaimer back out of
 *   the encoded bytes, at or above the panel-label pixel height, inside the same border as both
 *   panels, then `renderFigureExport` throws and this route answers 409 with the refusal code and
 *   the list of problems. It does not log a warning and serve the file. A figure whose disclaimer
 *   we cannot verify is precisely the document the legal memo says not to publish, and the button
 *   in the UI says so in those words.
 *
 *   THE MEASUREMENT TRAVELS WITH THE FILE. A successful response carries the two measured pixel
 *   heights in headers, so the guarantee is checkable with `curl -I` by somebody who does not
 *   trust this comment.
 *
 * `og:image` is unaffected and stays as decided: the 1200x630 card does not carry the two plates,
 * because it cannot hold them plus a full-size band, and shrinking the band for the card is the
 * named defect. This route will happily emit the `og` SIZE, because it emits it with the band at
 * full size or not at all.
 */

/** Refusals this route can answer with, over and above the ones the compositor raises. */
type RouteRefusal = ExportRefusalCode | "no_figure_on_this_receipt";

const refuse = (
  refused: RouteRefusal,
  detail: string,
  status: number,
  problems: readonly string[] = [],
): Response =>
  Response.json(
    { refused, detail, problems },
    { status, headers: { "cache-control": "no-store" } },
  );

export async function GET(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await context.params;
  const requested = new URL(request.url).searchParams.get("size") ?? "square";

  const size = exportSizeById(requested);
  if (!size) {
    return refuse(
      "unknown_export_size",
      `There is no export size called "${requested}". Every size this product emits is one of: ${EXPORT_SIZES.map((s) => s.id).join(", ")}. A size that is not on that list has never had its disclaimer measured, so it does not exist.`,
      400,
    );
  }

  const spec = figureSpecFor(id);
  if (!spec) {
    return refuse(
      "no_figure_on_this_receipt",
      "This receipt has no side-by-side figure. Nothing was reproduced for it, so there is no two-panel image to export and a one-panel export carrying a two-panel disclaimer would describe a comparison that does not exist.",
      404,
    );
  }

  try {
    const figure = renderFigureExport(spec, size);
    const downloadName = `slop-scorer-${id}-${size.id}.png`;
    return new Response(new Uint8Array(figure.bytes), {
      status: 200,
      headers: {
        "content-type": figure.mediaType,
        "content-length": String(figure.bytes.length),
        "content-disposition": `attachment; filename="${downloadName}"`,
        // Deterministic input, deterministic bytes. Safe to cache hard.
        "cache-control": "public, max-age=3600, s-maxage=86400, immutable",
        // The check, in the response. Both numbers are read back out of the encoded PNG.
        "x-disclaimer-height-px": String(figure.prominence.disclaimerHeightPx ?? 0),
        "x-panel-label-height-px": String(figure.prominence.labelHeightPx ?? 0),
        "x-figure-size": `${size.width}x${size.height}`,
      },
    });
  } catch (error) {
    if (error instanceof ExportRefusedError) {
      return refuse(
        error.code,
        "We refused to emit this file. The disclaimer band could not be verified in the finished pixels, and an export whose disclaimer we cannot verify is the one document this product must not put into circulation.",
        409,
        error.problems,
      );
    }
    throw error;
  }
}
