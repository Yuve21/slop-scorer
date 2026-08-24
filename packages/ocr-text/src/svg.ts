/**
 * Read the type out of an SVG.
 *
 * An SVG that draws words draws them with `<text>`, so the words are IN THE FILE and reading
 * them needs no model and no pixels. This is the half of "typography inside an image" that is
 * byte-exact, and it closes the cheapest way to defeat a copy rule: put the headline in a
 * graphic and every rule that reads `innerText` goes quiet.
 *
 * WHAT THIS DELIBERATELY DOES NOT CLAIM. That a reader can see the recovered string. An SVG
 * `<text>` node can be clipped by its viewBox, translated off canvas, painted in the
 * background colour, or covered. Establishing visibility means rasterising and comparing, and
 * until something does that, findings built on this are reported as probabilistic. The
 * recovery is exact; the inference from recovery to "on the page" is not.
 *
 * THE COUNT IS RETURNED, NOT THE STRING ALONE. `elements` is how many text-bearing elements
 * the scan SAW and `matched` is how many it read. A file with twelve `<text>` nodes and a
 * recovery of nothing is a broken pattern, not a quiet graphic, and a caller that only got a
 * string back could not tell those apart. This is the same denominator discipline the probe
 * layer runs on, for the same reason: the failure is silent otherwise.
 */

export interface SvgTextRead {
  /** Recovered text, in document order, one element per line. */
  readonly text: string;
  /** Text-bearing elements found. */
  readonly elements: number;
  /** Of those, how many yielded characters. */
  readonly matched: number;
}

/** Elements whose character data is type a reader is meant to read. */
const TEXT_ELEMENTS = ["text", "tspan", "title", "desc"] as const;

const ENTITIES: Readonly<Record<string, string>> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  mdash: "—",
  ndash: "–",
  hellip: "…",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
};

/** Named and numeric character references, so a recovered em dash is an em dash. */
export function decodeEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, body: string) => {
    if (body.startsWith("#")) {
      const code = body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[body.toLowerCase()] ?? whole;
  });
}

/**
 * Extract every string an SVG renders as type.
 *
 * Nesting is handled by reading character data only, per element, and then de-duplicating: a
 * `<text>` wrapping two `<tspan>`s would otherwise be reported three times and an em-dash
 * density computed over it would be inflated by a factor the file never contained.
 */
export function extractSvgText(source: string): SvgTextRead {
  const body = source.replace(/<!--[\s\S]*?-->/g, "");
  const seen = new Set<string>();
  const lines: string[] = [];
  let elements = 0;
  let matched = 0;

  for (const tag of TEXT_ELEMENTS) {
    const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}\\s*>`, "gi");
    for (let m = re.exec(body); m; m = re.exec(body)) {
      elements += 1;
      // Character data only: a child element's own text is picked up when that element is
      // scanned in its own pass.
      const chars = decodeEntities((m[1] ?? "").replace(/<[^>]*>/g, " "))
        .replace(/\s+/g, " ")
        .trim();
      if (chars.length === 0) continue;
      matched += 1;
      if (seen.has(chars)) continue;
      seen.add(chars);
      lines.push(chars);
    }
  }

  // A `<text>` wrapping two `<tspan>`s is read three times: once whole, once per child. Drop
  // any line another line already contains, so a density or a lexicon computed over the
  // recovery is computed over what the file draws rather than over the nesting depth. The
  // `matched` count is left alone deliberately: it counts elements that carried characters,
  // which is a fact about the scan, not about the copy.
  const deduped = lines.filter(
    (line, i) => !lines.some((other, j) => j !== i && other.length > line.length && other.includes(line)),
  );

  return { text: deduped.join("\n"), elements, matched };
}
