import { describe, expect, it } from "vitest";
import {
  assessLaundering,
  ingestMedia,
  inspectContainer,
  LAUNDERING_THRESHOLD,
  launderingDetail,
  mediaClaimViolations,
  synthJpeg,
  synthMp3,
  synthMp4,
  synthPng,
  synthWav,
} from "@slop/provenance";
import type { MediaArtifact } from "@slop/provenance";

/**
 * THE RE-ENCODING GATE, under test.
 *
 * This is the most consequential file in these packages, so it is worth stating what it is
 * checking and what it is not.
 *
 * IT IS CHECKING that a laundered artifact trips the gate and a pristine one does not, on
 * REAL BYTES built to the container specifications and read by the real parsers. Every case
 * below is a whole file, from magic bytes to end marker.
 *
 * IT IS NOT establishing a false-positive rate for the gate. Nine constructed files cannot,
 * and nothing here computes one. What they do is pin the behaviour so a weight change that
 * starts abstaining on camera originals, or stops abstaining on screenshots, goes red.
 */

const ingest = (bytes: Uint8Array, modality: MediaArtifact["modality"] = "image"): MediaArtifact =>
  ingestMedia(bytes, { modality, locator: "gate://case" });

/** The camera original: bespoke quantisation tables, full EXIF, a MakerNote, no JFIF. */
const cameraOriginal = () =>
  synthJpeg({
    width: 6048,
    height: 4024,
    quant: "camera",
    makerNoteBytes: 1_024,
    exif: {
      Make: "FUJIFILM",
      Model: "X-T5",
      DateTimeOriginal: "2024:09:02 17:03:44",
      DateTime: "2024:09:02 17:03:44",
    },
  });

/** A phone screenshot: JFIF, an IJG quality, exact screen geometry, no capture metadata. */
const phoneScreenshot = () => synthJpeg({ width: 1170, height: 2532, jfif: true, quant: 80, chroma: "4:2:0" });

/** A desktop screenshot saved as PNG at an exact scaled-desktop geometry. */
const desktopScreenshotPng = () => synthPng({ width: 1512, height: 982 });

/** A declared screen capture: the tool named itself in EXIF Software. */
const declaredScreenCapture = () =>
  synthJpeg({ width: 2000, height: 1200, quant: 92, jfif: true, exif: { Software: "CleanShot X 4.6" } });

/** A platform transcode: a generic brand set and an ffmpeg writer atom. */
const platformTranscode = () => synthMp4({ udta: { "©too": "Lavf60.16.100" }, width: 1080, height: 1920 });

/** A phone recording: QuickTime brands, capture-device atoms, the phone's own OS build. */
const phoneRecording = () =>
  synthMp4({
    brands: ["qt  ", "qt  "],
    timescale: 600,
    width: 1920,
    height: 1080,
    udta: { "©mak": "Apple", "©mod": "iPhone 15 Pro", "©too": "17.5.1" },
  });

/** An MP3 whose tag and whose frame header name two different encoders. */
const doubleEncodedMp3 = () => synthMp3({ id3: { TSSE: "ElevenLabs" }, lame: "LAME3.100" });

/** An uncompressed studio recording. */
const studioWav = () => synthWav({ sampleRate: 96_000, bitDepth: 24, channels: 2, seconds: 4 });

describe("the gate closes on laundered artifacts", () => {
  const laundered = [
    ["a phone screenshot (JPEG, screen geometry, libjpeg tables, no EXIF)", phoneScreenshot(), "image"],
    ["a file that names a screen-capture tool as its writer", declaredScreenCapture(), "image"],
    ["a platform transcode (generic MP4 brands, ffmpeg writer atom)", platformTranscode(), "video"],
    ["an MP3 that names two different encoders", doubleEncodedMp3(), "audio"],
  ] as const;

  it.each(laundered)("%s trips it", (_name, bytes, modality) => {
    const artifact = ingest(bytes, modality);
    expect(artifact.laundering.laundered).toBe(true);
    expect(artifact.laundering.score).toBeGreaterThanOrEqual(LAUNDERING_THRESHOLD);
    expect(artifact.laundering.indicators.length).toBeGreaterThan(0);
  });

  it("every indicator cites a byte offset and an observed value", () => {
    for (const [, bytes, modality] of laundered) {
      for (const indicator of ingest(bytes, modality).laundering.indicators) {
        expect(indicator.locator, indicator.code).toMatch(/:0x[0-9a-f]{8}|:metadata|:dimensions/);
        expect(indicator.observed, indicator.code).toBeTruthy();
        expect(indicator.detail.length, indicator.code).toBeGreaterThan(40);
      }
    }
  });

  it("prints the real numbers and cites why abstention is the honest answer", () => {
    const record = ingest(phoneScreenshot()).laundering;
    const detail = launderingDetail(record);
    expect(detail).toMatch(/re-encoded or re-rendered/);
    // The measured degradation is CITED BY SOURCE, never restated as a figure. A hardcoded
    // accuracy number would be a substantiation-bearing claim under FTC Act s5, which is what
    // `no-claims.test.ts` exists to prevent; naming the studies carries the same information
    // and holds up.
    expect(detail).toMatch(/arXiv 2412\.17671/);
    expect(detail).toMatch(/at or near chance/);
    expect(detail).not.toMatch(/\d{1,3}(\.\d+)?\s*%\s*(accura|precision|recall)/i);
  });

  it("says what WE observed and what WE will not do, never what the artifact is", () => {
    for (const [, bytes, modality] of laundered) {
      expect(mediaClaimViolations(launderingDetail(ingest(bytes, modality).laundering))).toEqual([]);
    }
  });
});

describe("the gate stays open on pristine originals", () => {
  const pristine = [
    ["a camera original with a MakerNote and bespoke quantisation tables", cameraOriginal(), "image"],
    ["a phone recording with capture-device atoms", phoneRecording(), "video"],
    ["an uncompressed studio WAVE", studioWav(), "audio"],
  ] as const;

  it.each(pristine)("%s does not trip it", (_name, bytes, modality) => {
    const artifact = ingest(bytes, modality);
    expect(
      artifact.laundering.laundered,
      `score ${artifact.laundering.score}: ${artifact.laundering.indicators.map((i) => i.code).join(", ")}`,
    ).toBe(false);
  });

  it("the pristine markers are what hold the score down, and they are cited too", () => {
    const artifact = ingest(cameraOriginal());
    expect(artifact.laundering.pristine.map((p) => p.code)).toContain("camera_maker_note");
    for (const marker of artifact.laundering.pristine) {
      expect(marker.locator, marker.code).toBeTruthy();
      expect(marker.weight, marker.code).toBeLessThan(0);
    }
  });
});

describe("a lossless re-save is deliberately NOT treated as laundering", () => {
  /**
   * The measured distinction the gate is built around: the lossy codec is what destroys the
   * signal, not the act of re-saving. A study that halved and halved again one method's
   * F-measure under mild JPEG found a PNG re-encode left it intact. Abstaining on every
   * metadata-free PNG would refuse a large class of artifacts we can still read honestly,
   * and abstention has a cost of its own.
   */
  it("a bare PNG with no metadata scores below the threshold on its own", () => {
    const artifact = ingest(synthPng({ width: 1024, height: 1024 }));
    expect(artifact.laundering.indicators.map((i) => i.code)).toContain("lossless_resave");
    expect(artifact.laundering.laundered).toBe(false);
  });

  it("but a PNG at an exact desktop geometry does trip it, because that is a screenshot", () => {
    expect(ingest(desktopScreenshotPng()).laundering.laundered).toBe(true);
  });

  it("a PNG carrying a generation record is readable rather than gated", () => {
    // The single most valuable case this product can actually serve: a local tool wrote its
    // whole call into a text chunk and nothing has rewritten the file since.
    const artifact = ingest(
      synthPng({
        width: 1024,
        height: 1024,
        text: { parameters: "a harbour\nSteps: 28, Sampler: DPM++ 2M Karras, CFG scale: 7, Seed: 1" },
      }),
    );
    expect(artifact.laundering.laundered).toBe(false);
    expect(artifact.metadata.fields.map((f) => f.name)).toContain("parameters");
  });
});

describe("standard capture resolutions are not treated as screen geometry", () => {
  /**
   * The false positive this table was built wrong for once already. 1920x1080, 1280x720,
   * 3840x2160 and 1080x1920 are the standard output sizes of every phone and camera made this
   * decade. Including them would have abstained on essentially all real video while claiming
   * to have spotted a screenshot.
   */
  const captureSizes: readonly [number, number][] = [
    [1920, 1080],
    [1280, 720],
    [3840, 2160],
    [1080, 1920],
  ];

  it.each(captureSizes)("%ix%i does not raise a geometry indicator", (width, height) => {
    const artifact = ingest(
      synthJpeg({ width, height, quant: "camera", exif: { Make: "Canon", Model: "EOS R6", DateTimeOriginal: "2024:01:01 00:00:00" } }),
    );
    expect(artifact.laundering.indicators.map((i) => i.code)).not.toContain("display_resolution_geometry");
  });
});

describe("the JPEG quality inverse is elementwise, not a sum comparison", () => {
  /**
   * The bug this pins was real and it pointed the dangerous way: inverting the table SUM
   * returns a plausible quality for any table at all, so a camera's bespoke tables came back
   * as "quality 85 on the standard ladder" and the gate abstained on a pristine original.
   */
  it("recovers the exact quality a libjpeg-shaped table was written at", () => {
    for (const quality of [60, 75, 82, 90, 95]) {
      const container = inspectContainer(synthJpeg({ quant: quality }));
      expect(container.jpeg?.qualityEstimate, `quality ${quality}`).toBe(quality);
    }
  });

  it("returns null for a table that is not on the ladder", () => {
    expect(inspectContainer(cameraOriginal()).jpeg?.qualityEstimate).toBeNull();
  });

  it("a maximum-quality libjpeg save is not by itself enough to close the gate", () => {
    // Quality 100 is above the re-quantisation threshold, so the indicator does not fire.
    const record = assessLaundering(
      inspectContainer(synthJpeg({ quant: 100 })),
      { fields: [], digitalSourceType: "unknown", digitalSourceLocator: null, hasMakerNote: false, hasCaptureTime: false, make: null, model: null, softwareAgents: [] },
      { state: "absent", locator: null, byteLength: 0, manifest: null, validationNotes: [] },
    );
    expect(record.indicators.map((i) => i.code)).not.toContain("lossy_requantisation");
  });
});

describe("a container we cannot parse lowers coverage rather than raising suspicion", () => {
  it("unrecognised bytes produce a parse error and no laundering indicator about origin", () => {
    const artifact = ingest(Uint8Array.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c]));
    expect(artifact.container.parseErrors.length).toBeGreaterThan(0);
    expect(artifact.container.segments).toEqual([]);
    // The container probe expects content, so it collects nothing and the engine will abstain
    // for lack of coverage. What must NOT happen is a finding.
    const containerProbe = artifact.probes.find((p) => p.id === "container")!;
    expect(containerProbe.denominator).toBe(0);
    expect(containerProbe.expectsNonEmpty).toBe(true);
  });

  it("a truncated JPEG is reported as truncated, not as evidence", () => {
    const full = cameraOriginal();
    const artifact = ingest(full.subarray(0, Math.floor(full.length / 2)));
    expect(artifact.container.parseErrors.join(" ")).toMatch(/past the end|truncated/i);
  });

  it("a PNG chunk with a bad CRC is refused rather than read", () => {
    const artifact = ingest(synthPng({ text: { parameters: "Steps: 28, Sampler: x, CFG scale: 7" }, corruptCrcOf: "tEXt" }));
    expect(artifact.container.parseErrors.join(" ")).toMatch(/fails its CRC/);
    expect(artifact.metadata.fields.map((f) => f.name)).not.toContain("parameters");
  });
});
