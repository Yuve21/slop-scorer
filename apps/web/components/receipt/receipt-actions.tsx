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
 * The two actions at the foot of a receipt.
 *
 * DEVIATION from design/SURFACES.md §A.9, stated with its reason. That spec's primary action
 * is "Export this receipt", rendering the figure including the disclaimer band as a PNG. The
 * export path is the legally important one, because a cropped share image is how a receipt
 * actually travels, and design/SELF-AUDIT.md risk 3 says the first test in the repo should be
 * one that renders every export size and asserts the disclaimer is present at or above the
 * panel-label pixel height. That renderer and that test are not built. Shipping a button that
 * produces an unverified PNG of the most legally sensitive artifact on the site would be the
 * single worst thing in this build, so the primary action is a real one that works today: it
 * copies the permalink, which travels with the whole page and therefore with the disclaimer.
 *
 * The method dialog is the substantiation surface. FTC substantiation (In re Workado) is the
 * top-ranked risk in the legal memo, and the answer to it is that every claim on the receipt
 * is one click from the measurement that supports it.
 */
export function ReceiptActions({
  view,
  permalink,
}: {
  readonly view: ScanView;
  readonly permalink: string;
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
    <div className="flex flex-wrap items-center gap-4">
      <Button
        onClick={copy}
        disabled={copying}
        className="h-auto rounded-sm bg-ink-accent px-[22px] py-[14px] text-body text-ink-accent-fg hover:bg-ink-accent/90"
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

      <Toaster position="bottom-right" />
    </div>
  );
}
