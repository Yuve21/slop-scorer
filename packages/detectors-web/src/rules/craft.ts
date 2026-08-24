import { attachRemedies } from "@slop/core";
import { ev, patch } from "../rule.js";
import type { WebRule } from "../rule.js";
import { manualEach, manualOnce, uiChange } from "./remedy.js";

/**
 * Family: craft-floor. Ported from a 54-check production hygiene audit.
 *
 * TWO THINGS ABOUT THIS FAMILY, AND THEY BOTH MATTER MORE THAN THE RULES.
 *
 * 1. EVERY ITEM IS PHRASED AS A DEFECT, so a rule that does not fire means the defect is
 *    ABSENT. The source audit is written that way round on purpose: the list is a list of
 *    things not to have, and inverting it in the output is how you end up reassured by the
 *    wrong line.
 *
 * 2. THIS FAMILY MEASURES ABSENT CRAFT, NOT GENERATION. A rushed human trips every check in
 *    it; a careful person using a generator trips none. It is the weakest positive evidence
 *    in the corpus, it is capped at 15%, its weights are a fifth of a builder fingerprint's,
 *    and the report says so next to the findings. Getting this family's weight wrong is how
 *    a detector ends up calling every small business site in the country AI-generated.
 */

const SCAFFOLD_TITLE = /vite \+ react|create next app|^react app$|^next\.js app$|^untitled|localhost|^document$|^home$/i;

const RAW_CRAFT_RULES: readonly WebRule[] = [
  {
    id: "craft.scaffold-title",
    family: "craft-floor",
    title: "The page title is a scaffold default",
    polarity: "signal",
    severity: "medium",
    baseWeight: 0.25,
    maxHits: 1,
    requiresProbe: "render",
    phase: 1,
    since: "corpus-2026.09",
    explanation:
      "The <title> is still whatever the template shipped with. It is the first string anyone writes on a site they care about, and it is the first one left behind on a site nobody read after generating.",
    falsePositiveNote: "An unfinished page in progress will also have this, and being unfinished is not the same as being generated.",
    prevention: "Write a title that makes a specific claim about this specific page.",
    detect: (a) => {
      const t = a.head.title;
      if (!t || !SCAFFOLD_TITLE.test(t.trim())) return [];
      return [ev("selector", "title", t, { expected: "a title specific to this page" })];
    },
    fixtures: {
      positive: (base) => ({ artifact: patch(base, { head: { title: "Vite + React" } }) }),
      mutated: (base) => ({ artifact: patch(base, { head: { title: "Hinges made in Leeds since 1994" } }) }),
    },
  },
  {
    id: "craft.soft-404",
    family: "craft-floor",
    title: "A missing page does not return 404",
    polarity: "signal",
    severity: "medium",
    baseWeight: 0.2,
    maxHits: 1,
    requiresProbe: "not-found",
    phase: 1,
    since: "corpus-2026.09",
    explanation:
      "A request for a page that does not exist returns 200, or returns a blank body. Either tells a crawler the page exists and drags crawl quality down across the whole site.",
    falsePositiveNote: "A single-page app that renders its own not-found view client side can look like this to a probe that does not read the rendered body.",
    prevention: "Return a real 404 status with a real page body.",
    detect: (a) => {
      const nf = a.notFound;
      if (!nf) return [];
      if (nf.status === 404 && nf.bodyBytes > 800) return [];
      return [
        ev("request", "GET /a-path-that-does-not-exist", `HTTP ${nf.status}, ${nf.bodyBytes} byte body`, {
          expected: "HTTP 404 with a rendered page",
        }),
      ];
    },
    fixtures: {
      positive: (base) => ({ artifact: patch(base, { notFound: { status: 200, bodyBytes: 4200 } }) }),
      mutated: (base) => ({ artifact: patch(base, { notFound: { status: 404, bodyBytes: 4200 } }) }),
      extra: [
        {
          name: "a 404 with an empty body still fires",
          shouldFire: true,
          build: (base) => ({ artifact: patch(base, { notFound: { status: 404, bodyBytes: 12 } }) }),
        },
      ],
    },
  },
  {
    id: "craft.published-sourcemaps",
    family: "craft-floor",
    title: "Source maps are published to production",
    polarity: "signal",
    severity: "low",
    baseWeight: 0.15,
    maxHits: 3,
    requiresProbe: "assets",
    phase: 1,
    since: "corpus-2026.09",
    explanation: "A .map file next to a shipped chunk returns JSON. That hands over readable original source to anyone who asks for it.",
    falsePositiveNote: "Some teams publish maps deliberately so error reporting is legible. That is a real choice, not an accident.",
    prevention: "Turn off source map emission for production builds, or upload them to your error reporter instead of your web root.",
    detect: (a) =>
      a.assets.chunks.filter((c) => c.mapReachable).map((c) => ev("request", `GET ${c.url}.map`, "200, JSON body", { expected: "404" })),
    fixtures: {
      positive: (base) => ({
        artifact: patch(base, {
          assets: {
            chunks: [{ url: "/assets/app-9f2c.js", bytes: 180_000, sourceMappingURL: true, mapReachable: true }],
            totalJsBytes: 180_000,
            thirdPartyHosts: [],
          },
        }),
      }),
      mutated: (base) => ({
        artifact: patch(base, {
          assets: {
            chunks: [{ url: "/assets/app-9f2c.js", bytes: 180_000, sourceMappingURL: true, mapReachable: false }],
            totalJsBytes: 180_000,
            thirdPartyHosts: [],
          },
        }),
      }),
    },
  },
  {
    id: "craft.no-meta-description",
    family: "craft-floor",
    title: "No meta description",
    polarity: "signal",
    severity: "low",
    baseWeight: 0.12,
    maxHits: 1,
    requiresProbe: "render",
    phase: 1,
    since: "corpus-2026.09",
    explanation: "No description, or one too short to be a real sentence. Search results then quote whatever text happens to be near the top.",
    falsePositiveNote: "Search engines often ignore the description anyway. Its absence is a sign nobody did the pass, not a ranking catastrophe.",
    prevention: "Write one sentence per page saying what the page is.",
    detect: (a) => {
      const d = a.head.description;
      if (d && d.length > 40) return [];
      return [ev("selector", 'meta[name="description"]', d ? `${d.length} chars` : "absent", { expected: "a sentence over 40 characters" })];
    },
    fixtures: {
      positive: (base) => ({ artifact: patch(base, { head: { description: null } }) }),
      mutated: (base) => ({ artifact: patch(base, { head: { description: "A sentence that is comfortably longer than the forty character floor." } }) }),
    },
  },
  {
    id: "craft.no-og-image",
    family: "craft-floor",
    title: "No link preview image",
    polarity: "signal",
    severity: "low",
    baseWeight: 0.12,
    maxHits: 1,
    requiresProbe: "render",
    phase: 1,
    since: "corpus-2026.09",
    explanation: "No og:image, so every share of this link renders as a grey box in every chat app it is pasted into.",
    falsePositiveNote: "Irrelevant for a site nobody shares, such as an internal tool.",
    prevention: "Ship an og:image. A generated one from the page title beats nothing.",
    detect: (a) => (a.head.ogImage ? [] : [ev("selector", 'meta[property="og:image"]', "absent", { expected: "a preview image URL" })]),
    fixtures: {
      positive: (base) => ({ artifact: patch(base, { head: { ogImage: null } }) }),
      mutated: (base) => ({ artifact: patch(base, { head: { ogImage: "https://example.test/og.png" } }) }),
    },
  },
  {
    id: "craft.no-lang",
    family: "craft-floor",
    title: "No lang attribute on the html element",
    polarity: "signal",
    severity: "low",
    baseWeight: 0.12,
    maxHits: 1,
    requiresProbe: "render",
    phase: 1,
    since: "corpus-2026.09",
    explanation: "Screen readers choose a voice from this attribute. Without it they guess, and it is a WCAG 3.1.1 failure.",
    falsePositiveNote: "One attribute. Its absence says nobody ran an accessibility pass, nothing more.",
    prevention: 'Add lang="en", or whatever the page is actually in.',
    detect: (a) => (a.head.htmlLang ? [] : [ev("selector", "html[lang]", "absent", { expected: 'lang="en"' })]),
    fixtures: {
      positive: (base) => ({ artifact: patch(base, { head: { htmlLang: null } }) }),
      mutated: (base) => ({ artifact: patch(base, { head: { htmlLang: "en" } }) }),
    },
  },
  {
    id: "craft.missing-alt",
    family: "craft-floor",
    title: "Images without an alt attribute",
    polarity: "signal",
    severity: "low",
    baseWeight: 0.12,
    maxHits: 3,
    requiresProbe: "dom-survey",
    phase: 1,
    since: "corpus-2026.09",
    explanation: 'An <img> with no alt attribute at all. alt="" is correct for decorative images; the attribute still has to be there.',
    falsePositiveNote:
      "Only fires when images were actually found. A page with no images cannot trip this, and that is not the same as passing it.",
    prevention: 'Give every image an alt attribute. Empty is fine when the image is decoration.',
    detect: (a) =>
      a.dom.images.filter((i) => i.alt === null).map((i) => ev("selector", `img[src="${i.src}"]`, "no alt attribute", { expected: 'alt="..." or alt=""' })),
    fixtures: {
      positive: (base) => ({
        artifact: patch(base, { dom: { images: [{ src: "/hero.png", alt: null, photographic: false }] } }),
      }),
      mutated: (base) => ({
        artifact: patch(base, { dom: { images: [{ src: "/hero.png", alt: "A brass hinge on a workbench", photographic: true }] } }),
      }),
    },
  },
  {
    id: "craft.no-canonical",
    family: "craft-floor",
    title: "No canonical URL",
    polarity: "signal",
    severity: "info",
    baseWeight: 0.1,
    maxHits: 1,
    requiresProbe: "render",
    phase: 1,
    since: "corpus-2026.09",
    explanation: "Without a canonical, every ?ref= and ?utm_ variant of this URL is indexed as a separate duplicate page.",
    falsePositiveNote: "Only matters for pages that are shared with tracking parameters attached.",
    prevention: "Emit a canonical link on every indexable page.",
    detect: (a) => (a.head.canonical ? [] : [ev("selector", 'link[rel="canonical"]', "absent", { expected: "the page's own URL" })]),
    fixtures: {
      positive: (base) => ({ artifact: patch(base, { head: { canonical: null } }) }),
      mutated: (base) => ({ artifact: patch(base, { head: { canonical: "https://example.test/" } }) }),
    },
  },
  {
    id: "craft.crawler-files",
    family: "craft-floor",
    title: "robots.txt or sitemap.xml missing, or unreferenced",
    polarity: "signal",
    severity: "info",
    baseWeight: 0.1,
    maxHits: 3,
    requiresProbe: "well-known",
    phase: 1,
    since: "corpus-2026.09",
    explanation: "No robots.txt, no sitemap.xml, or a sitemap that robots.txt never points at. A sitemap nothing references is a sitemap nothing finds.",
    falsePositiveNote: "Small sites are crawled fine without either. This is a completeness signal, not a functional problem.",
    prevention: "Serve both, and reference the sitemap from robots.txt.",
    detect: (a) => {
      const out = [];
      const robots = a.wellKnown.find((w) => w.path === "/robots.txt");
      const sitemap = a.wellKnown.find((w) => w.path === "/sitemap.xml");
      if (!robots || robots.status !== 200) out.push(ev("url", "/robots.txt", robots ? `HTTP ${robots.status}` : "not probed", { expected: "HTTP 200 text/plain" }));
      if (!sitemap || sitemap.status !== 200) out.push(ev("url", "/sitemap.xml", sitemap ? `HTTP ${sitemap.status}` : "not probed", { expected: "HTTP 200 xml" }));
      if (robots?.status === 200 && sitemap?.status === 200 && !/sitemap:/i.test(robots.excerpt ?? "")) {
        out.push(ev("text", "/robots.txt", "no Sitemap: line", { expected: "Sitemap: https://.../sitemap.xml" }));
      }
      return out;
    },
    fixtures: {
      positive: (base) => ({ artifact: patch(base, { wellKnown: [{ path: "/CLAUDE.md", status: 404, contentType: "text/html" }] }) }),
      mutated: (base) => ({
        artifact: patch(base, {
          wellKnown: [
            { path: "/robots.txt", status: 200, contentType: "text/plain", excerpt: "Sitemap: https://example.test/sitemap.xml" },
            { path: "/sitemap.xml", status: 200, contentType: "application/xml" },
          ],
        }),
      }),
    },
  },
  {
    id: "craft.no-favicon",
    family: "craft-floor",
    title: "No favicon",
    polarity: "signal",
    severity: "info",
    baseWeight: 0.1,
    maxHits: 1,
    requiresProbe: "render",
    phase: 1,
    since: "corpus-2026.09",
    explanation: "No icon is reachable and none is declared, so the tab shows a blank sheet.",
    falsePositiveNote: "Cosmetic. Included because it is the cheapest possible sign that nobody looked at the tab.",
    prevention: "Ship an icon.",
    detect: (a) => (a.head.favicon ? [] : [ev("url", "/favicon.ico", "absent, and no link[rel~=icon]", { expected: "an icon" })]),
    fixtures: {
      positive: (base) => ({ artifact: patch(base, { head: { favicon: false } }) }),
      mutated: (base) => ({ artifact: patch(base, { head: { favicon: true } }) }),
    },
  },
  {
    id: "craft.js-weight",
    family: "craft-floor",
    title: "Very heavy first-page JavaScript",
    polarity: "signal",
    severity: "info",
    baseWeight: 0.1,
    maxHits: 1,
    requiresProbe: "assets",
    phase: 1,
    since: "corpus-2026.09",
    explanation: "More than 1.5 MB of uncompressed JavaScript for the first page. Usually a whole component library shipped for four components.",
    falsePositiveNote:
      "Raw bytes, not transfer size, and a real application legitimately ships more than a landing page. Treat as a relative signal, never as a Lighthouse number.",
    prevention: "Look at what is in the bundle before adding to it.",
    detect: (a) =>
      a.assets.totalJsBytes <= 1_500_000
        ? []
        : [ev("metric", "totalJsBytes", `${Math.round(a.assets.totalJsBytes / 1024)} KB uncompressed`, { expected: "under 1500 KB" })],
    fixtures: {
      positive: (base) => ({
        artifact: patch(base, { assets: { chunks: base.assets.chunks, totalJsBytes: 2_400_000, thirdPartyHosts: [] } }),
      }),
      mutated: (base) => ({
        artifact: patch(base, { assets: { chunks: base.assets.chunks, totalJsBytes: 320_000, thirdPartyHosts: [] } }),
      }),
    },
  },
];

/**
 * The fixes.
 *
 * One `ui_change` in the whole family, and it is the only one whose replacement is a fact we
 * already hold: the canonical URL is the URL we just fetched. Everything else in here is a
 * missing SENTENCE, a missing IMAGE or a server setting. A title, a meta description and an
 * alt attribute are all things a machine can produce instantly and all things whose machine
 * production is the defect this product measures, so this table names the gap and stops.
 *
 * The alt one is worth stating outright: automatically generated alt text is the canonical
 * example of a fix that satisfies a checker and helps nobody, because a screen reader user
 * then hears a confident description of an image the writer never looked at.
 */
export const CRAFT_RULES: readonly WebRule[] = attachRemedies(RAW_CRAFT_RULES, {
  "craft.scaffold-title": (evidence) =>
    manualEach(evidence, (e) => ({
      summary: `Write a title for this page; it is still the scaffold default (${e.observed}).`,
      guidance: "One specific claim about this specific page. No title is proposed because a generated one would be the same defect in better handwriting.",
      doNotApplyIf: "the page is unfinished and known to be, which is not the same thing as a page nobody read.",
      blastRadius: "line",
    })),
  "craft.soft-404": (evidence) =>
    manualOnce(evidence, {
      locator: evidence[0]?.locator ?? "GET /a-path-that-does-not-exist",
      summary: "Return a real 404 status with a real page body for paths that do not exist.",
      guidance: "This is routing and server configuration rather than markup, so it is named rather than patched.",
      doNotApplyIf: "the app renders its own not-found view client side and the probe read the shell instead.",
      blastRadius: "project",
    }),
  "craft.published-sourcemaps": (evidence) =>
    manualEach(evidence, (e) => ({
      summary: `Stop publishing ${e.locator} to production.`,
      guidance: "Turn off source map emission for the production build, or upload the maps to the error reporter instead of the web root. A build setting, so nothing is patched here.",
      doNotApplyIf: "the maps are published deliberately so error reports stay legible.",
      blastRadius: "project",
    })),
  "craft.no-meta-description": (evidence) =>
    manualOnce(evidence, {
      locator: evidence[0]?.locator ?? 'meta[name="description"]',
      summary: "Write one sentence saying what this page is, and put it in the meta description.",
      guidance: "No sentence is proposed. A generated description is the thing search results already quote badly, and writing one takes a person a minute.",
      doNotApplyIf: "the page is not indexed, where the description does nothing.",
      blastRadius: "line",
    }),
  "craft.no-og-image": (evidence) =>
    manualOnce(evidence, {
      locator: evidence[0]?.locator ?? 'meta[property="og:image"]',
      summary: "Ship a link preview image and reference it from og:image.",
      guidance: "An image generated from the page title beats nothing, but which image is a design decision and the file does not exist yet, so no value is proposed.",
      doNotApplyIf: "nobody shares this link, as with an internal tool.",
      blastRadius: "file",
    }),
  "craft.no-lang": (evidence) =>
    manualOnce(evidence, {
      locator: evidence[0]?.locator ?? "html[lang]",
      summary: "Set a lang attribute on the html element, matching the language the page is actually in.",
      guidance:
        "No value is proposed: this detector measures type, colour and structure, not language, and a wrong lang attribute makes a screen reader read the page in the wrong voice, which is worse than an absent one.",
      doNotApplyIf: "nothing. The attribute belongs there; only its value needs a person.",
      blastRadius: "line",
    }),
  "craft.missing-alt": (evidence) =>
    manualEach(evidence, (e) => ({
      summary: `Add an alt attribute to ${e.locator}.`,
      guidance:
        "Empty is correct for decoration; the attribute still has to be there. No text is proposed on purpose: generated alt text passes the checker and tells a screen reader user, confidently, about an image nobody looked at.",
      doNotApplyIf: "nothing, though the right value may be the empty string.",
      blastRadius: "line",
    })),
  "craft.no-canonical": (evidence, artifact) =>
    evidence.map((e) =>
      uiChange({
        selector: 'link[rel="canonical"]',
        property: "href",
        before: "absent",
        after: artifact.finalUrl,
        summary: `Add a canonical link pointing at ${artifact.finalUrl}, which is the URL this read resolved to.`,
        doNotApplyIf:
          "this page is a variant that should canonicalise to a different URL, or the final URL carries tracking parameters that should not be the canonical form.",
        sourceHint: "the head of the layout or the page metadata for this route",
        addresses: [e.locator],
        blastRadius: "line",
      }),
    ),
  "craft.crawler-files": (evidence) =>
    manualEach(evidence, (e) => ({
      summary: `Serve ${e.locator}, and reference the sitemap from robots.txt.`,
      guidance: "Both files are served by the app or the host rather than declared in the document that was rendered, so this is named rather than patched.",
      doNotApplyIf: "the site is small and crawled fine without either, which is common.",
      blastRadius: "project",
    })),
  "craft.no-favicon": (evidence) =>
    manualOnce(evidence, {
      locator: evidence[0]?.locator ?? "/favicon.ico",
      summary: "Ship an icon and declare it.",
      guidance: "The file does not exist yet, so there is nothing to patch. This is the cheapest item in the corpus and the most visible in a tab strip.",
      doNotApplyIf: "nothing, beyond not caring how the tab looks.",
      blastRadius: "file",
    }),
  "craft.js-weight": (evidence) =>
    manualOnce(evidence, {
      locator: evidence[0]?.locator ?? "totalJsBytes",
      summary: "Look at what is in the bundle before adding to it.",
      guidance:
        "Usually a whole component library shipped for four components. Which import to drop is a build question, and the measurement here is raw bytes rather than transfer size, so treat it as a relative signal.",
      doNotApplyIf: "this is a real application rather than a landing page, where the weight may be honest.",
      blastRadius: "project",
    }),
});
