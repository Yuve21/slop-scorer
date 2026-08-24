/**
 * The three data attributes the reveal timeline animates, in a module with NO "use client".
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
 */

/** Beat 1: the count-up. Carries `data-reveal-to` and `data-reveal-suffix`. */
export const ELAPSED_ATTR = "data-reveal-elapsed";
/** Beat 2: the recreation panel, and only the recreation panel. */
export const PANEL_ATTR = "data-reveal-panel";
/** Beat 3: ONE element wrapping the whole evidence list. Never the rows. */
export const BLOCK_ATTR = "data-reveal-block";
