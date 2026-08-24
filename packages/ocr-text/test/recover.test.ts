import { describe, expect, it } from "vitest";
import { INK, PAPER, createRaster, drawText, encodePng } from "@slop/reproduce";
import { MIN_USABLE_CONFIDENCE, extractSvgText, readRasterText, recoverText } from "@slop/ocr-text";

/**
 * What this suite is actually protecting.
 *
 * A recovery module fails in one direction that matters: it INVENTS. A rule downstream quotes
 * the invention verbatim as evidence that somebody left "Your headline here" in a graphic, and
 * the page it accuses had a photograph of a beach in it. So most of what follows asserts
 * silence, and asserts that the silence carries a reason: an image nothing could be read from
 * must come back with `abstained` set, never as an empty string that a caller could read as
 * "no words in this picture".
 *
 * The other half is the denominator discipline the probe layer runs on. `extractSvgText`
 * returns how many text-bearing elements it SAW alongside what it read, because a scan that
 * finds twelve `<text>` nodes and recovers nothing is a broken pattern, and a caller holding
 * only a string cannot tell that apart from a quiet graphic.
 */

/** Render a line of type the way the export figure does, and hand back real PNG bytes. */
const pngOf = (lines: readonly string[], scale = 3): Uint8Array => {
  const raster = createRaster(420, 40 + lines.length * (7 * scale + 8), PAPER);
  lines.forEach((line, i) => drawText(raster, line, 12, 16 + i * (7 * scale + 8), scale, INK));
  return encodePng(raster);
};

describe("reading type out of an SVG", () => {
  it("recovers text, tspans, titles and character references", () => {
    const read = extractSvgText(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 200">
         <title>Hero image</title>
         <text x="20" y="60">Your headline here</text>
         <text x="20" y="120"><tspan>Built &amp; shipped &#8212; fast</tspan></text>
       </svg>`,
    );
    expect(read.text).toContain("Hero image");
    expect(read.text).toContain("Your headline here");
    // The entity is decoded, so an em dash recovered from a graphic is an em dash to the rules
    // that count them rather than the seven characters "&#8212;".
    expect(read.text).toContain("Built & shipped — fast");
    expect(read.elements).toBeGreaterThanOrEqual(4);
    expect(read.matched).toBeGreaterThanOrEqual(3);
  });

  it("does not report a nested tspan's words twice", () => {
    // A `<text>` wrapping two `<tspan>`s would otherwise be counted three times, and an em-dash
    // density computed over the recovery would be inflated by a factor the file never had.
    const read = extractSvgText(`<svg><text><tspan>Delve</tspan> <tspan>deeper</tspan></text></svg>`);
    expect(read.text.split("\n").filter((l) => l.includes("Delve"))).toHaveLength(1);
  });

  it("says how many text elements it SAW, so an empty read cannot pass as a quiet graphic", () => {
    const drawnAsPaths = extractSvgText(`<svg><path d="M0 0 L10 10"/></svg>`);
    expect(drawnAsPaths.elements).toBe(0);

    const emptyNodes = extractSvgText(`<svg><text x="1" y="2"></text><text x="1" y="9"> </text></svg>`);
    expect(emptyNodes.elements).toBe(2);
    expect(emptyNodes.matched).toBe(0);

    const recovered = recoverText({ src: "/hero.svg", contentType: "image/svg+xml", bytes: Buffer.from(`<svg><text x="1" y="2"></text></svg>`) });
    expect(recovered.abstained).toContain("text element(s) were found and none carried characters");
  });

  it("strips comments, so commented-out copy is not reported as rendered copy", () => {
    const read = extractSvgText(`<svg><!-- <text>Lorem ipsum</text> --><text>Real words</text></svg>`);
    expect(read.text).toBe("Real words");
  });
});

describe("reading type out of pixels", () => {
  it("round-trips real PNG bytes: what was drawn is what comes back", () => {
    const read = readRasterText(pngOf(["MADE WITH LOVABLE", "YOUR HEADLINE HERE"]));
    expect(read.abstained).toBeUndefined();
    expect(read.confidence).toBeGreaterThanOrEqual(MIN_USABLE_CONFIDENCE);
    expect(read.text).toContain("MADE WITH LOVABLE");
    expect(read.text).toContain("YOUR HEADLINE HERE");
    expect(read.lines).toBe(2);
  });

  it("abstains with a reason on pixels that are not type", () => {
    // A photograph is the ordinary input, and the ordinary answer is "no". The reason has to
    // say so in words a report can print, because an empty string here would be read as a
    // clean image by anything downstream.
    const noise = createRaster(64, 64, PAPER);
    for (let y = 0; y < 64; y += 1) {
      for (let x = 0; x < 64; x += 1) {
        if ((x * 7 + y * 13) % 5 === 0) noise.data[(y * 64 + x) * 4 + 0] = 10;
      }
    }
    const read = readRasterText(encodePng(noise));
    expect(read.text).toBe("");
    expect(read.abstained).toBeTruthy();
    expect(read.abstained).toContain("NOT a finding that the image has no words in it");
  });

  it("abstains rather than throwing on bytes that are not a PNG at all", () => {
    const read = readRasterText(Buffer.from("<html>this is not an image</html>"));
    expect(read.abstained).toContain("could not be decoded as a raster");
    expect(read.confidence).toBe(0);
  });
});

describe("the one door", () => {
  it("routes by content type first and extension second", () => {
    const svgByType = recoverText({
      src: "/asset",
      contentType: "image/svg+xml; charset=utf-8",
      bytes: Buffer.from(`<svg><text>Placeholder</text></svg>`),
    });
    expect(svgByType.method).toBe("svg-text");
    expect(svgByType.text).toBe("Placeholder");

    const svgByExtension = recoverText({ src: "/asset.svg?v=2", bytes: Buffer.from(`<svg><text>Placeholder</text></svg>`) });
    expect(svgByExtension.method).toBe("svg-text");
  });

  it("names the format it cannot read instead of returning nothing", () => {
    // The honest shape of the blind spot: most of the web's imagery is JPEG and WebP, this
    // build decodes neither, and the record says which one it met rather than going quiet.
    const jpeg = recoverText({ src: "/photo.jpg", contentType: "image/jpeg", bytes: Buffer.from([0xff, 0xd8]) });
    expect(jpeg.text).toBe("");
    expect(jpeg.abstained).toContain("image/jpeg");
    expect(jpeg.abstained).toContain("never examined");
  });

  it("never returns a recovered string without a confidence, or an empty one without a reason", () => {
    const cases = [
      recoverText({ src: "/a.svg", bytes: Buffer.from(`<svg><text>Words</text></svg>`) }),
      recoverText({ src: "/b.png", bytes: pngOf(["HELLO"]) }),
      recoverText({ src: "/c.png", bytes: Buffer.from("not a png") }),
      recoverText({ src: "/d.webp", contentType: "image/webp", bytes: Buffer.from([0]) }),
    ];
    for (const c of cases) {
      if (c.text.length > 0) expect(c.confidence, `${c.src} recovered text with no confidence`).toBeGreaterThan(0);
      else expect(c.abstained, `${c.src} recovered nothing and gave no reason`).toBeTruthy();
    }
  });
});
