"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import type { Availability } from "@/lib/mcp";

/**
 * A command, its copy button, and the label that says whether it will work for you.
 *
 * The availability label is not decoration and it is not a badge component. It is the reason
 * this block exists in the shape it does: two of the commands on `/mcp` cannot succeed today,
 * because the package is unpublished and the repository is private, and a copy button next to a
 * command that 404s is the exact species of confident, unearned claim this product sells the
 * detection of. So the label sits in the same row as the button, at the same size, and it is
 * derived from a constant in `lib/mcp.ts` rather than typed per block.
 *
 * There is no colour in the label. The palette has no severity ramp by design (design/DESIGN.md
 * §2), and "you cannot run this yet" is not an error state.
 *
 * The copied confirmation is a label swap inside a `role="status"`, not a toast: the toaster in
 * this app is mounted by the receipt actions, and a second copy of it on the landing page would
 * be two live regions competing to announce two different things.
 */

const AVAILABILITY_LABEL: Record<Availability, string> = {
  "works-today": "Works today",
  "needs-publish": "Not on npm yet",
  "needs-public-repo": "Needs a checkout",
};

export function CommandBlock({
  label,
  command,
  availability,
  note,
  tone = "primary",
}: {
  readonly label: string;
  readonly command: string;
  readonly availability: Availability;
  readonly note?: string;
  /** `primary` is a document you act on: a control border. `quiet` is a document you read. */
  readonly tone?: "primary" | "quiet";
}) {
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2400);
    return () => clearTimeout(timer);
  }, [copied]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
    } catch {
      // A refused clipboard is a real outcome, and pretending otherwise is a lie about a fact
      // the reader can check in one second. The command is selectable text either way.
      setCopied(false);
      window.getSelection()?.removeAllRanges();
    }
  };

  const runnable = availability === "works-today";

  return (
    <div
      data-doc
      className={`flex flex-col ${
        tone === "primary"
          ? "border border-border-control bg-surface-raised"
          : "border border-hairline bg-surface-raised"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline px-5 py-3">
        <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          {/* Deliberately NOT a tracked-uppercase eyebrow. Four of these blocks on one page,
              plus the nav wordmark and the page's own eyebrow, took `dom.eyebrow-count` from
              clear to firing at 3 on `/mcp` when it was measured with our own scan_ui. A rule we
              score other people against is not one we get to trip on our own install page. */}
          <span className="font-mono text-mono-md font-medium text-ink">{label}</span>
          <span className={`text-sm ${runnable ? "text-ink" : "text-ink-muted"}`}>
            {AVAILABILITY_LABEL[availability]}
          </span>
        </p>
        <Button
          type="button"
          onClick={copy}
          variant="outline"
          className="h-auto rounded-sm border-border-control bg-surface px-4 py-[6px] text-sm text-ink"
        >
          <span role="status">{copied ? "Copied" : "Copy"}</span>
        </Button>
      </div>
      <pre className="overflow-x-auto px-5 py-4 font-mono text-mono-md text-ink">{command}</pre>
      {note ? (
        <p className="max-w-[72ch] border-t border-hairline px-5 py-3 text-sm text-ink-muted">
          {note}
        </p>
      ) : null}
    </div>
  );
}
