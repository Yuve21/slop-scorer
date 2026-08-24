import { ev, patch } from "../rule.js";
import type { WebRule } from "../rule.js";

/**
 * Family: structural-uniformity. Capped at 10%.
 *
 * Template-grade repetition. The reason it is capped so low is that a good design system
 * produces exactly this too, and the corpus cannot tell "generated from a template" apart
 * from "built on a disciplined system" from structure alone.
 */

const BOILERPLATE_ROUTES = ["/", "/about", "/features", "/pricing", "/contact", "/blog", "/faq", "/testimonials"];

export const STRUCTURE_RULES: readonly WebRule[] = [
  {
    id: "struct.uniform-section-rhythm",
    family: "structural-uniformity",
    title: "Every section is the same height",
    polarity: "signal",
    severity: "low",
    baseWeight: 0.3,
    maxHits: 1,
    requiresProbe: "dom-survey",
    phase: 1,
    since: "corpus-2026.09",
    explanation:
      "Five or more sections whose rendered heights sit within 5% of each other. A page whose content varies in importance does not lay out in equal blocks; a page filling template slots does.",
    falsePositiveNote:
      "A page of genuinely parallel content, such as a plan comparison or a docs index, is legitimately uniform.",
    prevention: "Let the important section be bigger. Equal weight for unequal content is a layout that has not made a decision.",
    detect: (a) => {
      const heights = a.dom.sections.map((s) => s.heightPx).filter((h) => h > 0);
      if (heights.length < 5) return [];
      const mean = heights.reduce((x, y) => x + y, 0) / heights.length;
      if (mean <= 0) return [];
      const spread = (Math.max(...heights) - Math.min(...heights)) / mean;
      if (spread > 0.05) return [];
      return [
        ev("metric", `${a.dom.sections.length} top-level sections`, `heights ${heights.join(", ")}px, spread ${(spread * 100).toFixed(1)}%`, {
          expected: "varied section heights",
        }),
      ];
    },
    fixtures: {
      positive: (base) => ({
        artifact: patch(base, {
          dom: {
            sections: [
              { selector: "section:nth-child(1)", heightPx: 600 },
              { selector: "section:nth-child(2)", heightPx: 604 },
              { selector: "section:nth-child(3)", heightPx: 598 },
              { selector: "section:nth-child(4)", heightPx: 602 },
              { selector: "section:nth-child(5)", heightPx: 600 },
            ],
          },
        }),
      }),
      mutated: (base) => ({
        artifact: patch(base, {
          dom: {
            sections: [
              { selector: "section:nth-child(1)", heightPx: 980 },
              { selector: "section:nth-child(2)", heightPx: 320 },
              { selector: "section:nth-child(3)", heightPx: 1440 },
              { selector: "section:nth-child(4)", heightPx: 210 },
              { selector: "section:nth-child(5)", heightPx: 760 },
            ],
          },
        }),
      }),
    },
  },
  {
    id: "struct.boilerplate-routes",
    family: "structural-uniformity",
    title: "The route set is the default marketing-template route set",
    polarity: "signal",
    severity: "info",
    baseWeight: 0.25,
    maxHits: 3,
    requiresProbe: "render",
    phase: 1,
    since: "corpus-2026.09",
    explanation:
      "Four or more of the canonical generated route set and nothing outside it. Not that these pages exist, but that they are the ONLY pages: no route reflects anything specific to this business.",
    falsePositiveNote:
      "These are the pages a small site legitimately needs. The rule requires the route set to contain nothing else, and a site can be genuinely simple.",
    prevention: "Ship at least one route that only your product could have.",
    detect: (a) => {
      if (a.routes.length === 0) return [];
      const matched = a.routes.filter((r) => BOILERPLATE_ROUTES.includes(r));
      const distinctive = a.routes.filter((r) => !BOILERPLATE_ROUTES.includes(r));
      if (matched.length < 4 || distinctive.length > 0) return [];
      return matched.slice(0, 4).map((r) => ev("url", r, "default template route", { expected: "at least one route specific to this product" }));
    },
    fixtures: {
      positive: (base) => ({ artifact: patch(base, { routes: ["/", "/about", "/features", "/pricing", "/contact"] }) }),
      mutated: (base) => ({ artifact: patch(base, { routes: ["/", "/about", "/features", "/pricing", "/hinge-catalogue-1994"] }) }),
    },
  },
];
