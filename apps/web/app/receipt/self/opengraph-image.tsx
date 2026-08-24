import { ogCard, OG_CONTENT_TYPE, OG_SIZE } from "@/lib/og";

export const alt =
  "A Slop Scorer card: our own detector, run against our own deployment, published whether or not the result flatters us.";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return ogCard({
    masthead: "receipt / self",
    headline: "We ran it on us.",
    claim:
      "Every finding, every abstention and the arithmetic that reconciles to the number, for this deployment. A detector that cannot survive its own test is not worth running.",
  });
}
