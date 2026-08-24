import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ReceiptView } from "@/components/receipt/receipt-view";
import { reproductionFor } from "@/lib/reproduction";
import { SAMPLE_IDS, sampleReceipt } from "@/lib/receipts";
import { absolute } from "@/lib/site";
import { seconds } from "@/lib/view";

/**
 * A receipt permalink.
 *
 * `notFound()` rather than a redirect. An unknown receipt id has to answer 404, because a
 * redirect to the index is a soft 200 and a soft 200 on an unknown path is one of the exact
 * defects this product's corpus flags. It is also the trap that bit the codebase this design
 * system was learned from, where an auth matcher 307'd every unmatched path to sign-in.
 */

export function generateStaticParams() {
  return SAMPLE_IDS.map((id) => ({ id }));
}

export async function generateMetadata({ params }: PageProps<"/receipt/[id]">): Promise<Metadata> {
  const { id } = await params;
  const receipt = sampleReceipt(id);
  if (!receipt) return { title: "No such receipt" };
  return {
    title: `Receipt ${receipt.id}`,
    description: `${receipt.claim} Every finding on this receipt carries the measurement it was read from.`,
    alternates: { canonical: `/receipt/${receipt.id}` },
    openGraph: {
      title: `Receipt ${receipt.id} · Slop Scorer`,
      description: receipt.claim,
      url: absolute(`/receipt/${receipt.id}`),
      type: "article",
    },
  };
}

export default async function ReceiptPage({ params }: PageProps<"/receipt/[id]">) {
  const { id } = await params;
  const receipt = sampleReceipt(id);
  if (!receipt) notFound();

  const reproduction = reproductionFor(receipt.id);
  // The count-up only replaces the headline when the headline IS the measured duration. On
  // the abstaining receipts the headline is a sentence, and animating a sentence would be
  // decoration rather than reporting.
  const elapsedLabel =
    reproduction.state === "succeeded"
      ? { value: seconds(reproduction.elapsedMs), suffix: " seconds" }
      : undefined;

  return (
    <ReceiptView
      id={receipt.id}
      artifact={receipt.artifact}
      headline={receipt.headline}
      claim={receipt.claim}
      view={receipt.view}
      reproduction={reproduction}
      permalink={absolute(`/receipt/${receipt.id}`)}
      {...(elapsedLabel ? { elapsedLabel } : {})}
    />
  );
}
