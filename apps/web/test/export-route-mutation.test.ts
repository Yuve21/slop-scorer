/**
 * MUTATION OF THE SHIPPED PATH. Break the composition, prove the route goes red.
 *
 * `export-route.test.ts` is green. On its own that is worth very little: a suite that renders a
 * figure and asserts a disclaimer is in it will stay green if the checker stops checking, and the
 * corpus this project was learned from shipped exactly that bug three times in one day. So this
 * file replaces `composeFigure` - the ONE compositor both the library suite and the route go
 * through - with versions that produce genuinely defective figures, and requires two things:
 *
 *   1. the route REFUSES. Status 409, a typed refusal code, and no image bytes at all. Not a
 *      warning in a log next to a served PNG;
 *   2. the defect is real. Each mutant's own output is run through the same checker the green
 *      test uses, and must fail it. Without this second assertion the first would also pass on a
 *      route that refused everything.
 *
 * Two mutants, chosen because they are the two failure modes `design/SELF-AUDIT.md` risk 3 names:
 * a band that is not in the finished pixels, and panels that are not symmetric.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

/** Hoisted so the mock factory, which runs before the imports below, can read it. */
const state = vi.hoisted(() => ({ mutation: "none" as "none" | "erase_the_band" | "skew_the_panels" }));

vi.mock("../../../packages/reproduce/src/compose.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../packages/reproduce/src/compose.js")>();
  return {
    ...actual,
    composeFigure: (spec: Parameters<typeof actual.composeFigure>[0], size: Parameters<typeof actual.composeFigure>[1]) => {
      const figure = actual.composeFigure(spec, size);
      if (state.mutation === "erase_the_band") {
        // Paint the disclaimer out in the background colour, leaving the layout untouched. This
        // is the mutation a DOM assertion or a layout assertion cannot see.
        const box = figure.layout.disclaimerBox;
        for (let y = box.y; y < box.y + box.h; y += 1) {
          for (let x = box.x; x < box.x + box.w; x += 1) {
            const i = (y * figure.raster.width + x) * 4;
            figure.raster.data[i] = 255;
            figure.raster.data[i + 1] = 255;
            figure.raster.data[i + 2] = 255;
          }
        }
      }
      if (state.mutation === "skew_the_panels") {
        const [a, b] = figure.layout.plates;
        return { ...figure, layout: { ...figure.layout, plates: [a, { ...b, w: b.w - 24 }] as const } };
      }
      return figure;
    },
  };
});

const { checkDisclaimerProminence, composeFigure, encodePng, decodePng } = await import("@slop/reproduce");
const { GET } = await import("@/app/api/receipt/[id]/export/route");
const { figureSpecFor } = await import("@/lib/export-figure");

const WITH_FIGURE = "4F2A-9C";

const call = (size: string): Promise<Response> =>
  GET(new Request(`https://example.test/api/receipt/${WITH_FIGURE}/export?size=${size}`), {
    params: Promise.resolve({ id: WITH_FIGURE }),
  });

beforeEach(() => {
  state.mutation = "none";
});

describe("the mock is wired to the compositor the route actually uses", () => {
  it("is inert when no mutation is selected, so the green case still passes through it", async () => {
    const response = await call("square");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
  });
});

describe("a figure whose band is not in the pixels is refused, not served", () => {
  it("makes the route answer 409 with a typed code and no image", async () => {
    state.mutation = "erase_the_band";
    const response = await call("square");
    expect(response.status).toBe(409);
    expect(response.headers.get("content-type")).toContain("application/json");
    const body = (await response.json()) as { refused: string; detail: string; problems: string[] };
    expect(body.refused).toBe("disclaimer_not_prominent");
    expect(body.detail).toContain("could not be verified");
    expect(body.problems.length).toBeGreaterThan(0);
  });

  it("is a real defect: the mutant's own bytes fail the check the green suite makes", async () => {
    state.mutation = "erase_the_band";
    const spec = figureSpecFor(WITH_FIGURE);
    expect(spec).not.toBeNull();
    const { EXPORT_SIZES } = await import("@slop/reproduce");
    const size = EXPORT_SIZES.find((s) => s.id === "square");
    const mutant = composeFigure(spec as NonNullable<typeof spec>, size as NonNullable<typeof size>);
    const report = checkDisclaimerProminence(decodePng(encodePng(mutant.raster)));
    expect(report.ok).toBe(false);
  });
});

describe("a figure whose panels are not symmetric is refused, not served", () => {
  it("makes the route answer 409 before anything is even encoded", async () => {
    state.mutation = "skew_the_panels";
    const response = await call("square");
    expect(response.status).toBe(409);
    const body = (await response.json()) as { refused: string; problems: string[] };
    expect(body.refused).toBe("panels_not_symmetric");
    expect(body.problems.join(" ")).toContain("differ in size");
  });

  it("recovers on the next request, so the refusal is about the figure and not a stuck endpoint", async () => {
    state.mutation = "skew_the_panels";
    expect((await call("square")).status).toBe(409);
    state.mutation = "none";
    expect((await call("square")).status).toBe(200);
  });
});
