import { attachRemedies } from "@slop/core";
import { ev, patch } from "../rule.js";
import type { WebRule } from "../rule.js";
import type { MotionRecord } from "../artifact.js";
import { manualEach, manualOnce, uiChange } from "./remedy.js";

/**
 * Family: motion-signature. Capped at 12%.
 *
 * THE ONE IDEA THIS FILE IS BUILT ON. Motion is not a tell. Uniform motion is.
 *
 * Every well-funded, hand-built site in this repository's negative corpus animates something,
 * and several animate beautifully. A rule that fired on "this page has a transition" would
 * flag every site that hired a designer, which is the exact failure mode
 * `image-detection-reality.md` documents and the reason the category has a body count. So not
 * one rule below reads the PRESENCE of an animation. Every one of them reads a DISTRIBUTION:
 *
 *   - one duration and one easing shared by most of the moving page,
 *   - delay deltas that are all exactly equal, which is a loop with a multiplier in it,
 *   - an infinite iteration count on elements that carry no content,
 *   - an entrance on every section without exception,
 *   - a drop-in reveal library whose only purpose is spraying one animation over everything.
 *
 * WHY THE CAP IS 12% AND NOT MORE. Above `structural-uniformity` (10%) because a stagger
 * ladder is CONFIGURED: nobody gets `0ms, 80ms, 160ms, 240ms` by leaving a default alone,
 * whereas equal section heights fall out of a grid. Well below `builder-fingerprint` (40%)
 * because a disciplined design system produces uniform motion honestly, with tokens, and the
 * measurement cannot tell that apart from a template. Three findings at full strength here
 * move a score by a few points, not a band.
 *
 * WHAT IS COLLECTED AND DELIBERATELY NOT SCORED. The probe records framer-motion and GSAP
 * markers, and no rule fires on them. Both are professional tools that a person reaches for on
 * purpose; a data attribute framer-motion writes on every animated element is evidence that
 * somebody installed a good library, and treating dozens of them as dozens of tells is how a
 * naive detector convicts the best-built site in front of it. They stay in the artifact so a
 * reader can see them and a later corpus can argue with this decision, and they stay out of
 * `motion.library-fingerprint`, which fires only on the drop-in tier: animate.css, AOS, WOW,
 * ScrollReveal. Those are not tools for building motion, they are tools for having some.
 */

/** Anything that actually moves. A zero-duration transition is a default, not motion. */
const moving = (records: readonly MotionRecord[]): readonly MotionRecord[] => records.filter((r) => r.durationMs > 0);

/**
 * ANIMATIONS ONLY, and this narrowing is the most important line in the file.
 *
 * The uniformity rules were written over every moving element, transitions included, and the
 * first live reading killed that version: stripe.com computes 654 moving elements at 390px, of
 * which 478 are a 300ms token on colour, fill, stroke and background-colour. A hand-built site
 * by a named in-house design team would have tripped "one duration across the moving page" on
 * its HOVER STATES, which is the category's signature false positive arriving in the first
 * measurement.
 *
 * The line that separates them is not a threshold, it is a mechanism. A transition is a
 * RESPONSE: it does nothing until the reader hovers, focuses or opens something, and one
 * duration across all of those is a design token doing its job. An animation RUNS, whether
 * anybody is looking or not, and that is the motion a visitor is actually subjected to. So the
 * uniformity family reads `animation-*` and leaves `transition-*` in the artifact, measured,
 * printed and unscored, where a reader can see it and a later corpus can argue with this.
 */
const animated = (records: readonly MotionRecord[]): readonly MotionRecord[] =>
  records.filter((r) => r.source === "animation" && r.durationMs > 0);

/**
 * Keyframes a dependency brought with it, identified by the prefix the dependency writes.
 *
 * This exists because of a live reading. rodeorodeorodeo.com ships thirty-three keyframes and
 * six of them have six stops each, so `counter.bespoke-keyframe` handed that page
 * counter-evidence for "a keyframe somebody drew by hand" which was in fact react-toastify's
 * bounce, installed by an `npm i`. Crediting a page for its dependencies' craft is the same
 * error as blaming it for their fingerprints, and both are cheap to avoid: the names say who
 * wrote them.
 */
const LIBRARY_OWNED_KEYFRAME = /^(?:Toastify__|__framer|sonner-|swipe-out-|accordion-|animate__|ant-|Mui|chakra-|radix-|tw-)/i;

/** Libraries whose entire product is "apply one reveal to everything". */
const DROP_IN_LIBRARIES = /animate\.css|\baos\b|wow\.js|scrollreveal/i;

/**
 * Timings a framework ships and a page inherits without deciding anything.
 *
 * ONE ENTRY, deliberately. Every value added here is a value that starts flagging every site
 * built on that framework, so the bar is a pairing that is (a) the shipped default of a widely
 * used framework and (b) absent from all five hand-built pages in the negative corpus. Tailwind
 * clears it: `transition` means 150ms and `cubic-bezier(0.4, 0, 0.2, 1)` unless somebody says
 * otherwise, and not one of the five human pages says it.
 */
/** Whitespace inside a cubic-bezier is not information. Compare on the numbers. */
const normaliseTiming = (value: string): string => value.replace(/\s+/g, "").toLowerCase();

/**
 * Normalised THROUGH THE SAME FUNCTION the lookup uses, rather than written out pre-normalised.
 * The first draft stored `"150ms cubic-bezier(0.4,0,0.2,1)"` with a space the normaliser
 * removes, so every lookup missed and the rule was dead on arrival. The fixture caught it in
 * the same minute, which is the entire argument for `fixtures` being mandatory: a rule that
 * cannot fire does not crash, it just quietly stops finding anything.
 */
const FRAMEWORK_DEFAULT_TIMINGS = new Set(["150ms cubic-bezier(0.4, 0, 0.2, 1)"].map(normaliseTiming));

const RAW_MOTION_RULES: readonly WebRule[] = [
  {
    id: "motion.uniform-timing",
    family: "motion-signature",
    title: "One duration and one easing across most of the moving page",
    polarity: "signal",
    severity: "low",
    baseWeight: 0.6,
    maxHits: 3,
    requiresProbe: "motion",
    phase: 1,
    since: "corpus-2026.10",
    explanation:
      "Six or more moving elements, and 70% or more of them share an IDENTICAL duration and timing function. Motion that was designed is paced: a card settles faster than a hero, a menu opens faster than a page. Motion that was applied is one value written once and inherited everywhere.",
    falsePositiveNote:
      "A design system with motion tokens produces exactly this, on purpose, and it is good practice. The measurement cannot tell a token apart from a template, which is why the family is capped at 12% and why this fires on the SHARE rather than on any single value.",
    prevention:
      "Give the elements that matter their own timing. Two or three durations is a decision; one is a default.",
    detect: (a) => {
      const records = animated(a.motion?.records ?? []);
      if (records.length < 6) return [];
      const groups = new Map<string, MotionRecord[]>();
      for (const r of records) {
        const key = `${r.durationMs}ms ${r.easing}`;
        const bucket = groups.get(key);
        if (bucket) bucket.push(r);
        else groups.set(key, [r]);
      }
      let top: { key: string; members: MotionRecord[] } | null = null;
      for (const [key, members] of groups) {
        if (!top || members.length > top.members.length) top = { key, members };
      }
      if (!top || top.members.length < 6) return [];
      const share = top.members.length / records.length;
      if (share < 0.7) return [];
      return [
        ev(
          "metric",
          "shared duration and easing across moving elements",
          `${top.members.length} of ${records.length} moving elements (${Math.round(share * 100)}%) compute to ${top.key}`,
          { expected: "several durations, paced to what each element is doing" },
        ),
        ...top.members.slice(0, 4).map((r) =>
          ev("css", `${r.source}-duration on ${r.selector}`, `${r.durationMs}ms ${r.easing}`, {
            expected: "a duration chosen for this element",
          }),
        ),
      ];
    },
    fixtures: {
      positive: (base) => ({
        artifact: patch(base, {
          motion: {
            ...base.motion!,
            records: Array.from({ length: 8 }, (_, i) => ({
              selector: `.card:nth-child(${i + 1})`,
              source: "animation" as const,
              name: "fade-in-up",
              properties: "opacity, transform",
              durationMs: 500,
              delayMs: 0,
              easing: "cubic-bezier(0.4, 0, 0.2, 1)",
              iterations: "1",
              decorative: false,
            })),
          },
        }),
      }),
      mutated: (base) => ({
        artifact: patch(base, {
          motion: {
            ...base.motion!,
            // Same eight elements, same easing, PACED. One field changed: the durations vary.
            records: Array.from({ length: 8 }, (_, i) => ({
              selector: `.card:nth-child(${i + 1})`,
              source: "animation" as const,
              name: "fade-in-up",
              properties: "opacity, transform",
              durationMs: 180 + i * 55,
              delayMs: 0,
              easing: "cubic-bezier(0.4, 0, 0.2, 1)",
              iterations: "1",
              decorative: false,
            })),
          },
        }),
      }),
      extra: [
        {
          name: "five identical elements are under the floor: a card row is not a page",
          shouldFire: false,
          build: (base) => ({
            artifact: patch(base, {
              motion: {
                ...base.motion!,
                records: Array.from({ length: 5 }, (_, i) => ({
                  selector: `.card:nth-child(${i + 1})`,
                  source: "animation" as const,
                  name: "fade-in-up",
                  properties: "opacity",
                  durationMs: 400,
                  delayMs: 0,
                  easing: "ease-out",
                  iterations: "1",
                  decorative: false,
                })),
              },
            }),
          }),
        },
        {
          name: "a uniform majority inside a genuinely varied page does not clear the share floor",
          shouldFire: false,
          build: (base) => ({
            artifact: patch(base, {
              motion: {
                ...base.motion!,
                records: [
                  ...Array.from({ length: 6 }, (_, i) => ({
                    selector: `.card:nth-child(${i + 1})`,
                    source: "animation" as const,
                    name: "fade-in-up",
                    properties: "opacity",
                    durationMs: 400,
                    delayMs: 0,
                    easing: "ease-out",
                    iterations: "1",
                    decorative: false,
                  })),
                  ...Array.from({ length: 5 }, (_, i) => ({
                    selector: `.bespoke-${i}`,
                    source: "animation" as const,
                    name: `bespoke-${i}`,
                    properties: "clip-path",
                    durationMs: 220 + i * 130,
                    delayMs: i * 17,
                    easing: `cubic-bezier(0.${i}, 1, 0.2, 1)`,
                    iterations: "1",
                    decorative: false,
                  })),
                ],
              },
            }),
          }),
        },
      ],
    },
  },
  {
    id: "motion.stagger-ladder",
    family: "motion-signature",
    title: "Delays that step by exactly the same amount",
    polarity: "signal",
    severity: "low",
    baseWeight: 0.5,
    maxHits: 2,
    requiresProbe: "motion",
    phase: 1,
    since: "corpus-2026.10",
    explanation:
      "Four or more elements sharing one animation whose delays form an exact arithmetic ladder: 0ms, 90ms, 180ms, 270ms. Nobody arrives at an exactly constant delta by feel. It is an index multiplied by a constant, which is a loop.",
    falsePositiveNote:
      "An index times a constant is also the obvious, correct way for a person to write a stagger, and several component libraries expose it as a prop. This is evidence of a mechanism, not of a machine.",
    prevention:
      "If the sequence matters, break the ladder: let the first item lead by more than the rest, or drop the delay entirely below the fold where nobody is watching it arrive.",
    detect: (a) => {
      const records = animated(a.motion?.records ?? []);
      const groups = new Map<string, MotionRecord[]>();
      for (const r of records) {
        const key = `${r.name}|${r.durationMs}|${r.easing}`;
        const bucket = groups.get(key);
        if (bucket) bucket.push(r);
        else groups.set(key, [r]);
      }
      const out = [];
      for (const [, members] of groups) {
        const delays = [...new Set(members.map((m) => m.delayMs))].sort((x, y) => x - y);
        if (delays.length < 4) continue;
        const delta = (delays[1] as number) - (delays[0] as number);
        if (delta < 20) continue;
        const exact = delays.every((d, i) => i === 0 || d - (delays[i - 1] as number) === delta);
        if (!exact) continue;
        const first = members[0] as MotionRecord;
        out.push(
          ev(
            "metric",
            `animation-delay across ${members.length} elements running "${first.name}"`,
            `${delays.join("ms, ")}ms: a constant ${delta}ms step`,
            { expected: "delays that are not a single number multiplied by an index" },
          ),
        );
        for (const m of members.slice(0, 3)) {
          out.push(
            ev("css", `animation-delay on ${m.selector}`, `${m.delayMs}ms (duration ${m.durationMs}ms, ${m.easing})`),
          );
        }
      }
      return out;
    },
    fixtures: {
      positive: (base) => ({
        artifact: patch(base, {
          motion: {
            ...base.motion!,
            records: Array.from({ length: 5 }, (_, i) => ({
              selector: `.feature:nth-child(${i + 1})`,
              source: "animation" as const,
              name: "reveal",
              properties: "opacity, transform",
              durationMs: 600,
              delayMs: i * 90,
              easing: "ease-out",
              iterations: "1",
              decorative: false,
            })),
          },
        }),
      }),
      mutated: (base) => ({
        artifact: patch(base, {
          motion: {
            ...base.motion!,
            // The same five reveals, with the ladder broken: the first leads, the rest cluster.
            records: [0, 40, 90, 110, 130].map((delay, i) => ({
              selector: `.feature:nth-child(${i + 1})`,
              source: "animation" as const,
              name: "reveal",
              properties: "opacity, transform",
              durationMs: 600,
              delayMs: delay,
              easing: "ease-out",
              iterations: "1",
              decorative: false,
            })),
          },
        }),
      }),
      extra: [
        {
          name: "three steps is a sequence somebody typed, not a ladder",
          shouldFire: false,
          build: (base) => ({
            artifact: patch(base, {
              motion: {
                ...base.motion!,
                records: [0, 100, 200].map((delay, i) => ({
                  selector: `.feature:nth-child(${i + 1})`,
                  source: "animation" as const,
                  name: "reveal",
                  properties: "opacity",
                  durationMs: 600,
                  delayMs: delay,
                  easing: "ease-out",
                  iterations: "1",
                  decorative: false,
                })),
              },
            }),
          }),
        },
      ],
    },
  },
  {
    id: "motion.infinite-decorative-loop",
    family: "motion-signature",
    title: "Decoration animating forever",
    polarity: "signal",
    severity: "low",
    baseWeight: 0.45,
    maxHits: 3,
    requiresProbe: "motion",
    phase: 1,
    since: "corpus-2026.10",
    explanation:
      "Two or more elements that carry no text of their own running with `animation-iteration-count: infinite`. The floating blob, the pulsing dot, the drifting gradient. A loop with no end state is motion nobody was asked to sit through, and it is the single most reliable ornament in generated output.",
    falsePositiveNote:
      "A loading spinner, a live indicator on a status page and a marquee are all legitimately infinite. The rule requires two or more on elements with no content of their own, and a page can still have a good reason for both.",
    prevention:
      "Give the animation an end. If it is decorative, run it once on entrance; if it must loop, tie it to something that is actually still happening.",
    detect: (a) => {
      const loops = animated(a.motion?.records ?? []).filter((r) => r.decorative && /infinite/i.test(r.iterations));
      if (loops.length < 2) return [];
      return loops
        .slice(0, 4)
        .map((r) =>
          ev("css", `animation on ${r.selector}`, `${r.name} ${r.durationMs}ms ${r.easing} infinite`, {
            expected: "a finite iteration count, or no animation on decoration",
          }),
        );
    },
    fixtures: {
      positive: (base) => ({
        artifact: patch(base, {
          motion: {
            ...base.motion!,
            records: [
              {
                selector: ".blob-1",
                source: "animation" as const,
                name: "float",
                properties: "transform",
                durationMs: 6000,
                delayMs: 0,
                easing: "ease-in-out",
                iterations: "infinite",
                decorative: true,
              },
              {
                selector: ".blob-2",
                source: "animation" as const,
                name: "float",
                properties: "transform",
                durationMs: 8000,
                delayMs: 0,
                easing: "ease-in-out",
                iterations: "infinite",
                decorative: true,
              },
            ],
          },
        }),
      }),
      mutated: (base) => ({
        artifact: patch(base, {
          motion: {
            ...base.motion!,
            // The same two blobs, both running ONCE. One field changed.
            records: [
              {
                selector: ".blob-1",
                source: "animation" as const,
                name: "float",
                properties: "transform",
                durationMs: 6000,
                delayMs: 0,
                easing: "ease-in-out",
                iterations: "1",
                decorative: true,
              },
              {
                selector: ".blob-2",
                source: "animation" as const,
                name: "float",
                properties: "transform",
                durationMs: 8000,
                delayMs: 0,
                easing: "ease-in-out",
                iterations: "1",
                decorative: true,
              },
            ],
          },
        }),
      }),
      extra: [
        {
          name: "one infinite loop is a spinner and is not a finding",
          shouldFire: false,
          build: (base) => ({
            artifact: patch(base, {
              motion: {
                ...base.motion!,
                records: [
                  {
                    selector: ".spinner",
                    source: "animation" as const,
                    name: "spin",
                    properties: "transform",
                    durationMs: 800,
                    delayMs: 0,
                    easing: "linear",
                    iterations: "infinite",
                    decorative: true,
                  },
                ],
              },
            }),
          }),
        },
        {
          name: "infinite motion on elements that carry their own text is content, not ornament",
          shouldFire: false,
          build: (base) => ({
            artifact: patch(base, {
              motion: {
                ...base.motion!,
                records: [
                  {
                    selector: ".ticker-a",
                    source: "animation" as const,
                    name: "scroll-left",
                    properties: "transform",
                    durationMs: 12_000,
                    delayMs: 0,
                    easing: "linear",
                    iterations: "infinite",
                    decorative: false,
                  },
                  {
                    selector: ".ticker-b",
                    source: "animation" as const,
                    name: "scroll-left",
                    properties: "transform",
                    durationMs: 12_000,
                    delayMs: 0,
                    easing: "linear",
                    iterations: "infinite",
                    decorative: false,
                  },
                ],
              },
            }),
          }),
        },
      ],
    },
  },
  {
    id: "motion.library-fingerprint",
    family: "motion-signature",
    title: "A drop-in reveal library, naming itself",
    polarity: "signal",
    severity: "low",
    baseWeight: 0.4,
    maxHits: 2,
    requiresProbe: "motion",
    phase: 1,
    since: "corpus-2026.10",
    explanation:
      "animate.css, AOS, WOW.js or ScrollReveal, identified by its own class names, data attributes, keyframe names or stylesheet URL. These libraries exist to apply one entrance to everything without writing any motion, which is why their markers travel with template output.",
    falsePositiveNote:
      "STRIPPABLE, like every fingerprint: a class name is one find-and-replace away, so a score must never lean on it. And plenty of people reach for AOS on purpose to ship a small site quickly, which is a reasonable trade rather than a confession. framer-motion and GSAP markers are collected by the probe and deliberately NOT scored here: they are professional tools, and counting a per-element data attribute as a tell would convict the best-built page on the internet.",
    prevention:
      "If the motion matters, write the three lines of CSS it needs. If it does not matter, ship the page without it.",
    detect: (a) => {
      const markers = (a.motion?.libraryMarkers ?? []).filter((m) => DROP_IN_LIBRARIES.test(m.library));
      if (markers.length === 0) return [];
      return markers
        .slice(0, 4)
        .map((m) => ev(m.kind === "script" || m.kind === "stylesheet" ? "request" : "selector", m.locator, m.observed, {
          expected: "no third-party reveal library",
        }));
    },
    fixtures: {
      positive: (base) => ({
        artifact: patch(base, {
          motion: {
            ...base.motion!,
            libraryMarkers: [
              { library: "AOS", kind: "attribute" as const, locator: 'div.card[data-aos]', observed: 'data-aos="fade-up"' },
            ],
          },
        }),
      }),
      mutated: (base) => ({
        artifact: patch(base, {
          motion: {
            ...base.motion!,
            // framer-motion instead of AOS: a marker is present, and this rule must ignore it.
            libraryMarkers: [
              {
                library: "framer-motion",
                kind: "attribute" as const,
                locator: "div.card[data-framer-appear-id]",
                observed: 'data-framer-appear-id="a1b2c3"',
              },
            ],
          },
        }),
      }),
    },
  },
  {
    id: "motion.every-section-reveals",
    family: "motion-signature",
    title: "Every section on the page reveals itself",
    polarity: "signal",
    severity: "info",
    baseWeight: 0.35,
    maxHits: 1,
    requiresProbe: "motion",
    phase: 1,
    since: "corpus-2026.10",
    explanation:
      "Five or more top-level sections, and every single one of them arrives with an entrance. A scroll reveal is a way of saying 'look at this'; saying it about everything says it about nothing, and applying it without exception is what a wrapper does, not what an editor does.",
    falsePositiveNote:
      "A long single-column marketing page where every section genuinely is a beat, animated consistently, measures the same. Plenty of careful designers do exactly this, which is why it is the lightest rule in the family.",
    prevention: "Reveal the two sections that earn it and let the rest just be there.",
    detect: (a) => {
      const m = a.motion;
      if (!m || m.sectionsTotal < 5 || m.sectionsWithReveal !== m.sectionsTotal) return [];
      return [
        ev(
          "metric",
          "top-level sections carrying an entrance animation",
          `${m.sectionsWithReveal} of ${m.sectionsTotal}, with no exception`,
          { expected: "an entrance on the sections that earn one" },
        ),
      ];
    },
    fixtures: {
      positive: (base) => ({
        artifact: patch(base, { motion: { ...base.motion!, sectionsWithReveal: 6, sectionsTotal: 6 } }),
      }),
      mutated: (base) => ({
        artifact: patch(base, { motion: { ...base.motion!, sectionsWithReveal: 5, sectionsTotal: 6 } }),
      }),
    },
  },

  {
    id: "motion.framework-default-timing",
    family: "motion-signature",
    title: "The framework's out-of-the-box transition, everywhere",
    polarity: "signal",
    severity: "low",
    baseWeight: 0.4,
    maxHits: 2,
    requiresProbe: "motion",
    phase: 1,
    since: "corpus-2026.10",
    explanation:
      "Eight or more elements with a transition, and 60% or more of them compute to EXACTLY Tailwind's shipped default pairing: 150ms with cubic-bezier(0.4, 0, 0.2, 1). Not a uniform value, a specific one: the number nobody chose. Four generated pages read in August 2026 (three v0, one Lovable) all land on it, and the five hand-built pages in the negative corpus compute 300ms ease-in-out, 300ms ease, 200ms ease and 200ms cubic-bezier(0.44, 0, 0.56, 1) instead, because somebody typed those.",
    falsePositiveNote:
      "This is a DEFAULT, not a fingerprint. A hand-built Tailwind site whose author never touched the motion config computes the same values honestly, and there are a great many of those. It is a visual-default-flavoured tell wearing a motion coat, which is why it is weighted below the uniformity rule and why the family is capped at 12%.",
    prevention:
      "Set a duration and an easing you chose. Two lines in the theme, and the page stops sharing its timing with every other Tailwind page on the internet.",
    detect: (a) => {
      const transitions = (a.motion?.records ?? []).filter((r) => r.source === "transition" && r.durationMs > 0);
      if (transitions.length < 8) return [];
      const groups = new Map<string, MotionRecord[]>();
      for (const r of transitions) {
        const key = `${r.durationMs}ms ${r.easing}`;
        const bucket = groups.get(key);
        if (bucket) bucket.push(r);
        else groups.set(key, [r]);
      }
      let top: { key: string; members: MotionRecord[] } | null = null;
      for (const [key, members] of groups) {
        if (!top || members.length > top.members.length) top = { key, members };
      }
      if (!top || !FRAMEWORK_DEFAULT_TIMINGS.has(normaliseTiming(top.key))) return [];
      const share = top.members.length / transitions.length;
      if (share < 0.6) return [];
      return [
        ev(
          "metric",
          "dominant transition timing across the page",
          `${top.members.length} of ${transitions.length} transitions (${Math.round(share * 100)}%) compute to ${top.key}, which is the framework default`,
          { expected: "a duration and easing chosen for this page" },
        ),
        ...top.members.slice(0, 3).map((r) =>
          ev("css", `transition on ${r.selector}`, `${r.properties} ${r.durationMs}ms ${r.easing}`, {
            expected: "a timing this page chose",
          }),
        ),
      ];
    },
    fixtures: {
      positive: (base) => ({
        artifact: patch(base, {
          motion: {
            ...base.motion!,
            records: Array.from({ length: 10 }, (_, i) => ({
              selector: `button.btn-${i}`,
              source: "transition" as const,
              name: "color",
              properties: "color, background-color, border-color",
              durationMs: 150,
              delayMs: 0,
              easing: "cubic-bezier(0.4, 0, 0.2, 1)",
              iterations: "1",
              decorative: false,
            })),
          },
        }),
      }),
      mutated: (base) => ({
        artifact: patch(base, {
          motion: {
            ...base.motion!,
            // The same ten transitions at a duration somebody typed. One field changed.
            records: Array.from({ length: 10 }, (_, i) => ({
              selector: `button.btn-${i}`,
              source: "transition" as const,
              name: "color",
              properties: "color, background-color, border-color",
              durationMs: 300,
              delayMs: 0,
              easing: "cubic-bezier(0.4, 0, 0.2, 1)",
              iterations: "1",
              decorative: false,
            })),
          },
        }),
      }),
      extra: [
        {
          name: "the default on a minority of the transitions is not the page's signature",
          shouldFire: false,
          build: (base) => ({
            artifact: patch(base, {
              motion: {
                ...base.motion!,
                records: [
                  ...Array.from({ length: 8 }, (_, i) => ({
                    selector: `button.btn-${i}`,
                    source: "transition" as const,
                    name: "color",
                    properties: "color",
                    durationMs: 150,
                    delayMs: 0,
                    easing: "cubic-bezier(0.4, 0, 0.2, 1)",
                    iterations: "1",
                    decorative: false,
                  })),
                  ...Array.from({ length: 9 }, (_, i) => ({
                    selector: `a.link-${i}`,
                    source: "transition" as const,
                    name: "opacity",
                    properties: "opacity",
                    durationMs: 220,
                    delayMs: 0,
                    easing: "cubic-bezier(0.62, 0.05, 0.36, 1)",
                    iterations: "1",
                    decorative: false,
                  })),
                ],
              },
            }),
          }),
        },
      ],
    },
  },

  /* ---- counter-evidence ------------------------------------------------------------------ */
  {
    id: "counter.reduced-motion-honoured",
    family: "counter-evidence",
    title: "prefers-reduced-motion is actually honoured",
    polarity: "counter",
    counterScope: "global",
    severity: "info",
    baseWeight: -0.7,
    maxHits: 2,
    requiresProbe: "motion",
    phase: 1,
    since: "corpus-2026.10",
    explanation:
      "The page was read twice, the second time with `prefers-reduced-motion: reduce` emulated, and two thirds or more of the moving elements stopped. This is not the media query being present, it is the media query WORKING: somebody thought about a reader with vestibular disorder and then tested it. Generated output almost never contains this, because nothing in the prompt asked for it.",
    falsePositiveNote:
      "A framework or a UI library can supply the reduced-motion block for free, so this can be craft somebody else did. It is still craft that shipped, and it is a global counter for that reason rather than a family one.",
    detect: (a) => {
      const r = a.motion?.reducedMotion;
      if (!r || !r.measured || r.animatedBefore < 3) return [];
      if (r.animatedAfter > Math.floor(r.animatedBefore / 3)) return [];
      const out = [
        ev(
          "metric",
          "moving elements with prefers-reduced-motion: reduce emulated",
          `${r.animatedAfter} still moving, down from ${r.animatedBefore}`,
          { expected: "n/a: this argues FOR the artifact" },
        ),
      ];
      for (const selector of r.stopped.slice(0, 2)) {
        out.push(ev("selector", selector, "stopped moving under the reduced-motion preference"));
      }
      return out;
    },
    fixtures: {
      positive: (base) => ({
        artifact: patch(base, {
          motion: {
            ...base.motion!,
            reducedMotion: {
              measured: true,
              animatedBefore: 9,
              animatedAfter: 0,
              stopped: [".hero", ".card:nth-child(1)"],
              queryDeclared: true,
            },
          },
        }),
      }),
      mutated: (base) => ({
        artifact: patch(base, {
          motion: {
            ...base.motion!,
            // The query is declared and NOTHING stops. Declaring it is not honouring it, and
            // this is the single case the whole second read exists to separate.
            reducedMotion: {
              measured: true,
              animatedBefore: 9,
              animatedAfter: 9,
              stopped: [],
              queryDeclared: true,
            },
          },
        }),
      }),
      extra: [
        {
          name: "an unmeasured second read is not counter-evidence",
          shouldFire: false,
          build: (base) => ({
            artifact: patch(base, {
              motion: {
                ...base.motion!,
                reducedMotion: { measured: false, animatedBefore: 9, animatedAfter: 0, stopped: [], queryDeclared: true },
              },
            }),
          }),
        },
      ],
    },
  },
  {
    id: "counter.bespoke-keyframe",
    family: "motion-signature",
    title: "A keyframe somebody drew by hand",
    polarity: "counter",
    counterScope: "family",
    severity: "info",
    baseWeight: -0.45,
    maxHits: 2,
    requiresProbe: "motion",
    phase: 1,
    since: "corpus-2026.10",
    explanation:
      "An `@keyframes` block with four or more stops that animates something past opacity and transform (clip-path, filter, stroke-dashoffset, offset-distance, a mask), or six or more stops of anything. Four stops is somebody sitting with a curve and moving it; two stops of opacity is a fade a wrapper wrote.",
    falsePositiveNote:
      "A keyframe can be copied from CodePen as easily as authored, and a component library ships plenty of elaborate ones. This argues with the motion family only, never with the whole verdict.",
    detect: (a) => {
      const unusual = /clip-path|filter|stroke-dash|offset-|mask|letter-spacing|background-position|rotate|skew/i;
      const bespoke = (a.motion?.keyframes ?? []).filter(
        (k) =>
          !LIBRARY_OWNED_KEYFRAME.test(k.name) && ((k.stops >= 4 && unusual.test(k.properties)) || k.stops >= 6),
      );
      if (bespoke.length === 0) return [];
      return bespoke
        .slice(0, 3)
        .map((k) =>
          ev("css", `@keyframes ${k.name}`, `${k.stops} stops animating ${k.properties}`, {
            expected: "n/a: this argues FOR the artifact",
          }),
        );
    },
    fixtures: {
      positive: (base) => ({
        artifact: patch(base, {
          motion: {
            ...base.motion!,
            keyframes: [{ name: "ink-bleed", stops: 5, properties: "clip-path, filter" }],
          },
        }),
      }),
      mutated: (base) => ({
        artifact: patch(base, {
          motion: {
            ...base.motion!,
            // Five stops of a plain fade. Elaborate is not the same as considered, and the
            // properties are what tell them apart.
            keyframes: [{ name: "fade-in-up", stops: 5, properties: "opacity, transform" }],
          },
        }),
      }),
    },
  },
  {
    id: "counter.motion-restraint",
    family: "motion-signature",
    title: "Motion on one thing, on a page of many things",
    polarity: "counter",
    counterScope: "family",
    severity: "info",
    baseWeight: -0.3,
    maxHits: 1,
    requiresProbe: "motion",
    phase: 1,
    since: "corpus-2026.10",
    explanation:
      "At least two hundred elements were read for motion and no more than three of them move. Restraint is a decision with a cost: somebody had every reveal available for free and used almost none of them.",
    falsePositiveNote:
      "A page can have no motion because nobody got round to it, which is not restraint, it is absence. This is the weakest counter in the family and it argues with the motion family alone.",
    detect: (a) => {
      const m = a.motion;
      if (!m || m.sampled < 200) return [];
      const count = moving(m.records).length;
      if (count === 0 || count > 3) return [];
      return [
        ev("metric", "moving elements out of those examined", `${count} of ${m.sampled}`, {
          expected: "n/a: this argues FOR the artifact",
        }),
      ];
    },
    fixtures: {
      positive: (base) => ({
        artifact: patch(base, {
          motion: {
            ...base.motion!,
            sampled: 420,
            records: [
              {
                selector: "a.cta",
                source: "transition" as const,
                name: "background-color",
                properties: "background-color",
                durationMs: 120,
                delayMs: 0,
                easing: "ease-out",
                iterations: "1",
                decorative: false,
              },
            ],
          },
        }),
      }),
      mutated: (base) => ({
        artifact: patch(base, {
          motion: {
            ...base.motion!,
            sampled: 420,
            // Nothing moves at all. Absence is not restraint and this must stay silent on it.
            records: [],
          },
        }),
      }),
    },
  },
];

/**
 * The fixes.
 *
 * One `ui_change`, and it is the only place in this family where the observation fully
 * determines the replacement: `animation-iteration-count: infinite` becomes `1`, and both
 * values are already in the citation. Everything else is a decision. "Which of these sections
 * earns an entrance" and "how fast should this card be" are content judgements, and a detector
 * that answered them by picking numbers would be generating the same filler it is measuring.
 */
export const MOTION_RULES: readonly WebRule[] = attachRemedies(RAW_MOTION_RULES, {
  "motion.uniform-timing": (evidence) =>
    manualOnce(evidence, {
      locator: evidence[0]?.locator ?? "shared duration and easing across moving elements",
      summary: "Pace the motion: give the elements that carry the page their own duration.",
      guidance:
        "No timings are proposed. Which element should arrive first, and how fast, is the same judgement as which section matters, and it is the author's. Two or three durations is enough to stop reading as one value inherited everywhere.",
      doNotApplyIf:
        "the durations come from motion tokens in a design system, in which case they are uniform on purpose and the right change is nothing.",
      blastRadius: "multi-file",
    }),
  "motion.stagger-ladder": (evidence) =>
    manualOnce(evidence, {
      locator: evidence[0]?.locator ?? "animation-delay across the staggered elements",
      summary: "Break the ladder, or drop the stagger.",
      guidance:
        "An index times a constant reads as a loop because it is one. Either give the first item a longer lead than the rest, or remove the delay entirely: below the fold nobody watches things arrive.",
      doNotApplyIf: "the sequence is the content, as in a step-by-step explainer where order is the point.",
      blastRadius: "file",
    }),
  "motion.infinite-decorative-loop": (evidence) =>
    evidence.map((e) =>
      uiChange({
        selector: e.locator.replace(/^animation on /, ""),
        property: "animation-iteration-count",
        before: "infinite",
        after: "1",
        summary: `Stop the loop on ${e.locator.replace(/^animation on /, "")}: run the animation once instead of forever.`,
        doNotApplyIf:
          "the element is a spinner, a live indicator or a marquee, where a loop with no end is the correct behaviour.",
        sourceHint: "the stylesheet or component that declares this animation",
        addresses: [e.locator],
        blastRadius: "line",
      }),
    ),
  "motion.library-fingerprint": (evidence) =>
    manualEach(evidence, (e) => ({
      summary: `Replace what ${e.observed} is doing with the motion this page actually needs.`,
      guidance:
        "No patch is proposed: removing the marker alone would delete the evidence and keep the behaviour, which is the wrong half. A drop-in reveal library is usually three lines of CSS in disguise, and writing those three lines is the change.",
      doNotApplyIf:
        "the library was a deliberate trade to ship quickly, which is a reasonable decision and not a defect.",
      blastRadius: "multi-file",
    })),
  "motion.framework-default-timing": (evidence) =>
    manualOnce(evidence, {
      locator: evidence[0]?.locator ?? "dominant transition timing across the page",
      summary: "Choose a duration and an easing, in the theme, once.",
      guidance:
        "No values are proposed: which pace suits the page is the author's call, and the finding is that nobody has made it yet rather than that 150ms is wrong. Anything set deliberately clears this rule, including 150ms set deliberately, which the measurement cannot distinguish and which is why the weight is small.",
      doNotApplyIf:
        "the framework default was chosen after consideration, in which case the honest answer is that this rule cannot see the difference.",
      blastRadius: "file",
    }),
  "motion.every-section-reveals": (evidence) =>
    manualOnce(evidence, {
      locator: evidence[0]?.locator ?? "top-level sections carrying an entrance animation",
      summary: "Reveal the sections that earn it and leave the rest alone.",
      guidance:
        "Which two sections those are is a judgement about the content, so no selector is named. An entrance on everything is emphasis on nothing.",
      doNotApplyIf: "every section genuinely is a separate beat, which some long-form pages are.",
      blastRadius: "multi-file",
    }),
});
