# slop-scorer

Deterministic, evidence-cited detection of template and machine-generated tells, with an output
contract designed so it cannot be quoted as an accusation about a person.

**Every finding carries a locator you can go and check.** A file and a line, a CSS selector, a
computed style value, a dependency name. A finding without one cannot be constructed: the
`Finding` type requires a non-empty `evidence` array and the runtime validator rejects any
citation with an empty locator. That is the product, and it is a type constraint rather than a
convention.

No model, LLM or classifier is a dependency of any package here.

---

## What is in this repository

```
packages/
  core/                      the contract, the engine, the receipt, the calibration harness
    src/types.ts             Detector, Finding, Evidence, Coverage, ProbeStatus
    src/rule.ts              Rule<TArtifact, TProbeId>: rules as DATA, fixtures mandatory
    src/assessment.ts        AssessmentStatus, MAX_SCORE = 99, the verdict sentence
    src/config.ts            rule families and their caps
    src/score.ts             the engine: sequential attribution, caps, abstention
    src/receipt.ts           the receipt, rendered so a reader can redo the arithmetic
    src/calibration/         labeled corpora, the distribution, the negative-set tripwire
    src/validate.ts          the contract check, including the vacuous-probe guard
    test/meta.ts             the mutation meta-suite every corpus runs against itself

  detectors-web/             "is this rendered page template-shaped?"  30 rules
    src/artifact.ts          WebArtifact: what the probes saw, and the neutral base case
    src/probe.ts             playwright renderer. Measures the RENDERED page, never the HTML
    src/rules/               builder, visual, craft, structure, copy, counter
    src/fixtures/negatives.ts  five labeled human artifacts

  detectors-code/            "is this repository template-shaped?"  13 rules
    src/artifact.ts          RepoArtifact: every observation carries a path and a line
    src/scan.ts              the filesystem scanner
    src/families.ts          code-specific families and caps
    src/rules/               agent artifacts, comments, scaffold, uniformity, verification,
                             history, counter-evidence

  mcp-server/                the shippable plugin: scan_codebase, scan_ui, list_rules
    install.sh / install.ps1 the one-line installers
```

`npm run verify` runs typecheck, build and tests. All three are green.

---

## The output contract

Modelled on Stripe Radar, because Radar is the only shipped, at-scale, legally survivable
version of scoring a stranger's artifact. Research in `image-detection-reality.md` killed the
bare score before it was written: at consumer prevalence, a 5% false-positive rate yields
roughly coin-flip precision, which is a structural problem and not a tuning one.

| Decision | Where it lives |
|---|---|
| `assessed` / `inconclusive` / `not_assessed` are enum values in the API type, not UI garnish | `assessment.ts`, `Report.status` |
| The score is bounded at 99 and cannot reach certainty | `MAX_SCORE`, enforced in the scoring path |
| The verdict says what WE did, never what anyone is | `verdictSentence`, guarded by `FORBIDDEN_VERDICT_PHRASES` and a test |
| Low coverage withholds the score rather than reporting a low one | `minCoverage`, `AbstentionCode.coverage_below_floor` |
| A high score from one family is withheld: correlation is not corroboration | `minFamiliesFired` |
| The top band cannot be reached on look alone | `topBandRequires.anyOfFamilies` |
| Findings are grouped into families, each capped at a share of the budget | `FamilySpec.capShare` |
| Repeated evidence inside a rule decays harmonically | `multiplicity` |
| Counter-evidence subtracts, and global counters bypass family caps | `Polarity`, `CounterScope` |
| The receipt reconciles to the number, exactly, in integers | `ReceiptMismatchError` |

### Rules are data

A rule is a record: id, family, weight, cap, severity, the rationale, the false-positive note,
the prevention hint, and the corpus version it entered in. `detect` is a function because a
threshold has to be compared somewhere, but nothing that decides how much a rule MATTERS is
code. That is what makes the corpus publishable, auditable, disputable and versionable without
shipping a new engine, and it is what makes `list_rules` a real answer.

Both detectors declare `evidenceKind: "deterministic"`. The type also has `"probabilistic"` and
`"provenance"` for modalities that will need them; nothing in this build is allowed to use them.

### Counter-evidence, and the cream palette

Detecting tells is a weekend. Knowing which tells lie is the corpus. Of four well-funded,
design-literate, human-made comparables read out of live CSS, **three use a warm off-white
background** (#F0EBDC, #FFFBF0, #F6F2EA). Every competing detector treats cream as a tell.
Encoding it as one would fail three quarters of this project's own negative set, so it appears
as `counter.category-convention-palette`, which LOWERS the score and says why.

The other counters: a self-hosted licensed foundry face (generators do not license type), real
photography, hand-made assets, an anti-spam layer, and on the code side comments that record a
reason, a history with reverts in it, tests dense enough to fail, and the apparatus of a team.

---

## The tests are part of the product

### The mutation meta-suite

`packages/core/test/meta.ts`, run against every rule in both corpora on every test run.

A rule whose selector, path or threshold goes stale does not crash. It silently stops firing,
which LOWERS the score of every artifact it would have flagged, while the report keeps printing
confident citations for the rules that survived. The product quietly becomes a random number
generator with footnotes, and the number goes down, so nobody complains.

Five checks per rule:

1. the neutral artifact fires nothing, counter-evidence included
2. the rule fires on its own positive fixture
3. the mutated fixture, which differs in exactly one thing, does not fire
4. every citation has a non-empty locator and observed value
5. zeroing the rule's probe removes it from `rulesEvaluated` and produces a warning **naming
   it**, rather than counting as evaluated-and-clean

This suite found a dead rule on its first run: `css.violet-blue-gradient` searched a 230-290
degree hue band, which cannot express Tailwind's blue-500 at hue 217, i.e. half of the single
most common generated gradient there is. It had been matching nothing.

### Denominators everywhere

Every probe reports how many things it collected. A probe that ran and collected nothing is a
failure, not a pass: `assertWellFormedResult` throws `VacuousProbeError`, and the scoring engine
raises an `inconclusive` with reason code `probe_failed`. This is the bug the source corpus
shipped three times in one day in three unrelated files, and it is invisible by construction.

### Calibration against known-human work

`packages/detectors-web/test/calibration.test.ts` scores five labeled human artifacts, four of
them measured field by field in a live browser. All five trip something: three use the cream
background, two set very large display type, one uses a single free Google serif for everything,
one ships two megabytes of JavaScript. The test fails, and names the offending rule, if any of
them reaches the band the product would print as a finding.

`discrimination.test.ts` holds the other end: a synthetic template-shaped page must still score
far above all of them, so a corpus of dead rules cannot pass the negative set by flagging
nothing.

### No accuracy claim, anywhere

`packages/core/test/no-claims.test.ts` scans every shipped source file and README for a stated
accuracy, precision, recall or false-positive figure, and fails the build if it finds one. Any
such number must be computed by the harness at test time, from a named corpus, on the version
being shipped.

*In re Workado* (FTC, 2026) is a consent order over a 98%-accuracy claim for an AI-content
detector. The pleaded counts: the respondent did not build the model, did not test it against
the use cases it advertised, and could not produce substantiation. The guard exists so that
cannot happen here by accident, and the guard is itself mutation-tested against known-bad
strings so it cannot go quietly dead.

---

## Scope

Built: the core contract and engine, the web detector, the code detector, the MCP server, the
calibration harness.

Deliberately **not** built, because each depends on a legal or API design that is not finished:
the reproduction / "we remade it" feature, image, video and voice detection, the consumer app,
the Turing gauntlet, and the process notary. There are no speculative stubs for them.

See `packages/mcp-server/README.md` for install and tool documentation.

## Installing the MCP plugin

```sh
claude mcp add slop-scorer -- npx -y slop-scorer-mcp
```

That is the whole install once the package is published. `packages/mcp-server` is
publish-ready: self-contained (the workspace-only `@slop/*` packages are bundled into the
artifact, not depended on), packed and installed from a tarball into a clean directory as
verification, name (`slop-scorer-mcp`) checked unclaimed on the registry. Publishing itself
(`npm publish --access public`) has not been run: that is the founder's npm account and call.
See `packages/mcp-server/README.md#publishing-this-package` for the exact command and the
before-publish local-dev fallback (`npm run install:local`).
