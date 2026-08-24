"use client";

import { createTimeline, utils } from "animejs";
import * as React from "react";

import { BLOCK_ATTR, ELAPSED_ATTR, PANEL_ATTR } from "@/lib/reveal-attrs";

/**
 * THE ONE MOTION MOMENT. There is exactly one of these per route, and this file is the only
 * place in the app that imports an animation library.
 *
 * Three beats, one timeline, ~500 ms wall clock (design/DESIGN.md §7):
 *
 *   1  the elapsed figure counts 0.0 -> the measured value          480 ms
 *   2  the recreation panel wipes in beside the submitted one       320 ms at -=340
 *   3  the evidence list appears AS ONE BLOCK                       180 ms at -=140
 *
 * Beat 3 is one block on purpose and it is not a style preference. A per-card stagger is a
 * named tell in our own corpus, and it would also be a lie about the data: every finding in
 * that list was computed in the same pass, so revealing them in sequence asserts an order of
 * discovery that did not happen.
 *
 * SSR CONTRACT, and the reason this component takes children rather than data:
 * the server renders the FINISHED state. The number is in the HTML, the panels are in the
 * HTML, the list is in the HTML. This component runs the animation *backwards* from that
 * state after hydration. Nothing ships with `opacity: 0` in the server response, so there is
 * no blank flash, no layout shift, and no dependency on JavaScript for the page to be
 * readable and correct.
 *
 * REDUCED MOTION: we return before touching anything. The end state is already on screen,
 * which is the whole point of building it this way. There is no fade-only compromise.
 *
 * ANIME.JS VERSION: pinned to 4.5.0 and written against the v4 API (`createTimeline`,
 * `utils.set`). The shadcn/anime MCP documents 3.2.1, where this was `anime.timeline()`.
 * If you port a snippet from those docs it will not compile. That is deliberate: v4 is what
 * npm resolves, so we build against what we ship rather than against the documentation.
 */

// The attribute names live in a non-client module. See lib/reveal-attrs.ts for why: a
// server component importing a constant from here gets a client reference, not a string.
export { BLOCK_ATTR, ELAPSED_ATTR, PANEL_ATTR } from "@/lib/reveal-attrs";

const REDUCED = "(prefers-reduced-motion: reduce)";

export function ReceiptReveal({
  children,
  className,
}: {
  readonly children: React.ReactNode;
  readonly className?: string;
}) {
  const root = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const el = root.current;
    if (!el) return;
    if (window.matchMedia(REDUCED).matches) return;

    const elapsed = el.querySelector<HTMLElement>(`[${ELAPSED_ATTR}]`);
    const panel = el.querySelector<HTMLElement>(`[${PANEL_ATTR}]`);
    const block = el.querySelector<HTMLElement>(`[${BLOCK_ATTR}]`);

    // The count-up is driven off a plain object, not the DOM, because the thing being
    // animated is a NUMBER we measured, not a property of an element. The element's text is
    // written on each frame. Anything we cannot parse is left exactly as the server wrote it.
    const target = elapsed?.getAttribute("data-reveal-to");
    const to = target === null || target === undefined ? Number.NaN : Number.parseFloat(target);
    const counter = { value: 0 };
    const decimals = target?.includes(".") ? (target.split(".")[1]?.length ?? 1) : 0;
    const suffix = elapsed?.getAttribute("data-reveal-suffix") ?? "";
    const animateNumber = elapsed !== null && Number.isFinite(to);

    const willChange: HTMLElement[] = [];
    const arm = (node: HTMLElement) => {
      node.style.willChange = "transform, opacity";
      willChange.push(node);
      return node;
    };

    // Wind the two moving elements back to their start state. This happens after paint, so
    // the first frame the user sees is still the finished document.
    if (panel) utils.set(arm(panel), { opacity: 0, x: 8 });
    if (block) utils.set(arm(block), { opacity: 0, y: 2 });

    const timeline = createTimeline({
      defaults: { ease: "out(3)" },
      onComplete: () => {
        for (const node of willChange) node.style.willChange = "";
        if (elapsed && animateNumber) elapsed.textContent = `${to.toFixed(decimals)}${suffix}`;
      },
    });

    if (elapsed && animateNumber) {
      elapsed.textContent = `${(0).toFixed(decimals)}${suffix}`;
      timeline.add(counter, {
        value: to,
        duration: 480,
        onUpdate: () => {
          elapsed.textContent = `${counter.value.toFixed(decimals)}${suffix}`;
        },
      });
    }
    if (panel) timeline.add(panel, { opacity: 1, x: 0, duration: 320 }, "-=340");
    if (block) timeline.add(block, { opacity: 1, y: 0, duration: 180 }, "-=140");

    return () => {
      timeline.revert();
      for (const node of willChange) node.style.willChange = "";
      if (elapsed && animateNumber) elapsed.textContent = `${to.toFixed(decimals)}${suffix}`;
      if (panel) utils.set(panel, { opacity: 1, x: 0 });
      if (block) utils.set(block, { opacity: 1, y: 0 });
    };
  }, []);

  return (
    <div ref={root} className={className}>
      {children}
    </div>
  );
}

/**
 * The measured figure. Rendered by the server with its final value, so the reduced-motion
 * path and the no-JavaScript path both read the true number rather than a zero that never
 * gets written.
 */
export function ElapsedFigure({
  value,
  suffix = "",
  className,
}: {
  readonly value: string;
  readonly suffix?: string;
  readonly className?: string;
}) {
  const attrs = { [ELAPSED_ATTR]: "", "data-reveal-to": value, "data-reveal-suffix": suffix };
  return (
    <span {...attrs} className={className}>
      {value}
      {suffix}
    </span>
  );
}
