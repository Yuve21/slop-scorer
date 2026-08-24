"use client";

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item";
import { BLOCK_ATTR, ElapsedFigure, ReceiptReveal } from "@/components/receipt/reveal";
import { ago, type ScanView } from "@/lib/view";

/**
 * The self-scan, in the fold.
 *
 * This is not a screenshot of a result and there is no filter between the report and the
 * render. The reading arrives from the server already complete: the browser render happened
 * in the build container (`scripts/capture-self-scan.mjs`) and the shipped corpus scored the
 * captured artifact on this request. So the server HTML in the fold already contains the real
 * finding count, the real score and the real citations, with no hydration and no fetch.
 *
 * WHY THERE IS NO LOADING STATE ON FIRST PAINT ANY MORE. There used to be one: the card asked
 * the server for a live render on mount, the serverless runtime has no browser, and the fold
 * sat on "Running…" forever under a headline claiming the page had already been scanned. A
 * spinner with no terminal case is a lie with a progress animation. Every state this
 * component can reach now ends somewhere: a result, or a stated reason there is none.
 *
 * A LIVE RUN IS STILL A BUTTON, because on any host that does have a browser (local dev, a
 * self-hosted deployment) it works, and when it refuses, the refusal is printed verbatim.
 * The request is bounded by `LIVE_TIMEOUT_MS`: if it has not answered by then it is aborted
 * and the card says the run did not come back, rather than spinning behind the number.
 */

const ROWS = 4;
/** The route's own ceiling is 60 s. This waits past it, then stops waiting, always. */
const LIVE_TIMEOUT_MS = 75_000;

interface Payload {
  readonly view: ScanView;
  readonly origin: "build-capture" | "live";
  readonly fresh: boolean;
}

type Phase = "idle" | "running" | "unreachable";

export function SelfScanCard({
  initial,
  ruleTitles,
  target,
  commit,
  capturedAt,
  staleReason,
}: {
  readonly initial: ScanView;
  readonly ruleTitles: Readonly<Record<string, string>>;
  readonly target: string;
  readonly commit: string | null;
  readonly capturedAt: string;
  /** Set when the reading predates this deployment. Printed, never hidden. */
  readonly staleReason?: string;
}) {
  const [view, setView] = React.useState<ScanView>(initial);
  const [live, setLive] = React.useState(false);
  const [phase, setPhase] = React.useState<Phase>("idle");
  const [age, setAge] = React.useState<string | null>(null);

  const run = React.useCallback(async () => {
    setPhase("running");
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), LIVE_TIMEOUT_MS);
    try {
      const response = await fetch("/api/scan?force=1", {
        method: "POST",
        signal: controller.signal,
      });
      if (!response.ok) {
        setPhase("unreachable");
        return;
      }
      const payload = (await response.json()) as Payload;
      setView(payload.view);
      setLive(payload.origin === "live");
      setPhase("idle");
    } catch {
      // Aborted, offline, or a body that did not parse. All three are "no answer came back",
      // and the reading already on screen stays on screen, labelled with its real age.
      setPhase("unreachable");
    } finally {
      window.clearTimeout(timer);
    }
  }, []);

  // The age is computed after mount and ticks. Rendering it on the server would bake a
  // timestamp into the HTML and the card would claim to be that old forever.
  React.useEffect(() => {
    const tick = () => setAge(ago(view.ranAt));
    tick();
    const id = window.setInterval(tick, 5000);
    return () => window.clearInterval(id);
  }, [view]);

  // NO SCORE IN THE FOLD. Not a number, not a gauge, not a band: `design/SURFACES.md` §A and
  // the product spec both forbid it, because a 0-100 readout as the face of the product is
  // exactly the claim the detection research says nobody can honestly make. What the fold
  // shows is what was found and how much was checked, which are facts.
  //
  // Two outcomes have rows: a scored report and an `inconclusive` one look the same here, and
  // when the engine declined to publish a number the reason is printed under the rows in
  // plain words. `not_assessed` means it never looked, and then there is a reason instead.
  const assessed = view.status !== "not_assessed";
  const findings = [...view.findings, ...view.counterEvidence];
  const quiet = view.evaluated
    .filter((id) => !findings.some((f) => f.ruleId === id))
    .slice(0, Math.max(0, ROWS - findings.length));

  // "at build" is dropped when the reading is not this build's. The sentence under the rows
  // explains why; the label above them must not claim a provenance it does not have.
  const provenance = live
    ? `live run${age ? `, ${age}` : ""}`
    : `${age ? `captured ${age}` : "captured"}${staleReason ? "" : " at build"}${
        commit ? `, commit ${commit.slice(0, 7)}` : ""
      }`;

  return (
    <ReceiptReveal>
      <Frame
        target={target}
        status={
          assessed
            ? `${findings.length} ${findings.length === 1 ? "finding" : "findings"}`
            : "Not assessed"
        }
        meta={
          <>
            {assessed ? (
              <ElapsedFigure value={(view.elapsedMs / 1000).toFixed(1)} suffix=" s to render" />
            ) : null}
            <span title={view.ranAt}>{assessed ? ` · ${provenance}` : provenance}</span>
          </>
        }
        checks={assessed ? `${view.evaluated.length} of ${view.corpusSize} checks` : undefined}
        onRerun={() => void run()}
        busy={phase === "running"}
      >
        {assessed ? (
          <ItemGroup
            {...{ [BLOCK_ATTR]: "" }}
            className="gap-px bg-hairline has-data-[size=sm]:gap-px has-data-[size=xs]:gap-px"
          >
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
        ) : (
          // The terminal abstention. Whatever the detector refused to do, in its own words.
          <p className="max-w-[72ch] p-5 text-body text-ink">
            {view.abstention[0]?.detail ??
              "No reading of this page was recorded, and we are not going to invent one."}
          </p>
        )}

        {assessed && view.score === null ? (
          // Why the receipt for this page carries no number. Said here rather than quoted from
          // the engine, because the engine's sentence names the figure it withheld, and a
          // withheld figure printed above the fold is still a figure above the fold.
          <p className="max-w-[72ch] border-t border-hairline px-5 py-4 text-sm text-ink-muted">
            {view.abstention[0]?.code === "single_family_only"
              ? "The engine declined to publish a number for this page: everything above came from a single rule family, and one family on its own is a correlated observation rather than corroboration. What was found is still what was found, and it is listed above."
              : (view.abstention[0]?.detail ??
                "The engine declined to publish a number for this page.")}
          </p>
        ) : null}

        {staleReason && !live ? (
          // The reading is older than the deployment showing it. Said out loud, at the same
          // size as everything else in the card, because the only thing that makes keeping an
          // older measurement honest is telling you it is one.
          <p className="max-w-[72ch] border-t border-hairline px-5 py-4 text-sm text-ink-muted">
            {staleReason}
          </p>
        ) : null}

        {phase === "running" ? (
          <p className="border-t border-hairline px-5 py-4 text-sm text-ink-muted">
            Running a live scan: a browser is being launched to load this page and read its
            computed styles. That takes a few seconds, and if nothing comes back within{" "}
            {LIVE_TIMEOUT_MS / 1000} seconds we stop waiting and say so. The reading above stays
            where it is until a newer one replaces it.
          </p>
        ) : null}
        {phase === "unreachable" ? (
          <p className="border-t border-hairline px-5 py-4 text-sm text-ink-muted">
            The live run did not come back. That is a result and this is us showing it: the
            reading above is still the one from this deployment's build, at the age printed next
            to it, and nothing has been quietly refreshed.
          </p>
        ) : null}
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
              {busy ? "running" : "run it live"}
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
