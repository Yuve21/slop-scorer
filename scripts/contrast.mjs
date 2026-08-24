/**
 * THE CONTRAST TABLE IN design/DESIGN.md §2, COMPUTED.
 *
 * Usage: node scripts/contrast.mjs
 *
 * Exists because the previous version of that table was partly asserted rather than computed, and
 * the one pair it omitted was the one that was failing: dark `--border-control: #4C525A` computes
 * 2.38 : 1 on the dark page, against the 3 : 1 that WCAG 1.4.11 requires of a boundary that
 * identifies a control, while the document said "Load-bearing. Meets 3:1" next to the light number.
 * A table with a hole in it is worse than no table, because it reads as having been checked.
 *
 * So this enumerates the FULL cross product — every foreground token against every surface it can
 * appear on — rather than a hand-picked list, and exits non-zero if any text pair is below AA or any
 * load-bearing border is below 3:1. Recompute and repaste before changing any hex in globals.css.
 *
 * WCAG 2.x relative luminance, sRGB. Not eyeballed, and not an APCA number wearing a WCAG label.
 */

const linear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

const luminance = (hex) => {
  const n = Number.parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => linear(v / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const ratio = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

/** Kept in sync BY HAND with apps/web/app/globals.css. Diverging is the failure mode; check both. */
const PALETTES = {
  light: {
    "surface-sunk": "#e4e3dd",
    surface: "#f2f1ec",
    "surface-raised": "#ffffff",
    "surface-overlay": "#eae9e3",
    "accent-quiet": "#e4e9f0",
    ink: "#16150f",
    "ink-muted": "#585549",
    hairline: "#c8c6bd",
    "border-control": "#87847a",
    accent: "#13416e",
    "accent-ink": "#ffffff",
  },
  dark: {
    "surface-sunk": "#100f0d",
    surface: "#171613",
    "surface-raised": "#201e1a",
    "surface-overlay": "#2a2823",
    "accent-quiet": "#1b2430",
    ink: "#f1eee7",
    "ink-muted": "#aba49a",
    hairline: "#332f29",
    "border-control": "#7a7366",
    accent: "#6fb4ff",
  },
};

const SURFACES = ["surface-sunk", "surface", "surface-raised", "surface-overlay", "accent-quiet"];
const TEXT = ["ink", "ink-muted", "accent"];
/** Load-bearing borders sit on these three. `accent-quiet` is a header band, never a control bed. */
const CONTROL_BEDS = ["surface", "surface-raised", "surface-overlay"];

const rows = [];
let failures = 0;

for (const [mode, p] of Object.entries(PALETTES)) {
  for (const bed of SURFACES) {
    for (const fg of TEXT) {
      const r = ratio(p[fg], p[bed]);
      if (r < 4.5) failures += 1;
      rows.push([mode, `\`${fg}\` on \`${bed}\``, r, r >= 7 ? "AAA" : r >= 4.5 ? "AA" : "**FAILS AA**"]);
    }
  }
  const onFill = ratio(p["accent-ink"] ?? PALETTES.dark["surface-sunk"], p.accent);
  if (onFill < 4.5) failures += 1;
  rows.push([mode, "`accent-ink` on `accent` fill", onFill, onFill >= 7 ? "AAA" : "AA"]);

  for (const bed of CONTROL_BEDS) {
    const r = ratio(p["border-control"], p[bed]);
    if (r < 3) failures += 1;
    rows.push([mode, `\`border-control\` on \`${bed}\``, r, r >= 3 ? "passes 1.4.11" : "**FAILS 1.4.11**"]);
  }
  // Hairline is decorative BY DECLARATION (see DESIGN.md §2). It is printed so nobody "fixes" it,
  // and it is deliberately not counted as a failure.
  for (const bed of ["surface", "surface-raised"]) {
    rows.push([
      mode,
      `\`hairline\` on \`${bed}\``,
      ratio(p.hairline, p[bed]),
      "decorative only, by declaration",
    ]);
  }
}

console.log("| Mode | Pair | Ratio | Verdict |");
console.log("|---|---|---|---|");
for (const [mode, pair, r, verdict] of rows) {
  console.log(`| ${mode} | ${pair} | ${r.toFixed(2)} : 1 | ${verdict} |`);
}

if (failures > 0) {
  console.error(`\n${failures} pair(s) below threshold.`);
  process.exit(1);
}
console.log(`\nAll ${rows.length} pairs pass: no text below AA, no load-bearing border below 3:1.`);
