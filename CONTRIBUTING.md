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
| Web positives | 4 live pages that name their own builder in their own markup, captured and pinned | `packages/detectors-web/test/corpus/` |
| Code positives | 4 public repositories whose README is written by the generator and whose every commit is the vendor's bot, pinned by SHA | `packages/detectors-code/test/corpus/` |
| Discrimination | 2 synthetic generated repositories + 1 synthetic template page | `scripts/fixtures/`, `packages/detectors-web/test/discrimination.test.ts` |
| Image (structural) | Constructed JPEG/PNG files labelled by what they DECLARE | `packages/detectors-image/src/fixtures/corpus.ts` |
| Video (structural) | Constructed ISO base media files labelled by what they DECLARE | `packages/detectors-video/src/fixtures/corpus.ts` |
| Audio (structural) | Constructed RIFF/MPEG audio files labelled by what they DECLARE | `packages/detectors-audio/src/fixtures/corpus.ts` |

**The three media corpora are STRUCTURAL, not real-world, and nothing computed over them is a
false-positive rate.** A real image or video negative corpus needs licensed, *unmodified*
originals from named creators — unmodified because the whole subject of those detectors is what
survives a re-save — which is a licensing job rather than a coding job and has not been done.
Until it is, those detectors ship abstaining by default. Each package's README says so in the
same words. Do not quietly upgrade a structural corpus to a real one by adding members to it.

**Their abstention rate is a headline metric, not a defect.** `npm test` and `npm run backtest`
both compute and print it per modality, against the corpus and the rules of that run. A change
that lowers it is not automatically an improvement: it may mean the product started guessing.

Re-capture the code corpus with `npm run capture:code-corpus`. It clones each pinned commit into
a gitignored `.corpus-cache/` and stores the SCAN, not the source: a `RepoArtifact` is small,
replayable and carries no third party's code beyond single-line excerpts. `npm run
capture:web-corpus` is the same contract for the pages: a real browser render, frozen to disk and
pinned by `capturedAt`. **Neither corpus touches the network at test time.** A suite that fetched a
stranger's site would go red when they redeployed, and a published rate would move with it.

**Adding a negative is a bigger contribution than adding a rule.** Every member needs stated
provenance a stranger can check: named authorship, substantial pre-2022 history, and an
institution behind it. A label with no stated basis is an assertion, and an assertion is what the
FTC's *In re Workado* order was about.

**A generated positive has the same bar pointed the other way, and it is not "it looks generated".**
Inferring the label from the artifact's shape would be circular, because the shape is the thing
under test. A member qualifies on two conditions, both re-checked against the capture by the
script rather than asserted in prose:

1. **The generator named itself,** in a locator anyone can re-read: a `<meta name="generator">`, a
   vendor runtime script served into the page, a README heading the tool writes into every export.
2. **Nobody else touched it.** For a repository, 100% of the captured history must be authored by
   the vendor's bot account. A single human commit disqualifies it, and this threw out two
   candidates that carried a builder's README and had then been developed by a person for months.

Both conditions abort the capture when they fail. And record `origin`: `real` means somebody else
published it, `synthetic` means we wrote it. A sensitivity floor measured against our own fixture
and a result measured against a stranger's real build are different claims, and the tests never
pool them.

## Two things the suite will not let you do

- **Publish an accuracy number.** `no-claims.test.ts` scans the source and the READMEs for
  hardcoded accuracy figures. Any number is computed at test time from a named corpus or it does
  not exist.
- **Suppress evidence quietly.** A phase-2 suppressor may withdraw evidence that is about the
  detector rather than about the artifact (a rule's own pattern table, a test fixture), but it
  must name the rule, the file and the reason in the warnings, and in the receipt's caveat line
  when the rule still fires. A silently suppressed rule and a dead rule are the same observation.
