import { attachRemedies } from "@slop/core";
import { ev, patch } from "../rule.js";
import type { WebRule } from "../rule.js";
import { manualEach, manualOnce, uiChange, withoutTrailingArrow } from "./remedy.js";

/**
 * Family: copy-tell. Capped at 5%, the smallest positive cap in the corpus.
 *
 * Cheap to compute and noisy as evidence. Prose style is the weakest signal available: it
 * moves with the writer's habits, with house style, and with whatever the last editor read.
 * These rules earn their place because they are ACTIONABLE for an agent in the prevention
 * loop, not because they are good evidence. The cap says which of those two it is.
 */

/**
 * Exported, because the same lexicon is applied to text recovered from INSIDE an image by
 * `rules/imagetext.ts`. One list in one place: a second copy would drift, and the copy that
 * went stale would be the one nobody was looking at. The regexes are global, so every caller
 * resets `lastIndex` before use.
 */
export const SLOP_LEXICON = [
  /\bdelve\b/gi,
  /\btapestry\b/gi,
  /\bfurthermore\b/gi,
  /\bseamless(?:ly)?\b/gi,
  /\bnot only\b[^.!?]{0,80}\bbut also\b/gi,
  /\bunlock the (?:power|potential)\b/gi,
  /\bin today's fast-paced\b/gi,
  /\belevate your\b/gi,
  /\bgame-?changer\b/gi,
];

const RAW_COPY_RULES: readonly WebRule[] = [
  {
    id: "copy.slop-lexicon",
    family: "copy-tell",
    title: "House vocabulary of generated marketing prose",
    polarity: "signal",
    severity: "low",
    baseWeight: 0.25,
    maxHits: 3,
    requiresProbe: "text",
    phase: 1,
    since: "corpus-2026.09",
    explanation:
      "Phrases that appear far more often in generated copy than in written-by-a-person copy: delve, tapestry, seamless, 'not only X but also Y', 'unlock the power of'.",
    falsePositiveNote:
      "All of these are ordinary English words. A human marketer reaching for the same register writes the same sentence, and this is why the family is capped near zero.",
    prevention: "Say the specific thing. Most of these phrases are placeholders standing where a fact should be.",
    detect: (a) => {
      const text = a.text.innerText;
      const out = [];
      for (const re of SLOP_LEXICON) {
        re.lastIndex = 0;
        const m = re.exec(text);
        if (!m) continue;
        const at = m.index;
        out.push(
          ev("text", `rendered text at offset ${at}`, m[0], {
            excerpt: text.slice(Math.max(0, at - 40), at + m[0].length + 40).replace(/\s+/g, " "),
          }),
        );
      }
      return out;
    },
    fixtures: {
      positive: (base) => ({
        artifact: patch(base, {
          text: { innerText: "We delve into your workflow to unlock the power of seamless collaboration.", wordCount: 12 },
        }),
      }),
      mutated: (base) => ({
        artifact: patch(base, { text: { innerText: "We make hinges in Leeds. Ring us on a weekday.", wordCount: 10 } }),
      }),
    },
  },
  {
    id: "copy.em-dash-density",
    family: "copy-tell",
    title: "Em-dash density well above written-by-hand rates",
    polarity: "signal",
    severity: "info",
    baseWeight: 0.2,
    maxHits: 1,
    requiresProbe: "text",
    phase: 1,
    since: "corpus-2026.09",
    explanation:
      "More than 1.5 em dashes per 100 rendered words. The em dash is the most reliable punctuation tell because it is almost never typed on a keyboard and almost always emitted by a model.",
    falsePositiveNote:
      "Editors and typographically careful writers use em dashes correctly and often. Publishing houses set them automatically. Density on a marketing page is the signal, not the character.",
    prevention: "Commas, colons, periods and parentheses. Most em dashes are a sentence that did not want to end.",
    detect: (a) => {
      const words = a.text.wordCount;
      if (words < 40) return [];
      const dashes = (a.text.innerText.match(/—/g) ?? []).length;
      const per100 = (dashes / words) * 100;
      if (per100 < 1.5) return [];
      return [
        ev("metric", "em dashes per 100 rendered words", `${per100.toFixed(1)} (${dashes} in ${words} words)`, { expected: "under 1.5" }),
      ];
    },
    fixtures: {
      positive: (base) => ({
        artifact: patch(base, {
          text: {
            innerText:
              "Our platform — built for teams — helps you move faster. It is simple — and powerful. Everything you need — nothing you do not. " +
              "We believe work should feel effortless, and that starts with tools that get out of the way so people can actually think about the problem in front of them today.",
            wordCount: 60,
          },
        }),
      }),
      mutated: (base) => ({
        artifact: patch(base, {
          text: {
            innerText:
              "Our platform, built for teams, helps you move faster. It is simple and powerful. Everything you need, nothing you do not. " +
              "We believe work should feel effortless, and that starts with tools that get out of the way so people can actually think about the problem in front of them today.",
            wordCount: 60,
          },
        }),
      }),
    },
  },
  {
    id: "copy.arrow-cta",
    family: "copy-tell",
    title: "Call to action ending in a trailing arrow",
    polarity: "signal",
    severity: "info",
    baseWeight: 0.15,
    maxHits: 2,
    requiresProbe: "text",
    phase: 1,
    since: "corpus-2026.09",
    explanation: "A button or link label ending in an arrow glyph. A decoration the template supplied, on a control that already looks like a control.",
    falsePositiveNote: "A directional affordance is a reasonable design choice and reads fine. On its own this is nearly no evidence, which is what the weight says.",
    prevention: "Let the verb do the work.",
    detect: (a) => {
      const out = [];
      // The arrow may end a line OR sit inline between two labels. The first version required
      // a newline after it, and missed both arrows in this corpus's own synthetic template
      // page ("Join the waitlist -> Learn more ->"), because `innerText` only breaks lines
      // where the layout does and two inline links on one row do not.
      const re = /([A-Z][^\n.!?]{2,40}?)\s*(→|->|›|»)(?=\s|$)/g;
      for (let m = re.exec(a.text.innerText); m && out.length < 4; m = re.exec(a.text.innerText)) {
        out.push(ev("text", "call to action label", m[0].trim(), { expected: "the label without the arrow" }));
      }
      return out;
    },
    fixtures: {
      positive: (base) => ({
        artifact: patch(base, { text: { innerText: "Join the waitlist →\nGet started →\n", wordCount: 6 } }),
      }),
      mutated: (base) => ({ artifact: patch(base, { text: { innerText: "Join the waitlist\nGet started\n", wordCount: 6 } }) }),
      extra: [
        {
          name: "two inline CTAs on one rendered line still fire",
          shouldFire: true,
          build: (base) => ({
            artifact: patch(base, {
              text: { innerText: "Join the waitlist -> Learn more ->", wordCount: 6 },
            }),
          }),
        },
        {
          name: "an arrow inside a hyphenated word is not a call to action",
          shouldFire: false,
          build: (base) => ({
            artifact: patch(base, { text: { innerText: "Our end->to->end pipeline runs nightly.", wordCount: 6 } }),
          }),
        },
      ],
    },
  },
];

/**
 * The fixes.
 *
 * One `ui_change`, because a trailing arrow can be removed from a label without anybody
 * deciding anything: the replacement is the same label with the glyph gone, which the
 * evidence already contains. The other two are rewrites, and a rewrite proposed by a machine
 * on a page flagged for reading like a machine wrote it would be a closed loop with nothing
 * in it. The family is capped at 5% for the same reason.
 */
export const COPY_RULES: readonly WebRule[] = attachRemedies(RAW_COPY_RULES, {
  "copy.slop-lexicon": (evidence) =>
    manualEach(evidence, (e) => ({
      summary: `Replace "${e.observed}" with the specific thing it is standing in for.`,
      guidance:
        "Most of these phrases sit where a fact should be. No replacement is proposed: a rewrite generated here would be the same register in different words, which is what the rule is measuring.",
      doNotApplyIf: "the phrase is ordinary English in context. All of these are ordinary English words, which is why this family is capped near zero.",
      blastRadius: "line",
    })),
  "copy.em-dash-density": (evidence) =>
    manualOnce(evidence, {
      locator: evidence[0]?.locator ?? "em dashes per 100 rendered words",
      summary: "Use commas, colons, periods and parentheses for most of these.",
      guidance:
        "Most em dashes are a sentence that did not want to end. No patch is proposed because which ones are load-bearing depends on the sentences, and some of them will be.",
      doNotApplyIf: "the prose is edited to a house style that sets em dashes deliberately, which several publishers do.",
      blastRadius: "file",
    }),
  "copy.arrow-cta": (evidence) =>
    evidence.map((e) =>
      uiChange({
        selector: "the call to action carrying this label",
        property: "label text",
        before: e.observed,
        after: withoutTrailingArrow(e.observed),
        summary: `Drop the trailing arrow: "${e.observed}" becomes "${withoutTrailingArrow(e.observed)}".`,
        doNotApplyIf: "the arrow is a directional affordance that the layout relies on, which is a reasonable design choice and reads fine.",
        sourceHint: "the button or link component rendering this label",
        addresses: [e.locator],
        blastRadius: "line",
      }),
    ),
});
