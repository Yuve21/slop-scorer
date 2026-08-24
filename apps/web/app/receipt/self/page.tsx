import type { Metadata } from "next";
import { ReceiptView } from "@/components/receipt/receipt-view";
import type { Reproduction } from "@/lib/reproduction";
import { capturedSelfScan, scanHost } from "@/lib/self-scan";
import { absolute, siteUrl } from "@/lib/site";
import { seconds } from "@/lib/view";

/**
 * Our own receipt, in full, on the same surface any other artifact gets.
 *
 * This is a static segment sitting beside [id], so Next resolves /receipt/self here and never
 * to the sample lookup. That is deliberate: "self" is not a sample, it is a reading of us.
 *
 * It reads the SAME capture the fold does, scored on this request. The browser render happens
 * in the build container (`scripts/capture-self-scan.mjs`) because the serverless runtime has
 * no browser, and asking for a live one here produced a receipt that said, on every visit,
 * that we could not finish. The claim below therefore states when the render happened instead
 * of implying it happened just now.
 *
 * The reproduction state is `not_configured`, honestly. There is no image or layout
 * reproduction pipeline wired for a live web scan in this build, and rendering an empty pair
 * of panels here would imply we tried and failed, which is a different and false claim.
 */

export const metadata: Metadata = {
  title: "Our own receipt",
  description:
    "The detector, run against this deployment, with every finding, every abstention and the arithmetic that reconciles to the number. Published whether or not it is flattering.",
  alternates: { canonical: "/receipt/self" },
  openGraph: {
    title: "Our own receipt · Slop Scorer",
    description: "The detector, run against this deployment. Published whether or not it flatters us.",
    url: absolute("/receipt/self"),
    type: "article",
  },
};

// Scored per request from the captured artifact, so this receipt reflects the corpus this
// deployment ships rather than whatever it said when a prerender happened to run.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const REPRODUCTION: Reproduction = {
  state: "not_configured",
  modality: "our own rendered web page",
  reason:
    "No reproduction pipeline is wired for a live web scan in this build, so nothing was attempted. The findings below are hygiene and rendered-style measurements, and they stand on their own citations without a recreation beside them.",
};

export default async function SelfReceiptPage() {
  const { view, commit, staleReason } = await capturedSelfScan();
  const ran = view.status !== "not_assessed";
  const when = new Date(view.ranAt).toISOString().replace("T", " ").slice(0, 16);

  return (
    <ReceiptView
      id="SELF"
      artifact={`${scanHost(view.target || siteUrl())}, scanned by itself`}
      headline={ran ? "We ran it on us." : "We could not finish this one."}
      claim={
        ran
          ? `A real browser rendered this site and read its computed styles on ${when} UTC${
              commit ? `, building commit ${commit.slice(0, 7)}` : ""
            }, and that render took ${seconds(view.elapsedMs)} seconds. Everything below was measured in it and scored by the corpus this deployment ships. We publish it whether or not it flatters us, because a detector that cannot survive its own test is not worth running.${
              staleReason ? ` ${staleReason}` : ""
            }`
          : "The scan of our own page did not produce a publishable read. That is a result about us, and we are showing it rather than the last run that happened to look good. The band below says exactly what did not run."
      }
      view={view}
      reproduction={REPRODUCTION}
      permalink={absolute("/receipt/self")}
      elapsedLabel={{ value: seconds(view.elapsedMs), suffix: " seconds" }}
    />
  );
}
