/**
 * A 5x7 monospace bitmap face, and the reason it exists.
 *
 * The export figure has one ship-blocking property: the disclaimer must render at or above the
 * pixel height of the panel labels, at EVERY export size (`design/SURFACES.md` A.5,
 * `design/SELF-AUDIT.md` risk 3). The only test that actually proves that reads the finished
 * pixels back. A bitmap face at integer scale makes that round trip exact: every glyph is 5x7
 * cells, every cell is `scale` pixels square, so a decoder can recover both the text and the
 * rendered height with no tolerance and no antialiasing to argue with.
 *
 * Uppercase only. That is a real constraint on export copy, and it is deliberate: mono
 * uppercase is the document register the receipt already uses, and it halves the glyph set the
 * decoder has to be right about.
 *
 * ALL LETTERS AND DIGITS OCCUPY ALL SEVEN ROWS. `ocr.ts` recovers the scale as
 * `bandHeight / 7`, so a short capital would silently change the measured height of a line,
 * which is precisely the measurement the legal test depends on. There is a test asserting this
 * invariant over the whole table rather than a comment asking future authors to be careful.
 */

export const GLYPH_W = 5;
export const GLYPH_H = 7;
/** One blank cell between glyphs, so the advance is 6 cells. */
export const ADVANCE = GLYPH_W + 1;

const G = (...rows: string[]): readonly string[] => rows;

export const FONT: Readonly<Record<string, readonly string[]>> = {
  " ": G(".....", ".....", ".....", ".....", ".....", ".....", "....."),
  A: G(".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"),
  B: G("####.", "#...#", "#...#", "####.", "#...#", "#...#", "####."),
  C: G(".###.", "#...#", "#....", "#....", "#....", "#...#", ".###."),
  D: G("####.", "#...#", "#...#", "#...#", "#...#", "#...#", "####."),
  E: G("#####", "#....", "#....", "####.", "#....", "#....", "#####"),
  F: G("#####", "#....", "#....", "####.", "#....", "#....", "#...."),
  G: G(".###.", "#...#", "#....", "#.###", "#...#", "#...#", ".###."),
  H: G("#...#", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"),
  I: G("#####", "..#..", "..#..", "..#..", "..#..", "..#..", "#####"),
  J: G("..###", "...#.", "...#.", "...#.", "...#.", "#..#.", ".##.."),
  K: G("#...#", "#..#.", "#.#..", "##...", "#.#..", "#..#.", "#...#"),
  L: G("#....", "#....", "#....", "#....", "#....", "#....", "#####"),
  M: G("#...#", "##.##", "#.#.#", "#...#", "#...#", "#...#", "#...#"),
  N: G("#...#", "##..#", "#.#.#", "#..##", "#...#", "#...#", "#...#"),
  O: G(".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."),
  P: G("####.", "#...#", "#...#", "####.", "#....", "#....", "#...."),
  Q: G(".###.", "#...#", "#...#", "#...#", "#.#.#", "#..#.", ".##.#"),
  R: G("####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#"),
  S: G(".####", "#....", "#....", ".###.", "....#", "....#", "####."),
  T: G("#####", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."),
  U: G("#...#", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."),
  V: G("#...#", "#...#", "#...#", "#...#", "#...#", ".#.#.", "..#.."),
  W: G("#...#", "#...#", "#...#", "#...#", "#.#.#", "##.##", "#...#"),
  X: G("#...#", "#...#", ".#.#.", "..#..", ".#.#.", "#...#", "#...#"),
  Y: G("#...#", "#...#", ".#.#.", "..#..", "..#..", "..#..", "..#.."),
  Z: G("#####", "....#", "...#.", "..#..", ".#...", "#....", "#####"),
  "0": G(".###.", "#...#", "#..##", "#.#.#", "##..#", "#...#", ".###."),
  "1": G("..#..", ".##..", "..#..", "..#..", "..#..", "..#..", ".###."),
  "2": G(".###.", "#...#", "....#", "...#.", "..#..", ".#...", "#####"),
  "3": G("#####", "...#.", "..#..", "...#.", "....#", "#...#", ".###."),
  "4": G("...#.", "..##.", ".#.#.", "#..#.", "#####", "...#.", "...#."),
  "5": G("#####", "#....", "####.", "....#", "....#", "#...#", ".###."),
  "6": G("..##.", ".#...", "#....", "####.", "#...#", "#...#", ".###."),
  "7": G("#####", "....#", "...#.", "..#..", ".#...", ".#...", ".#..."),
  "8": G(".###.", "#...#", "#...#", ".###.", "#...#", "#...#", ".###."),
  "9": G(".###.", "#...#", "#...#", ".####", "....#", "...#.", ".##.."),
  ".": G(".....", ".....", ".....", ".....", ".....", ".....", "..#.."),
  ",": G(".....", ".....", ".....", ".....", ".....", "..#..", ".#..."),
  ":": G(".....", "..#..", ".....", ".....", ".....", "..#..", "....."),
  "-": G(".....", ".....", ".....", ".###.", ".....", ".....", "....."),
  "/": G("....#", "....#", "...#.", "..#..", ".#...", "#....", "#...."),
  "(": G("...#.", "..#..", ".#...", ".#...", ".#...", "..#..", "...#."),
  ")": G(".#...", "..#..", "...#.", "...#.", "...#.", "..#..", ".#..."),
  $: G("..#..", ".####", "#.#..", ".###.", "..#.#", "####.", "..#.."),
  "?": G(".###.", "#...#", "....#", "...#.", "..#..", ".....", "..#.."),
  "!": G("..#..", "..#..", "..#..", "..#..", "..#..", ".....", "..#.."),
  "'": G("..#..", "..#..", "..#..", ".....", ".....", ".....", "....."),
  "%": G("##..#", "##..#", "...#.", "..#..", ".#...", "#..##", "#..##"),
  "+": G(".....", "..#..", "..#..", "#####", "..#..", "..#..", "....."),
  "=": G(".....", ".....", "#####", ".....", "#####", ".....", "....."),
  "*": G(".....", "#...#", ".#.#.", "#####", ".#.#.", "#...#", "....."),
};

/** Characters the renderer can draw. Anything else is normalised to `?` at draw time. */
export const SUPPORTED = new Set(Object.keys(FONT));

/**
 * Fold arbitrary copy into the drawable set.
 *
 * Note what this deliberately does NOT do: it does not silently drop characters. An unknown
 * character becomes a visible `?`, because a disclaimer that quietly loses a word is exactly
 * the failure mode this whole module exists to prevent.
 */
export function normalizeForRender(text: string): string {
  return Array.from(text.toUpperCase())
    .map((ch) => {
      if (SUPPORTED.has(ch)) return ch;
      if (ch === "·" || ch === "–" || ch === "—" || ch === "_") return "-";
      if (ch === "“" || ch === "”") return "'";
      if (ch === "’") return "'";
      return "?";
    })
    .join("");
}
