import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { FEED_ATTR } from "@/lib/reveal-attrs";
import type { ScanView } from "@/lib/view";

/**
 * THE ARITHMETIC.
 *
 * Every finding on this page carries points. This block is where those points are added up
 * in public, so a reader can check the total by hand rather than trusting that we did.
 *
 * Two deliberate properties:
 *
 *  1. NO DIAL, NO RAMP. The number appears once, as text, in a table footer. There is no
 *     gauge, no 0-100 arc and no red/amber/green. A colour ramp asserts guilt before a word
 *     is read, and a dial invites a screenshot of the needle with the evidence cropped off.
 *  2. THE RECONCILIATION IS CHECKED AT RENDER TIME. We recompute the sum from the rows we
 *     printed and compare it to the engine's number. If they disagree the mismatch is
 *     printed. A receipt that silently rounds itself into agreement is worse than no receipt,
 *     and this is exactly the class of defect our own corpus exists to catch.
 */

const signed = (n: number) => `${n > 0 ? "+" : ""}${n.toFixed(1)}`;

export function Arithmetic({ view }: { readonly view: ScanView }) {
  const printed = view.priorPoints + view.families.reduce((sum, f) => sum + f.points, 0);
  const drift = Math.abs(printed - view.computedScore);
  const reconciles = drift < 0.05;

  return (
    <section aria-labelledby="arithmetic-heading" className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <h2 id="arithmetic-heading" className="text-h3 font-medium text-ink">
          How the number was reached
        </h2>
        <p className="max-w-[72ch] text-sm text-ink-muted">
          Each family contributes points up to its own cap, so no single kind of signal can
          carry a result on its own. Counter-evidence subtracts. Add the column and you get the
          number in the last row.
        </p>
      </div>

      {/* The table scrolls on its own axis below ~700px rather than being allowed to widen
          the document. A receipt whose page scrolls sideways is broken, and collapsing the
          columns into stacked labels would break the one property this block is for: the
          points column has to be readable as a column you can add up. */}
      <div
        data-doc
        {...{ [FEED_ATTR]: "" }}
        className="overflow-x-auto border border-border-control bg-surface-raised"
      >
        <Table>
          <TableHeader>
            <TableRow className="border-hairline">
              <TableHead className="font-mono text-mono-xs font-medium tracking-[0.06em] text-ink-muted uppercase">
                Family
              </TableHead>
              <TableHead className="font-mono text-mono-xs font-medium tracking-[0.06em] text-ink-muted uppercase">
                Findings
              </TableHead>
              <TableHead className="font-mono text-mono-xs font-medium tracking-[0.06em] text-ink-muted uppercase">
                Points
              </TableHead>
              <TableHead className="font-mono text-mono-xs font-medium tracking-[0.06em] text-ink-muted uppercase">
                Cap
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow className="border-hairline">
              <TableCell className="text-sm text-ink">
                Starting point, before any finding
              </TableCell>
              <TableCell className="font-mono text-mono-sm text-ink-muted">n/a</TableCell>
              <TableCell className="font-mono text-mono-sm text-ink">
                {signed(view.priorPoints)}
              </TableCell>
              <TableCell className="font-mono text-mono-sm text-ink-muted">n/a</TableCell>
            </TableRow>
            {view.families.map((family) => (
              <TableRow key={family.id} className="border-hairline align-top">
                {/*
                 * `whitespace-normal` and a real width, both load-bearing. shadcn's TableCell
                 * ships `whitespace-nowrap`, so this caveat — the longest string in the table by
                 * an order of magnitude — was laid out on ONE unbreakable line, overflowed its
                 * cell, and printed straight across the Findings, Points and Cap columns of its
                 * own row. Three of the four numbers in every family row were unreadable under
                 * a sentence, which is a real defect in a block whose entire purpose is that a
                 * reader can add the column up by hand. Caught in a dark 1440 capture.
                 */}
                <TableCell className="w-[46ch] max-w-[46ch] min-w-[28ch] text-sm whitespace-normal text-ink">
                  {family.title}
                  <span className="mt-1 block font-mono text-mono-sm whitespace-normal text-ink-muted">
                    {family.caveat}
                  </span>
                </TableCell>
                <TableCell className="font-mono text-mono-sm text-ink">
                  {family.findingCount}
                </TableCell>
                <TableCell className="font-mono text-mono-sm text-ink">
                  {signed(family.points)}
                </TableCell>
                <TableCell className="font-mono text-mono-sm text-ink-muted">
                  {family.atCap ? "reached, remainder discarded" : "not reached"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter className="border-t border-border-control bg-surface-raised">
            <TableRow className="border-0">
              <TableCell className="text-body font-medium text-ink">
                {view.status === "assessed"
                  ? "Total, on a scale that stops at 99"
                  : "Total the engine computed, withheld from the top of this receipt"}
              </TableCell>
              <TableCell />
              <TableCell className="font-mono text-mono-md font-medium text-ink">
                {view.computedScore.toFixed(1)}
              </TableCell>
              <TableCell className="font-mono text-mono-sm text-ink-muted">
                {view.bandLabel}
              </TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </div>

      <p className="max-w-[72ch] font-mono text-mono-sm text-ink-muted">
        {reconciles
          ? `The rows above sum to ${printed.toFixed(1)}, which is the number in the last row. This is recomputed from the printed rows every time this page renders, not asserted.`
          : `The rows above sum to ${printed.toFixed(1)}, and the engine reported ${view.computedScore.toFixed(1)}. They disagree by ${drift.toFixed(2)}. We are printing that rather than rounding it away: a receipt that does not add up is a defect in us, and hiding it would be the exact behaviour this product exists to detect.`}
        {view.status !== "assessed"
          ? " The status of this run is not `assessed`, so no score is reported at the top of the receipt. The engine's working is still shown, because withholding a number is not a reason to withhold the method."
          : ""}
      </p>
    </section>
  );
}
