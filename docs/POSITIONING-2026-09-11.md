# The product changed, and this is the measured account of what that costs

Decided 2026-09-11 by the founder. Written before any code moves, because a retirement done by
grepping for a word removes the foundation along with the surface.

## What changed

**Was:** deterministic, evidence-cited detection of template and machine-generated tells. A 0 to 99
score, a verdict sentence, a visualisation, and a gauntlet that demonstrates the detector.

**Is:** a team of specialist agents, sold as an MCP to teams and used to support Proof. The agents
find flaws and do the business-side work for teams and their websites. The detector's *machinery* is
what makes an agent's finding trustworthy; the detector's *verdict* is not a product any more.

**Two decisions taken with it:**

1. **The name stays `slop-scorer` for now.** A rename touches two repositories, an npm package, the
   MCP tool names and every published doc, and renaming twice is worse than renaming late. The cost
   of waiting is recorded below rather than left to be discovered.
2. **Roughly 50 seats, sold as 8 departments, and the count is never the pitch.** Hundreds of agents
   is the crowded position and it invites the one question we cannot answer well, which is what each
   of them knows. A seat ships when its corpus exists, not when its brief is written.

## KEEP: the foundation

Every one of these is a reason a stranger should believe an agent's finding, and none of them
depends on there being a score.

- **Rules as data, with a mandatory published false-positive note.** The field that makes an agent
  read as senior: the condition under which it is WRONG, refused at load time if empty or vague.
- **The citation contract.** `Finding` requires a non-empty `evidence` array and the runtime
  validator rejects a citation with an empty locator. A finding without one cannot be constructed.
  This is a type constraint rather than a convention, and it is the differentiator.
- **Abstention as a first-class status.** "I could not read enough of this to tell you" is worth more
  than a guess, because the guess is unfalsifiable and the abstention is actionable.
- **The notary**, the reproduction pipeline, and the no-egress guarantee.
- **`false-positive-hunter` as a mandatory second reviewer**, and the rest of the fourteen internal
  audit seats. They stay internal: they audit our corpus and our gates, and no customer operates
  them.

## RETIRE: the product surface

Measured rather than guessed, because "remove the score" reaches further than it looks:

| Surface | Where it actually lives |
|---|---|
| `MAX_SCORE` / the 0 to 99 number | `packages/core/src/assessment.ts`, read by `score.ts`, `mcp-server`, and two test files |
| The verdict sentence | `verdictSentence()` in `assessment.ts`, called from exactly two sites in `score.ts` |
| The visualisation and demo surface | `apps/web` gauntlet, receipt and method pages |
| The gauntlet's accuracy framing | `apps/web/app/gauntlet/*`, and the README section around it |

The surface is small and well contained, which is a consequence of rules being data. Four files own
the number.

## THE THING THAT MUST NOT BE RETIRED WITH IT

**`scripts/backtest.mjs` is the only instrument that measures whether a rule change made the corpus
better, and it is defined in terms of BANDS.** Its own header: the two outcomes that must never ship
quietly are "a human negative moving up a band or over the base rate, and a generated positive
falling a band."

Remove the score and that gate has nothing to compare. Removing it silently would delete the only
measurement of rule quality in the repository, at the exact moment the product's whole claim becomes
"our agents are senior". That is the vacuous-guarantee shape this house is built to catch, and it
would be self-inflicted.

**So the order is fixed, and it is not negotiable by convenience:**

1. Replace the backtest's band comparison with a finding-level one: a rule that fired on a verified
   human artifact before and after, per rule, with its denominator. The corpus quality question
   survives the score's removal because it was never really a question about the score.
2. Only then retire `MAX_SCORE`, `verdictSentence` and the pages that render them.
3. `calibration/baseline.json` is re-derived against the new comparison in the same commit as step 1,
   never later, or there is a window where the baseline describes a thing that no longer runs.

## The cost of keeping the name, stated so it is not discovered

Until the rename, these describe a product we do not sell:

- `README.md` line 3 and `docs/agents/HQ.md` line 9 both open with "deterministic, evidence-cited
  detection of template and machine-generated tells".
- `proof-studio/docs/AGENT-ROSTER-PLAN.md` states the roster "is built on the deterministic
  foundation in `Yuve21/slop-scorer` and it is a SEPARATE product from that detector". Under the new
  shape they are one product with an engine, not two products.
- The npm package name and the MCP tool names.

`claims-officer` is pointed at every published claim except our own positioning. That is the next
thing it should read.
