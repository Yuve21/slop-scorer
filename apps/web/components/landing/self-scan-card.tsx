"use client";

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item";
import { BLOCK_ATTR, ElapsedFigure, ReceiptReveal } from "@/components/receipt/reveal";
import { ago, type ScanView } from "@/lib/view";

/**
 * The live self-scan, in the fold.
 *
 * This is not a screenshot and there is no filter between the response and the render. It
 * POSTs to /api/scan, which runs the same detector any URL would get, against this origin,
 * and prints whatever comes back. If a deploy regresses a check, this card says so, in
 * public, above the fold. That is the point of putting it here rather than in a case study.
 *
 * WHY IT IS A CLIENT COMPONENT AND WHY THAT IS NOT A CORNER BEING CUT: a scan renders this
 * page in a real browser. Starting one while server-rendering this page would have the page
 * wait on a browser that is waiting on the page. So the server renders the last completed
 * run (or the honest "no run yet" state), and the browser asks for a fresh one. Nothing here
 * is hidden behind hydration: the server HTML already contains the real result.
 *
 * The failure path is the honest one. If the endpoint is down the card renders INCONCLUSIVE
 * in the same treatment the receipt uses, saying we could not scan ourselves just now, rather
 * than falling back to the last run that happened to look good.
 */

const ROWS = 4;

interface Payload {
  readonly view: ScanView;
  readonly fresh: boolean;
}

type Phase = "idle" | "running" | "unreachable";

export function SelfScanCard({
  initial,
  ruleTitles,
  target,
}: {
  readonly initial: ScanView | null;
  readonly ruleTitles: Readonly<Record<string, string>>;
  readonly target: string;
}) {
  const [view, setView] = React.useState<ScanView | null>(initial);
  const [phase, setPhase] = React.useState<Phase>("idle");
  const [age, setAge] = React.useState<string | null>(null);

  const run = React.useCallback(async (force: boolean) => {
    setPhase("running");
    try {
      const response = await fetch(`/api/scan${force ? "?force=1" : ""}`, { method: "POST" });
      if (!response.ok) {
        setPhase("unreachable");
        return;
      }
      const payload = (await response.json()) as Payload;
      setView(payload.view);
      setPhase("idle");
    } catch {
      setPhase("unreachable");
    }
  }, []);

  React.useEffect(() => {
    void run(false);
  }, [run]);

  // The age is computed after mount and ticks. Rendering it on the server would bake a
  // timestamp into static HTML and the card would claim to be seconds old forever.
  React.useEffect(() => {
    if (!view) return;
    const tick = () => setAge(ago(view.ranAt));
    tick();
    const id = window.setInterval(tick, 5000);
    return () => window.clearInterval(id);
  }, [view]);

  if (phase === "unreachable") {
    return (
      <Frame target={target} status="Inconclusive" meta="the run did not complete">
        <p className="max-w-[72ch] p-5 text-body text-ink">
          We could not scan ourselves just now. That is a result, and we are showing it rather
          than a cached one. Nothing on this page is a stored screenshot, which is exactly why
          it can fail in front of you.
        </p>
      </Frame>
    );
  }

  if (!view) {
    return (
      <Frame target={target} status="Running" meta="rendering this page in a real browser">
        <p className="max-w-[72ch] p-5 text-body text-ink">
          A scan means launching a browser, loading this page, and reading its computed styles.
          That takes a few seconds and we are not going to pretend otherwise with a progress bar
          that is not measuring anything.
        </p>
      </Frame>
    );
  }

  const findings = [...view.findings, ...view.counterEvidence];
  const quiet = view.evaluated
    .filter((id) => !findings.some((f) => f.ruleId === id))
    .slice(0, Math.max(0, ROWS - findings.length));

  return (
    <ReceiptReveal>
      <Frame
        target={target}
        status={`${findings.length} ${findings.length === 1 ? "finding" : "findings"}`}
        meta={
          <>
            <ElapsedFigure value={(view.elapsedMs / 1000).toFixed(1)} suffix=" s to run" />
            {age ? ` · ${age}` : ""}
          </>
        }
        checks={`${view.evaluated.length} of ${view.corpusSize} checks`}
        onRerun={() => void run(true)}
        busy={phase === "running"}
      >
        <ItemGroup {...{ [BLOCK_ATTR]: "" }} className="gap-px bg-hairline has-data-[size=sm]:gap-px has-data-[size=xs]:gap-px">
          {findings.slice(0, ROWS).map((finding) => (
            <Item
              key={finding.ruleId}
              variant="outline"
              size="sm"
              className="items-start gap-5 border-hairline bg-surface-raised px-5 py-[18px]"
            >
              <a
                href={`/method#${finding.ruleId}`}
                className="w-[13rem] shrink-0 font-mono text-mono-sm font-medium text-ink-accent underline-offset-4 hover:underline"
              >
                {finding.ruleId}
              </a>
              <ItemContent className="min-w-0 gap-1">
                <ItemTitle className="text-body font-medium text-ink">{finding.title}</ItemTitle>
                <ItemDescription className="font-mono text-mono-sm text-ink-muted [overflow-wrap:anywhere]">
                  {finding.evidence[0]
                    ? `${finding.evidence[0].locator} resolves to ${finding.evidence[0].observed}`
                    : "no evidence attached, which is itself a defect in us"}
                </ItemDescription>
              </ItemContent>
            </Item>
          ))}
          {quiet.map((id) => (
            <Item
              key={id}
              variant="outline"
              size="sm"
              className="items-start gap-5 border-hairline bg-surface-raised px-5 py-[18px]"
            >
              <span className="w-[13rem] shrink-0 font-mono text-mono-sm font-medium text-ink-muted">
                {id}
              </span>
              <ItemContent className="min-w-0 gap-1">
                <ItemTitle className="text-body font-medium text-ink">
                  {ruleTitles[id] ?? "This check ran."}
                </ItemTitle>
                <ItemDescription className="font-mono text-mono-sm text-ink-muted">
                  ran against the rendered page, nothing to cite
                </ItemDescription>
              </ItemContent>
            </Item>
          ))}
        </ItemGroup>
      </Frame>
    </ReceiptReveal>
  );
}

function Frame({
  target,
  status,
  meta,
  checks,
  onRerun,
  busy,
  children,
}: {
  readonly target: string;
  readonly status: string;
  readonly meta: React.ReactNode;
  readonly checks?: string;
  readonly onRerun?: () => void;
  readonly busy?: boolean;
  readonly children: React.ReactNode;
}) {
  return (
    <div data-doc className="border border-border-control bg-surface-raised">
      <div className="flex flex-wrap items-baseline justify-between gap-4 border-b border-hairline px-5 py-4">
        <p className="font-mono text-mono-sm text-ink">
          {target} · scan_ui{checks ? ` · ${checks}` : ""}
        </p>
        <div className="flex flex-wrap items-baseline gap-3">
          <Badge
            variant="outline"
            className="rounded-sm border-border-control font-mono text-mono-xs font-medium tracking-[0.06em] text-ink uppercase"
          >
            {status}
          </Badge>
          <span className="font-mono text-mono-sm text-ink-muted">{meta}</span>
          {onRerun ? (
            <button
              type="button"
              onClick={onRerun}
              disabled={busy}
              className="rounded-sm font-mono text-mono-sm text-ink-accent underline-offset-4 hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-60"
            >
              {busy ? "running" : "re-run"}
            </button>
          ) : null}
        </div>
      </div>
      {children}
      <p className="border-t border-hairline bg-surface px-5 py-4 text-sm text-ink-muted">
        This is the same report any URL gets. We publish ours because a detector that cannot
        survive its own test is not worth running.
      </p>
    </div>
  );
}
