# Contributing a rule

A rule in this repository is an accusation with arithmetic behind it. The bar is therefore
higher than "the tests are green", because a rule change is invisible in unit tests by
construction: every rule passes its own fixtures while the ensemble drifts, and the ensemble is
what scores a stranger's work.

## The path, in order

1. **Write the rule as data.** Family, weight, cap, severity, `falsePositiveNote`, `prevention`,
   `since`. Only `detect` is code. If it cannot cite a file, a line, a selector or a header, it
   is not a rule.
2. **Ship both fixtures.** `positive` must fire. `mutated` changes exactly ONE field and must
   not fire. The meta-suite (`packages/core/test/meta.ts`) runs both on every test run, which is
   what stops a rule going stale in silence.
3. **Make the fixture the real thing.** Two rules in this corpus fired on their fixtures and on
   nothing in the world: a hue band that could not express Tailwind's `blue-500`, and a font
   matcher that could not express `__Inter_36bd41`, which is how `next/font` actually names
   Inter on a real page. If your fixture value is prettier than the value a browser or a
   compiler emits, the rule is decorative.
4. **Run `npm test`.** The mutation meta-suite, the vacuous-probe guard and both calibration
   corpora.
5. **Run `npm run backtest`.** This is the gate. It replays every frozen corpus against your
   rules and prints the per-artifact delta.
6. **Read the delta, then commit the baseline with your change** if it is correct:
   `node scripts/backtest.mjs --update`. The baseline diff is the reviewable record of what your
   rule did to fifteen labelled artifacts.

## What `npm run backtest` fails on

Only two things, because a gate that forbids all movement is a gate nobody follows:

- **A human negative moved up a band, or crossed the base rate.** The product is now accusing
  someone it was not accusing yesterday.
- **A generated positive fell a band.** The corpus is going dead, and a dead corpus passes every
  negative test in the suite.

Everything else is printed and allowed.

## The corpora

| Corpus | Members | Where |
|---|---|---|
| Web negatives | 5 human-made sites, provenanced | `packages/detectors-web/src/fixtures/negatives.ts` |
| Code negatives | 10 repositories with named maintainers and pre-2022 history, pinned by SHA | `packages/detectors-code/test/corpus/` |
| Discrimination | 2 synthetic generated repositories + 1 synthetic template page | `scripts/fixtures/`, `packages/detectors-web/test/discrimination.test.ts` |

Re-capture the code corpus with `npm run capture:code-corpus`. It clones each pinned commit into
a gitignored `.corpus-cache/` and stores the SCAN, not the source: a `RepoArtifact` is small,
replayable and carries no third party's code beyond single-line excerpts.

**Adding a negative is a bigger contribution than adding a rule.** Every member needs stated
provenance a stranger can check: named authorship, substantial pre-2022 history, and an
institution behind it. A label with no stated basis is an assertion, and an assertion is what the
FTC's *In re Workado* order was about.

## Two things the suite will not let you do

- **Publish an accuracy number.** `no-claims.test.ts` scans the source and the READMEs for
  hardcoded accuracy figures. Any number is computed at test time from a named corpus or it does
  not exist.
- **Suppress evidence quietly.** A phase-2 suppressor may withdraw evidence that is about the
  detector rather than about the artifact (a rule's own pattern table, a test fixture), but it
  must name the rule, the file and the reason in the warnings, and in the receipt's caveat line
  when the rule still fires. A silently suppressed rule and a dead rule are the same observation.
