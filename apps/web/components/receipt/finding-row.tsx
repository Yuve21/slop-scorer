"use client";

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from "@/components/ui/item";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { FindingView } from "@/lib/view";
import { WRITE_ATTR } from "@/lib/reveal-attrs";

/**
 * One finding.
 *
 * Layout is `[locator] [title + citation] [verify]`, per design/SURFACES.md §A.7. What that
 * spec is really encoding is that a reader can re-derive every claim without trusting us:
 * the locator says which rule, the citation says what was measured and where, and `verify`
 * opens the raw payload IN PLACE. In place matters. A modal or a detail page separates the
 * evidence from the claim it supports, and a claim you have to navigate to verify is a claim
 * most readers will take on faith, which is the black box this product argues against.
 *
 * No severity colour and no severity ordering. Rows are ordered by rule id upstream, which
 * is stable, which makes two receipts for the same artifact diffable.
 *
 * DEVIATION from design/COMPONENTS.md, stated with its reason: that doc specifies hover-card
 * for pointer plus tooltip for keyboard on the rule locator. Both mounted on the same trigger
 * fight for the same focus and hover events and produce two overlapping popovers on a mouse
 * user with a keyboard focus. Radix's Tooltip already opens on focus as well as hover, so one
 * component covers both input methods. The full rule text is also always present, unhidden,
 * inside the expanded evidence, so nothing here is reachable only by hover.
 */

const KIND_LABEL: Readonly<Record<string, string>> = {
  css: "computed style",
  selector: "DOM",
  url: "HTTP",
  header: "response header",
  text: "page text",
  bytes: "bytes",
};

export function FindingRow({ finding }: { readonly finding: FindingView }) {
  const [open, setOpen] = React.useState(false);
  const counter = finding.polarity === "counter";

  return (
    <Collapsible open={open} onOpenChange={setOpen} asChild>
      <Item
        variant="outline"
        size="sm"
        className="flex-col items-stretch border-hairline bg-surface-raised px-5 py-[18px]"
      >
        <div className="flex w-full flex-wrap items-start gap-x-5 gap-y-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <a
                href={`/method#${finding.ruleId}`}
                className="w-full shrink-0 font-mono text-mono-sm font-medium text-ink-accent underline-offset-4 hover:underline md:w-[13rem]"
              >
                {finding.ruleId}
              </a>
            </TooltipTrigger>
            <TooltipContent className="max-w-[40ch] font-mono text-mono-sm">
              {finding.explanation}
            </TooltipContent>
          </Tooltip>

          <ItemContent className="min-w-0 gap-2">
            <ItemTitle className="text-body font-medium text-ink">
              {finding.title}
              {counter ? (
                <Badge
                  variant="outline"
                  className="rounded-sm border-border-control font-mono text-mono-xs font-medium tracking-[0.06em] text-ink uppercase"
                >
                  Counter-evidence
                </Badge>
              ) : null}
            </ItemTitle>
            {finding.evidence.map((e, i) => (
              // WRITE_ATTR: this citation gets written across the line by a mask sweep whose
              // duration is this string's own length. The full string is in the server HTML —
              // the mask is applied after hydration and removed on completion, so there is no
              // state in which a citation is partially present in the markup.
              <ItemDescription
                key={`${e.locator}-${i}`}
                {...{ [WRITE_ATTR]: "" }}
                className="font-mono text-mono-sm text-ink-muted [overflow-wrap:anywhere]"
              >
                {/* The locator stays in muted ink, NOT the accent. The accent means
                    "interactive" on this site and nothing else; a non-interactive citation
                    tinted with it would be the first step back toward colour carrying a
                    verdict. The mono face is what distinguishes it, as designed. */}
                {e.locator} resolves to {e.observed}
                {e.expected ? ` · expected ${e.expected}` : ""} · read from the rendered page,
                not the stylesheet
              </ItemDescription>
            ))}
          </ItemContent>

          <ItemActions className="shrink-0">
            <CollapsibleTrigger className="rounded-sm font-mono text-mono-sm text-ink-accent underline-offset-4 hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none">
              {open ? "hide evidence" : "verify"}
            </CollapsibleTrigger>
          </ItemActions>
        </div>

        <CollapsibleContent className="w-full">
          <dl className="mt-5 grid gap-4 border-t border-hairline pt-5 text-mono-sm md:grid-cols-[13rem_1fr]">
            <dt className="font-mono text-mono-sm text-ink-muted">Family</dt>
            <dd className="text-sm text-ink">{finding.familyTitle}</dd>

            <dt className="font-mono text-mono-sm text-ink-muted">Arithmetic</dt>
            <dd className="font-mono text-mono-sm text-ink">
              base weight {finding.baseWeight} · applied weight {finding.weight} ·{" "}
              {finding.hitsCounted} {finding.hitsCounted === 1 ? "hit" : "hits"} counted ={" "}
              {counter ? "" : "+"}
              {finding.points} points
              {finding.cappedOut ? " (its family reached its cap, so the rest was discarded)" : ""}
            </dd>

            <dt className="font-mono text-mono-sm text-ink-muted">Why this rule exists</dt>
            <dd className="max-w-[72ch] text-sm text-ink">{finding.explanation}</dd>

            <dt className="font-mono text-mono-sm text-ink-muted">When it is wrong</dt>
            <dd className="max-w-[72ch] text-sm text-ink">{finding.falsePositiveNote}</dd>

            {finding.prevention ? (
              <>
                <dt className="font-mono text-mono-sm text-ink-muted">How to not do this</dt>
                <dd className="max-w-[72ch] text-sm text-ink">{finding.prevention}</dd>
              </>
            ) : null}

            <dt className="font-mono text-mono-sm text-ink-muted">Raw payload</dt>
            <dd className="min-w-0">
              {/* Plain mono, no syntax highlighting. Highlighting is a taste layer applied to
                  someone else's source; this is a forensic exhibit, so the only thing that
                  gets colour is the cited locator. */}
              <div className="max-h-64 overflow-auto border border-hairline bg-surface p-4">
                {finding.evidence.map((e, i) => (
                  <pre
                    key={`raw-${e.locator}-${i}`}
                    className="font-mono text-mono-sm whitespace-pre-wrap text-ink [overflow-wrap:anywhere]"
                  >
                    <span className="text-ink-muted">
                      {KIND_LABEL[e.kind] ?? e.kind}
                      {"  "}
                    </span>
                    <span className="text-ink-accent underline underline-offset-4">
                      {e.locator}
                    </span>
                    {"\n"}
                    {e.observed}
                    {e.expected ? `\nexpected: ${e.expected}` : ""}
                    {e.excerpt ? `\n\n${e.excerpt}` : ""}
                  </pre>
                ))}
              </div>
            </dd>
          </dl>
        </CollapsibleContent>
      </Item>
    </Collapsible>
  );
}
