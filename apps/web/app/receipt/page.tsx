import type { Metadata } from "next";
import Link from "next/link";
import { ScanForm } from "@/components/landing/scan-form";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { isSampleId } from "@/lib/sample-ids";
import { absolute } from "@/lib/site";

/**
 * The receipt index, before an artifact is submitted.
 *
 * No illustration, no icon tile, no "Get started" gradient panel. An empty state that has to
 * be decorated is an empty state with nothing to say. This one has something to say: the four
 * sample receipts are the four honest shapes a report can take, and reading them is a better
 * use of the visitor's next thirty seconds than looking at a shape assembled out of circles.
 */

export const metadata: Metadata = {
  title: "Receipts",
  description:
    "A receipt is what this product returns instead of a score: a reproduction attempt, the measurements behind it, and an explicit account of what was not assessed.",
  alternates: { canonical: "/receipt" },
  openGraph: {
    title: "Receipts · Slop Scorer",
    description: "What this product returns instead of a score.",
    url: absolute("/receipt"),
    type: "website",
  },
};

const SHAPES: readonly { readonly id: string; readonly shape: string }[] = [
  { id: "4F2A-9C", shape: "A reproduction that worked, timed, with the disclaimer in frame" },
  { id: "8B10-2D", shape: "An abstention: we looked, and the read was not good enough to publish" },
  { id: "C7E3-51", shape: "Not assessed: no detector for this modality, and a standing refusal" },
  { id: "A05E-13", shape: "Counter-evidence: the run mostly argued in the artifact's favour" },
];

export default function ReceiptIndex() {
  return (
    <div className="mx-auto flex max-w-receipt flex-col gap-16 px-6 py-16 md:px-[72px]">
      <Empty className="items-start gap-8 p-0 text-left">
        <EmptyHeader className="max-w-none items-start gap-3">
          {/* EmptyTitle renders a div. The route still needs exactly one h1, and our own
              hygiene check measures that in a browser, so the heading element goes inside it
              rather than being faked with a font size. Caught by running our own audit
              against this route: it reported 0 h1s and it was right. */}
          <EmptyTitle>
            <h1 className="text-h1 leading-[108%] font-normal tracking-[-0.01em] text-ink">
              No receipt yet.
            </h1>
          </EmptyTitle>
          <EmptyDescription className="max-w-[72ch] text-lead text-ink-muted">
            Paste a URL or drop a file. We will try to remake it and time ourselves doing it.
            You will see the same report we publish about our own site.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent className="max-w-none items-start gap-5">
          <ScanForm />
        </EmptyContent>
      </Empty>

      <section className="flex flex-col gap-5">
        <h2 className="text-h3 font-medium text-ink">
          The four shapes a report can take, one sample each
        </h2>
        <div className="flex flex-col gap-px bg-hairline">
          {SHAPES.filter((s) => isSampleId(s.id)).map((sample) => (
            <Link
              key={sample.id}
              href={`/receipt/${sample.id}`}
              className="flex flex-wrap items-baseline gap-5 bg-surface-raised px-5 py-[18px] hover:bg-surface"
            >
              <span className="w-[13rem] shrink-0 font-mono text-mono-sm font-medium text-ink-accent">
                {sample.id}
              </span>
              <span className="text-body text-ink">{sample.shape}</span>
            </Link>
          ))}
        </div>
        <p className="max-w-[72ch] font-mono text-mono-sm text-ink-muted">
          Every artifact behind these four was made by us for this page. We do not put a
          recreation of somebody else&apos;s work in our own marketing, and a sample is
          marketing.
        </p>
      </section>
    </div>
  );
}
