"use client";

import { ItemGroup } from "@/components/ui/item";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { FindingView } from "@/lib/view";
import { FindingRow } from "./finding-row";
import { FEED_ATTR } from "./reveal";

/**
 * The evidence list, as ONE document that prints.
 *
 * `FEED_ATTR` is on the wrapper and never on a row, and that distinction is the same one
 * `BLOCK_ATTR` used to carry: the reveal moves this single element, so the list cannot be
 * staggered even by accident. A per-row stagger here would be a named tell in our own corpus
 * and, worse, a false statement about the data, since every finding on a receipt came out of
 * the same pass. (The fold's card is the one place rows do arrive in sequence, and only because
 * it has the detector's real evaluation order to sequence them by. See reveal.tsx beat 3a.)
 *
 * What changed is the SHAPE of that one reveal: it used to be a 2px fade-and-rise of the whole
 * block, which is the most generic gesture in the library. It is now a bottom-up clip feed at a
 * constant rate with a print head on the cut, because the artifact this product hands you is a
 * printed receipt, and a ruled list of citations is the part of it that actually looks printed.
 * The duration comes from this element's own height.
 *
 * `gap-px` on a hairline-coloured parent draws the separators, so adjacent rows never stack
 * two 1px borders into a 2px seam.
 */
export function EvidenceList({ findings }: { readonly findings: readonly FindingView[] }) {
  const attrs = { [FEED_ATTR]: "" };
  return (
    <TooltipProvider>
      <ItemGroup
        {...attrs}
        className="gap-px bg-hairline has-data-[size=sm]:gap-px has-data-[size=xs]:gap-px"
      >
        {findings.map((finding) => (
          <FindingRow key={finding.ruleId} finding={finding} />
        ))}
      </ItemGroup>
    </TooltipProvider>
  );
}
