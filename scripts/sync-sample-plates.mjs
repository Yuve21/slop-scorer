#!/usr/bin/env node
/**
 * Generate `apps/web/lib/sample-plates.ts` from the SVGs the site actually serves.
 *
 * The export route needs the plate markup inside the bundle (see the header this script writes
 * for why reading `public/` at request time is the wrong answer). Copying the markup by hand
 * would be a second copy that drifts, so it is generated here and pinned by a test.
 *
 * Run from the repository root:  node scripts/sync-sample-plates.mjs
 */

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** [exported constant, public URL]. The URL is the key the route looks a plate up by. */
const PLATES = [
  ["SUBMITTED_PLATE_SVG", "/samples/4F2A-9C-submitted.svg"],
  ["RECREATION_PLATE_SVG", "/samples/4F2A-9C-recreation.svg"],
];

const HEADER = `/**
 * The sample plates, as source text, so the export route never touches the filesystem.
 *
 * The receipt page serves these two files from \`public/samples/\`. The export route has to draw
 * the SAME artwork into its PNG, because an export that shows something other than the page it
 * came from is a different document wearing the page's receipt number.
 *
 * Reading them from \`public/\` at request time was the obvious approach and it is the wrong one:
 * the static directory is not part of a serverless function's traced input, so the route would
 * work locally and fail in production, on the one code path whose failure mode is legal rather
 * than cosmetic. So the markup lives here, in the bundle, and \`apps/web/test/plate-svg.test.ts\`
 * asserts each constant is byte-for-byte identical to the file the browser is served. Drift
 * between the two is a test failure rather than a discrepancy nobody notices.
 *
 * GENERATED FILE. To change a plate, edit the SVG in \`apps/web/public/samples/\` and re-run
 * \`node scripts/sync-sample-plates.mjs\` from the repository root.
 */

`;

const escape = (text) => text.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${");

let out = HEADER;
for (const [name, src] of PLATES) {
  const file = path.join(root, "apps/web/public", src);
  const text = readFileSync(file, "utf8");
  out += `/** Byte for byte the contents of \`public${src}\`. \`apps/web/test/plate-svg.test.ts\` proves it. */\n`;
  out += `export const ${name} = \`${escape(text)}\`;\n\n`;
}
out += "/** The one place a plate URL becomes pixels. An unknown path is not guessed at. */\n";
out += "export const PLATE_SVG_BY_SRC: Readonly<Record<string, string>> = {\n";
for (const [name, src] of PLATES) out += `  ${JSON.stringify(src)}: ${name},\n`;
out += "};\n";

const target = path.join(root, "apps/web/lib/sample-plates.ts");
writeFileSync(target, out);
console.log(`wrote ${path.relative(root, target)} from ${PLATES.length} plate(s)`);
