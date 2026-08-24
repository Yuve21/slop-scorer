import { ABSTENTION_STATUS, type AbstentionCode } from "@slop/core";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import type { ScanView } from "@/lib/view";

/**
 * WHAT WE COULD NOT ASSESS.
 *
 * This band is the reason to trust the rest of the page, so it is rendered on every receipt,
 * always, including when it is empty. Products bury this. Burying it is the dishonesty: a
 * report that only ever shows what it found lets a reader assume everything else was checked
 * and came back clean.
 *
 * Three rules, from design/SURFACES.md §A.8, and all three are testable:
 *
 *   - Same type, same colour as a finding. Not greyed, not collapsed, not a footnote, never
 *     an error state and never a toast. Downgrading it visually is the lie.
 *   - The sentence "Absence of a finding here is not a finding." is fixed copy. It does not
 *     get rewritten for tone. It is the single most important sentence here for anyone who
 *     intends to use a receipt as an accusation.
 *   - The unevaluated count is DERIVED (corpus size minus rules that ran), never typed. A
 *     hardcoded denominator is how a check passes having tested nothing.
 */

const CHIP: Readonly<Record<"inconclusive" | "not_assessed", string>> = {
  inconclusive: "Inconclusive",
  not_assessed: "Not assessed",
};

const FIXED = "Absence of a finding here is not a finding.";

function Chip({ label }: { readonly label: string }) {
  return (
    <Badge
      variant="outline"
      className="rounded-sm border-border-control font-mono text-mono-xs font-medium tracking-[0.06em] text-ink uppercase"
    >
      {label}
    </Badge>
  );
}

function Entry({ label, children }: { readonly label: string; readonly children: string }) {
  return (
    <div className="flex flex-col gap-2 border-t border-hairline pt-5 first:border-t-0 first:pt-0">
      <Chip label={label} />
      <p className="max-w-[72ch] text-body text-ink">{children}</p>
    </div>
  );
}

export function AbstentionBand({ view }: { readonly view: ScanView }) {
  const unevaluated = Math.max(0, view.corpusSize - view.evaluated.length);
  const entries: { key: string; label: string; body: string }[] = [];

  for (const reason of view.abstention) {
    const kind = ABSTENTION_STATUS[reason.code as AbstentionCode] ?? "not_assessed";
    entries.push({ key: reason.code, label: CHIP[kind], body: reason.detail });
  }

  if (unevaluated > 0) {
    entries.push({
      key: "unevaluated",
      label: CHIP.not_assessed,
      body: `${unevaluated} of the ${view.corpusSize} rules in this corpus did not run on this artifact, because the probes they read were not available. ${FIXED}`,
    });
  }

  for (const [i, warning] of view.warnings.entries()) {
    entries.push({ key: `warning-${i}`, label: CHIP.inconclusive, body: warning });
  }

  return (
    <Alert
      data-doc
      className="gap-0 border border-border-control bg-surface p-5 text-ink md:p-6"
    >
      <AlertTitle className="font-mono text-mono-xs font-medium tracking-[0.06em] text-ink uppercase">
        What we could not assess
      </AlertTitle>
      <AlertDescription className="mt-5 flex flex-col gap-5 text-ink">
        {entries.length === 0 ? (
          <p className="max-w-[72ch] text-body text-ink">
            Nothing was withheld on this run. All {view.corpusSize} checks in the corpus ran and
            returned a measurement. {FIXED}
          </p>
        ) : (
          entries.map((entry) => (
            <Entry key={entry.key} label={entry.label}>
              {entry.body}
            </Entry>
          ))
        )}
      </AlertDescription>
    </Alert>
  );
}
