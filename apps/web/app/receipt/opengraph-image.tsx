import { ogCard, OG_CONTENT_TYPE, OG_SIZE } from "@/lib/og";

export const alt =
  "A Slop Scorer card: a receipt is what this product returns instead of a score, and abstention is one of the shapes it can take.";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return ogCard({
    masthead: "receipts",
    headline: "A receipt, not a score.",
    claim:
      "A reproduction attempt, the measurements behind it, and an explicit account of what was not assessed. Abstention is a result, not an error.",
  });
}
