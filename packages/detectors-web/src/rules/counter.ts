import type { Finding } from "@slop/core";
import { ev, patch } from "../rule.js";
import type { WebRule } from "../rule.js";
import { normalizeFamily } from "./visual.js";

/**
 * Counter-evidence: the rules that argue for the artifact.
 *
 * This layer is the moat and it is the thing every competing tool lacks. Detecting tells is
 * a weekend. Knowing which tells LIE is the corpus. A detector that can only find guilt will
 * find it everywhere, and the category's fatal flaw is not missing generated sites, it is
 * accusing careful human work.
 *
 * Two scopes:
 *   - `global` counters argue with the whole verdict and bypass family caps, subject to
 *     their own cap. "This site self-hosts a licensed foundry face" is an argument about
 *     the artifact, not about one family of tells.
 *   - `family` counters argue with one family. The cream-palette suppressor below is the
 *     canonical example.
 */

/**
 * Faces that are free, and therefore say nothing about whether anyone made a decision.
 * A face NOT on this list, self-hosted, is money spent and a licence signed: generators do
 * not license type. Three of four funded human comparables in the calibration set bought
 * one.
 */
const FREE_FACES = new Set(
  [
    "inter", "geist", "geist sans", "geist mono", "space grotesk", "roboto", "open sans", "lato",
    "montserrat", "poppins", "playfair display", "playfair", "fraunces", "instrument serif",
    "instrument sans", "dm sans", "dm serif display", "work sans", "nunito", "nunito sans", "raleway",
    "source sans 3", "source sans pro", "source serif 4", "ibm plex sans", "ibm plex serif",
    "ibm plex mono", "libre franklin", "libre baskerville", "crimson pro", "jost", "antonio",
    "damion", "satoshi", "general sans", "cabinet grotesk", "switzer", "clash display",
    "familjen grotesk", "newsreader", "manrope", "outfit", "sora", "figtree", "plus jakarta sans",
    "karla", "rubik", "urbanist", "bricolage grotesque", "public sans", "noto sans", "merriweather",
    "lora", "pt sans", "oswald", "bebas neue", "cormorant garamond", "eb garamond", "space mono",
    "jetbrains mono", "fira code", "fira sans", "arial", "helvetica", "helvetica neue", "georgia",
    "times new roman", "system-ui", "-apple-system", "ui-sans-serif", "ui-serif",
  ].map((s) => s.toLowerCase()),
);

const isSelfHosted = (src: string): boolean => src.startsWith("/") || src.startsWith("./") || /^https?:\/\/[^/]*(?:\/_next\/|\/assets\/|\/fonts\/)/.test(src);

/** Hex or rgb() to an rgb triple. */
function toRgb(color: string): [number, number, number] | null {
  const hex = /^#([0-9a-f]{6})$/i.exec(color.trim());
  if (hex) {
    const h = hex[1] as string;
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  const rgb = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i.exec(color);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  return null;
}

/**
 * The warm off-white cluster: #F4EFE4, #F0EBDC, #FFFBF0, #F6F2EA and their neighbours.
 * Light, warm, red channel above green above blue, with a small but real warm shift.
 */
function isWarmPaper(color: string): boolean {
  const rgb = toRgb(color);
  if (!rgb) return false;
  const [r, g, b] = rgb;
  if (r < 235 || g < 225 || b < 205) return false;
  if (!(r >= g && g >= b)) return false;
  const warmth = r - b;
  return warmth >= 8 && warmth <= 45;
}

const countVisualSignals = (prior: readonly Finding[]): number =>
  prior.filter((f) => f.family === "visual-default" && f.polarity === "signal").length;

const visualSignal = (ruleId: string): Finding => ({
  ruleId,
  family: "visual-default",
  title: ruleId,
  severity: "low",
  polarity: "signal",
  baseWeight: 0.4,
  weight: 0.4,
  hitsCounted: 1,
  evidence: [ev("css", "fixture", "fixture")],
  explanation: "fixture",
  falsePositiveNote: "fixture",
});

export const COUNTER_RULES: readonly WebRule[] = [
  {
    id: "counter.licensed-foundry-face",
    family: "counter-evidence",
    title: "A licensed, self-hosted typeface",
    polarity: "counter",
    counterScope: "global",
    severity: "info",
    baseWeight: -0.8,
    maxHits: 2,
    requiresProbe: "font-faces",
    phase: 1,
    since: "corpus-2026.09",
    explanation:
      "A CSSFontFaceRule serving a face that is not on the known-free list, from this origin. Somebody chose a typeface, paid for it, and self-hosted the files. Generators do not license type.",
    falsePositiveNote:
      "A face can be absent from the free list because it is obscure rather than because it is paid for, and a trial or DEMO build is licence sloppiness rather than investment. Read the src, it is printed.",
    detect: (a) =>
      a.type.faces
        // Normalised first. `next/font` self-hosts Google faces under a build-hashed family
        // name (`__Inter_36bd41`), which is absent from every free-face list ever written, so
        // an unnormalised lookup handed a generated Next.js page counter-evidence for
        // "licensing a typeface" it had downloaded for nothing.
        .filter((f) => !FREE_FACES.has(normalizeFamily(f.family).toLowerCase()) && isSelfHosted(f.src))
        .map((f) => ev("css", `@font-face src for "${f.family}"`, f.src, { expected: "n/a: this argues FOR the artifact" })),
    fixtures: {
      positive: (base) => ({
        artifact: patch(base, { type: { faces: [{ family: "Focal Maxi Web Medium", src: "/fonts/focal-maxi-medium.woff2" }] } }),
      }),
      mutated: (base) => ({
        artifact: patch(base, { type: { faces: [{ family: "Inter", src: "/fonts/inter-var.woff2" }] } }),
      }),
      extra: [
        {
          name: "a free face self-hosted by next/font under a hashed name is not a licensed face",
          shouldFire: false,
          build: (base) => ({
            artifact: patch(base, {
              type: { faces: [{ family: "__Inter_36bd41", src: "/_next/static/media/a1b2c3.p.woff2" }] },
            }),
          }),
        },
        {
          name: "a paid face loaded from a third-party CDN is not self-hosted and does not count",
          shouldFire: false,
          build: (base) => ({
            artifact: patch(base, { type: { faces: [{ family: "Focal Maxi Web Medium", src: "https://use.typekit.net/af/x.woff2" }] } }),
          }),
        },
      ],
    },
  },
  {
    id: "counter.real-photography",
    family: "counter-evidence",
    title: "Real photography with written alt text",
    polarity: "counter",
    counterScope: "global",
    severity: "info",
    baseWeight: -0.5,
    maxHits: 3,
    requiresProbe: "dom-survey",
    phase: 1,
    since: "corpus-2026.09",
    explanation:
      "Three or more photographic images carrying specific, written alt text. Commissioning or taking photographs and then describing them is work that does not happen by accident.",
    falsePositiveNote: "Stock photography also looks like this to a probe, and generated imagery increasingly does too. This is the weakest counter in the corpus.",
    detect: (a) => {
      const photos = a.dom.images.filter((i) => i.photographic && i.alt !== null && i.alt.trim().length >= 15);
      if (photos.length < 3) return [];
      return photos.map((i) => ev("selector", `img[src="${i.src}"]`, i.alt ?? ""));
    },
    fixtures: {
      positive: (base) => ({
        artifact: patch(base, {
          dom: {
            images: [
              { src: "/a.jpg", alt: "Two colleagues at a workbench in Leeds", photographic: true },
              { src: "/b.jpg", alt: "A brass hinge being filed by hand", photographic: true },
              { src: "/c.jpg", alt: "The catalogue open on a bench, 1994 edition", photographic: true },
            ],
          },
        }),
      }),
      mutated: (base) => ({
        artifact: patch(base, {
          dom: {
            images: [
              { src: "/a.svg", alt: "Two colleagues at a workbench in Leeds", photographic: false },
              { src: "/b.svg", alt: "A brass hinge being filed by hand", photographic: false },
              { src: "/c.svg", alt: "The catalogue open on a bench, 1994 edition", photographic: false },
            ],
          },
        }),
      }),
    },
  },
  {
    id: "counter.handmade-artifact",
    family: "counter-evidence",
    title: "A hand-made, non-generated asset",
    polarity: "counter",
    counterScope: "global",
    severity: "info",
    baseWeight: -0.5,
    maxHits: 2,
    requiresProbe: "dom-survey",
    phase: 1,
    since: "corpus-2026.09",
    explanation:
      "An analog grain overlay, a drawn mark, photographed handwriting, a torn-paper plate. Assets almost nobody produces by accident and no generator reaches for unprompted.",
    falsePositiveNote: "A grain overlay is itself a trend, and a texture can be bought as easily as commissioned.",
    detect: (a) => a.dom.customArtifacts.map((c) => ev("selector", c.selector, `${c.kind}: ${c.detail}`)),
    fixtures: {
      positive: (base) => ({
        artifact: patch(base, {
          dom: { customArtifacts: [{ selector: ".grain", kind: "noise-overlay", detail: "fractal noise at 3.5% opacity" }] },
        }),
      }),
      mutated: (base) => ({ artifact: patch(base, { dom: { customArtifacts: [] } }) }),
    },
  },
  {
    id: "counter.anti-spam-plumbing",
    family: "counter-evidence",
    title: "A real anti-spam layer on the form",
    polarity: "counter",
    counterScope: "global",
    severity: "info",
    baseWeight: -0.4,
    maxHits: 2,
    requiresProbe: "dom-survey",
    phase: 1,
    since: "corpus-2026.09",
    explanation:
      "Two or more honeypot fields, or hidden attribution plumbing, on the signup form. Somebody ran this form in production, got spammed, and fixed it. Generators do not ship an anti-spam layer.",
    falsePositiveNote: "A form library or a hosted form provider can supply honeypots without anyone deciding anything.",
    detect: (a) => {
      const pots = a.dom.hiddenInputs.filter((i) => /honeypot|utm|referral/i.test(i.reason));
      if (pots.length < 2) return [];
      return pots.map((i) => ev("selector", `input[name="${i.name}"]`, i.reason));
    },
    fixtures: {
      positive: (base) => ({
        artifact: patch(base, {
          dom: {
            hiddenInputs: [
              { name: "website", reason: "honeypot, tabindex=-1 and scale(0)" },
              { name: "company", reason: "honeypot, aria-hidden" },
              { name: "utm_source", reason: "hidden utm plumbing" },
            ],
          },
        }),
      }),
      mutated: (base) => ({ artifact: patch(base, { dom: { hiddenInputs: [] } }) }),
    },
  },
  {
    id: "counter.category-convention-palette",
    family: "visual-default",
    title: "A warm-paper background standing on its own is category convention, not a tell",
    polarity: "counter",
    counterScope: "family",
    severity: "info",
    baseWeight: -0.3,
    maxHits: 1,
    requiresProbe: "computed-style",
    phase: 2,
    since: "corpus-2026.09",
    explanation:
      "The body background sits in the warm off-white cluster and fewer than two other visual defaults fired. Of four well-funded, design-literate, human-made comparables read out of live CSS in August 2026, THREE use exactly this palette: #F0EBDC, #FFFBF0 and #F6F2EA. Cream is the house style of the credible 2026 startup, so on its own it argues for the artifact rather than against it.",
    falsePositiveNote:
      "This is a measured convention with a date on it. Conventions move. If cream stops being what careful designers reach for, this suppressor has to be re-measured or removed.",
    detect: (a, ctx) => {
      const bg = a.color.bodyBackground;
      if (!bg || !isWarmPaper(bg)) return [];
      if (countVisualSignals(ctx.priorFindings) >= 2) return [];
      return [
        ev("css", "background-color on body", bg, {
          expected: "n/a: measured as category convention, so it lowers rather than raises the score",
        }),
      ];
    },
    fixtures: {
      positive: (base) => ({ artifact: patch(base, { color: { bodyBackground: "#F0EBDC" } }), prior: [] }),
      mutated: (base) => ({ artifact: patch(base, { color: { bodyBackground: "#ffffff" } }), prior: [] }),
      extra: [
        {
          name: "cream alongside two other visual defaults is no longer suppressed",
          shouldFire: false,
          build: (base) => ({
            artifact: patch(base, { color: { bodyBackground: "#F0EBDC" } }),
            prior: [visualSignal("css.crushed-tracking"), visualSignal("dom.eyebrow-count")],
          }),
        },
        {
          name: "the other three measured cream hexes are suppressed too",
          shouldFire: true,
          build: (base) => ({ artifact: patch(base, { color: { bodyBackground: "#FFFBF0" } }), prior: [] }),
        },
      ],
    },
  },
  {
    id: "provenance.disclosed",
    family: "provenance",
    title: "The artifact discloses how it was made",
    polarity: "counter",
    counterScope: "family",
    severity: "info",
    baseWeight: -0.6,
    maxHits: 1,
    requiresProbe: "provenance",
    phase: 1,
    since: "corpus-2026.09",
    explanation:
      "A C2PA manifest or an explicit on-page disclosure. Disclosed content is scored DOWN. Rewarding disclosure is the correct posture and it is the one that survives EU AI Act Art. 50 and California SB 942.",
    falsePositiveNote: "A disclosure is a claim by the operator. It is not verified here, and absence of a manifest proves nothing either way.",
    detect: (a) => {
      const out = [];
      if (a.provenance.c2pa) out.push(ev("metric", "C2PA manifest", "present"));
      if (a.provenance.aiDisclosure) out.push(ev("text", "on-page disclosure", a.provenance.aiDisclosure));
      return out.slice(0, 1);
    },
    fixtures: {
      positive: (base) => ({
        artifact: patch(base, { provenance: { c2pa: false, aiDisclosure: "Parts of this site were drafted with AI assistance." } }),
      }),
      mutated: (base) => ({ artifact: patch(base, { provenance: { c2pa: false, aiDisclosure: null } }) }),
    },
  },
];
