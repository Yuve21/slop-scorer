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
    { id: "provenance", ran: true, denominator: 1, weight: PROBE_WEIGHTS.provenance },
  ];
}
