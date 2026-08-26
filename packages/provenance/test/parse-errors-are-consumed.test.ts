import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildReport } from "@slop/core";
import type { DetectorResult } from "@slop/core";
import { imageDetector } from "@slop/detectors-image";
import { ingestImage } from "@slop/detectors-image";
import { coverageOfMedia, inspectContainer, synthPng } from "@slop/provenance";

/**
 * `container.parseErrors` must be CONSUMED, and coverage must mean what was read.
 *
 * The defect, measured (LEARNINGS L-16): the PNG walk recorded
 * `text chunk "zTXt" ... was compressed and was not decompressed`, and nothing anywhere read
 * that list. `mediaProbes` built all five probe rows out of segment and field COUNTS, so the
 * container probe was paid its full weight of 3 for a walk that had explicitly failed, and
 * the report said COVERAGE 1.0. Two PNGs, one read and one not read, both reporting 1.0.
 *
 * That is the same defect as the other two repaired beside it, and it is the failure class
 * this product exists to catch: a guarantee that reports success without doing its job. A
 * confident negative over a region nobody read ("no metadata is present") is strictly worse
 * than a missing finding, because it is a citation that is false.
 *
 * The rule this file pins: an unreadable region forces ABSTENTION. Not a quietly smaller
 * coverage number, not a silently missing finding. Both halves are asserted, because a
 * coverage drop with no stated reason is just a smaller confident number.
 *
 * MUTATIONS RUN AGAINST THIS FILE (each made, each seen red, each reverted):
 *   1. `artifact.ts`, `complete: unread === 0` -> `complete: true` on the container probe.
 *      Red: "an unreadable region costs the container probe its coverage weight".
 *   2. `artifact.ts`, the same on the metadata probe. Red: the coverage-floor case.
 *   3. `analyze.ts`, drop `p.complete !== false` from the `ok` conjunction in
 *      `coverageOfMedia`. Red: the coverage cases.
 *   4. `core/src/score.ts`, delete the `partialProbes` block. Red: "says WHY, in a coded
 *      abstention" and the no-silent-drop case.
 */

// A PNG whose zTXt chunk cannot be decompressed: the compression method is undefined, so the
// chunk is present, is metadata-bearing, and cannot be read. Built through the real fixture
// builder and parsed by the real parser, so nothing here is a hand-written record.
const UNREADABLE = synthPng({
  rawChunks: [{ type: "zTXt", data: [...[..."parameters"].map((c) => c.charCodeAt(0)), 0, 9, 1, 2, 3] }],
});
const READABLE = synthPng({ textZ: { parameters: "Steps: 28, Sampler: DPM++ 2M Karras, CFG scale: 7" } });

const ingest = (bytes: Uint8Array) => ingestImage(bytes, { locator: "fixture://x.png", mediaType: "image/png" });

describe("a container walk that failed cannot report a complete read", () => {
  it("the fixture really is unreadable in one region and readable everywhere else", () => {
    // The denominator for everything below. Without this, the assertions could all be about a
    // file that simply failed to parse at byte one, which is a different bug.
    const record = inspectContainer(UNREADABLE);
    expect(record.format).toBe("png");
    expect(record.segments.length).toBeGreaterThan(2);
    expect(record.parseErrors).toHaveLength(1);
    expect(inspectContainer(READABLE).parseErrors).toEqual([]);
  });

  it("an unreadable region costs the container and metadata probes their coverage weight", () => {
    const clean = ingest(READABLE);
    const dirty = ingest(UNREADABLE);
    expect(coverageOfMedia(clean).ratio).toBe(1);
    // 3 + 3 of the 12 shared probe weights, so exactly half. Pinned as an absolute value
    // rather than "less than the clean one", so that shrinking the drop is caught too.
    expect(coverageOfMedia(dirty).ratio).toBe(0.5);
    expect(coverageOfMedia(dirty).examined).toContain("container(partial)");
  });

  it("the probe row carries the reason, not just a flag", () => {
    const probe = ingest(UNREADABLE).probes.find((p) => p.id === "container")!;
    expect(probe.complete).toBe(false);
    expect(probe.note).toMatch(/compression method 9/);
    // The denominator stays HONEST: segments really were walked. The completeness flag is a
    // separate fact precisely because a count cannot carry it.
    expect(probe.denominator).toBeGreaterThan(0);
  });

  it("cannot cite the ABSENCE of a chunk it merely failed to read", () => {
    // The sharpest half of L-16. `payloads.length === 0` gated the `lossless_resave`
    // indicator, whose observed value read "no tEXt, iTXt, eXIf or XMP chunk present" on a
    // file that demonstrably had one, because the chunk had failed to decompress and so
    // produced no payload. A receipt line asserting that something present is absent is a
    // fabricated citation, and it is the worst thing this product can emit.
    const dirty = ingest(UNREADABLE);
    expect(dirty.container.payloads).toHaveLength(0); // the condition that used to fire it
    expect(dirty.metadata.fields).toHaveLength(0); // and the other half of that condition
    expect(dirty.container.segments.map((s) => s.name)).toContain("zTXt"); // and it IS there
    expect(dirty.laundering.indicators.map((i) => i.code)).not.toContain("lossless_resave");
  });

  it("says WHY, in a coded abstention, rather than dropping the number silently", async () => {
    const result = (await imageDetector.analyze({
      kind: "file",
      path: writeTemp(UNREADABLE),
      mediaType: "image/png",
    })) as DetectorResult;
    const report = buildReport([result]);
    expect(report.status).toBe("inconclusive");
    expect(report.score).toBeNull();
    const codes = report.abstention.map((a) => a.code);
    expect(codes).toContain("probe_failed");
    const detail = report.abstention.find((a) => a.code === "probe_failed" && /could not read part/.test(a.detail));
    expect(detail?.detail).toMatch(/container|metadata/);
  });

  it("a readable file still gets its number, so this is a narrowing and not a blanket refusal", async () => {
    const result = (await imageDetector.analyze({
      kind: "file",
      path: writeTemp(READABLE),
      mediaType: "image/png",
    })) as DetectorResult;
    const report = buildReport([result]);
    expect(report.coverage.ratio).toBe(1);
    expect(report.abstention.map((a) => a.code)).not.toContain("probe_failed");
    expect(result.findings.map((f) => f.ruleId)).toContain("prov.sidecar-declares-generative-tool");
  });
});

let counter = 0;
function writeTemp(bytes: Uint8Array): string {
  const dir = mkdtempSync(join(tmpdir(), "slop-parse-"));
  const file = join(dir, `case-${counter++}.png`);
  writeFileSync(file, bytes);
  return file;
}
