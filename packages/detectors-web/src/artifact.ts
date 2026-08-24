/**
 * The web artifact: everything the probe layer observed, and nothing else.
 *
 * Two properties matter more than the field list.
 *
 * 1. THIS IS MEASURED FROM THE RENDERED PAGE, NOT THE SERVER HTML. That is the
 *    methodological line the whole modality lives on. A static-HTML read of a
 *    client-rendered route produces confident findings about the wrong document: the
 *    version of this that shipped in the source corpus reported "this route has 0 H1s" for
 *    a route whose heading simply does not exist until hydration. A fetch-only read is
 *    allowed as a fast path but it sets coverage below the abstention floor on its own, so
 *    it can never produce a confident score.
 *
 * 2. THE ARTIFACT IS THE STORED THING, NOT THE SITE. Reports are re-scorable against a
 *    later corpus by replaying this object. That is what makes the benchmark reproducible,
 *    the appeals process answerable, and the storage bill small, with none of the copyright
 *    exposure of keeping copies of other people's pages.
 */

import type { ProbeStatus } from "@slop/core";

export const ARTIFACT_SCHEMA_VERSION = 1 as const;

/** Probe ids. Every rule names the probe it depends on, and the name is checked. */
export type ProbeId =
  | "http"
  | "render"
  | "computed-style"
  | "font-faces"
  | "dom-survey"
  | "assets"
  | "well-known"
  | "not-found"
  | "text"
  | "motion"
  | "image-text"
  | "provenance";

/** Coverage weights. Rendering is worth more than a header read because it reveals more. */
export const PROBE_WEIGHTS: Readonly<Record<ProbeId, number>> = {
  http: 1,
  render: 3,
  "computed-style": 2,
  "font-faces": 1,
  "dom-survey": 2,
  assets: 2,
  "well-known": 2,
  "not-found": 1,
  text: 1,
  // A second computed-style pass, taken twice (once under an emulated
  // prefers-reduced-motion), so it is weighted like the first one.
  motion: 2,
  "image-text": 1,
  provenance: 1,
};

export interface FontFaceRecord {
  readonly family: string;
  readonly src: string;
  readonly weight?: string;
}

export interface TypeSample {
  readonly selector: string;
  readonly family: string;
  readonly weightNum: number;
  readonly sizePx: number;
  readonly letterSpacingEm: number;
}

export interface CardSignature {
  readonly selector: string;
  readonly radius: string;
  readonly border: string;
  readonly shadow: string;
}

export interface ChunkRecord {
  readonly url: string;
  readonly bytes: number;
  readonly sourceMappingURL: boolean;
  readonly mapReachable: boolean;
  /** First bytes of the reachable map, where generator banners and commit trailers live. */
  readonly mapExcerpt?: string;
}

/**
 * One animated element, as the browser computed it.
 *
 * Everything here is a `getComputedStyle` value on a real selector, which is the whole reason
 * motion can live in a deterministic corpus at all: a reader can open DevTools, select the
 * element, and read the same number back. Nothing in this record is a judgement.
 */
export interface MotionRecord {
  readonly selector: string;
  /** Which mechanism moves it. A transition needs a trigger; an animation runs on its own. */
  readonly source: "animation" | "transition";
  /** `animation-name`, or the transition's property list. */
  readonly name: string;
  /** The properties actually being animated, comma separated, as computed. */
  readonly properties: string;
  readonly durationMs: number;
  readonly delayMs: number;
  /** The computed timing function, verbatim, including a `cubic-bezier(...)` spelled out. */
  readonly easing: string;
  /** `animation-iteration-count` as computed. "infinite" is the one that matters. */
  readonly iterations: string;
  /** True when the element carries no text of its own: decoration rather than content. */
  readonly decorative: boolean;
}

/** An `@keyframes` block, read out of the loaded stylesheets. */
export interface KeyframeRecord {
  readonly name: string;
  /** How many stops the author wrote. Two is a fade; five is somebody drawing a curve. */
  readonly stops: number;
  /** Properties the keyframes touch, comma separated. */
  readonly properties: string;
}

/** A motion library naming itself in the markup, the CSS or a request. */
export interface MotionLibraryMarker {
  readonly library: string;
  readonly kind: "class" | "attribute" | "keyframe" | "stylesheet" | "script";
  readonly locator: string;
  readonly observed: string;
}

/**
 * Text recovered from INSIDE an image, and how it was recovered.
 *
 * `method` is load-bearing, not descriptive. `svg-text` is a byte-exact read of a `<text>`
 * node; `raster-ocr` is a decode of pixels that abstains far more often than it succeeds.
 * Both are reported as probabilistic findings, for the reason the family caveat gives: what a
 * file contains and what a reader sees are different claims, and neither method establishes
 * the second one.
 */
export interface ImageTextRecord {
  readonly src: string;
  readonly method: "svg-text" | "raster-ocr";
  /** Recovered text, verbatim. Quoted into the evidence so the read itself is auditable. */
  readonly text: string;
  /** 0..1. For OCR, the share of decoded glyph cells that matched a glyph. */
  readonly confidence: number;
  /** Set when nothing was recovered, saying WHY. An unread image is not a clean image. */
  readonly abstained?: string;
}

export interface WellKnownRecord {
  readonly path: string;
  readonly status: number;
  readonly contentType: string;
  readonly excerpt?: string;
}

export interface WebArtifact {
  readonly schemaVersion: typeof ARTIFACT_SCHEMA_VERSION;
  readonly url: string;
  readonly finalUrl: string;
  readonly fetchedAt: string;
  /** "rendered" is a real browser. "static" is fetch-only and cannot clear the score floor. */
  readonly tier: "rendered" | "static";
  readonly viewport: { readonly width: number; readonly height: number };

  readonly http: { readonly status: number; readonly headers: Readonly<Record<string, string>> };

  readonly head: {
    readonly title: string | null;
    readonly generator: string | null;
    readonly description: string | null;
    readonly ogImage: string | null;
    readonly canonical: string | null;
    readonly htmlLang: string | null;
    readonly favicon: boolean;
    readonly jsonLd: boolean;
  };

  readonly type: {
    readonly faces: readonly FontFaceRecord[];
    /** Distinct computed families actually in use across sampled elements. */
    readonly familiesInUse: readonly string[];
    readonly hero: TypeSample | null;
    readonly body: TypeSample | null;
  };

  readonly color: {
    readonly bodyBackground: string | null;
    /** Computed background-image on the hero, when it is a gradient. */
    readonly heroGradient: string | null;
  };

  readonly dom: {
    readonly nodeCount: number;
    readonly h1Count: number;
    readonly images: readonly { readonly src: string; readonly alt: string | null; readonly photographic: boolean }[];
    readonly eyebrows: readonly { readonly selector: string; readonly text: string }[];
    readonly pingDots: readonly { readonly selector: string; readonly animation: string }[];
    readonly numberedLabels: readonly { readonly selector: string; readonly text: string }[];
    readonly cards: readonly CardSignature[];
    readonly iconTiles: readonly { readonly selector: string }[];
    readonly sections: readonly { readonly selector: string; readonly heightPx: number }[];
    /** Honeypots and hidden UTM plumbing. Generators do not ship an anti-spam layer. */
    readonly hiddenInputs: readonly { readonly name: string; readonly reason: string }[];
    /** Hand-made assets: grain overlays, drawn marks, photographed handwriting. */
    readonly customArtifacts: readonly { readonly selector: string; readonly kind: string; readonly detail: string }[];
  };

  readonly assets: {
    readonly chunks: readonly ChunkRecord[];
    readonly totalJsBytes: number;
    readonly thirdPartyHosts: readonly string[];
  };

  readonly wellKnown: readonly WellKnownRecord[];
  readonly routes: readonly string[];
  readonly notFound: { readonly status: number; readonly bodyBytes: number } | null;

  readonly text: { readonly innerText: string; readonly wordCount: number };

  /**
   * The page's motion, and the second reading that makes it mean something.
   *
   * OPTIONAL ON PURPOSE, and this is the only optional block in the artifact. Captures taken
   * before this probe existed are replayable, and when this field is absent the motion probe
   * is absent from `probes` too, so every motion rule is SKIPPED with a warning naming it
   * rather than evaluated against nothing. That is the difference this whole file is built
   * around: "we did not look" and "we looked and it was fine" must never render the same.
   * Filling it with an empty record would have been the second thing.
   */
  readonly motion?: {
    readonly records: readonly MotionRecord[];
    readonly keyframes: readonly KeyframeRecord[];
    readonly libraryMarkers: readonly MotionLibraryMarker[];
    /**
     * The same page, read again under an emulated `prefers-reduced-motion: reduce`.
     *
     * This is the measurement, not the `@media` block. A page can carry the query and honour
     * none of it; the only way to know is to ask the browser for the reduced document and
     * count what stopped moving.
     */
    readonly reducedMotion: {
      readonly measured: boolean;
      readonly animatedBefore: number;
      readonly animatedAfter: number;
      /** Up to a handful of selectors that actually stopped, for the citation. */
      readonly stopped: readonly string[];
      /** A `@media (prefers-reduced-motion` block found in same-origin CSS. Declared, not honoured. */
      readonly queryDeclared: boolean;
    };
    /** Top-level sections carrying an entrance animation, over the number of sections. */
    readonly sectionsWithReveal: number;
    readonly sectionsTotal: number;
    /** Elements whose computed motion was read. The denominator; zero means a stale walk. */
    readonly sampled: number;
  };

  /**
   * Text read out of the images on the page. Optional for the same reason `motion` is.
   *
   * `attempted` is the denominator and it counts images we TRIED, not images we read. An
   * image nothing could be recovered from is a record with `abstained` set, not a gap.
   */
  readonly imageText?: {
    readonly records: readonly ImageTextRecord[];
    readonly attempted: number;
  };

  readonly provenance: {
    readonly c2pa: boolean;
    /** An explicit "made with AI" disclosure found on the page, verbatim. */
    readonly aiDisclosure: string | null;
  };

  readonly probes: readonly ProbeStatus[];
}

/**
 * A clean artifact that NO rule fires on.
 *
 * Every rule's fixtures are expressed as a patch over this, which is what makes the
 * mutation meta-test meaningful: the mutated case differs from the positive case in exactly
 * one field, so a rule that still fires after the mutation is reading something it did not
 * claim to read.
 *
 * It is also a live assertion in its own right. `corpus.test.ts` scores it and requires
 * zero findings, so a rule accidentally written to fire on absence announces itself the
 * moment it is added.
 */
export function neutralArtifact(overrides: Partial<WebArtifact> = {}): WebArtifact {
  const base: WebArtifact = {
    schemaVersion: ARTIFACT_SCHEMA_VERSION,
    url: "https://example.test/",
    finalUrl: "https://example.test/",
    fetchedAt: "2026-08-23T00:00:00.000Z",
    tier: "rendered",
    viewport: { width: 390, height: 844 },
    http: { status: 200, headers: { "content-type": "text/html; charset=utf-8" } },
    head: {
      title: "Example: a specific claim about a specific thing",
      generator: null,
      description:
        "A description long enough to be a real description rather than a placeholder left in by a scaffold.",
      ogImage: "https://example.test/og.png",
      canonical: "https://example.test/",
      htmlLang: "en",
      favicon: true,
      jsonLd: true,
    },
    // A free face on purpose: the neutral artifact must fire NOTHING, counter-evidence
    // included, or the mutation meta-test is measuring the fixture rather than the rule.
    type: {
      faces: [{ family: "Libre Franklin", src: "/fonts/libre-franklin-var.woff2", weight: "400 700" }],
      familiesInUse: ["Libre Franklin", "Newsreader"],
      hero: { selector: "h1", family: "Libre Franklin", weightNum: 600, sizePx: 40, letterSpacingEm: -0.01 },
      body: { selector: "p", family: "Libre Franklin", weightNum: 400, sizePx: 17, letterSpacingEm: 0 },
    },
    color: { bodyBackground: "#ffffff", heroGradient: null },
    dom: {
      nodeCount: 640,
      h1Count: 1,
      images: [{ src: "/photo-a.jpg", alt: "Two colleagues at a workbench in Leeds", photographic: true }],
      eyebrows: [],
      pingDots: [],
      numberedLabels: [],
      cards: [],
      iconTiles: [],
      sections: [
        { selector: "section:nth-child(1)", heightPx: 720 },
        { selector: "section:nth-child(2)", heightPx: 380 },
        { selector: "section:nth-child(3)", heightPx: 1100 },
      ],
      hiddenInputs: [],
      customArtifacts: [],
    },
    assets: {
      chunks: [{ url: "/assets/app-9f2c.js", bytes: 180_000, sourceMappingURL: false, mapReachable: false }],
      totalJsBytes: 180_000,
      thirdPartyHosts: [],
    },
    wellKnown: [
      { path: "/robots.txt", status: 200, contentType: "text/plain", excerpt: "Sitemap: https://example.test/sitemap.xml" },
      { path: "/sitemap.xml", status: 200, contentType: "application/xml" },
      { path: "/CLAUDE.md", status: 404, contentType: "text/html" },
      { path: "/AGENTS.md", status: 404, contentType: "text/html" },
      { path: "/.cursorrules", status: 404, contentType: "text/html" },
      { path: "/llms.txt", status: 404, contentType: "text/html" },
    ],
    routes: ["/", "/work", "/about"],
    notFound: { status: 404, bodyBytes: 2400 },
    text: {
      innerText:
        "We make hinges in Leeds. Fourteen people, one workshop, a catalogue you can hold. Ring us on a weekday and someone who has actually used the thing will pick up.",
      wordCount: 31,
    },
    // A page that animates a LITTLE, unevenly, and honours nothing in particular. Every field
    // here is chosen to sit between the motion rules rather than under them: four moving
    // elements (the uniformity rules need six), three different easings (the sameness rule
    // needs one), delay steps of 0/60/90/240 (the stagger rule needs an exact ladder), no
    // infinite loop, no library marker, and a reduced-motion read that measured nothing
    // stopping (so the counter does not fire either). Motion PRESENT and unremarkable is the
    // hardest case for this family and it is the one the neutral artifact has to be.
    motion: {
      records: [
        {
          selector: "a.cta",
          source: "transition",
          name: "background-color",
          properties: "background-color",
          durationMs: 120,
          delayMs: 0,
          easing: "ease-out",
          iterations: "1",
          decorative: false,
        },
        {
          selector: "details.spec",
          source: "transition",
          name: "height",
          properties: "height",
          durationMs: 240,
          delayMs: 60,
          easing: "cubic-bezier(0.2, 0, 0, 1)",
          iterations: "1",
          decorative: false,
        },
        {
          selector: "img.plate",
          source: "animation",
          name: "plate-settle",
          properties: "transform",
          durationMs: 900,
          delayMs: 90,
          easing: "cubic-bezier(0.33, 1, 0.68, 1)",
          iterations: "1",
          decorative: true,
        },
        {
          selector: "nav.sticky",
          source: "transition",
          name: "box-shadow",
          properties: "box-shadow",
          durationMs: 80,
          delayMs: 240,
          easing: "linear",
          iterations: "1",
          decorative: false,
        },
      ],
      keyframes: [{ name: "plate-settle", stops: 2, properties: "transform" }],
      libraryMarkers: [],
      reducedMotion: { measured: true, animatedBefore: 4, animatedAfter: 4, stopped: [], queryDeclared: false },
      sectionsWithReveal: 1,
      sectionsTotal: 3,
      sampled: 24,
    },
    // One image was tried and nothing was recovered from it, which is the ordinary outcome:
    // a photograph is not type. The record exists rather than being omitted, because an image
    // nobody could read is not an image with no text in it.
    imageText: {
      records: [
        {
          src: "/photo-a.jpg",
          method: "raster-ocr",
          text: "",
          confidence: 0,
          abstained: "no decoder for image/jpeg in this build, so the pixels were never examined",
        },
      ],
      attempted: 1,
    },
    provenance: { c2pa: false, aiDisclosure: null },
    probes: allProbesRan(),
  };
  return { ...base, ...overrides };
}

/** Every probe ran and collected something. Denominators are what stop a vacuous pass. */
export function allProbesRan(): ProbeStatus[] {
  return [
    { id: "http", ran: true, denominator: 1, weight: PROBE_WEIGHTS.http },
    { id: "render", ran: true, denominator: 1, weight: PROBE_WEIGHTS.render },
    { id: "computed-style", ran: true, denominator: 24, expectsNonEmpty: true, weight: PROBE_WEIGHTS["computed-style"], note: "elements sampled for computed styles" },
    { id: "font-faces", ran: true, denominator: 1, expectsNonEmpty: true, weight: PROBE_WEIGHTS["font-faces"], note: "CSSFontFaceRule entries enumerated from loaded stylesheets" },
    { id: "dom-survey", ran: true, denominator: 640, expectsNonEmpty: true, weight: PROBE_WEIGHTS["dom-survey"], note: "DOM nodes walked" },
    { id: "assets", ran: true, denominator: 1, expectsNonEmpty: true, weight: PROBE_WEIGHTS.assets, note: "script chunks sampled. Zero here means the chunk pattern went stale and every source-map and weight rule below it passed having scanned nothing." },
    { id: "well-known", ran: true, denominator: 6, expectsNonEmpty: true, weight: PROBE_WEIGHTS["well-known"], note: "well-known paths probed" },
    { id: "not-found", ran: true, denominator: 1, weight: PROBE_WEIGHTS["not-found"] },
    { id: "text", ran: true, denominator: 31, expectsNonEmpty: true, weight: PROBE_WEIGHTS.text, note: "words of rendered innerText" },
    { id: "motion", ran: true, denominator: 24, expectsNonEmpty: true, weight: PROBE_WEIGHTS.motion, note: "elements whose computed animation and transition values were read. Zero means the motion walk went stale and every uniformity rule below it passed having measured nothing." },
    { id: "image-text", ran: true, denominator: 1, weight: PROBE_WEIGHTS["image-text"], note: "images text recovery was ATTEMPTED on. Counts the attempts, not the successes: an image nothing could be read from is a record with a stated reason, not a gap." },
    { id: "provenance", ran: true, denominator: 1, weight: PROBE_WEIGHTS.provenance },
  ];
}
