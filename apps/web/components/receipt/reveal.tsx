"use client";

import { createTimeline, utils } from "animejs";
import * as React from "react";

import {
  BLOCK_ATTR,
  ELAPSED_ATTR,
  FEED_ATTR,
  ORDER_ATTR,
  PANEL_ATTR,
  READ_ATTR,
  ROW_ATTR,
  WRITE_ATTR,
} from "@/lib/reveal-attrs";

/**
 * THE MOTION. One orchestrator per route, and this file is the only place in the app that
 * imports an animation library.
 *
 * ==== WHAT CHANGED, AND THE STANDARD IT IS HELD TO ====
 *
 * There used to be exactly one moment here, on a 500 ms budget, because design/DESIGN.md §7
 * specified one. The founder overruled that ("no animation throughout it"), and he is right,
 * but the fix is not more animation — it is more REPORTING. The bar every moment below has to
 * clear is the bar the count-up already cleared: it animates a fact, the fact is measured, and
 * the animation is how the measurement arrives. Anything that cannot name the fact it reports
 * does not get to move.
 *
 *   BEAT              WHAT IT REPORTS                                    DURATION FROM
 *   read sweep        a head passing over a document it just read        the element's height
 *   count-up          a measured wall-clock duration                     fixed 480 ms
 *   panel wipe        the artifact our pipeline produced                 fixed 320 ms
 *   row resolve       the ORDER the corpus evaluated its checks in       the run's own ordering
 *   print feed        a ruled document coming off the printer            the element's height
 *   locator write     a machine writing a citation                       the string's length
 *
 * The read sweep and the print feed share a rate (2.2 px/ms) and therefore share a duration for
 * any two elements of the same height, which is correct: it is one machine, and a machine has
 * one speed. They do not share a duration with anything else, because nothing else on the site
 * is a physical head crossing paper.
 *
 * ==== WHY THIS DOES NOT TRIP OUR OWN MOTION RULES ====
 *
 * A sibling agent is building a motion detector family whose headline rule is "every element
 * animating at an identical duration and easing". Read the table again: five beats, five
 * different durations, and three of the five derive their duration from a property of their own
 * content, which makes a uniform value impossible rather than merely unfashionable. The
 * easings are deliberately three different curves, and each is the physically correct one:
 *
 *   out(3)   count-up and panel wipe — a value settling toward a rest state
 *   out(2)   row resolve             — the same shape, softer, so rows do not snap
 *   linear   print feed              — a printer feeds paper at a CONSTANT rate. An eased
 *                                      print is a wrong print.
 *   linear   locator write           — likewise: a machine writes at constant characters/sec.
 *
 * The other two named tells are also structurally unreachable. "Uniform per-card stagger": the
 * row delays come from `ORDER_ATTR`, the detector's own evaluation index, so they are as uneven
 * as the run was, and the write phase advances by a fraction of the PREVIOUS row's
 * content-derived duration. "Infinite decorative loop": there is no `loop` in this file at all.
 * The only two loops on the site are the page backdrop's grain and scan band, argued for
 * separately in globals.css.
 *
 * ==== THE VIEWPORT RULE. READ THIS BEFORE ADDING A BEAT ====
 *
 *      NOTHING THAT IS ALREADY ON SCREEN IS EVER WOUND BACKWARDS.
 *
 * This is the fix for the founder's "refreshing the page glitches", and the glitch was ours and
 * was in this file. Measured on localhost with `scripts/repro-glitch.mjs`, three runs, identical
 * every time: the landing fold paints COMPLETE at ~170 ms — real finding count, real elapsed
 * figure, four rows at full opacity, exactly as the SSR contract below promises. Then hydration
 * lands at ~700-1000 ms, this effect runs, and `wind()` sets all four rows to `opacity: 0` and
 * rewrites the elapsed figure to `0.0`. The reader watches the card they are already reading
 * blank itself out and replay.
 *
 * So the SSR contract was being kept to the letter and broken in spirit. "The server renders the
 * finished state" is worth nothing if the client's first act is to un-render it. Winding
 * backwards is only invisible when the thing being wound is off screen, which is true of a
 * receipt's evidence list and was never true of the fold.
 *
 * `offScreen()` is therefore the gate on every subtractive beat below. An element inside the
 * viewport at hydration keeps exactly the pixels the server drew for it, forever. An element
 * below the fold — which the reader has not seen and cannot see — is wound back and animated in
 * when they scroll to it, which is the thing scroll reveals were always supposed to be.
 *
 * The one beat exempt from the rule is BEAT 0, the read sweep, and it is exempt because it is
 * additive: it paints an overlay ABOVE the card and never touches the card. There is no state to
 * take away, so there is nothing that can flash.
 *
 * This also, incidentally, deletes a whole class of future bug: no beat can any longer hide
 * something the reader is looking at, whatever a later author wires it to.
 *
 * ==== THE SSR CONTRACT, unchanged and non-negotiable ====
 *
 * The server renders the FINISHED state. The number is in the HTML, the panels are in the HTML,
 * the rows are in the HTML, every locator string is in the HTML. This component winds the
 * animation BACKWARDS from that state after hydration, inside an effect, so nothing ever ships
 * with `opacity: 0` in the server response. No blank flash, no layout shift, and the page is
 * readable and correct with JavaScript off. There is a test asserting the fold ships its
 * finished number; do not break it.
 *
 * Every start-state write goes through `wind()`, which records its own undo. If the component
 * unmounts mid-timeline, or an element is missing, the undo runs and the DOM is back to exactly
 * what the server sent. The previous version re-asserted each end state by hand in the cleanup
 * and had to remember them all; this cannot forget one.
 *
 * ==== REDUCED MOTION ====
 *
 * We return before touching anything. The end state is already on screen, which is the whole
 * point of building it this way. There is no fade-only compromise and no fast-forward, because
 * there is nothing to fast-forward to. The backdrop's two CSS loops are cancelled by name in
 * globals.css, since a 0.01 ms infinite animation still schedules a frame forever.
 *
 * ==== ANIME.JS VERSION ====
 *
 * Pinned to 4.5.0 and written against the v4 API, verified against the shipped package's own
 * type definitions (`node_modules/animejs/dist/modules/{timeline,animation,utils}`): v4 exports
 * `createTimeline`, `animate`, `utils.set`. The shadcn/anime MCP documents 3.2.1, where the
 * timeline factory is `anime.timeline()` and the import is `animejs/lib/anime.es.js`; a snippet
 * ported from those docs does not compile here. THAT MCP WAS ALSO UNREACHABLE in the session
 * that wrote this pass (`mcp__gateway__anime__*` was not registered on the gateway), so the API
 * surface below is taken from the installed package rather than from documentation for a
 * different major version — which is the better source either way, since it is what npm
 * resolves and what actually ships.
 */

export {
  BLOCK_ATTR,
  ELAPSED_ATTR,
  FEED_ATTR,
  ORDER_ATTR,
  PANEL_ATTR,
  READ_ATTR,
  ROW_ATTR,
  WRITE_ATTR,
} from "@/lib/reveal-attrs";

const REDUCED = "(prefers-reduced-motion: reduce)";

/** Paper leaves a thermal head at a roughly constant rate. This is ours, in px per ms. */
const FEED_PX_PER_MS = 2.2;
/** A feed shorter than this is a flicker; longer than this is a wait. */
const FEED_MIN_MS = 260;
const FEED_MAX_MS = 900;

/**
 * A READ head is not a print head, and it is slower. Reading is a pass that takes in a whole
 * document; printing is a pass that lays down one line at a time as fast as the paper will feed.
 *
 * These were briefly the same constant, on the reasoning that it is "the same machine". Measured
 * against the real card that carries this beat (467px tall), that gave a 260 ms sweep — over
 * before a reader's eye had arrived, which is the founder's "no transitions" complaint restated
 * as a number rather than fixed. 0.72 px/ms puts the same card at ~650 ms, which is a pass you
 * can watch. It also gives the beat a rate of its own, so it cannot share a duration with the
 * feed even by coincidence of height, and `motion.uniform-timing` gets one more thing it cannot
 * bucket together.
 */
const READ_PX_PER_MS = 0.72;
const READ_MIN_MS = 420;
const READ_MAX_MS = 1100;

/** A machine writes at a constant rate. This is ours, in characters per ms. */
const WRITE_CHARS_PER_MS = 0.34;
const WRITE_MIN_MS = 130;
const WRITE_MAX_MS = 420;
/** How far into a locator the next one starts. Not a fixed delay: a fraction of a real length. */
const WRITE_OVERLAP = 0.38;
/** Beyond this many locators the page is a wall of text and the writing becomes a wait. */
const WRITE_LIMIT = 8;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/**
 * THE GATE. True when none of the element is inside the viewport right now, and therefore when
 * it is safe to take its finished state away and animate it back.
 *
 * Read at hydration, once per element, from a single `getBoundingClientRect()`. Deliberately
 * NOT an IntersectionObserver: an observer is asynchronous, and by the time its first callback
 * ran the timeline would already have hidden the row. The question here is not "is it visible
 * eventually", it is "is the reader looking at it at the instant I am about to hide it", and
 * that question only has a synchronous answer.
 *
 * The 4px inset means an element whose last four pixels are peeking over the fold counts as off
 * screen. A sliver is not something the reader is reading, and treating it as visible would
 * leave a half-caught row permanently un-animated for no gain.
 */
const offScreen = (node: HTMLElement): boolean => {
  const r = node.getBoundingClientRect();
  // A zero-area element (display:none, or a collapsed ancestor) is not on screen either, and
  // reporting it as visible would silently disable a beat on a tab that is not open yet.
  if (r.width === 0 && r.height === 0) return true;
  return r.bottom <= 4 || r.top >= (window.innerHeight || 0) - 4;
};

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

    const undo: Array<() => void> = [];
    const wind = (node: HTMLElement, apply: () => void, revert: () => void) => {
      node.style.willChange = "transform, opacity, clip-path";
      undo.push(() => {
        node.style.willChange = "";
        revert();
      });
      apply();
      return node;
    };
    const done = () => {
      while (undo.length > 0) undo.pop()?.();
    };

    const timeline = createTimeline({ defaults: { ease: "out(3)" }, onComplete: done });
    const teardown: Array<() => void> = [];

    // ---------------------------------------------------------------------------------------
    // BEAT 0. A read head passes down the document, once.
    //
    // THE ONLY BEAT THAT MAY RUN ON SOMETHING ALREADY ON SCREEN, because it is the only one that
    // adds rather than subtracts: the sweep is painted by `[data-reading]::after` in globals.css,
    // above the card, and the card's own opacity, position and text are never touched. There is
    // no start state, so there is no undo, so there is nothing that can flash.
    //
    // Its duration is the element's own rendered height at READ_PX_PER_MS, which is the read
    // head's own rate and slower than the print head's: reading a document and printing one are
    // not the same pass. A tall card is read for longer than a short one, and the only way to get
    // two identical sweeps is two identically tall cards.
    //
    // Runs on its own timeline, not the main one, for the same reason the feed does: it must own
    // its own lifetime rather than inherit the main timeline's completion.
    // ---------------------------------------------------------------------------------------
    for (const doc of el.querySelectorAll<HTMLElement>(`[${READ_ATTR}]`)) {
      const height = doc.getBoundingClientRect().height;
      if (height < 40) continue;
      const duration = clamp(height / READ_PX_PER_MS, READ_MIN_MS, READ_MAX_MS);
      const head = { pct: -10 };
      const paint = () => doc.style.setProperty("--read", `${head.pct}%`);
      const clear = () => {
        doc.style.removeProperty("--read");
        doc.removeAttribute("data-reading");
      };

      doc.setAttribute("data-reading", "");
      paint();
      const run = createTimeline({ onComplete: clear });
      // Linear. A read head crosses a page at a constant rate, exactly as a print head feeds it.
      run.add(head, { pct: 110, duration, ease: "linear", onUpdate: paint });
      teardown.push(() => {
        run.revert();
        clear();
      });
    }

    // ---------------------------------------------------------------------------------------
    // BEAT 1. The measured duration counts to its value.
    //
    // Driven off a plain object rather than the DOM, because the thing being animated is a
    // NUMBER we measured, not a property of an element: the element's text is written on each
    // frame. Anything unparseable is left exactly as the server wrote it.
    // ---------------------------------------------------------------------------------------
    const elapsed = el.querySelector<HTMLElement>(`[${ELAPSED_ATTR}]`);
    const target = elapsed?.getAttribute("data-reveal-to");
    const to = target === null || target === undefined ? Number.NaN : Number.parseFloat(target);
    const suffix = elapsed?.getAttribute("data-reveal-suffix") ?? "";
    const decimals = target?.includes(".") ? (target.split(".")[1]?.length ?? 1) : 0;

    // Gated: on the landing page this figure is in the fold and the server already wrote the
    // real number into it. Resetting it to 0.0 in front of the reader was half of the glitch.
    if (elapsed && Number.isFinite(to) && offScreen(elapsed)) {
      const node = elapsed;
      const finished = `${to.toFixed(decimals)}${suffix}`;
      const counter = { value: 0 };
      wind(
        node,
        () => {
          node.textContent = `${(0).toFixed(decimals)}${suffix}`;
        },
        () => {
          node.textContent = finished;
        },
      );
      timeline.add(counter, {
        value: to,
        duration: 480,
        onUpdate: () => {
          node.textContent = `${counter.value.toFixed(decimals)}${suffix}`;
        },
      });
    }

    // ---------------------------------------------------------------------------------------
    // BEAT 2. The recreation panel wipes in beside the submitted one.
    //
    // Only the recreation. The submitted panel and, critically, the disclaimer band are never
    // touched: the band is a compliance artifact that must sit in the same frame as both panels
    // at every moment, so no timeline on this site may clip, fade or translate it. Nothing here
    // selects it, and `FEED_ATTR` is deliberately absent from the figure for the same reason —
    // a top-down clip reveal would pass THROUGH the band, and the rule is to animate around it.
    // ---------------------------------------------------------------------------------------
    const panel = el.querySelector<HTMLElement>(`[${PANEL_ATTR}]`);
    if (panel && offScreen(panel)) {
      wind(
        panel,
        () => utils.set(panel, { opacity: 0, x: 8 }),
        () => utils.set(panel, { opacity: 1, x: 0 }),
      );
      timeline.add(panel, { opacity: 1, x: 0, duration: 320 }, "-=340");
    }

    // ---------------------------------------------------------------------------------------
    // BEAT 3a. Rows resolve in the order the corpus evaluated them.
    //
    // `ORDER_ATTR` is the row's index in the detector's `evaluated` array. A row whose check ran
    // fourth lands fourth, and a row whose check ran thirtieth lands late — so the spacing is
    // uneven, and it is uneven because the run was. This is the one thing that makes a
    // sequential reveal of a list honest: without the ordering datum it would be a uniform
    // per-card stagger asserting a discovery order that never happened, which is a tell we
    // encode and a lie about our own output.
    // ---------------------------------------------------------------------------------------
    // Gated as a GROUP, not per row, and that distinction matters: gating each row on its own
    // would animate the rows below the fold while the rows above it sat still, which is a list
    // resolving in two different ways at once. Either the whole list was unseen or it was not.
    const rows = [...el.querySelectorAll<HTMLElement>(`[${ROW_ATTR}]`)];
    if (rows.length > 0 && rows.every(offScreen)) {
      const orders = rows.map((r) => Number.parseFloat(r.getAttribute(ORDER_ATTR) ?? "") || 0);
      const span = Math.max(1, ...orders);
      for (const [i, row] of rows.entries()) {
        wind(
          row,
          () => utils.set(row, { opacity: 0, x: -4 }),
          () => utils.set(row, { opacity: 1, x: 0 }),
        );
        // 340 ms of wall clock, distributed by real evaluation position rather than by index.
        const at = ((orders[i] ?? 0) / span) * 340;
        timeline.add(row, { opacity: 1, x: 0, duration: 190, ease: "out(2)" }, at);
      }
    }

    // ---------------------------------------------------------------------------------------
    // BEAT 3b. A list with no ordering of its own arrives as ONE block.
    //
    // Kept, and still the right answer wherever `ORDER_ATTR` is unavailable: revealing rows in
    // sequence with nothing to sequence them by is decoration pretending to be data.
    // ---------------------------------------------------------------------------------------
    const block = el.querySelector<HTMLElement>(`[${BLOCK_ATTR}]`);
    if (block && offScreen(block)) {
      wind(
        block,
        () => utils.set(block, { opacity: 0, y: 2 }),
        () => utils.set(block, { opacity: 1, y: 0 }),
      );
      timeline.add(block, { opacity: 1, y: 0, duration: 180 }, "-=140");
    }

    // ---------------------------------------------------------------------------------------
    // BEAT 4. The document prints.
    //
    // A bottom-up clip reveal at a constant px-per-ms, with a 1px print head riding the cut
    // (drawn in CSS off the `--feed` custom property this writes each frame). LINEAR, because a
    // printer does not ease. The duration is the element's own rendered height divided by the
    // feed rate, so a receipt with twelve findings visibly takes longer to come out than one
    // with three, and no two feeds on the site share a duration unless two documents happen to
    // be the same height.
    //
    // Each feed runs on its OWN timeline gated by an IntersectionObserver, not on the main one:
    // paper feeds when you reach it, and a print that finished silently while you were four
    // screens up is a print nobody saw.
    // ---------------------------------------------------------------------------------------
    for (const feed of el.querySelectorAll<HTMLElement>(`[${FEED_ATTR}]`)) {
      const height = feed.getBoundingClientRect().height;
      if (height < 40) continue;
      // A document already on screen at load has already been read. Clipping it to zero height
      // and feeding it back out is the blank-flash this whole file is built to avoid, and the
      // observer below would not save us: it fires immediately for something already visible,
      // by which point the clip is applied. The observer answers "when"; this answers "whether".
      if (!offScreen(feed)) continue;
      const duration = clamp(height / FEED_PX_PER_MS, FEED_MIN_MS, FEED_MAX_MS);
      const cut = { pct: 100 };
      const paint = () => {
        feed.style.clipPath = `inset(0 0 ${cut.pct}% 0)`;
        feed.style.setProperty("--feed", `${100 - cut.pct}%`);
      };
      const clear = () => {
        feed.style.clipPath = "";
        feed.style.removeProperty("--feed");
        feed.removeAttribute("data-feeding");
      };

      // NOT `wind()`. This one is deliberately outside the main timeline's undo stack, and the
      // reason is a bug this file shipped for one revision: `wind` registers its revert with the
      // main timeline, the main timeline completes in about 2 s, and its completion therefore
      // un-clipped every feed that had not been scrolled to yet. The result was a document that
      // sat clipped to zero height for two seconds and then snapped in — the exact blank-flash
      // failure the whole SSR contract exists to prevent, reintroduced by the cleanup. A
      // scroll-gated animation must own its own lifetime.
      feed.style.willChange = "clip-path";
      feed.setAttribute("data-feeding", "");
      paint();

      const run = createTimeline({
        onComplete: () => {
          feed.style.willChange = "";
          clear();
        },
      });
      run.add(cut, { pct: 0, duration, ease: "linear", onUpdate: paint });
      run.pause();

      const release = () => {
        window.clearTimeout(failsafe);
        observer.disconnect();
        run.play();
      };
      // A document that is never scrolled to must not stay clipped forever. Find-in-page and
      // anchor jumps both scroll and would trip the observer, but a reader who simply leaves the
      // tab open on a tall screen would otherwise have content hidden by a decoration. Eight
      // seconds is well past any reasonable reading of the screen above it.
      const failsafe = window.setTimeout(release, 8000);
      const observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) if (entry.isIntersecting) release();
        },
        { rootMargin: "0px 0px -12% 0px" },
      );
      observer.observe(feed);
      teardown.push(() => {
        window.clearTimeout(failsafe);
        observer.disconnect();
        run.revert();
        feed.style.willChange = "";
        clear();
      });
    }

    // ---------------------------------------------------------------------------------------
    // BEAT 5. The locators get written.
    //
    // A left-to-right gradient mask sweeps each citation, at a constant characters-per-ms taken
    // from that citation's own length. A mask rather than a substring write, for two reasons
    // that are both about honesty rather than polish: writing `textContent` character by
    // character reflows the block on every frame, and it would mean the server shipping
    // something other than the finished string.
    //
    // The mask is angled 104deg so a citation that wraps to three lines is written across all
    // three the way a head crosses a page, instead of revealing the left third of every line at
    // once.
    //
    // The spacing between lines is a FRACTION OF THE PREVIOUS LINE'S OWN DURATION, so it is a
    // function of content length rather than a constant delay. Two locators of identical length
    // is the only way to get two identical intervals here.
    // ---------------------------------------------------------------------------------------
    const writes = [...el.querySelectorAll<HTMLElement>(`[${WRITE_ATTR}]`)]
      // Same rule, applied per line rather than per group: a citation is a self-contained string
      // and masking the ones below the fold while leaving the visible ones alone is coherent,
      // where doing that to a resolving list would not be.
      .filter(offScreen)
      .slice(0, WRITE_LIMIT);
    let cursor = 0;
    for (const line of writes) {
      const chars = (line.textContent ?? "").trim().length;
      if (chars === 0) continue;
      const duration = clamp(chars / WRITE_CHARS_PER_MS, WRITE_MIN_MS, WRITE_MAX_MS);
      const head = { at: -12 };
      const paint = () => {
        const mask = `linear-gradient(104deg, rgb(0 0 0) ${head.at}%, rgb(0 0 0) ${head.at + 3}%, transparent ${head.at + 13}%)`;
        line.style.maskImage = mask;
        line.style.setProperty("-webkit-mask-image", mask);
      };
      const clear = () => {
        line.style.maskImage = "";
        line.style.removeProperty("-webkit-mask-image");
      };

      wind(line, paint, clear);
      timeline.add(head, { at: 112, duration, ease: "linear", onUpdate: paint }, cursor);
      cursor += duration * WRITE_OVERLAP;
    }

    // ---------------------------------------------------------------------------------------
    // WHEN THE MAIN TIMELINE PLAYS.
    //
    // Not "immediately", which is what it used to do and which wasted every beat it owned. The
    // viewport rule above means the only things left on this timeline are things OFF SCREEN, and
    // a timeline that plays them at hydration finishes revealing them roughly a second before the
    // reader has scrolled anywhere near. Measured on the landing page: the recreation panel wiped
    // in at 1044 ms, in one frame, four screens below the fold. The beat ran and nobody saw it,
    // which from the reader's side is indistinguishable from it not existing — and "there are no
    // transitions" is exactly what the founder reported.
    //
    // So the timeline is built paused and released when the reveal root reaches the viewport, the
    // same contract the print feed has had all along. Same 8 s failsafe, for the same reason: a
    // reader on a very tall screen who never scrolls must not be left with content held back by
    // a decoration. If the root is ALREADY on screen there is nothing on this timeline anyway
    // (everything inside it was skipped), so it is released at once and plays an empty second.
    // ---------------------------------------------------------------------------------------
    timeline.pause();
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      window.clearTimeout(failsafe);
      observer.disconnect();
      timeline.play();
    };
    const failsafe = window.setTimeout(release, 8000);
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) if (entry.isIntersecting) release();
      },
      { rootMargin: "0px 0px -10% 0px" },
    );
    observer.observe(el);

    return () => {
      window.clearTimeout(failsafe);
      observer.disconnect();
      timeline.revert();
      for (const drop of teardown) drop();
      done();
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
