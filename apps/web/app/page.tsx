import type { Metadata } from "next";
import Link from "next/link";
import { RULE_DESCRIPTORS } from "@slop/detectors-web";
import { ScanForm } from "@/components/landing/scan-form";
import { SelfScanCard } from "@/components/landing/self-scan-card";
import { ReproductionFigure } from "@/components/receipt/reproduction-figure";
import { reproductionFor } from "@/lib/reproduction";
import { sampleReceipt } from "@/lib/receipts";
import { lastSelfScan } from "@/lib/self-scan";
import { absolute, siteUrl } from "@/lib/site";

/**
 * The landing page.
 *
 * Its job is to run the detector on something in front of the visitor, immediately, and the
 * thing it runs on is US. That decision does three jobs at once: it is a live demo, so no
 * video and no explainer are needed; it is the marketing asset ("we pass our own tool, here
 * is the receipt"); and it carries zero legal exposure, because the only artifact judged
 * above the fold is our own. Every alternative names a third party in the first screen.
 *
 * The word "AI" does not appear above the fold. Neither does a logo wall, a three-card
 * pricing grid, a testimonial carousel or a stats row: every one of those is an
 * identical-card-grid tell, and with zero users any of them would be a fabrication.
 *
 * `lastSelfScan()` never starts a run, which is what makes it safe to call while server
 * rendering the page the scan targets. The browser asks for a fresh one.
 */

export const metadata: Metadata = {
  alternates: { canonical: "/" },
  openGraph: {
    title: "This page has already been scanned by the thing it sells",
    description:
      "Not a score. We reproduce the artifact and show you how long it took. The result for this URL is rendered live in the fold, and nothing is cached.",
    url: absolute("/"),
    type: "website",
  },
};

// The self-scan is a live measurement of this deployment, so this route cannot be a build
// artifact. A prerendered "scanned 12 seconds ago" would be a lie the moment it was cached.
export const dynamic = "force-dynamic";

const RULE_TITLES = Object.fromEntries(RULE_DESCRIPTORS.map((rule) => [rule.id, rule.title]));

const JSON_LD = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Slop Scorer",
  applicationCategory: "DeveloperApplication",
  operatingSystem: "Any",
  description:
    "Reproduces an artifact, reports how long the reproduction took, and cites every measurement that made the shortcut possible. Reports abstention as a first-class result.",
  url: siteUrl(),
};

export default function Home() {
  const last = lastSelfScan();
  const sample = sampleReceipt("4F2A-9C");
  const target = new URL(siteUrl()).host;

  return (
    <div className="mx-auto flex max-w-page flex-col gap-24 px-6 py-16 md:px-16">
      <script
        type="application/ld+json"
        // Structured data on the homepage only. Never on a receipt: a machine-readable
        // record of a page about somebody else's artifact is the last thing we want indexed.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }}
      />

      <section className="flex flex-col gap-8">
        {/* 52px at Regular 400. Our largest type is our lightest weight. */}
        <h1 className="max-w-[940px] text-[52px] leading-[106%] font-normal tracking-[-0.01em] text-ink">
          This page has already been scanned by the thing it sells.
        </h1>
        <p className="max-w-[760px] text-lg text-ink-muted">
          Not a score. We reproduce the artifact and show you how long it took. Below is the
          live result for this URL. Nothing is cached, and if a deploy breaks one of our own
          checks this is where you will find out.
        </p>

        <SelfScanCard initial={last?.view ?? null} ruleTitles={RULE_TITLES} target={target} />

        <ScanForm />

        <p className="max-w-[72ch] text-sm text-ink-muted">
          We do not name creators. We do not assert that anything is AI. Read the method before
          you read a receipt.
        </p>
      </section>

      {sample ? (
        <section className="flex flex-col gap-8">
          <div className="flex flex-col gap-3">
            <h2 className="max-w-[24ch] text-h2 font-normal text-ink">
              A real receipt, with the part our lawyer cares about visible before you sign up
            </h2>
            <p className="max-w-[72ch] text-lg text-ink-muted">
              When an original and a recreation appear together, the disclaimer sits inside the
              same frame, at the same size as the panel labels. That is a legal requirement, not
              a styling preference, and it is on this page so you can check it before you give
              us anything.
            </p>
          </div>
          <ReproductionFigure reproduction={reproductionFor(sample.id)} />
          <Link
            href={`/receipt/${sample.id}`}
            className="text-body text-ink-accent underline-offset-4 hover:underline"
          >
            Read the whole receipt, including what we could not assess
          </Link>
        </section>
      ) : null}

      <section id="mcp" className="flex flex-col gap-8">
        <div className="flex flex-col gap-3">
          <h2 className="max-w-[24ch] text-h2 font-normal text-ink">
            The other half is prevention
          </h2>
          <p className="max-w-[72ch] text-lg text-ink-muted">
            The same corpus is exposed to your own coding agent over MCP, so it can ask what not
            to produce before it produces it. Detection decays as generators improve. A rule
            that stops the artifact being made does not.
          </p>
        </div>
        <p className="max-w-[72ch] text-sm text-ink-muted">
          The server lives in this repository at{" "}
          <span className="font-mono text-mono-sm text-ink">packages/mcp-server</span>. There is
          no hosted install command yet, and there will not be a copy button here until there
          is something real to copy.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="max-w-[24ch] text-h2 font-normal text-ink">What this cannot see</h2>
        <p className="max-w-[72ch] text-lg text-ink-muted">
          {RULE_DESCRIPTORS.length} rules is not a verdict on taste. The scan in the fold reads
          hygiene and rendered style on one page at one viewport. It cannot read motion, audio,
          typography inside an image, or whether the writing is any good. A clean run means the
          checks that ran found nothing they know how to cite, and nothing more than that.
        </p>
        <Link href="/method" className="text-body text-ink-accent underline-offset-4 hover:underline">
          The method, in full, including the parts that argue against us
        </Link>
      </section>
    </div>
  );
}
