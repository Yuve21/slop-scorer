import { ogCard, OG_CONTENT_TYPE, OG_SIZE } from "@/lib/og";

/**
 * Per route, not inherited. Declaring `openGraph` on a page replaces the parent's object
 * wholesale, images included, so a route with a custom og:title and no card of its own ships
 * with no og:image at all — which is a defect in our own corpus (`craft.no-og-image`).
 */

export const alt =
  "A Slop Scorer card: five artifacts, four out of a generator and one made by a person. Find it.";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return ogCard({
    masthead: "gauntlet",
    headline: "Four came out of a generator. One did not.",
    claim:
      "Five cards from the corpus this detector is calibrated against. Answer, then read the label, its stated basis, and our own reading of all five.",
  });
}
