import { ogCard, OG_CONTENT_TYPE, OG_SIZE } from "@/lib/og";

/**
 * Per route, not inherited. A page that declares its own `openGraph` object replaces the
 * parent's images too, and a route with no card of its own then ships with no og:image at all,
 * which our own corpus flags as `craft.no-og-image`.
 *
 * The headline is the credential's own shape rather than a slogan, and it deliberately does not
 * contain the two words this package exists to never ship.
 */

export const alt =
  "A Slop Scorer card: a record of the making, never a claim about the maker.";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return ogCard({
    masthead: "notary",
    headline: "A record of the making.",
    claim:
      "A recorded process shows that a tool was operated over time. It does not show who operated it. Every credential says so, in the same breath as everything else it says.",
  });
}
