import { attachRemedies } from "@slop/core";
import { ev, patch } from "../rule.js";
import type { WebRule } from "../rule.js";
import { manualEach, manualOnce, uiChange } from "./remedy.js";

/**
 * Family: visual-default.
 *
 * The highest false-positive risk in the corpus, and the reason the family is capped at 25%
 * and can never reach the top band on its own. Skilled human designers converge. Everything
 * in here is "this looks like the current default", which is a weaker claim than it feels.
 *
 * THE RULE THAT IS DELIBERATELY NOT HERE: the cream / warm-paper palette.
 *
 * Every competing vibe-code detector treats a cream background as a tell. It is measured
 * that it is not. Of four well-funded, design-literate, human-made comparables read out of
 * live CSS in August 2026, THREE use a warm off-white: #F0EBDC (Overtone, Hinge founder,
 * $18M), #FFFBF0 (Rodeo, $8.5M seed) and #F6F2EA. Warm paper is category convention in
 * 2026, not evidence of generation. Encoding it as a positive rule would fail three of four
 * known-human sites on the corpus's own calibration set.
 *
 * It appears instead as `counter.category-convention-palette` in counter.ts, where a cream
 * background STANDING ALONE lowers the score and says why. That is the honest encoding of a
 * measured fact, and it is the difference between a corpus and a list of vibes.
 */

/**
 * The blue-through-violet band, in degrees.
 *
 * Named rather than inlined because the first version of it (230-290) could not express
 * Tailwind's blue-500 at hue 217, which is half of the single most common generated
 * gradient there is. The rule therefore matched nothing and quietly lowered every score it
 * touched. A threshold that cannot express its own canonical example is the same failure as
 * a regex that cannot express its own input: it fails in silence and reads as a clean result.
 */
const HUE_BAND = { lo: 210, hi: 300 } as const;

const AI_DEFAULT_SANS = /^(inter|geist|geist sans|geistsans|space grotesk)$/i;
const AI_DEFAULT_SERIF = /^(instrument serif|fraunces|playfair display|playfair)$/i;

/**
 * The family name as a human would say it, from the family name a browser actually computes.
 *
 * THIS IS THE SAME BUG AS THE HUE BAND, ONE FILE ACROSS. The rules above match `^inter$`, and
 * the single most common way Inter reaches a page in 2026 is `next/font`, which rewrites the
 * family to a build-hashed identifier: `__Inter_36bd41`, with `__Inter_Fallback_36bd41`
 * behind it. The probe reads the first computed family, so the string these rules were handed
 * on a real generated Next.js site was never `Inter` and the match was never going to happen.
 * The rule fired on the fixture, passed the meta-suite, and was dead on the live web.
 *
 * It is worse than a missed signal on the counter side: `counter.licensed-foundry-face` asks
 * whether a self-hosted face is absent from the free list, and `__Inter_36bd41` is absent
 * from every list. A generated Next.js page was collecting CREDIT for licensing a typeface it
 * had downloaded from Google.
 *
 * Handled: the next/font hash wrapper, the `Fallback` twin, underscore separators, and the
 * `Variable`/`var`/`VF` suffixes foundries ship variable files under.
 */
export function normalizeFamily(raw: string): string {
  let f = raw.replace(/["']/g, "").trim();
  const hashed = /^__(.+?)_(?:[A-Za-z0-9]{6,})$/.exec(f);
  if (hashed) f = hashed[1] as string;
  f = f.replace(/_/g, " ").replace(/\s+/g, " ").trim();
  f = f.replace(/\s+(?:fallback|variable|var|vf)$/i, "");
  f = f.replace(/(?<=[a-z])(?:Variable|VF)$/, "");
  return f.trim();
}

/** Rough hue of an rgb triple, 0..360. Enough to separate violet-blue from everything else. */
function hueOf(r: number, g: number, b: number): number | null {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d < 24) return null; // near-grey: no meaningful hue
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h *= 60;
  return h < 0 ? h + 360 : h;
}

function colorStops(css: string): { text: string; rgb: [number, number, number] }[] {
  const out: { text: string; rgb: [number, number, number] }[] = [];
  const rgbRe = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/g;
  for (let m = rgbRe.exec(css); m; m = rgbRe.exec(css)) {
    out.push({ text: m[0], rgb: [Number(m[1]), Number(m[2]), Number(m[3])] });
  }
  const hexRe = /#([0-9a-f]{6})\b/gi;
  for (let m = hexRe.exec(css); m; m = hexRe.exec(css)) {
    const h = m[1] as string;
    out.push({
      text: m[0],
      rgb: [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)],
    });
  }
  return out;
}

const RAW_VISUAL_RULES: readonly WebRule[] = [
  {
    id: "css.violet-blue-gradient",
    family: "visual-default",
    title: "Hero uses the violet-to-blue gradient",
    polarity: "signal",
    severity: "medium",
    baseWeight: 0.6,
    maxHits: 1,
    requiresProbe: "computed-style",
    phase: 1,
    since: "corpus-2026.09",
    explanation:
      "Two or more stops in the 210-300 degree hue band on the hero background. Blue through indigo through violet is the single most-reproduced default in generated marketing pages, and the canonical version of it is the Tailwind ramp's blue-500 to indigo-500.",
    falsePositiveNote:
      "Plenty of real brands are blue or purple, and a blue-to-indigo gradient is a perfectly ordinary thing to choose. The rule requires TWO stops inside the band, on the hero specifically, and a genuinely violet brand will still trip it.",
    prevention: "Pick a palette from something real: a photograph, a material, a printed reference. Not two adjacent stops of the default ramp.",
    detect: (a) => {
      const g = a.color.heroGradient;
      if (!g) return [];
      const stops = colorStops(g).filter(({ rgb }) => {
        const h = hueOf(rgb[0], rgb[1], rgb[2]);
        return h !== null && h >= HUE_BAND.lo && h <= HUE_BAND.hi;
      });
      if (stops.length < 2) return [];
      return [
        ev("css", "background-image on the hero", g.slice(0, 160), {
          expected: "a palette that is not two adjacent stops of the default blue-violet ramp",
        }),
      ];
    },
    fixtures: {
      // Tailwind indigo-500 (hue 239) to blue-500 (hue 217). The band was originally written
      // as 230-290 and could not express blue-500 at all, so this rule fired on nothing and
      // was silently lowering the score of every page it should have flagged. Caught by the
      // mutation meta-test on the first run, which is precisely what that test is for.
      positive: (base) => ({
        artifact: patch(base, {
          color: { heroGradient: "linear-gradient(135deg, rgb(99, 102, 241) 0%, rgb(59, 130, 246) 100%)" },
        }),
      }),
      mutated: (base) => ({
        artifact: patch(base, {
          color: { heroGradient: "linear-gradient(135deg, rgb(214, 84, 58) 0%, rgb(232, 168, 74) 100%)" },
        }),
      }),
      extra: [
        {
          name: "one stop in the band alongside a warm stop does not fire",
          shouldFire: false,
          build: (base) => ({
            artifact: patch(base, {
              // stripe.com's actual hero: cyan (189), blue (211), orange (21). One stop.
              color: {
                heroGradient: "linear-gradient(190deg, rgb(0, 217, 255) 0%, rgb(0, 122, 255) 40%, rgb(255, 88, 0) 100%)",
              },
            }),
          }),
        },
        {
          name: "violet to fuchsia, the other canonical pair, fires",
          shouldFire: true,
          build: (base) => ({
            artifact: patch(base, {
              color: { heroGradient: "linear-gradient(135deg, rgb(139, 92, 246) 0%, rgb(168, 85, 247) 100%)" },
            }),
          }),
        },
      ],
    },
  },
  {
    id: "css.crushed-tracking",
    family: "visual-default",
    title: "Headline letter-spacing is crushed at a heavy weight",
    polarity: "signal",
    severity: "medium",
    baseWeight: 0.6,
    maxHits: 1,
    requiresProbe: "computed-style",
    phase: 1,
    since: "corpus-2026.09",
    explanation:
      "Computed letter-spacing at or below -0.03em on a headline set at weight 700 or heavier. Tight tracking on a heavy grotesque is the default 'looks designed' move and it is applied without measuring.",
    falsePositiveNote:
      "Some faces genuinely want negative tracking at display size, and a type-literate designer may choose exactly this. It is a taste signal, not a provenance signal.",
    prevention: "Loosen to about -0.02em, or drop the weight. Optical tracking is a per-face decision, not a global -0.04em.",
    detect: (a) => {
      const h = a.type.hero;
      if (!h || h.weightNum < 700 || h.letterSpacingEm > -0.03) return [];
      return [
        ev("css", `letter-spacing on ${h.selector}`, `${h.letterSpacingEm}em at weight ${h.weightNum}`, {
          expected: "-0.02em or looser at weight 700+",
        }),
      ];
    },
    fixtures: {
      positive: (base) => ({
        artifact: patch(base, { type: { hero: { selector: "h1", family: "Grafier", weightNum: 800, sizePx: 40, letterSpacingEm: -0.04 } } }),
      }),
      mutated: (base) => ({
        artifact: patch(base, { type: { hero: { selector: "h1", family: "Grafier", weightNum: 800, sizePx: 40, letterSpacingEm: -0.01 } } }),
      }),
      extra: [
        {
          name: "crushed tracking at a light weight does not fire",
          shouldFire: false,
          build: (base) => ({
            artifact: patch(base, { type: { hero: { selector: "h1", family: "Grafier", weightNum: 300, sizePx: 40, letterSpacingEm: -0.05 } } }),
          }),
        },
      ],
    },
  },
  {
    id: "css.default-sans",
    family: "visual-default",
    title: "The real headline face is one of the AI-default sans set",
    polarity: "signal",
    severity: "low",
    baseWeight: 0.5,
    maxHits: 1,
    requiresProbe: "font-faces",
    phase: 1,
    since: "corpus-2026.09",
    explanation:
      "Inter, Geist or Space Grotesk as the actual rendered headline face. Free, excellent, and the default output of every generator, which is exactly why it reads as one.",
    falsePositiveNote:
      "Inter is a genuinely great typeface used deliberately by serious teams. This is the weakest kind of evidence in the corpus and it is weighted accordingly.",
    prevention: "Any other competent face moves the read. It does not have to be expensive: none of the four funded comparables measured used Inter as their real face.",
    detect: (a) => {
      const h = a.type.hero;
      if (!h || !AI_DEFAULT_SANS.test(normalizeFamily(h.family))) return [];
      return [ev("css", `font-family on ${h.selector}`, h.family, { expected: "a face chosen for this project" })];
    },
    fixtures: {
      positive: (base) => ({
        artifact: patch(base, { type: { hero: { selector: "h1", family: "Inter", weightNum: 700, sizePx: 40, letterSpacingEm: -0.01 } } }),
      }),
      mutated: (base) => ({
        artifact: patch(base, { type: { hero: { selector: "h1", family: "Focal Maxi", weightNum: 700, sizePx: 40, letterSpacingEm: -0.01 } } }),
      }),
      extra: [
        {
          // The form the rule met on the live web and could not read.
          name: "Inter shipped through next/font, as a build-hashed family name, still fires",
          shouldFire: true,
          build: (base) => ({
            artifact: patch(base, {
              type: { hero: { selector: "h1", family: "__Inter_36bd41", weightNum: 700, sizePx: 40, letterSpacingEm: -0.01 } },
            }),
          }),
        },
        {
          name: "Space Grotesk through next/font, underscored and hashed, still fires",
          shouldFire: true,
          build: (base) => ({
            artifact: patch(base, {
              type: { hero: { selector: "h1", family: "__Space_Grotesk_e1a2b3", weightNum: 700, sizePx: 40, letterSpacingEm: -0.01 } },
            }),
          }),
        },
        {
          name: "a different face that merely starts with the same letters does not fire",
          shouldFire: false,
          build: (base) => ({
            artifact: patch(base, {
              type: { hero: { selector: "h1", family: "Inter Tight", weightNum: 700, sizePx: 40, letterSpacingEm: -0.01 } },
            }),
          }),
        },
      ],
    },
  },
  {
    id: "css.ai-serif",
    family: "visual-default",
    title: "The display face is one of the AI-default serif set",
    polarity: "signal",
    severity: "low",
    baseWeight: 0.5,
    maxHits: 1,
    requiresProbe: "font-faces",
    phase: 1,
    since: "corpus-2026.09",
    explanation:
      "Instrument Serif, Fraunces or Playfair Display as the display face. The 'add warmth' move that replaced the purple gradient, and now just as automatic.",
    falsePositiveNote: "All three are good faces. Using one is a convention, not a confession.",
    prevention: "If warmth is the goal, get it from a face nobody else on the page is using this month.",
    detect: (a) => {
      const h = a.type.hero;
      if (!h || !AI_DEFAULT_SERIF.test(normalizeFamily(h.family))) return [];
      return [ev("css", `font-family on ${h.selector}`, h.family, { expected: "a display face chosen for this project" })];
    },
    fixtures: {
      positive: (base) => ({
        artifact: patch(base, { type: { hero: { selector: "h1", family: "Instrument Serif", weightNum: 400, sizePx: 44, letterSpacingEm: 0 } } }),
      }),
      mutated: (base) => ({
        artifact: patch(base, { type: { hero: { selector: "h1", family: "Crimson Pro", weightNum: 300, sizePx: 44, letterSpacingEm: 0 } } }),
      }),
      extra: [
        {
          name: "Playfair Display through next/font, hashed and underscored, still fires",
          shouldFire: true,
          build: (base) => ({
            artifact: patch(base, {
              type: { hero: { selector: "h1", family: "__Playfair_Display_9f2c1a", weightNum: 400, sizePx: 44, letterSpacingEm: 0 } },
            }),
          }),
        },
      ],
    },
  },
  {
    id: "dom.eyebrow-count",
    family: "visual-default",
    title: "Tracked-uppercase eyebrow labels above headings, repeatedly",
    polarity: "signal",
    severity: "medium",
    baseWeight: 0.5,
    maxHits: 3,
    requiresProbe: "dom-survey",
    phase: 1,
    since: "corpus-2026.09",
    explanation:
      "Three or more small tracked-uppercase kicker labels sitting above section headings. One is a design choice. Several is a template filling a slot it was given.",
    falsePositiveNote:
      "Editorial and enterprise design systems use eyebrows correctly and often. The signal is the COUNT, and the threshold is a judgement call.",
    prevention: "Keep at most two on a page. If a section needs a label to be understood, the heading is not doing its job.",
    detect: (a) => {
      if (a.dom.eyebrows.length < 3) return [];
      return a.dom.eyebrows.map((e) => ev("selector", e.selector, e.text, { expected: "at most two per page" }));
    },
    fixtures: {
      positive: (base) => ({
        artifact: patch(base, {
          dom: {
            eyebrows: [
              { selector: "section:nth-child(1) .eyebrow", text: "EARLY ACCESS" },
              { selector: "section:nth-child(2) .eyebrow", text: "HOW IT WORKS" },
              { selector: "section:nth-child(3) .eyebrow", text: "WHY IT MATTERS" },
              { selector: "section:nth-child(4) .eyebrow", text: "READY WHEN YOU ARE" },
            ],
          },
        }),
      }),
      mutated: (base) => ({
        artifact: patch(base, {
          dom: { eyebrows: [{ selector: "section:nth-child(1) .eyebrow", text: "EARLY ACCESS" }] },
        }),
      }),
    },
  },
  {
    id: "dom.uniform-cards",
    family: "visual-default",
    title: "A grid of identical cards, same radius, border and shadow",
    polarity: "signal",
    severity: "medium",
    baseWeight: 0.5,
    maxHits: 3,
    requiresProbe: "dom-survey",
    phase: 1,
    since: "corpus-2026.09",
    explanation:
      "Six or more blocks sharing one exact radius-border-shadow signature. Content of different importance rendered at identical visual weight is what a template does when it has nothing to say about hierarchy.",
    falsePositiveNote:
      "This is also what a good design system produces. A consistent card is a feature. The tell is that EVERYTHING is a card, including the things that should not be.",
    prevention: "Break the grid. Give the one thing that matters a different treatment, and let the rest be a list.",
    detect: (a) => {
      const groups = new Map<string, string[]>();
      for (const c of a.dom.cards) {
        const sig = `${c.radius}|${c.border}|${c.shadow}`;
        groups.set(sig, [...(groups.get(sig) ?? []), c.selector]);
      }
      const out = [];
      for (const [sig, selectors] of groups) {
        if (selectors.length < 6) continue;
        out.push(
          ev("css", selectors.slice(0, 3).join(", "), `${selectors.length} blocks share ${sig}`, {
            expected: "hierarchy: not every block at the same visual weight",
          }),
        );
      }
      return out;
    },
    fixtures: {
      positive: (base) => ({
        artifact: patch(base, {
          dom: {
            cards: Array.from({ length: 8 }, (_, i) => ({
              selector: `.card:nth-of-type(${i + 1})`,
              radius: "16px",
              border: "1px solid rgba(0,0,0,0.06)",
              shadow: "rgba(0,0,0,0.04) 0px 1px 2px 0px, rgba(0,0,0,0.06) 0px 6px 16px 0px",
            })),
          },
        }),
      }),
      mutated: (base) => ({
        artifact: patch(base, {
          dom: {
            cards: Array.from({ length: 3 }, (_, i) => ({
              selector: `.card:nth-of-type(${i + 1})`,
              radius: "16px",
              border: "1px solid rgba(0,0,0,0.06)",
              shadow: "rgba(0,0,0,0.04) 0px 1px 2px 0px, rgba(0,0,0,0.06) 0px 6px 16px 0px",
            })),
          },
        }),
      }),
    },
  },
  {
    id: "dom.ping-dot",
    family: "visual-default",
    title: "A pulsing status dot in a pill",
    polarity: "signal",
    severity: "low",
    baseWeight: 0.4,
    maxHits: 2,
    requiresProbe: "dom-survey",
    phase: 1,
    since: "corpus-2026.09",
    explanation:
      "A small element running a ping or pulse keyframe, usually inside a 'Launching soon' pill. Two named tells in one 120px component, and it is almost never signalling anything live.",
    falsePositiveNote: "A dashboard with a real live-status indicator has a genuine reason for this and should be read as such.",
    prevention: "If nothing is actually live, make it a static dot or plain type.",
    detect: (a) => a.dom.pingDots.map((d) => ev("selector", d.selector, d.animation, { expected: "no animation, unless something is genuinely live" })),
    fixtures: {
      positive: (base) => ({
        artifact: patch(base, { dom: { pingDots: [{ selector: ".pill span.dot", animation: "ping 1s cubic-bezier(0,0,0.2,1) infinite" }] } }),
      }),
      mutated: (base) => ({ artifact: patch(base, { dom: { pingDots: [] } }) }),
    },
  },
  {
    id: "css.one-family",
    family: "visual-default",
    title: "One typeface for the entire page",
    polarity: "signal",
    severity: "low",
    baseWeight: 0.4,
    maxHits: 1,
    requiresProbe: "computed-style",
    phase: 1,
    since: "corpus-2026.09",
    explanation:
      "A single computed font-family across headings, body and UI. Every premium reference page in the calibration set has two voices; a monoculture is what you get when nobody chose.",
    falsePositiveNote:
      "One-face systems are a legitimate and sometimes excellent decision, particularly with a variable face carrying real optical range.",
    prevention: "Add one second voice for display, or use a real optical-size axis so the headline is not just the body text made large.",
    detect: (a) => {
      if (a.type.familiesInUse.length !== 1) return [];
      const only = a.type.familiesInUse[0] as string;
      return [ev("css", "font-family across h1, body and UI", only, { expected: "at least two voices, or a real optical axis" })];
    },
    fixtures: {
      positive: (base) => ({ artifact: patch(base, { type: { familiesInUse: ["Inter"] } }) }),
      mutated: (base) => ({ artifact: patch(base, { type: { familiesInUse: ["Focal Maxi", "Focal"] } }) }),
    },
  },
  {
    id: "css.hero-scale",
    family: "visual-default",
    title: "Hero headline is oversized at mobile width",
    polarity: "signal",
    severity: "low",
    baseWeight: 0.4,
    maxHits: 1,
    requiresProbe: "computed-style",
    phase: 1,
    since: "corpus-2026.09",
    explanation:
      "A headline at 54px or more inside a 480px viewport. Scale used as a substitute for having something to say.",
    falsePositiveNote:
      "Editorial and fashion sites set enormous type on purpose and it works. This only counts alongside other visual defaults, which the family cap enforces.",
    prevention: "Set the headline at the size the sentence needs. Four of four funded comparables measured set theirs lighter and smaller than the generated default.",
    detect: (a) => {
      const h = a.type.hero;
      if (!h || a.viewport.width > 480 || h.sizePx < 54) return [];
      return [ev("css", `font-size on ${h.selector}`, `${h.sizePx}px at ${a.viewport.width}px viewport`, { expected: "under 54px at mobile width" })];
    },
    fixtures: {
      positive: (base) => ({
        artifact: patch(base, { type: { hero: { selector: "h1", family: "Grafier", weightNum: 400, sizePx: 58, letterSpacingEm: -0.01 } } }),
      }),
      mutated: (base) => ({
        artifact: patch(base, { type: { hero: { selector: "h1", family: "Grafier", weightNum: 400, sizePx: 40, letterSpacingEm: -0.01 } } }),
      }),
    },
  },
  {
    id: "dom.icon-tile-stack",
    family: "visual-default",
    title: "Rounded icon tile stacked above every section heading",
    polarity: "signal",
    severity: "low",
    baseWeight: 0.35,
    maxHits: 3,
    requiresProbe: "dom-survey",
    phase: 1,
    since: "corpus-2026.09",
    explanation:
      "Three or more sections opening with a rounded tile containing a line icon. A slot in the template, filled with whichever icon was nearest in meaning.",
    falsePositiveNote: "A documentation or feature page with genuinely parallel sections has a real reason to repeat a pattern.",
    prevention: "Drop the tiles. If an icon is not adding meaning that the heading lacks, it is decoration standing where content should be.",
    detect: (a) => (a.dom.iconTiles.length < 3 ? [] : a.dom.iconTiles.map((t) => ev("selector", t.selector, "icon tile above a heading"))),
    fixtures: {
      positive: (base) => ({
        artifact: patch(base, {
          dom: { iconTiles: [{ selector: "section:nth-child(1) .tile" }, { selector: "section:nth-child(2) .tile" }, { selector: "section:nth-child(3) .tile" }] },
        }),
      }),
      mutated: (base) => ({ artifact: patch(base, { dom: { iconTiles: [{ selector: "section:nth-child(1) .tile" }] } }) }),
    },
  },
  {
    id: "css.stock-shadow",
    family: "visual-default",
    title: "The two-layer diffuse stock shadow",
    polarity: "signal",
    severity: "low",
    baseWeight: 0.35,
    maxHits: 2,
    requiresProbe: "computed-style",
    phase: 1,
    since: "corpus-2026.09",
    explanation:
      "A tight 1-2px contact shadow paired with a wide soft one, at the default offsets. The elevation recipe every component library ships and nobody tunes.",
    falsePositiveNote: "It is the recipe because it is a good recipe. Using a sensible default is not a defect on its own.",
    prevention: "Tune the shadow to the surface, or use a hairline border instead. Elevation should say something about hierarchy.",
    detect: (a) => {
      const seen = new Set<string>();
      const out = [];
      for (const c of a.dom.cards) {
        if (!/0px 1px 2px/.test(c.shadow)) continue;
        if (!/0px (?:[4-9]|1\d)px (?:1[0-9]|2\d)px/.test(c.shadow)) continue;
        if (seen.has(c.shadow)) continue;
        seen.add(c.shadow);
        out.push(ev("css", `box-shadow on ${c.selector}`, c.shadow, { expected: "a shadow tuned to this surface" }));
      }
      return out;
    },
    fixtures: {
      positive: (base) => ({
        artifact: patch(base, {
          dom: {
            cards: [
              {
                selector: ".card",
                radius: "16px",
                border: "1px solid rgba(0,0,0,0.06)",
                shadow: "rgba(0,0,0,0.04) 0px 1px 2px 0px, rgba(0,0,0,0.06) 0px 6px 16px 0px",
              },
            ],
          },
        }),
      }),
      mutated: (base) => ({
        artifact: patch(base, {
          dom: { cards: [{ selector: ".card", radius: "16px", border: "1px solid rgba(0,0,0,0.06)", shadow: "none" }] },
        }),
      }),
    },
  },
  {
    id: "dom.numbered-steps",
    family: "visual-default",
    title: "Tiny zero-padded numerals labelling sections",
    polarity: "signal",
    severity: "info",
    baseWeight: 0.3,
    maxHits: 3,
    requiresProbe: "dom-survey",
    phase: 1,
    since: "corpus-2026.09",
    explanation: "Three or more '01' style section numerals. A layout convention applied to content that is not actually sequential.",
    falsePositiveNote: "A genuine step-by-step process is legitimately numbered, and numbering it is a kindness to the reader.",
    prevention: "Number things that are steps. Do not number things that are simply next to each other.",
    detect: (a) => {
      const labels = a.dom.numberedLabels.filter((l) => /^0[1-9]$/.test(l.text.trim()));
      if (labels.length < 3) return [];
      return labels.map((l) => ev("selector", l.selector, l.text));
    },
    fixtures: {
      positive: (base) => ({
        artifact: patch(base, {
          dom: {
            numberedLabels: [
              { selector: ".step:nth-of-type(1) .num", text: "01" },
              { selector: ".step:nth-of-type(2) .num", text: "02" },
              { selector: ".step:nth-of-type(3) .num", text: "03" },
            ],
          },
        }),
      }),
      mutated: (base) => ({
        artifact: patch(base, { dom: { numberedLabels: [{ selector: ".step:nth-of-type(1) .num", text: "01" }] } }),
      }),
    },
  },
];

/**
 * The fixes.
 *
 * Two `ui_change`s, and everything else is a `manual` carrying the selector.
 *
 * The two that get a patch are the two whose replacement the observation determines: a
 * decorative pulse resolves to no animation, and crushed tracking resolves to the value this
 * rule's own threshold names. The rest of this family is taste. A palette, a typeface and a
 * hierarchy are decisions, and a detector that proposed specific ones would be doing the
 * thing it exists to measure: filling a slot with whatever is nearest in meaning.
 */
export const VISUAL_RULES: readonly WebRule[] = attachRemedies(RAW_VISUAL_RULES, {
  "css.violet-blue-gradient": (evidence) =>
    manualEach(evidence, () => ({
      summary: "Replace the hero gradient with a palette taken from something real.",
      guidance:
        "A photograph, a material, a printed reference. No colour is proposed here: choosing one for a brand from a rendered page would be guessing, and the guess would land in the same register as the default it replaced.",
      doNotApplyIf: "the brand genuinely is blue or violet and this palette was chosen deliberately.",
      blastRadius: "file",
    })),
  "css.crushed-tracking": (evidence, artifact) =>
    evidence.map((e) =>
      uiChange({
        selector: artifact.type.hero?.selector ?? "h1",
        property: "letter-spacing",
        before: `${artifact.type.hero?.letterSpacingEm ?? 0}em`,
        after: "-0.02em",
        summary: "Loosen the headline tracking to -0.02em, the value this rule's own floor names.",
        doNotApplyIf:
          "the face genuinely wants negative tracking at display size and somebody measured it. Optical tracking is a per-face decision and this is a global suggestion.",
        sourceHint: "the headline style or the type scale token that sets tracking",
        addresses: [e.locator],
        blastRadius: "line",
      }),
    ),
  "css.default-sans": (evidence) =>
    manualEach(evidence, (e) => ({
      summary: `Choose a headline face for this project rather than the default (${e.observed}).`,
      guidance: "Any other competent face moves the read, and it does not have to be an expensive one. Which face is a brand decision, so none is proposed.",
      doNotApplyIf: "this face was chosen deliberately, which is a perfectly reasonable thing to have done.",
      blastRadius: "file",
    })),
  "css.ai-serif": (evidence) =>
    manualEach(evidence, (e) => ({
      summary: `Choose a display face for this project rather than the default (${e.observed}).`,
      guidance: "If warmth is the goal, get it from a face that is not on every landing page this month. Which face is a brand decision, so none is proposed.",
      doNotApplyIf: "this face was chosen deliberately. All three in this rule are good faces.",
      blastRadius: "file",
    })),
  "dom.eyebrow-count": (evidence) =>
    manualEach(evidence, (e) => ({
      summary: `Remove the eyebrow label at ${e.locator} or fold it into the heading.`,
      guidance: "Keep at most two on a page. If a section needs a label to be understood, the heading is not doing its job yet, and rewriting the heading is the fix.",
      doNotApplyIf: "this is an editorial or enterprise system where eyebrows carry real navigation meaning.",
      blastRadius: "line",
    })),
  "dom.uniform-cards": (evidence) =>
    manualEach(evidence, () => ({
      summary: "Give the one block that matters a different treatment and let the rest be a list.",
      guidance:
        "The tell is that everything is a card, including the things that should not be. Which block matters is a content decision this detector cannot make from a rendered page.",
      doNotApplyIf: "this is a design system doing its job and the blocks genuinely are of equal importance.",
      blastRadius: "file",
    })),
  "dom.ping-dot": (evidence, artifact) =>
    evidence.map((e) => {
      const dot = artifact.dom.pingDots.find((d) => d.selector === e.locator);
      return uiChange({
        selector: e.locator,
        property: "animation",
        before: dot?.animation ?? e.observed,
        after: "none",
        summary: `Stop the pulse on ${e.locator}; nothing observed on the page is live.`,
        doNotApplyIf: "the dot reflects a genuine live status, in which case the animation is carrying real information and should stay.",
        sourceHint: "the pill or badge component that renders the dot",
        addresses: [e.locator],
        blastRadius: "line",
      });
    }),
  "css.one-family": (evidence) =>
    manualOnce(evidence, {
      locator: evidence[0]?.locator ?? "font-family",
      summary: "Add a second voice for display, or use a face with a real optical-size axis.",
      guidance: "Which second face is a brand decision, so none is proposed. The observation is that headings, body and UI all compute to one family.",
      doNotApplyIf: "the one-face system is deliberate and the face carries real optical range.",
      blastRadius: "file",
    }),
  "css.hero-scale": (evidence) =>
    manualEach(evidence, (e) => ({
      summary: `Set the headline at the size the sentence needs (observed ${e.observed}).`,
      guidance:
        "No specific size is proposed: the right one depends on the sentence and the face, and the rule's threshold is a floor for the observation rather than a recommended value.",
      doNotApplyIf: "the enormous setting is deliberate, which is normal on editorial and fashion pages and works.",
      blastRadius: "line",
    })),
  "dom.icon-tile-stack": (evidence) =>
    manualEach(evidence, (e) => ({
      summary: `Remove the icon tile at ${e.locator}.`,
      guidance: "If the icon is not adding meaning the heading lacks, it is decoration standing where content should be. Removing the element is the change; which markup declares it is not visible from a rendered read.",
      doNotApplyIf: "the sections are genuinely parallel, as on a documentation or feature index, where the repeated pattern helps.",
      blastRadius: "line",
    })),
  "css.stock-shadow": (evidence) =>
    manualEach(evidence, (e) => ({
      summary: `Tune the shadow on ${e.locator} to this surface, or replace it with a hairline border.`,
      guidance:
        "Elevation should say something about hierarchy. No replacement value is proposed because a tuned shadow depends on the surface it sits on, which a rendered read cannot judge.",
      doNotApplyIf: "the default recipe is the right answer here, which it often is; this is a weak signal on its own.",
      blastRadius: "line",
    })),
  "dom.numbered-steps": (evidence) =>
    manualEach(evidence, (e) => ({
      summary: `Remove the numeral at ${e.locator} unless these sections are genuinely sequential.`,
      guidance: "Number things that are steps. Do not number things that are merely next to each other.",
      doNotApplyIf: "the content really is a step-by-step process, where numbering is a kindness to the reader.",
      blastRadius: "line",
    })),
});
