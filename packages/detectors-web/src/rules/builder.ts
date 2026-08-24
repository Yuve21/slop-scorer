import { attachRemedies } from "@slop/core";
import { ev, patch } from "../rule.js";
import type { WebRule } from "../rule.js";
import { manualEach, manualOnce, uiChange } from "./remedy.js";

/**
 * Family: builder-fingerprint.
 *
 * The strongest evidence available in this modality and the most brittle. Everything here
 * is a FACT ABOUT THE ARTIFACT that a user can re-read in DevTools in ten seconds, which is
 * why the family is allowed to be worth 40% of the budget. It is capped at 40% for the
 * opposite reason: any vendor can delete its generator tag in one release, and a score that
 * collapses when they do was never measuring the artifact.
 */

const AI_BUILDERS =
  /lovable|v0\.dev|\bv0\b|bolt\.new|bolt\.diy|replit|figma\s*make|tempo\s*labs|famous\.ai|create\.xyz|softr\s*ai|base44|rork|emergent\.sh/i;

const AGENT_ARTIFACTS = new Set([
  "/CLAUDE.md",
  "/AGENTS.md",
  "/.cursorrules",
  "/.cursor/rules",
  "/.windsurfrules",
  "/.github/copilot-instructions.md",
  "/GEMINI.md",
]);

const BARE_PLATFORM_HOSTS =
  /\.(vercel\.app|netlify\.app|lovable\.app|lovableproject\.com|replit\.app|repl\.co|bolt\.host|web\.app|pages\.dev|onrender\.com|fly\.dev)$/i;

const GENERATOR_TRAILERS =
  /generated with \[?claude code|co-authored-by:\s*claude|lovable\.dev|v0\.dev|bolt\.new|windsurf|\.cursor\/|created by cursor/i;

const VENDOR_ASSET_HOSTS =
  /^(cdn\.lovable\.dev|assets\.lovable\.app|v0\.dev|cdn\.v0\.dev|bolt\.new|cdn\.builder\.io|replit\.com|cdn\.replit\.com)$/i;

const RAW_BUILDER_RULES: readonly WebRule[] = [
  {
    id: "builder.ai-generator-meta",
    family: "builder-fingerprint",
    title: "The page names an AI site builder in its generator tag",
    polarity: "signal",
    severity: "high",
    baseWeight: 1.8,
    maxHits: 1,
    requiresProbe: "render",
    phase: 1,
    since: "corpus-2026.09",
    explanation:
      "A <meta name=\"generator\"> naming an AI site builder is the builder saying so itself. This is the single most direct piece of evidence in the corpus and it is readable in view-source.",
    falsePositiveNote:
      "A tag is a claim about the TOOL, not about the effort. A designer can build something careful in one of these and leave the tag in. It also says nothing about who wrote the copy.",
    prevention: "If the build is yours, own the output: remove the vendor generator tag or replace it with your own build identifier.",
    detect: (a) => {
      const g = a.head.generator;
      if (!g || !AI_BUILDERS.test(g)) return [];
      return [ev("selector", 'meta[name="generator"]', g, { expected: "absent, or your own build identifier" })];
    },
    fixtures: {
      positive: (base) => ({ artifact: patch(base, { head: { generator: "Lovable" } }) }),
      mutated: (base) => ({ artifact: patch(base, { head: { generator: "Hugo 0.128.0" } }) }),
      extra: [
        {
          name: "a no-code builder that is not an AI builder does not fire",
          shouldFire: false,
          build: (base) => ({ artifact: patch(base, { head: { generator: "Webflow" } }) }),
        },
      ],
    },
  },
  {
    id: "builder.agent-artifact-reachable",
    family: "builder-fingerprint",
    title: "An agent instruction file is served from the public site",
    polarity: "signal",
    severity: "high",
    baseWeight: 1.6,
    maxHits: 3,
    requiresProbe: "well-known",
    phase: 1,
    since: "corpus-2026.09",
    explanation:
      "Files like CLAUDE.md, AGENTS.md and .cursorrules are instructions written FOR a coding agent. Reaching one over HTTP means the agent's working directory was deployed as the web root.",
    falsePositiveNote:
      "A human who uses an agent as a tool also has these files. The finding is about how the build was produced and how carelessly it was deployed, not about who designed it.",
    prevention: "Exclude agent instruction files from the deployed output, and check the deploy for anything else that was never meant to be public.",
    detect: (a) =>
      a.wellKnown
        .filter((w) => AGENT_ARTIFACTS.has(w.path) && w.status === 200 && !/text\/html/i.test(w.contentType))
        .map((w) =>
          ev("url", `${a.finalUrl.replace(/\/$/, "")}${w.path}`, `HTTP ${w.status} ${w.contentType}`, {
            expected: "404",
            ...(w.excerpt ? { excerpt: w.excerpt } : {}),
          }),
        ),
    fixtures: {
      positive: (base) => ({
        artifact: patch(base, {
          wellKnown: [
            { path: "/CLAUDE.md", status: 200, contentType: "text/markdown", excerpt: "# Project instructions" },
            { path: "/robots.txt", status: 200, contentType: "text/plain", excerpt: "Sitemap: https://example.test/sitemap.xml" },
            { path: "/sitemap.xml", status: 200, contentType: "application/xml" },
          ],
        }),
      }),
      mutated: (base) => ({
        artifact: patch(base, {
          wellKnown: [
            { path: "/CLAUDE.md", status: 404, contentType: "text/html" },
            { path: "/robots.txt", status: 200, contentType: "text/plain", excerpt: "Sitemap: https://example.test/sitemap.xml" },
            { path: "/sitemap.xml", status: 200, contentType: "application/xml" },
          ],
        }),
      }),
      extra: [
        {
          name: "a soft 404 that returns HTML at the path does not count as reachable",
          shouldFire: false,
          build: (base) => ({
            artifact: patch(base, {
              wellKnown: [
                { path: "/CLAUDE.md", status: 200, contentType: "text/html; charset=utf-8" },
                { path: "/robots.txt", status: 200, contentType: "text/plain", excerpt: "Sitemap: https://example.test/sitemap.xml" },
                { path: "/sitemap.xml", status: 200, contentType: "application/xml" },
              ],
            }),
          }),
        },
      ],
    },
  },
  {
    id: "builder.sourcemap-generator-trailer",
    family: "builder-fingerprint",
    title: "A published source map carries a generator or agent trailer",
    polarity: "signal",
    severity: "high",
    baseWeight: 1.5,
    maxHits: 2,
    requiresProbe: "assets",
    phase: 1,
    since: "corpus-2026.09",
    explanation:
      "A reachable .map file hands over original paths and comments. When those contain a generator banner or an agent commit trailer, the build's provenance is written into the shipped bundle.",
    falsePositiveNote:
      "Trailers say a tool touched the code. Plenty of professional teams commit with agent trailers on purpose and are proud of it.",
    prevention: "Stop publishing source maps to production, and strip generator banners from the build output.",
    detect: (a) =>
      a.assets.chunks
        .filter((c) => c.mapReachable && c.mapExcerpt && GENERATOR_TRAILERS.test(c.mapExcerpt))
        .map((c) =>
          ev("request", `GET ${c.url}.map`, "200, contains a generator or agent trailer", {
            excerpt: (c.mapExcerpt ?? "").slice(0, 200),
          }),
        ),
    fixtures: {
      positive: (base) => ({
        artifact: patch(base, {
          assets: {
            chunks: [
              {
                url: "/assets/app-9f2c.js",
                bytes: 180_000,
                sourceMappingURL: true,
                mapReachable: true,
                mapExcerpt: '{"sources":["src/App.tsx"],"x_comment":"Co-Authored-By: Claude <noreply@anthropic.com>"}',
              },
            ],
            totalJsBytes: 180_000,
            thirdPartyHosts: [],
          },
        }),
      }),
      mutated: (base) => ({
        artifact: patch(base, {
          assets: {
            chunks: [
              {
                url: "/assets/app-9f2c.js",
                bytes: 180_000,
                sourceMappingURL: true,
                mapReachable: true,
                mapExcerpt: '{"sources":["src/App.tsx"],"x_comment":"built by the platform team"}',
              },
            ],
            totalJsBytes: 180_000,
            thirdPartyHosts: [],
          },
        }),
      }),
    },
  },
  {
    id: "builder.bare-platform-domain",
    family: "builder-fingerprint",
    title: "The site is served from a bare hosting-platform subdomain",
    polarity: "signal",
    severity: "medium",
    baseWeight: 1,
    maxHits: 1,
    requiresProbe: "http",
    phase: 1,
    since: "corpus-2026.09",
    explanation:
      "A production site on a raw *.vercel.app / *.lovable.app / *.repl.co host has skipped the one step that costs money and takes a human decision: a domain.",
    falsePositiveNote:
      "Staging URLs, internal tools, demos and hobby projects live here legitimately, and none of that is a defect. What it is not is a shipped product.",
    prevention: "Put it on a domain you own and make the platform URL redirect or noindex.",
    detect: (a) => {
      let host: string;
      try {
        host = new URL(a.finalUrl).hostname;
      } catch {
        return [];
      }
      if (!BARE_PLATFORM_HOSTS.test(host)) return [];
      return [ev("url", a.finalUrl, host, { expected: "a domain the operator owns" })];
    },
    fixtures: {
      positive: (base) => ({ artifact: patch(base, { finalUrl: "https://my-cool-app-9f2c.vercel.app/" }) }),
      mutated: (base) => ({ artifact: patch(base, { finalUrl: "https://myapp.com/" }) }),
    },
  },
  {
    id: "builder.vendor-asset-host",
    family: "builder-fingerprint",
    title: "Assets are loaded from an AI builder's CDN",
    polarity: "signal",
    severity: "medium",
    baseWeight: 0.9,
    maxHits: 2,
    requiresProbe: "assets",
    phase: 1,
    since: "corpus-2026.09",
    explanation:
      "Even when the generator tag is gone, generated builds keep pulling images and runtime chunks from the builder's own CDN. The request log outlives the meta tag.",
    falsePositiveNote:
      "A single asset from a builder CDN can be a leftover from an early prototype on a page that has since been rewritten by hand.",
    prevention: "Self-host your assets. A build that still calls home to the tool that made it is not really yours.",
    detect: (a) =>
      a.assets.thirdPartyHosts
        .filter((h) => VENDOR_ASSET_HOSTS.test(h))
        .map((h) => ev("request", `third-party host ${h}`, h, { expected: "first-party or a neutral CDN" })),
    fixtures: {
      positive: (base) => ({
        artifact: patch(base, {
          assets: { chunks: base.assets.chunks, totalJsBytes: base.assets.totalJsBytes, thirdPartyHosts: ["cdn.lovable.dev"] },
        }),
      }),
      mutated: (base) => ({
        artifact: patch(base, {
          assets: { chunks: base.assets.chunks, totalJsBytes: base.assets.totalJsBytes, thirdPartyHosts: ["fonts.example.com"] },
        }),
      }),
    },
  },
];

/**
 * The fixes.
 *
 * One `ui_change` and four refusals, and the refusals are the interesting part. Three of
 * these findings are about a DEPLOYMENT rather than a document: a file served from the web
 * root, a map published to production, a hostname. None of those is a property of anything
 * this detector rendered, so none of them gets a patch from a detector that only rendered a
 * page. Saying which build setting to look at is the honest limit of what a page read knows.
 */
export const BUILDER_RULES: readonly WebRule[] = attachRemedies(RAW_BUILDER_RULES, {
  "builder.ai-generator-meta": (evidence) =>
    evidence.map((e) =>
      uiChange({
        selector: 'meta[name="generator"]',
        property: "content",
        before: e.observed,
        after: "",
        summary: "Remove the vendor generator meta tag, or replace it with the build identifier for this project.",
        doNotApplyIf: "the tag is wanted for tooling that reads it, in which case set it to something that names this build rather than the vendor.",
        sourceHint: "the head of the root layout or the template that renders <head>",
        addresses: [e.locator],
        blastRadius: "line",
      }),
    ),
  "builder.agent-artifact-reachable": (evidence) =>
    manualEach(evidence, (e) => ({
      summary: `Stop serving ${e.locator} from the deployed output.`,
      guidance:
        "Exclude agent instruction files from the deploy, then check what else went out with them. No patch is proposed because this file is part of a deployment, not part of the document that was rendered, and this detector never saw the repository it came from.",
      doNotApplyIf: "the file is published on purpose, which some projects do so that agents reading the site can find it.",
      blastRadius: "project",
    })),
  "builder.sourcemap-generator-trailer": (evidence) =>
    manualEach(evidence, (e) => ({
      summary: `Stop publishing the source map at ${e.locator}, and strip generator banners from the build output.`,
      guidance:
        "Turn off source map emission for production, or upload the maps to the error reporter instead of the web root. This is a build setting, so it is named rather than patched.",
      doNotApplyIf: "the maps are published deliberately so that production errors stay legible, which is a real choice.",
      blastRadius: "project",
    })),
  "builder.bare-platform-domain": (evidence) =>
    manualOnce(evidence, {
      locator: evidence[0]?.locator ?? "the final URL",
      summary: "Serve this from a domain the operator owns, and let the platform URL redirect to it.",
      guidance:
        "A domain is a purchase and a DNS change, not an edit, so nothing is proposed here. If the platform URL has to stay reachable, redirect it or mark it noindex so it is not the canonical version.",
      doNotApplyIf: "this is a staging URL, an internal tool, a demo or a hobby project, none of which needs a domain.",
      blastRadius: "project",
    }),
  "builder.vendor-asset-host": (evidence) =>
    manualEach(evidence, (e) => ({
      summary: `Self-host the assets currently loaded from ${e.observed}.`,
      guidance:
        "Copy the assets into the project and update the references. The host is visible in the request log but the reference lives in source this detector never read, so the change is described rather than written.",
      doNotApplyIf: "the asset is a leftover from a prototype on a page that has since been rewritten, in which case delete the reference rather than rehosting it.",
      blastRadius: "multi-file",
    })),
});
