/**
 * Print the motion and image-text reading for any URL, in the shape the artifact stores it.
 *
 * This is the tool the human negative corpus was transcribed with. `NEGATIVE_CORPUS` holds
 * five pages a person made, hand-written field by field from a measured audit, and when the
 * motion probe landed those five fixtures had no motion in them. The choice was to leave the
 * field absent (which makes the motion family untested against human work, i.e. a rule set
 * that has never had to survive the sites it is most likely to hurt) or to go and measure the
 * live pages. This script is the second option, and the numbers it printed are pasted into
 * `negatives.ts` under `MOTION_AUDIT` with the date they were read.
 *
 * It is not part of any gate. It touches the network on purpose and nothing in `npm test`
 * calls it.
 *
 *   node scripts/measure-motion.mjs https://example.com [more urls...]
 */

import { probeUrl } from "@slop/detectors-web";

const urls = process.argv.slice(2);
if (urls.length === 0) {
  console.error("usage: node scripts/measure-motion.mjs <url> [url...]");
  process.exit(2);
}

for (const url of urls) {
  console.log(`\n${"=".repeat(78)}\n${url}`);
  let artifact;
  try {
    artifact = await probeUrl(url, { viewport: { width: 390, height: 844 }, timeoutMs: 45_000 });
  } catch (error) {
    console.log(`  FAILED: ${error.message}`);
    continue;
  }
  const m = artifact.motion;
  if (!m) {
    console.log("  no motion block (probe did not run)");
    continue;
  }
  const movingRecords = m.records.filter((r) => r.durationMs > 0);
  const byTiming = new Map();
  for (const r of movingRecords) {
    const key = `${r.durationMs}ms ${r.easing}`;
    byTiming.set(key, (byTiming.get(key) ?? 0) + 1);
  }
  const top = [...byTiming.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);

  console.log(`  sampled=${m.sampled}  moving=${movingRecords.length}  sections=${m.sectionsWithReveal}/${m.sectionsTotal}`);
  console.log(
    `  reduced-motion: measured=${m.reducedMotion.measured} before=${m.reducedMotion.animatedBefore} ` +
      `after=${m.reducedMotion.animatedAfter} queryDeclared=${m.reducedMotion.queryDeclared}`,
  );
  console.log(`  stopped: ${m.reducedMotion.stopped.join(", ") || "(none)"}`);
  console.log(`  infinite+decorative: ${movingRecords.filter((r) => r.decorative && /infinite/.test(r.iterations)).length}`);
  console.log("  top timings:");
  for (const [key, count] of top) console.log(`    ${String(count).padStart(4)}x  ${key}`);
  console.log(`  keyframes (${m.keyframes.length}):`);
  for (const k of m.keyframes.slice(0, 12)) console.log(`    ${k.name}: ${k.stops} stops [${k.properties}]`);
  console.log(`  library markers (${m.libraryMarkers.length}):`);
  for (const marker of m.libraryMarkers.slice(0, 8)) {
    console.log(`    ${marker.library} (${marker.kind}) ${marker.locator} -> ${marker.observed}`);
  }
  console.log("  delays by animation:");
  const byName = new Map();
  for (const r of movingRecords) {
    const key = `${r.name}|${r.durationMs}|${r.easing}`;
    byName.set(key, [...(byName.get(key) ?? []), r.delayMs]);
  }
  for (const [key, delays] of [...byName.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 6)) {
    console.log(`    ${key}: ${[...new Set(delays)].sort((a, b) => a - b).join(", ")}`);
  }
  console.log(`  image text (${artifact.imageText?.records.length ?? 0} attempted):`);
  for (const record of artifact.imageText?.records ?? []) {
    console.log(
      `    ${record.src} [${record.method}] conf=${record.confidence.toFixed(2)}` +
        (record.abstained ? `\n      ABSTAINED: ${record.abstained}` : `\n      TEXT: ${JSON.stringify(record.text.slice(0, 300))}`),
    );
  }
}
