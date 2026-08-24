"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/kbd";
import { Toaster } from "@/components/ui/sonner";
import type { ScanView } from "@/lib/view";

/**
 * The actions at the foot of a receipt.
 *
 * THE EXPORT BUTTON, AND THE CONDITION IT SHIPPED UNDER. design/SURFACES.md §A.9 asks for
 * "Export this receipt" as the primary action. This build originally shipped the permalink
 * instead, and said why: design/SELF-AUDIT.md risk 3 names the export as the place the
 * equal-prominence disclaimer degrades, because the PNG is what travels and it is rendered by
 * a code path legal review never opens. A button producing an unverified PNG of the most
 * legally sensitive artifact on the site was the worst available option.
 *
 * That reasoning has not changed; the facts have. `packages/reproduce` composes the figure,
 * `renderFigureExport` encodes it and then re-reads the ENCODED BYTES with the OCR checker, and
 * `/api/receipt/[id]/export` serves only what passes. The same compositor is rendered, OCR'd and
 * mutation-tested at every export size by the suite in that package, and again end to end
 * through this route by `apps/web/test/export-route.test.ts`.
 *
 * So the button has three states and the third one is the important one:
 *
 *   AVAILABLE   only when the receipt HAS a figure. A reproduction that was refused, failed or
 *               never ran has no side-by-side, and there is nothing honest to export.
 *   GENERATING  the composition and its verification are real work, on the server, per size.
 *   REFUSED     the server declined to emit the file because the disclaimer could not be
 *               verified in the finished pixels. This is not an error message we are embarrassed
 *               by, so it is stated plainly and left on the page rather than flashed in a toast.
 *
 * The permalink stays. It is the only artifact that carries the whole receipt, and it remains the
 * safest thing to hand someone.
 *
 * The method dialog is the substantiation surface. FTC substantiation (In re Workado) is the
 * top-ranked risk in the legal memo, and the answer to it is that every claim on the receipt
 * is one click from the measurement that supports it.
 */

/** What the export endpoint answers with when it declines. Mirrors the route's shape. */
interface ExportRefusal {
  readonly refused?: string;
  readonly detail?: string;
  readonly problems?: readonly string[];
}

type ExportState =
  | { readonly kind: "available" }
  | { readonly kind: "generating" }
  | { readonly kind: "refused"; readonly detail: string; readonly problems: readonly string[] };

function ExportAction({ href }: { readonly href: string }) {
  const [state, setState] = React.useState<ExportState>({ kind: "available" });

  const run = async () => {
    setState({ kind: "generating" });
    try {
      const response = await fetch(href, { headers: { accept: "image/png" } });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as ExportRefusal;
        setState({
          kind: "refused",
          detail:
            body.detail ??
            "The server declined to emit the file and did not say why, which we are treating as a refusal.",
          problems: body.problems ?? [],
        });
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      // The server already named the file after the receipt and the size. A blob download does
      // not honour Content-Disposition, so the name is read out of it rather than re-invented
      // here, where it would drift from the one the endpoint reports.
      anchor.download =
        /filename="([^"]+)"/.exec(response.headers.get("content-disposition") ?? "")?.[1] ?? "receipt.png";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setState({ kind: "available" });
      toast.success("Exported.", {
        description:
          "Both panels and the full-size disclaimer, inside one border. The band was read back out of the finished image before the file was sent.",
      });
    } catch {
      // A network failure is indistinguishable from a refusal from here, and the honest reading
      // of "we did not receive a verified file" is that there is no file.
      setState({
        kind: "refused",
        detail:
          "We could not reach the export endpoint, so no file was produced. Nothing was written to your machine.",
        problems: [],
      });
    }
  };

  return (
    <div className="flex w-full flex-col gap-3">
      <Button
        onClick={run}
        disabled={state.kind === "generating"}
        className="h-auto w-fit rounded-sm bg-ink-accent px-[22px] py-[14px] text-body text-ink-accent-fg hover:bg-ink-accent/90"
      >
        {state.kind === "generating" ? "Composing and checking the figure…" : "Export this figure as a PNG"}
      </Button>
      {state.kind === "refused" ? (
        <div
          role="status"
          className="max-w-[76ch] border border-border-control bg-surface-raised p-4"
        >
          <p className="font-mono text-mono-md font-medium text-ink">
            THE EXPORT WAS REFUSED. NO FILE WAS PRODUCED.
          </p>
          <p className="mt-2 font-mono text-mono-sm text-ink">{state.detail}</p>
          {state.problems.length > 0 ? (
            <ul className="mt-2 list-disc pl-5 font-mono text-mono-sm text-ink-muted">
              {state.problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          ) : null}
          <p className="mt-2 max-w-[70ch] font-mono text-mono-sm text-ink-muted">
            The permalink below carries the whole receipt, disclaimer included, and is unaffected.
          </p>
        </div>
      ) : null}
    </div>
  );
}

export function ReceiptActions({
  view,
  permalink,
  exportHref,
}: {
  readonly view: ScanView;
  readonly permalink: string;
  /** Present only on receipts that HAVE a figure. Absent means no button, not a disabled one. */
  readonly exportHref?: string;
}) {
  const [copying, setCopying] = React.useState(false);

  const copy = async () => {
    setCopying(true);
    try {
      await navigator.clipboard.writeText(permalink);
      toast.success("Permalink copied.", {
        description: "It resolves to this exact receipt, disclaimer included.",
      });
    } catch {
      // Clipboard access can be refused by the browser, and saying so is more useful than a
      // success toast that lied. The URL is in the address bar either way.
      toast("We could not reach your clipboard.", {
        description: `Your browser refused the request. The address is ${permalink}`,
      });
    } finally {
      setCopying(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {exportHref ? <ExportAction href={exportHref} /> : null}

      <div className="flex flex-wrap items-center gap-4">
        <Button
          onClick={copy}
          disabled={copying}
          variant={exportHref ? "outline" : "default"}
          className={
            exportHref
              ? "h-auto rounded-sm border-border-control bg-surface-raised px-[22px] py-[14px] text-body text-ink"
              : "h-auto rounded-sm bg-ink-accent px-[22px] py-[14px] text-body text-ink-accent-fg hover:bg-ink-accent/90"
          }
        >
          Copy the permalink to this receipt
        </Button>

        <Dialog>
          <DialogTrigger asChild>
            <Button
              variant="outline"
              className="h-auto rounded-sm border-border-control bg-surface-raised px-[22px] py-[14px] text-body text-ink"
            >
              Show the prompt and the method
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[80vh] max-w-2xl overflow-auto rounded-[6px] border-border-control bg-surface-raised">
            <DialogHeader>
              <DialogTitle className="text-h3 font-medium text-ink">
                How this run was produced
              </DialogTitle>
              <DialogDescription className="text-sm text-ink-muted">
                Everything needed to repeat it. If you cannot repeat it, the receipt is worthless
                and we would rather you found that out here.
              </DialogDescription>
            </DialogHeader>
            <dl className="grid gap-4 md:grid-cols-[13rem_1fr]">
              <dt className="font-mono text-mono-sm text-ink-muted">Artifact</dt>
              <dd className="font-mono text-mono-sm break-all text-ink">{view.target}</dd>

              <dt className="font-mono text-mono-sm text-ink-muted">Run at</dt>
              <dd className="font-mono text-mono-sm text-ink">{view.ranAt}</dd>

              <dt className="font-mono text-mono-sm text-ink-muted">Corpus version</dt>
              <dd className="font-mono text-mono-sm text-ink">{view.corpusVersion}</dd>

              <dt className="font-mono text-mono-sm text-ink-muted">Rules evaluated</dt>
              <dd className="font-mono text-mono-sm text-ink">
                {view.evaluated.length} of {view.corpusSize}
              </dd>

              <dt className="font-mono text-mono-sm text-ink-muted">What was examined</dt>
              <dd className="max-w-[60ch] font-mono text-mono-sm text-ink">
                {view.coverageExamined} ({Math.round(view.coverageRatio * 100)}% of the probe
                weight this detector can collect)
              </dd>

              <dt className="font-mono text-mono-sm text-ink-muted">Inferred findings</dt>
              <dd className="max-w-[60ch] text-sm text-ink">
                {view.inferredCount} of {view.findings.length + view.counterEvidence.length}. Every
                other line is a measurement read off the rendered page. This number is derived
                from the evidence kind each detector declares, so if a probabilistic detector is
                ever added it moves on its own.
              </dd>

              <dt className="font-mono text-mono-sm text-ink-muted">Standing disclaimer</dt>
              <dd className="max-w-[60ch] text-sm text-ink">{view.disclaimer}</dd>
            </dl>
            <p className="text-sm text-ink-muted">
              Press <Kbd>Esc</Kbd> to close. Every rule id on this page links to its full
              definition on the method page.
            </p>
          </DialogContent>
        </Dialog>
      </div>

      <Toaster position="bottom-right" />
    </div>
  );
}
