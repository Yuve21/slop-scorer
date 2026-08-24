import { ogCard, OG_CONTENT_TYPE, OG_SIZE } from "@/lib/og";

/**
 * Per route, not inherited.
 *
 * Declaring `openGraph` in a page's metadata replaces the parent's `openGraph` object
 * wholesale, images included, so a route that sets a custom og:title silently loses the
 * root og:image. Our own audit caught exactly that on this route and on /receipt. The fix is
 * a real per-route card rather than a re-declared image URL, because the card should say
 * something true about the route it belongs to.
 */

export const alt =
  "A Slop Scorer card: every rule in the corpus is published with its weight and the conditions under which it is wrong.";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return ogCard({
    masthead: "method",
    headline: "Every rule, published.",
    claim:
      "Weight, reason, and the conditions under which each one is wrong. A detector that publishes findings but not its corpus is asking to be trusted.",
  });
}
