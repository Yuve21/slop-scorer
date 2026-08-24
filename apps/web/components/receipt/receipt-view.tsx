import type { Reproduction } from "@/lib/reproduction";
import type { ScanView } from "@/lib/view";
import { seconds } from "@/lib/view";
import { AbstentionBand } from "./abstention-band";
import { Arithmetic } from "./arithmetic";
import { EvidenceList } from "./evidence-list";
import { ReceiptActions } from "./receipt-actions";
import { ElapsedFigure, ReceiptReveal } from "./reveal";
import { ReproductionFigure } from "./reproduction-figure";

/**
 * The receipt. Order is fixed by design/SURFACES.md §A and the order is the argument:
 *
 *   masthead, hairline, elapsed figure, claim sentence, FIGURE, evidence, what we could not
 *   assess, the arithmetic, actions.
 *
 * A visitor who reads exactly one thing reads a measured duration. What is deliberately NOT
 * in the first three seconds: any percentage, any gauge, any red, and any word resembling
 * "detected", "fake", "AI-generated" or "confidence".
 *
 * The whole thing is wrapped in ONE ReceiptReveal, which is the route's only animation.
 */
export function ReceiptView({
  id,
  artifact,
  headline,
  claim,
  view,
  reproduction,
  permalink,
  exportHref,
  elapsedLabel,
}: {
  readonly id: string;
  readonly artifact: string;
  readonly headline: string;
  readonly claim: string;
  readonly view: ScanView;
  readonly reproduction: Reproduction;
  readonly permalink: string;
  /**
   * The export endpoint for this receipt's figure, when it HAS one.
   *
   * Passed in rather than derived here, because whether a figure exists is a property of the
   * reproduction and the button must not appear on a receipt where nothing was reproduced.
   */
  readonly exportHref?: string;
  /** Overrides the headline with a counted-up figure when the headline IS a duration. */
  readonly elapsedLabel?: { readonly value: string; readonly suffix: string };
}) {
  const cited = view.findings.length + view.counterEvidence.length;
  const stamp = new Date(view.ranAt)
    .toISOString()
    .replace("T", " ")
    .replace(/:\d\d\.\d+Z$/, " UTC");

  return (
    <ReceiptReveal className="mx-auto flex max-w-receipt flex-col gap-11 px-6 py-11 md:px-[72px] md:py-16">
      <header className="flex flex-col gap-5">
        <div className="flex flex-wrap items-baseline justify-between gap-4 border-b border-hairline pb-4">
          <p className="font-mono text-mono-xs font-medium tracking-[0.06em] text-ink uppercase">
            Slop Scorer / Receipt
          </p>
          <p className="font-mono text-mono-xs font-medium tracking-[0.06em] text-ink-muted uppercase">
            {id} · {stamp}
          </p>
        </div>

        {/* The largest object on the page is a measured duration, set at Regular 400. Our
            largest type is our lightest weight: every human comparable we measured sets its
            headline lighter than expected, and a bold hero was one of the things that read
            machine-made on the site this design system was learned from. */}
        <h1 className="max-w-[20ch] text-display font-normal text-ink">
          {elapsedLabel ? (
            <ElapsedFigure value={elapsedLabel.value} suffix={elapsedLabel.suffix} />
          ) : (
            headline
          )}
        </h1>

        <p className="max-w-[72ch] text-lead text-ink">{claim}</p>

        <p className="max-w-[72ch] font-mono text-mono-sm text-ink-muted">
          Artifact: {artifact}. Scanned {view.target}.
        </p>
      </header>

      <ReproductionFigure reproduction={reproduction} />

      <section aria-labelledby="evidence-heading" className="flex flex-col gap-5">
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <h2 id="evidence-heading" className="text-h3 font-medium text-ink">
            What let us shortcut it
          </h2>
          {/* `inferred` is derived from the evidence kinds the detectors declared. It is a
              standing promise with teeth: the moment a heuristic finding ships it stops
              being zero, in public, on every receipt. */}
          <p className="font-mono text-mono-sm text-ink-muted">
            {cited} {cited === 1 ? "citation" : "citations"} · {view.inferredCount} inferred
          </p>
        </div>

        {cited === 0 ? (
          <p className="max-w-[72ch] border border-hairline bg-surface-raised p-5 text-body text-ink">
            No rule in this corpus fired on this artifact. That is not a clean bill of health
            and we are not offering it as one: it means the {view.evaluated.length} checks that
            ran found nothing they know how to cite. Read the band below for what did not run.
          </p>
        ) : (
          <EvidenceList findings={[...view.findings, ...view.counterEvidence]} />
        )}
      </section>

      <AbstentionBand view={view} />

      <Arithmetic view={view} />

      <ReceiptActions view={view} permalink={permalink} {...(exportHref ? { exportHref } : {})} />
    </ReceiptReveal>
  );
}

/** Split "8.4 seconds" into an animatable figure and its unit, or return null. */
export function elapsedHeadline(elapsedMs: number, status: ScanView["status"]) {
  if (status !== "assessed" && elapsedMs <= 0) return null;
  return { value: seconds(elapsedMs), suffix: " seconds" };
}
