"use client";

import { ItemGroup } from "@/components/ui/item";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { FindingView } from "@/lib/view";
import { FindingRow } from "./finding-row";
import { BLOCK_ATTR } from "./reveal";

/**
 * The evidence list, as ONE block.
 *
 * `BLOCK_ATTR` is on the wrapper and never on a row. That is the whole point: beat 3 of the
 * reveal moves this single element, so the list cannot be staggered even by accident. A
 * stagger would be a named tell and, worse, a false statement about the data, since every
 * finding here came out of the same pass.
 *
 * `gap-px` on a hairline-coloured parent draws the separators, so adjacent rows never stack
 * two 1px borders into a 2px seam.
 */
export function EvidenceList({ findings }: { readonly findings: readonly FindingView[] }) {
  const attrs = { [BLOCK_ATTR]: "" };
  return (
    <TooltipProvider>
      <ItemGroup {...attrs} className="gap-px bg-hairline has-data-[size=sm]:gap-px has-data-[size=xs]:gap-px">
        {findings.map((finding) => (
          <FindingRow key={finding.ruleId} finding={finding} />
        ))}
      </ItemGroup>
    </TooltipProvider>
  );
}
