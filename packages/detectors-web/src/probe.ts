/**
 * The probe layer: turn a URL into a `WebArtifact`.
 *
 * ONE METHODOLOGICAL RULE GOVERNS THIS FILE. Everything visual is measured from the RENDERED
 * page in a real browser, never from the server HTML. That is not a preference, it is the
 * lesson the source corpus paid for twice:
 *
 *   - a heading check read the raw response and reported "this route has 0 H1s" for a route
 *     whose heading does not exist until hydration. Confident finding, wrong document.
 *   - a chunk pattern matched `/_next/static/chunks/` while the app served
 *     `/_next/static/immutable/chunks/`. It sampled ZERO chunks, three checks downstream
 *     passed having examined nothing, and the suite printed PASS for months.
 *
 * The second one is why every collection built here reports a DENOMINATOR into
 * `ProbeStatus`. A probe that ran and collected nothing is a failure, not a pass, and the
 * core validator throws on it. A stale selector in this file cannot quietly lower somebody's
 * score; it stops the run.
 *
 * A static (fetch-only) read is offered as a fast path and is deliberately crippled: it sets
 * `tier: "static"`, cannot fill the render-dependent probes, and therefore lands under the
 * engine's coverage floor, so it can only ever produce an `inconclusive`. There is no
 * configuration that lets a fetch-only read print a score.
 *
 * playwright is an OPTIONAL peer dependency, imported dynamically. `npm test` never launches
 * a browser: the tests run against stored artifacts, which is also what makes the calibration
 * corpus reproducible.
 */

import type { ProbeStatus } from "@slop/core";
import { recoverText } from "@slop/ocr-text";
import { ARTIFACT_SCHEMA_VERSION, PROBE_WEIGHTS } from "./artifact.js";
import type {
  ChunkRecord,
  ImageTextRecord,
  KeyframeRecord,
  MotionLibraryMarker,
  MotionRecord,
  ProbeId,
  WebArtifact,
  WellKnownRecord,
} from "./artifact.js";

/** Paths that answer "was an agent's working file shipped to production?". */
export const WELL_KNOWN_PATHS: readonly string[] = [
  "/robots.txt",
  "/sitemap.xml",
  "/llms.txt",
  "/CLAUDE.md",
  "/AGENTS.md",
  "/.cursorrules",
  "/.env",
  "/README.md",
];

export interface ProbeOptions {
  readonly viewport?: { readonly width: number; readonly height: number };
  readonly timeoutMs?: number;
  readonly userAgent?: string;
  /** Skip the browser entirely. Guarantees an inconclusive result; used for smoke tests. */
  readonly staticOnly?: boolean;
  readonly signal?: AbortSignal;
}

export class PlaywrightUnavailableError extends Error {
  constructor(cause: unknown) {
    super(
      "playwright is not installed, so the page could not be rendered. This detector refuses to " +
        "substitute a server-HTML read for a rendered one: a fetch-only read produces confident " +
        "findings about a document the user never sees. Install it with `npx playwright install chromium`.",
    );
    this.name = "PlaywrightUnavailableError";
    this.cause = cause;
  }
}

/** What the in-page script hands back. Mirrors the visual half of `WebArtifact`. */
interface PageReadout {
  readonly head: WebArtifact["head"];
  readonly type: WebArtifact["type"];
  readonly color: WebArtifact["color"];
  readonly dom: WebArtifact["dom"];
  readonly text: WebArtifact["text"];
  readonly provenance: WebArtifact["provenance"];
  readonly routes: readonly string[];
  /** Element counts, so a stale selector shows up as a zero denominator. */
  readonly counts: { readonly styled: number; readonly nodes: number; readonly faces: number };
}

/**
 * Runs INSIDE the page. Stringified by playwright, so it may not close over anything.
 *
 * Kept as one function on purpose: every selector in the corpus is measured in one pass over
 * one committed layout, so two rules can never disagree about what the page looked like.
 */
/* c8 ignore start -- executed in the browser, covered by the stored artifacts instead */
function readPage(): PageReadout {
  const q = <T extends Element>(sel: string): T[] => Array.from(document.querySelectorAll<T>(sel));
  const meta = (name: string): string | null =>
    document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`)?.content?.trim() || null;
  const prop = (p: string): string | null =>
    document.querySelector<HTMLMetaElement>(`meta[property="${p}"]`)?.content?.trim() || null;
  const selectorOf = (el: Element): string => {
    const id = el.id ? `#${el.id}` : "";
    const cls = typeof el.className === "string" && el.className.trim()
      ? `.${el.className.trim().split(/\s+/).slice(0, 3).join(".")}`
      : "";
    return `${el.tagName.toLowerCase()}${id}${cls}`;
  };
  const em = (value: string, fontSizePx: number): number => {
    if (!value || value === "normal") return 0;
    const px = parseFloat(value);
    return Number.isFinite(px) && fontSizePx > 0 ? px / fontSizePx : 0;
  };
  const sample = (sel: string) => {
    const el = document.querySelector<HTMLElement>(sel);
    if (!el) return null;
    const cs = getComputedStyle(el);
    const sizePx = parseFloat(cs.fontSize) || 16;
    return {
      selector: sel,
      family: (cs.fontFamily.split(",")[0] ?? "").replace(/["']/g, "").trim(),
      weightNum: Number(cs.fontWeight) || 400,
      sizePx,
      letterSpacingEm: em(cs.letterSpacing, sizePx),
    };
  };

  // Font faces, from the loaded stylesheets. Cross-origin sheets throw on .cssRules; a
  // caught sheet is skipped rather than silently counted, and `faces` carries the count.
  const faces: { family: string; src: string; weight?: string }[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList | null = null;
    try {
      rules = sheet.cssRules;
    } catch {
      continue;
    }
    for (const rule of Array.from(rules ?? [])) {
      if (rule.constructor.name !== "CSSFontFaceRule" && !/^@font-face/.test(rule.cssText)) continue;
      const css = rule.cssText;
      const family = /font-family:\s*(["']?)([^;"']+)\1/.exec(css)?.[2]?.trim();
      const src = /url\((["']?)([^)"']+)\1\)/.exec(css)?.[2]?.trim();
      const weight = /font-weight:\s*([^;]+)/.exec(css)?.[1]?.trim();
      if (family && src) faces.push({ family, src, ...(weight ? { weight } : {}) });
    }
  }

  const styledEls = q<HTMLElement>("body *").slice(0, 4000);
  const familiesInUse = Array.from(
    new Set(
      styledEls
        .slice(0, 600)
        .map((el) => (getComputedStyle(el).fontFamily.split(",")[0] ?? "").replace(/["']/g, "").trim())
        .filter(Boolean),
    ),
  );

  const eyebrows: { selector: string; text: string }[] = [];
  const pingDots: { selector: string; animation: string }[] = [];
  const numberedLabels: { selector: string; text: string }[] = [];
  const cards: { selector: string; radius: string; border: string; shadow: string }[] = [];
  const iconTiles: { selector: string }[] = [];
  const customArtifacts: { selector: string; kind: string; detail: string }[] = [];

  for (const el of styledEls) {
    const cs = getComputedStyle(el);
    const text = (el.textContent ?? "").trim();
    const sizePx = parseFloat(cs.fontSize) || 16;
    const own = Array.from(el.childNodes).some((n) => n.nodeType === 3 && (n.textContent ?? "").trim());

    if (own && text.length >= 2 && text.length <= 30 && sizePx <= 15) {
      const tracked = em(cs.letterSpacing, sizePx) >= 0.05;
      if (cs.textTransform === "uppercase" && tracked) eyebrows.push({ selector: selectorOf(el), text });
      if (/^0\d$|^\d{2}$/.test(text) && text.length === 2) numberedLabels.push({ selector: selectorOf(el), text });
    }
    if (/\b(ping|pulse|blink)\b/i.test(cs.animationName) && el.clientWidth <= 16 && el.clientHeight <= 16) {
      pingDots.push({ selector: selectorOf(el), animation: cs.animationName });
    }
    const radius = parseFloat(cs.borderTopLeftRadius) || 0;
    if (radius >= 8 && cs.boxShadow !== "none" && el.clientHeight >= 80 && el.clientWidth >= 120) {
      cards.push({
        selector: selectorOf(el),
        radius: cs.borderTopLeftRadius,
        border: cs.borderTopWidth === "0px" ? "none" : `${cs.borderTopWidth} ${cs.borderTopColor}`,
        shadow: cs.boxShadow,
      });
    }
    if (
      el.clientWidth >= 32 &&
      el.clientWidth <= 72 &&
      Math.abs(el.clientWidth - el.clientHeight) <= 4 &&
      radius >= 6 &&
      el.querySelector("svg")
    ) {
      iconTiles.push({ selector: selectorOf(el) });
    }
    // Hand-made assets. A generator does not ship a fractal-noise grain plate or a
    // photograph of somebody's handwriting: both are decisions with a cost attached.
    const bg = cs.backgroundImage;
    if (/feTurbulence|fractalNoise|grain|noise/i.test(bg + " " + el.className)) {
      customArtifacts.push({ selector: selectorOf(el), kind: "grain-overlay", detail: bg.slice(0, 120) });
    }
    if (cs.mixBlendMode !== "normal" && cs.mixBlendMode !== "") {
      customArtifacts.push({ selector: selectorOf(el), kind: "blend-mode", detail: cs.mixBlendMode });
    }
  }

  const hiddenInputs: { name: string; reason: string }[] = [];
  for (const input of q<HTMLInputElement>("form input, form textarea")) {
    const cs = getComputedStyle(input);
    const hidden =
      input.type === "hidden" ||
      cs.display === "none" ||
      cs.visibility === "hidden" ||
      cs.opacity === "0" ||
      input.getAttribute("aria-hidden") === "true" ||
      input.tabIndex === -1;
    if (!hidden) continue;
    const name = input.name || input.id || "(unnamed)";
    const reason = /utm|referr|source|campaign/i.test(name) ? "attribution field" : "honeypot";
    hiddenInputs.push({ name, reason });
  }

  const images = q<HTMLImageElement>("img").map((img) => ({
    src: img.currentSrc || img.src,
    alt: img.hasAttribute("alt") ? img.alt : null,
    photographic:
      /\.(jpe?g|webp|avif)(\?|$)/i.test(img.currentSrc || img.src) &&
      Math.min(img.naturalWidth, img.naturalHeight) >= 320,
  }));

  const sections = q<HTMLElement>("body > * > section, body > section, main > section, main > div").map((el) => ({
    selector: selectorOf(el),
    heightPx: Math.round(el.getBoundingClientRect().height),
  }));

  const innerText = (document.body.innerText ?? "").replace(/\s+/g, " ").trim();
  const disclosure = /\b(made|generated|created|written|built)\s+with\s+(the\s+help\s+of\s+)?ai\b|\bai[- ]generated\b|\bai[- ]assisted\b/i.exec(
    innerText,
  );

  return {
    head: {
      title: document.title?.trim() || null,
      generator: meta("generator"),
      description: meta("description"),
      ogImage: prop("og:image"),
      canonical: document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href || null,
      htmlLang: document.documentElement.getAttribute("lang"),
      favicon: !!document.querySelector('link[rel~="icon"]'),
      jsonLd: !!document.querySelector('script[type="application/ld+json"]'),
    },
    type: { faces, familiesInUse, hero: sample("h1"), body: sample("p") },
    color: {
      bodyBackground: getComputedStyle(document.body).backgroundColor || null,
      heroGradient: (() => {
        const hero = document.querySelector<HTMLElement>("h1")?.closest("section, header, div") ?? null;
        const bg = hero ? getComputedStyle(hero).backgroundImage : "none";
        return bg && bg !== "none" && /gradient/i.test(bg) ? bg : null;
      })(),
    },
    dom: {
      nodeCount: document.querySelectorAll("*").length,
      h1Count: q("h1").length,
      images,
      eyebrows,
      pingDots,
      numberedLabels,
      cards,
      iconTiles,
      sections,
      hiddenInputs,
      customArtifacts,
    },
    text: { innerText: innerText.slice(0, 20_000), wordCount: innerText ? innerText.split(/\s+/).length : 0 },
    provenance: {
      c2pa: !!document.querySelector('meta[name="c2pa"], link[rel="c2pa-manifest"]'),
      aiDisclosure: disclosure ? disclosure[0] : null,
    },
    routes: Array.from(
      new Set(
        q<HTMLAnchorElement>("a[href]")
          .map((a) => {
            try {
              const u = new URL(a.href, location.href);
              return u.origin === location.origin ? u.pathname : null;
            } catch {
              return null;
            }
          })
          .filter((p): p is string => !!p),
      ),
    ).slice(0, 50),
    counts: { styled: styledEls.length, nodes: document.querySelectorAll("*").length, faces: faces.length },
  };
}
/* c8 ignore stop */

/** What the motion pass hands back. Run twice: once normally, once under reduced motion. */
interface MotionReadout {
  readonly records: MotionRecord[];
  readonly keyframes: KeyframeRecord[];
  readonly libraryMarkers: MotionLibraryMarker[];
  readonly queryDeclared: boolean;
  readonly sectionsWithReveal: number;
  readonly sectionsTotal: number;
  readonly sampled: number;
}

/**
 * Runs INSIDE the page. The motion pass.
 *
 * Separate from `readPage` for one reason that is not tidiness: it is evaluated TWICE, the
 * second time with `prefers-reduced-motion: reduce` emulated, and the difference between the
 * two readings is the only honest way to know whether the preference is honoured. A page can
 * ship the media query and honour none of it. Counting `@media` blocks would score the
 * intention; asking the browser for the reduced document scores the behaviour.
 *
 * Every value here is a `getComputedStyle` read on a real selector, so every citation this
 * produces can be re-read in DevTools. Nothing is inferred and nothing is averaged.
 */
/* c8 ignore start -- executed in the browser, covered by the stored artifacts instead */
function readMotion(): MotionReadout {
  const selectorOf = (el: Element): string => {
    const id = el.id ? `#${el.id}` : "";
    const cls = typeof el.className === "string" && el.className.trim()
      ? `.${el.className.trim().split(/\s+/).slice(0, 3).join(".")}`
      : "";
    return `${el.tagName.toLowerCase()}${id}${cls}`;
  };
  /**
   * Split a CSS list on its TOP-LEVEL commas.
   *
   * `cubic-bezier(0.25, 0.1, 0.25, 1)` contains three commas that are not list separators. The
   * first version of this file split on `,` and stored the easing as `cubic-bezier(0.25`, which
   * did not look broken in a report and was quietly catastrophic: every cubic-bezier starting
   * with the same first number collapsed into ONE bucket, so the uniformity rule counted 478
   * unrelated easings as identical and read stripe.com as a page with one timing function.
   * A truncated value is worse than a missing one, because a missing one fails a denominator.
   */
  const listSplit = (value: string): string[] => {
    const out: string[] = [];
    let depth = 0;
    let current = "";
    for (const ch of value || "") {
      if (ch === "(") depth += 1;
      if (ch === ")") depth -= 1;
      if (ch === "," && depth === 0) {
        out.push(current.trim());
        current = "";
        continue;
      }
      current += ch;
    }
    if (current.trim()) out.push(current.trim());
    return out.filter(Boolean);
  };
  /** "0.35s" / "350ms" -> 350. A list ("0.2s, 0.4s") takes its longest member. */
  const ms = (value: string): number => {
    let max = 0;
    for (const part of listSplit(value)) {
      const n = parseFloat(part);
      if (!Number.isFinite(n)) continue;
      const scaled = /ms$/.test(part) ? n : n * 1000;
      if (Math.abs(scaled) > Math.abs(max)) max = scaled;
    }
    return Math.round(max);
  };
  const first = (value: string): string => listSplit(value)[0] ?? "";

  const records: MotionRecord[] = [];
  const elements = Array.from(document.querySelectorAll<HTMLElement>("body *")).slice(0, 4000);
  for (const el of elements) {
    const cs = getComputedStyle(el);
    const ownText = Array.from(el.childNodes).some((n) => n.nodeType === 3 && (n.textContent ?? "").trim());
    const decorative = !ownText;

    const animName = cs.animationName;
    if (animName && animName !== "none") {
      const duration = ms(cs.animationDuration);
      records.push({
        selector: selectorOf(el),
        source: "animation",
        name: first(animName),
        properties: first(animName),
        durationMs: duration,
        delayMs: ms(cs.animationDelay),
        easing: first(cs.animationTimingFunction),
        iterations: first(cs.animationIterationCount),
        decorative,
      });
    }

    const transitionProperty = cs.transitionProperty;
    const transitionDuration = ms(cs.transitionDuration);
    // `transition-property` defaults to "all" with a zero duration on every element in the
    // document. A zero-duration transition is not motion, and counting it would hand every
    // page in existence a few thousand records and make every distribution below meaningless.
    if (transitionDuration > 0 && transitionProperty && transitionProperty !== "none") {
      records.push({
        selector: selectorOf(el),
        source: "transition",
        name: first(transitionProperty),
        properties: transitionProperty,
        durationMs: transitionDuration,
        delayMs: ms(cs.transitionDelay),
        easing: first(cs.transitionTimingFunction),
        iterations: "1",
        decorative,
      });
    }
  }

  // Keyframes and the reduced-motion query, from the loaded stylesheets. A cross-origin sheet
  // throws on .cssRules and is skipped rather than counted.
  const keyframes: KeyframeRecord[] = [];
  const libraryMarkers: MotionLibraryMarker[] = [];
  let queryDeclared = false;
  const KEYFRAME_RULE = 7;
  const MEDIA_RULE = 4;

  const walk = (rules: CSSRuleList): void => {
    for (const rule of Array.from(rules)) {
      if (rule.type === MEDIA_RULE) {
        const media = (rule as CSSMediaRule).conditionText ?? "";
        if (/prefers-reduced-motion/i.test(media)) queryDeclared = true;
        try {
          walk((rule as CSSMediaRule).cssRules);
        } catch {
          /* nested import, unreadable */
        }
        continue;
      }
      if (rule.type !== KEYFRAME_RULE && rule.constructor.name !== "CSSKeyframesRule") continue;
      const kf = rule as CSSKeyframesRule;
      const stops = kf.cssRules ? kf.cssRules.length : 0;
      const props = new Set<string>();
      for (const stop of Array.from(kf.cssRules ?? [])) {
        const style = (stop as CSSKeyframeRule).style;
        for (let i = 0; i < style.length; i += 1) {
          const prop = style.item(i);
          if (prop) props.add(prop);
        }
      }
      keyframes.push({ name: kf.name, stops, properties: [...props].join(", ") });
      if (/^(?:animate__|aos-|wow|fade(?:In|Out)(?:Up|Down|Left|Right)?$)/i.test(kf.name)) {
        libraryMarkers.push({
          library: /^animate__/i.test(kf.name) ? "animate.css" : "a named library keyframe",
          kind: "keyframe",
          locator: `@keyframes ${kf.name}`,
          observed: `${stops} stop(s): ${[...props].join(", ")}`,
        });
      }
    }
  };

  for (const sheet of Array.from(document.styleSheets)) {
    const href = sheet.href ?? "";
    const named = /animate\.css|animate\.min\.css|\baos\b|gsap|scrollreveal|locomotive/i.exec(href);
    if (named) {
      libraryMarkers.push({
        library: named[0],
        kind: "stylesheet",
        locator: `link[rel=stylesheet][href*="${named[0]}"]`,
        observed: href.slice(0, 160),
      });
    }
    let rules: CSSRuleList | null = null;
    try {
      rules = sheet.cssRules;
    } catch {
      continue;
    }
    if (rules) walk(rules);
  }

  // Library markers in the markup. Class names and data attributes, both strippable, which is
  // exactly what the rule that reads them has to say about itself.
  const CLASS_MARKERS: readonly { readonly library: string; readonly test: RegExp }[] = [
    { library: "animate.css", test: /\banimate__animated\b|\banimate__[a-z]/i },
    { library: "AOS", test: /\baos-init\b|\baos-animate\b/i },
    { library: "framer-motion", test: /\bframer-[0-9a-z]{4,}\b/i },
    { library: "GSAP", test: /\bgsap-marker|\bgs_reveal\b/i },
    { library: "WOW.js", test: /\bwow\b(?=\s|$)/i },
  ];
  const ATTR_MARKERS: readonly { readonly library: string; readonly attr: string }[] = [
    { library: "AOS", attr: "data-aos" },
    { library: "framer-motion", attr: "data-framer-appear-id" },
    { library: "framer (published site)", attr: "data-framer-name" },
    { library: "GSAP ScrollTrigger", attr: "data-gsap" },
    { library: "Locomotive Scroll", attr: "data-scroll" },
    { library: "ScrollReveal", attr: "data-sr-id" },
  ];
  for (const el of elements.slice(0, 1500)) {
    const cls = typeof el.className === "string" ? el.className : "";
    for (const marker of CLASS_MARKERS) {
      if (cls && marker.test.test(cls)) {
        libraryMarkers.push({
          library: marker.library,
          kind: "class",
          locator: selectorOf(el),
          observed: `class="${cls.slice(0, 120)}"`,
        });
      }
    }
    for (const marker of ATTR_MARKERS) {
      const value = el.getAttribute(marker.attr);
      if (value !== null) {
        libraryMarkers.push({
          library: marker.library,
          kind: "attribute",
          locator: `${selectorOf(el)}[${marker.attr}]`,
          observed: `${marker.attr}="${value.slice(0, 60)}"`,
        });
      }
    }
  }

  // Section reveals. "Every section fades in" is a distribution, so it needs both numbers.
  const sections = Array.from(
    document.querySelectorAll<HTMLElement>("body > * > section, body > section, main > section, main > div"),
  );
  let sectionsWithReveal = 0;
  for (const section of sections) {
    const candidates = [section, ...Array.from(section.children).slice(0, 6)] as HTMLElement[];
    const reveals = candidates.some((el) => {
      const cs = getComputedStyle(el);
      const animated = cs.animationName && cs.animationName !== "none" && /opacity|transform|translate|fade/i.test(
        `${cs.animationName} ${cs.willChange}`,
      );
      const transitioned = /opacity|transform/i.test(cs.transitionProperty) && parseFloat(cs.transitionDuration) > 0;
      const held = cs.opacity !== "" && parseFloat(cs.opacity) < 1;
      return !!(animated || transitioned || held);
    });
    if (reveals) sectionsWithReveal += 1;
  }

  return {
    records,
    keyframes,
    libraryMarkers,
    queryDeclared,
    sectionsWithReveal,
    sectionsTotal: sections.length,
    sampled: elements.length,
  };
}
/* c8 ignore stop */

const probe = (id: ProbeId, ran: boolean, denominator: number, opts: Partial<ProbeStatus> = {}): ProbeStatus => ({
  id,
  ran,
  denominator,
  weight: PROBE_WEIGHTS[id],
  ...opts,
});

/** Render a URL and collect everything the corpus reads. Requires playwright. */
export async function probeUrl(url: string, options: ProbeOptions = {}): Promise<WebArtifact> {
  const viewport = options.viewport ?? { width: 390, height: 844 };
  const timeout = options.timeoutMs ?? 30_000;

  type PlaywrightModule = typeof import("playwright");
  let chromium: PlaywrightModule["chromium"];
  try {
    ({ chromium } = (await import("playwright")) as PlaywrightModule);
  } catch (cause) {
    throw new PlaywrightUnavailableError(cause);
  }

  const browser = await chromium.launch({ headless: true });
  const chunks: ChunkRecord[] = [];
  const thirdPartyHosts = new Set<string>();
  let status = 0;
  let headers: Record<string, string> = {};
  let finalUrl = url;

  try {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      ...(options.userAgent ? { userAgent: options.userAgent } : {}),
    });
    const page = await context.newPage();
    const origin = new URL(url).origin;

    const pending: Promise<void>[] = [];
    page.on("response", (response) => {
      const rUrl = response.url();
      try {
        const host = new URL(rUrl).host;
        if (new URL(rUrl).origin !== origin) thirdPartyHosts.add(host);
      } catch {
        /* data: and blob: URLs have no host. Not evidence of anything. */
      }
      if (!/\.m?js(\?|$)/i.test(rUrl)) return;
      pending.push(
        (async () => {
          const body = await response.text().catch(() => "");
          if (!body) return;
          const mapRef = /[#@]\s*sourceMappingURL=(\S+)/.exec(body);
          let mapReachable = false;
          let mapExcerpt: string | undefined;
          if (mapRef?.[1] && !mapRef[1].startsWith("data:")) {
            const mapUrl = new URL(mapRef[1], rUrl).href;
            const map = await page.request.get(mapUrl, { timeout: 5000 }).catch(() => null);
            if (map?.ok()) {
              mapReachable = true;
              mapExcerpt = (await map.text().catch(() => "")).slice(0, 4000);
            }
          }
          chunks.push({
            url: rUrl,
            bytes: Buffer.byteLength(body),
            sourceMappingURL: !!mapRef,
            mapReachable,
            ...(mapExcerpt ? { mapExcerpt } : {}),
          });
        })(),
      );
    });

    const main = await page.goto(url, { waitUntil: "networkidle", timeout }).catch(() => null);
    if (main) {
      status = main.status();
      headers = main.headers();
      finalUrl = page.url();
    }
    // Lazy sections and intersection-observer reveals are part of the rendered page. A read
    // that stops at the fold measures a document the visitor does not have.
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)).catch(() => undefined);
    await page.waitForTimeout(600);
    await page.evaluate(() => window.scrollTo(0, 0)).catch(() => undefined);

    const readout = await page.evaluate(readPage);

    // ---- motion, read twice -------------------------------------------------------------
    // The second read is the point. `prefers-reduced-motion` is the one craft signal in this
    // family that cannot be faked by configuration, and the only way to observe it is to ask
    // the browser for the reduced document and count what stopped. A page that ships the media
    // query and honours none of it reads identically to a page with no query at all, which is
    // the correct answer for both.
    const motionFull = await page.evaluate(readMotion);
    let reducedMeasured = false;
    let motionReduced: typeof motionFull | null = null;
    try {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.waitForTimeout(150);
      motionReduced = await page.evaluate(readMotion);
      reducedMeasured = true;
    } catch {
      /* An older browser build may not support the emulation. Reported as unmeasured. */
    } finally {
      await page.emulateMedia({ reducedMotion: "no-preference" }).catch(() => undefined);
    }

    // Both sides are COUNTS OF RECORDS over the same walk, not sizes of key sets.
    //
    // The first version compared `records.length` before against the size of a Set of
    // `selector|source|name` keys after, and the selectors a probe can synthesise are not
    // unique: eight cards produce eight identical `div.card` keys. So a page where nothing
    // stopped read as "15 before, 5 after" and would have been handed counter-evidence for
    // accessibility work it had not done. Keys are still used to name WHICH elements stopped,
    // by comparing multiplicities, but the numbers the rule reads are element counts.
    const movingKey = (r: MotionRecord): string => `${r.selector}|${r.source}|${r.name}`;
    const tally = (records: readonly MotionRecord[]): Map<string, number> => {
      const counts = new Map<string, number>();
      for (const r of records) {
        if (r.durationMs <= 0) continue;
        counts.set(movingKey(r), (counts.get(movingKey(r)) ?? 0) + 1);
      }
      return counts;
    };
    const before = tally(motionFull.records);
    const after = tally(motionReduced?.records ?? []);
    const movingBefore = [...before.values()].reduce((a, b) => a + b, 0);
    const movingAfter = [...after.values()].reduce((a, b) => a + b, 0);
    const stopped = [...before.entries()]
      .filter(([key, count]) => (after.get(key) ?? 0) < count)
      .map(([key]) => key.split("|")[0] ?? key);

    // Library markers from the REQUEST side too: a bundled framer-motion or GSAP leaves no
    // class name behind, but the chunk that carries it still has a name.
    const scriptMarkers: MotionLibraryMarker[] = [];
    const SCRIPT_MARKERS: readonly { readonly library: string; readonly test: RegExp }[] = [
      { library: "framer-motion", test: /framer-motion|framer_motion/i },
      { library: "GSAP", test: /\bgsap\b|ScrollTrigger/i },
      { library: "AOS", test: /\baos\b(?:\.js|\.min|@)/i },
      { library: "animate.css", test: /animate\.(?:min\.)?css/i },
      { library: "lenis / smooth scroll", test: /\blenis\b|locomotive-scroll/i },
    ];
    for (const chunk of chunks) {
      for (const marker of SCRIPT_MARKERS) {
        if (marker.test.test(chunk.url)) {
          scriptMarkers.push({
            library: marker.library,
            kind: "script",
            locator: `GET ${chunk.url}`,
            observed: `${marker.library} in a loaded script URL (${chunk.bytes} bytes)`,
          });
        }
      }
    }

    const motion: NonNullable<WebArtifact["motion"]> = {
      records: motionFull.records,
      keyframes: motionFull.keyframes as KeyframeRecord[],
      libraryMarkers: [...motionFull.libraryMarkers, ...scriptMarkers],
      reducedMotion: {
        measured: reducedMeasured,
        animatedBefore: movingBefore,
        animatedAfter: reducedMeasured ? movingAfter : movingBefore,
        stopped: [...new Set(stopped)].slice(0, 5),
        queryDeclared: motionFull.queryDeclared,
      },
      sectionsWithReveal: motionFull.sectionsWithReveal,
      sectionsTotal: motionFull.sectionsTotal,
      sampled: motionFull.sampled,
    };

    // ---- text inside the images ---------------------------------------------------------
    const imageTextRecords: ImageTextRecord[] = [];
    for (const image of readout.dom.images.slice(0, 8)) {
      if (!image.src || image.src.startsWith("data:")) continue;
      const response = await page.request.get(new URL(image.src, finalUrl).href, { timeout: 8000 }).catch(() => null);
      if (!response || !response.ok()) {
        imageTextRecords.push({
          src: image.src,
          method: "raster-ocr",
          text: "",
          confidence: 0,
          abstained: `the image could not be fetched for reading (${response ? response.status() : "no response"}), so its pixels were never examined`,
        });
        continue;
      }
      const body = await response.body().catch(() => null);
      if (!body) continue;
      const recovered = recoverText({
        src: image.src,
        contentType: response.headers()["content-type"] ?? "",
        bytes: new Uint8Array(body),
      });
      imageTextRecords.push(recovered as ImageTextRecord);
    }

    await Promise.allSettled(pending);

    const wellKnown: WellKnownRecord[] = [];
    for (const path of WELL_KNOWN_PATHS) {
      const res = await page.request.get(new URL(path, origin).href, { timeout: 8000 }).catch(() => null);
      if (!res) continue;
      const body = res.ok() ? (await res.text().catch(() => "")).slice(0, 400) : "";
      wellKnown.push({
        path,
        status: res.status(),
        contentType: res.headers()["content-type"] ?? "",
        ...(body ? { excerpt: body } : {}),
      });
    }

    const missing = await page.request
      .get(new URL(`/slop-scorer-probe-${Date.now()}`, origin).href, { timeout: 8000, maxRedirects: 0 })
      .catch(() => null);
    const notFound = missing
      ? { status: missing.status(), bodyBytes: Buffer.byteLength(await missing.text().catch(() => "")) }
      : null;

    const totalJsBytes = chunks.reduce((a, c) => a + c.bytes, 0);
    const probes: ProbeStatus[] = [
      probe("http", status > 0, status > 0 ? 1 : 0),
      probe("render", true, 1),
      probe("computed-style", true, readout.counts.styled, {
        expectsNonEmpty: true,
        note: "elements sampled for computed styles. Zero means the `body *` walk returned nothing and every CSS rule below it passed having measured nothing.",
      }),
      probe("font-faces", true, readout.counts.faces, {
        note: "@font-face rules enumerated from same-origin stylesheets. Zero is legitimate (a system-font page), so this probe does not demand a non-empty result.",
      }),
      probe("dom-survey", true, readout.counts.nodes, {
        expectsNonEmpty: true,
        note: "DOM nodes walked",
      }),
      probe("assets", chunks.length > 0, chunks.length, {
        expectsNonEmpty: true,
        note: "script responses captured. Zero means the response filter went stale and the source-map, bundle-weight and vendor-host rules all passed having scanned nothing. This is the exact bug the source corpus shipped for months.",
      }),
      probe("well-known", wellKnown.length > 0, wellKnown.length, {
        expectsNonEmpty: true,
        note: "well-known paths probed",
      }),
      probe("not-found", !!notFound, notFound ? 1 : 0),
      probe("text", true, readout.text.wordCount, {
        expectsNonEmpty: true,
        note: "words of rendered innerText. Zero means the page rendered nothing readable.",
      }),
      probe("motion", true, motion.sampled, {
        expectsNonEmpty: true,
        note:
          "elements whose computed animation and transition values were read, then re-read under an emulated prefers-reduced-motion. Zero means the motion walk went stale and every uniformity rule below it passed having measured nothing.",
      }),
      probe("image-text", true, imageTextRecords.length, {
        note:
          "images text recovery was ATTEMPTED on. This counts attempts, not successes: an image nothing could be read from is stored with the reason, because an unread image is not an image with no words in it. Zero is legitimate here, and only here, because a page can honestly have no images.",
      }),
      probe("provenance", true, 1),
    ];

    return {
      schemaVersion: ARTIFACT_SCHEMA_VERSION,
      url,
      finalUrl,
      fetchedAt: new Date().toISOString(),
      tier: "rendered",
      viewport,
      http: { status, headers },
      head: readout.head,
      type: readout.type,
      color: readout.color,
      dom: readout.dom,
      assets: { chunks, totalJsBytes, thirdPartyHosts: [...thirdPartyHosts] },
      wellKnown,
      routes: readout.routes,
      notFound,
      text: readout.text,
      motion,
      imageText: { records: imageTextRecords, attempted: imageTextRecords.length },
      provenance: readout.provenance,
      probes,
    };
  } finally {
    await browser.close().catch(() => undefined);
  }
}
