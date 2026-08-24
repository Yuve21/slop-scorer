import { ogCard, OG_CONTENT_TYPE, OG_SIZE } from "@/lib/og";

export const alt =
  "A Slop Scorer receipt card reading: this page has already been scanned by the thing it sells, with the standing disclaimer that we make no claim about who made anything.";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return ogCard({
    masthead: "slopscorer / live self-scan",
    headline: "We scan ourselves in the fold.",
    claim:
      "Not a score. We reproduce the artifact, time ourselves doing it, and cite every measurement. Abstention is a result, and our own result is published live.",
  });
}
