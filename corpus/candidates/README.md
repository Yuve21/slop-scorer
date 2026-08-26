# Candidate rules

Stage 2 of the corpus training loop. The full runbook is `docs/agents/HQ.md`, "Training the corpus".

An observation is not a rule and never becomes one automatically. A person or an agent reads the
accumulated observations (local JSONL, off by default, see `packages/core/src/observation.ts`),
notices a pattern the corpus does not name, and writes a candidate here as `<rule-id>.json`.

`_TEMPLATE.json` is the shape. It is validated by `assertWellFormedCandidate` in
`@slop/core`, which **refuses a candidate without a specific, non-empty `falsePositiveNote`**. That
is the field that takes the most work and is the easiest to defer, so the type will not let you
defer it: the note is the published condition under which the rule is WRONG, and `attachRemedies`
injects it as the rebuttal on every patch the rule proposes, so a missing or softened note travels
attached to an edit somebody is about to apply. "May occasionally be wrong" is rejected by name.

## The rules of this directory

- **Two reviewers, never one.** `corpus-steward` judges the rule on the merits;
  `false-positive-hunter` runs against it adversarially. A candidate cannot reach `accepted` with
  only one, because a rule's author is the worst judge of its false-positive surface.
- **Support is a count AND its dates.** `support.observations` must equal `support.days.length`, so
  the count and its evidence are two independent statements that can disagree, so the check can
  fail. A count that only agrees with itself is not support.
- **Below five distinct observations it is an anecdote** (`MIN_SUPPORTING_OBSERVATIONS`), and a
  steward says so rather than promoting it thin.
- **A rejected candidate STAYS here, with its reason.** It is the most useful file in the directory:
  it stops the same idea being re-proposed every quarter. Deleting one throws away the only record
  that the question was already asked and answered.
- **`proposedSince` is the NEXT corpus version**, and promotion bumps that version in the same
  commit, then regenerates everything that froze the old one. `node scripts/check-corpus-version.mjs`
  is the ratchet and it will not let the two drift.

## This directory is empty of real candidates today

That is the honest state, and it is stated rather than filled with examples. The observation sink
shipped in this same commit and no scan has run with it enabled yet, so there are no observations to
draw a candidate from. A fabricated candidate with invented support dates would be exactly the kind
of unsubstantiated artifact this product exists to detect.
