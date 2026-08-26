/**
 * The data attributes the reveal timelines animate, in a module with NO "use client".
 *
 * They live here rather than beside the timeline for a reason worth writing down, because it
 * is invisible until it bites: a `"use client"` module's exports become client references
 * when a server component imports them. A string constant read on the server is then not a
 * string, and using it as a computed JSX key produces a garbage attribute name or throws.
 *
 * That is exactly what happened. `PANEL_ATTR` was exported from the timeline component and
 * imported by the server-rendered reproduction figure, so `data-reveal-panel` never reached
 * the HTML and beat 2 of the timeline silently animated nothing. Production built fine and
 * the page looked correct; only running the dev server surfaced it. Keep these here.
 *
 * WHAT EACH ONE EXPRESSES. Every moment on this site animates a fact, and a candidate
 * animation that cannot name the fact it is reporting does not get an attribute here.
 */

/** A measured duration counting to its value. Carries `data-reveal-to` and `data-reveal-suffix`. */
export const ELAPSED_ATTR = "data-reveal-elapsed";

/** The recreation panel, and only the recreation panel: the thing our pipeline produced. */
export const PANEL_ATTR = "data-reveal-panel";

/**
 * ONE element wrapping a whole list, revealed as a single block. Kept for any list whose rows
 * carry no ordering of their own; a stagger there would assert a sequence that did not happen.
 */
export const BLOCK_ATTR = "data-reveal-block";

/**
 * A ruled document that FEEDS OUT of the page like paper out of a printer: a bottom-up clip
 * reveal at a constant rate, with a 1px print head riding the cut. The duration is computed
 * from the element's own rendered height, so a longer receipt genuinely takes longer to print.
 * Gated on entering the viewport, because paper feeds when you get to it.
 */
export const FEED_ATTR = "data-reveal-feed";

/**
 * A row that resolves when its check resolved. Carries `ORDER_ATTR`, which is the row's index
 * in the detector's OWN `evaluated` array — the order the corpus actually ran — not its index
 * in the DOM. That is the whole justification for revealing rows in sequence at all: the
 * sequence is a fact about the run, and the spacing between rows is therefore uneven in
 * exactly the way the run was.
 */
export const ROW_ATTR = "data-reveal-row";
export const ORDER_ATTR = "data-reveal-order";

/**
 * An evidence locator, written across the line the way a machine writes it. The duration is
 * derived from the string's own length at a fixed characters-per-second, so no two locators
 * take the same time and none of it is a number anybody chose.
 */
export const WRITE_ATTR = "data-reveal-write";

/**
 * A document a read head passes over once. The ONLY beat allowed to run on something already on
 * screen, because it is the only one that is purely additive: it paints an overlay above the
 * element and never touches the element's own opacity, position or text.
 *
 * Every other attribute in this file names a beat that HIDES its target first and then restores
 * it. That is safe below the fold and it is a visible glitch above it — see the viewport rule at
 * the top of components/receipt/reveal.tsx, which is what this attribute exists to work around
 * rather than to violate.
 *
 * The sweep's duration is the element's own rendered height at the print head's constant rate,
 * so it is the same machine moving at the same speed over a different document.
 */
export const READ_ATTR = "data-reveal-read";
