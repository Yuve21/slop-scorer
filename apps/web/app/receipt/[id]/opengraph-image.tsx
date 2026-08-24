import { ogCard, OG_CONTENT_TYPE, OG_SIZE } from "@/lib/og";
import { sampleReceipt } from "@/lib/receipts";

export const alt =
  "A Slop Scorer receipt card: the measured duration, one sentence describing what we did, and the standing disclaimer that we make no claim about who made the artifact.";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const receipt = sampleReceipt(id);
  return ogCard({
    masthead: receipt ? `receipt ${receipt.id}` : "no such receipt",
    headline: receipt?.headline ?? "Not assessed.",
    claim:
      receipt?.claim ??
      "There is no receipt at this address, so nothing was examined. Absence of a finding is not a finding.",
  });
}
