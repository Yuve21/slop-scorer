import { attachRemedies } from "@slop/core";
import { ev, patch } from "../rule.js";
import type { WebRule } from "../rule.js";
import type { ImageTextRecord } from "../artifact.js";
import { manualEach } from "./remedy.js";
import { SLOP_LEXICON } from "./copy.js";

/**
 * Family: image-text. Capped at 4%, the smallest positive cap in the corpus.
 *
 * THE HOLE THIS CLOSES. Every copy rule in this corpus reads `innerText`. So a page can pass
 * all of them by putting its headline in a JPEG, and the honest description of that page used
 * to be "we did not read it". These rules read the text rendered inside the images instead,
 * and apply the same tells to it: the scaffold string nobody replaced, the generator's name
 * burned into a screenshot, the house vocabulary of generated marketing prose.
 *
 * EVERY FINDING HERE IS PROBABILISTIC AND SAYS SO. `evidenceKind` is set per rule, which the
 * core validator then enforces: a probabilistic finding may not carry an applicable patch, so
 * every fix in this file is a `manual` and there is nothing to remember. Two separate reasons
 * the label is right, and neither is "the model might be wrong":
 *
 *   1. THE RASTER READ ABSTAINS FAR MORE THAN IT SUCCEEDS. It reuses the pixel decoder that
 *      guards the export figure, which is exact on pixel-grid type and refuses everything
 *      else. Pointed at a photograph it returns nothing, with a reason. That is a narrow tool
 *      being honest, not a broad tool being cautious, and a report built on it must not read
 *      as a complete pass over the imagery.
 *   2. RECOVERY IS NOT VISIBILITY. An SVG `<text>` node is byte-exact and still says nothing
 *      about whether a reader sees it: it can be clipped by the viewBox, translated off
 *      canvas, or painted in the background colour. Deterministic recovery, inferred display.
 *
 * So the evidence quotes the recovered string VERBATIM. A reader who thinks the read is wrong
 * can see the read, not just the verdict, which is the only defensible way to ship a
 * probabilistic line in a deterministic receipt.
 */

/**
 * Records a rule may reason about: something was recovered, and the recovery was not
 * abstained. A record with `abstained` set is kept in the artifact deliberately (an unread
 * image is not an image with no words in it) and must never reach a finding.
 */
const readable = (records: readonly ImageTextRecord[] | undefined): readonly ImageTextRecord[] =>
  (records ?? []).filter((r) => !r.abstained && r.text.trim().length > 0);

const cite = (record: ImageTextRecord, matched: string, expected: string) =>
  ev("text", `text inside ${record.src} (recovered by ${record.method})`, matched, {
    excerpt: record.text.slice(0, 300).replace(/\s+/g, " "),
    expected,
  });

/** Strings a scaffold leaves behind when nobody replaced the placeholder. */
const SCAFFOLD_STRINGS: readonly RegExp[] = [
  /lorem ipsum[^\n]{0,60}/i,
  /your (?:headline|logo|text|image|title|brand|company)(?: here)?/i,
  /(?:hero|placeholder|sample|example) (?:image|text|copy|banner)/i,
  /image (?:goes )?here/i,
  /replace (?:this|with your)/i,
  /add your (?:text|image|logo)/i,
  /insert (?:image|text) here/i,
  /\bplaceholder\b/i,
];

/** Builders and generators that write their own name into what they produce. */
const GENERATOR_STRINGS: readonly RegExp[] = [
  /made (?:with|in) (?:v0|lovable|bolt|framer|canva|figma make|replit)/i,
  /\b(?:v0\.app|v0\.dev|lovable\.dev|bolt\.new|gpteng\.co)\b/i,
  /built with (?:ai|v0|lovable|bolt)/i,
  /generated (?:by|with) (?:ai|midjourney|dall[·.·-]?e|stable diffusion|sora|firefly)/i,
  /\bmidjourney\b|\bdall[·.·-]?e\b|\bstable diffusion\b/i,
  /created with (?:ai|artificial intelligence)/i,
];

const RAW_IMAGE_TEXT_RULES: readonly WebRule[] = [
  {
    id: "imgtext.scaffold-placeholder",
    family: "image-text",
    title: "A placeholder string, inside an image",
    polarity: "signal",
    evidenceKind: "probabilistic",
    severity: "medium",
    baseWeight: 0.6,
    maxHits: 3,
    requiresProbe: "image-text",
    phase: 1,
    since: "corpus-2026.10",
    explanation:
      "Text recovered from inside an image on the page reads as scaffold: 'Lorem ipsum', 'Your headline here', 'Hero image', 'placeholder'. Nobody who looked at the finished page and cared about it left this in a graphic.",
    falsePositiveNote:
      "The word 'placeholder' can be the subject of a page, and a design-system site legitimately ships images of its own placeholder components. Recovery is also not visibility: the string may be in the file and clipped out of view.",
    prevention: "Open the exported graphic and read it. A placeholder inside an asset survives every copy review.",
    detect: (a) => {
      const out = [];
      for (const record of readable(a.imageText?.records)) {
        for (const re of SCAFFOLD_STRINGS) {
          const m = re.exec(record.text);
          if (!m) continue;
          out.push(cite(record, m[0], "the real copy, or no text in the image at all"));
          break;
        }
      }
      return out.slice(0, 4);
    },
    fixtures: {
      positive: (base) => ({
        artifact: patch(base, {
          imageText: {
            records: [
              {
                src: "/hero-illustration.svg",
                method: "svg-text" as const,
                text: "Your headline here\nSupporting sentence goes here",
                confidence: 1,
              },
            ],
            attempted: 1,
          },
        }),
      }),
      mutated: (base) => ({
        artifact: patch(base, {
          imageText: {
            records: [
              {
                src: "/hero-illustration.svg",
                method: "svg-text" as const,
                text: "Fourteen people, one workshop\nHinges since 1974",
                confidence: 1,
              },
            ],
            attempted: 1,
          },
        }),
      }),
      extra: [
        {
          name: "a placeholder inside an image the decoder ABSTAINED on is not a finding",
          shouldFire: false,
          build: (base) => ({
            artifact: patch(base, {
              imageText: {
                records: [
                  {
                    src: "/hero.png",
                    method: "raster-ocr" as const,
                    text: "Y0UR H?ADL?N? H?R?",
                    confidence: 0.6,
                    abstained: "60% of the decoded glyphs matched, below the 75% floor",
                  },
                ],
                attempted: 1,
              },
            }),
          }),
        },
      ],
    },
  },
  {
    id: "imgtext.generator-signature",
    family: "image-text",
    title: "A generator's name, burned into an image",
    polarity: "signal",
    evidenceKind: "probabilistic",
    severity: "high",
    baseWeight: 0.7,
    maxHits: 2,
    requiresProbe: "image-text",
    phase: 1,
    since: "corpus-2026.10",
    explanation:
      "The name of a builder or an image model recovered from inside an image: a 'Made with' watermark, a v0 or Lovable badge left in a screenshot, a Midjourney credit in an exported asset. The artifact is naming its own tooling in a place a copy review never looks.",
    falsePositiveNote:
      "A page ABOUT these tools quotes their names for the most ordinary reason there is, and a changelog screenshot of somebody else's product carries their watermark, not yours. This rule reads a string, not an origin.",
    prevention:
      "Export the asset again without the badge, or say plainly on the page that the image was generated. Disclosure is scored DOWN by this engine; a watermark nobody mentions is scored up.",
    detect: (a) => {
      const out = [];
      for (const record of readable(a.imageText?.records)) {
        for (const re of GENERATOR_STRINGS) {
          const m = re.exec(record.text);
          if (!m) continue;
          out.push(cite(record, m[0], "no tooling name inside the asset, or an on-page disclosure instead"));
          break;
        }
      }
      return out.slice(0, 3);
    },
    fixtures: {
      positive: (base) => ({
        artifact: patch(base, {
          imageText: {
            records: [
              {
                src: "/screenshot-dashboard.png",
                method: "raster-ocr" as const,
                text: "DASHBOARD\nMADE WITH LOVABLE",
                confidence: 1,
              },
            ],
            attempted: 1,
          },
        }),
      }),
      mutated: (base) => ({
        artifact: patch(base, {
          imageText: {
            records: [
              {
                src: "/screenshot-dashboard.png",
                method: "raster-ocr" as const,
                text: "DASHBOARD\nJUNE INVOICES",
                confidence: 1,
              },
            ],
            attempted: 1,
          },
        }),
      }),
    },
  },
  {
    id: "imgtext.slop-lexicon",
    family: "image-text",
    title: "Generated marketing vocabulary, inside an image",
    polarity: "signal",
    evidenceKind: "probabilistic",
    severity: "low",
    baseWeight: 0.3,
    maxHits: 2,
    requiresProbe: "image-text",
    phase: 1,
    since: "corpus-2026.10",
    explanation:
      "The same lexicon `copy.slop-lexicon` reads on the page, found in text rendered inside an image instead: delve, seamless, unlock the power of, 'not only X but also Y'. The rule exists because putting the copy in a graphic is the cheapest way to defeat every text rule in this corpus.",
    falsePositiveNote:
      "Every one of these is ordinary English, exactly as it is on the page, and this read is weaker than that one because it is recovered rather than read. Both families are capped near zero and this is the lower of the two.",
    prevention: "Say the specific thing, in the image and out of it.",
    detect: (a) => {
      const out = [];
      for (const record of readable(a.imageText?.records)) {
        for (const re of SLOP_LEXICON) {
          re.lastIndex = 0;
          const m = re.exec(record.text);
          if (!m) continue;
          out.push(cite(record, m[0], "the specific claim this phrase is standing in for"));
          break;
        }
      }
      return out.slice(0, 3);
    },
    fixtures: {
      positive: (base) => ({
        artifact: patch(base, {
          imageText: {
            records: [
              {
                src: "/banner.svg",
                method: "svg-text" as const,
                text: "Unlock the power of seamless collaboration",
                confidence: 1,
              },
            ],
            attempted: 1,
          },
        }),
      }),
      mutated: (base) => ({
        artifact: patch(base, {
          imageText: {
            records: [
              {
                src: "/banner.svg",
                method: "svg-text" as const,
                text: "Two people can edit the same drawing at once",
                confidence: 1,
              },
            ],
            attempted: 1,
          },
        }),
      }),
    },
  },
];

/**
 * The fixes: manual, every one of them, and not by choice.
 *
 * `validate.ts` refuses an applicable patch on a finding whose `evidenceKind` is
 * probabilistic, per finding rather than per detector, so this family CANNOT ship a
 * `ui_change` even though the surrounding corpus can. That is the correct constraint: a fix
 * derived from an OCR read is a patch built on a guess about pixels, and the guess is the part
 * a person has to check.
 */
export const IMAGE_TEXT_RULES: readonly WebRule[] = attachRemedies(RAW_IMAGE_TEXT_RULES, {
  "imgtext.scaffold-placeholder": (evidence) =>
    manualEach(evidence, (e) => ({
      summary: `Re-export the asset without "${e.observed}".`,
      guidance:
        "The string is inside the image, so no selector and no stylesheet will fix it: the asset has to be opened and the copy replaced. Check the recovered text quoted above first, because this read is probabilistic.",
      doNotApplyIf:
        "the placeholder is the subject of the image, as in documentation of a placeholder component, or the text is present in the file but not visible in the rendered page.",
      blastRadius: "file",
    })),
  "imgtext.generator-signature": (evidence) =>
    manualEach(evidence, (e) => ({
      summary: `"${e.observed}" is inside this image. Re-export it without the badge, or disclose it on the page.`,
      guidance:
        "Two honest routes and they are not equivalent: removing the watermark changes the asset, saying so on the page changes the score DOWNWARD, because this engine treats disclosure as counter-evidence. Deleting the badge and staying quiet is the one option that is neither.",
      doNotApplyIf:
        "the image is a screenshot of somebody else's product, or the page is about the tool it names.",
      blastRadius: "file",
    })),
  "imgtext.slop-lexicon": (evidence) =>
    manualEach(evidence, (e) => ({
      summary: `Replace "${e.observed}" inside the asset with the specific thing it stands for.`,
      guidance:
        "No replacement is proposed, for the same reason `copy.slop-lexicon` proposes none: a rewrite generated here would be the same register in different words. Confirm the recovered text before acting on it.",
      doNotApplyIf: "the phrase is ordinary English in context, which all of these are.",
      blastRadius: "file",
    })),
});
