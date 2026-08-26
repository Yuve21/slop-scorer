# Learnings (what outcomes taught us)

Every agent reads this alongside `docs/agents/HOUSE-KNOWLEDGE.md`, and every agent writes back to it.

**The two files are different on purpose.** HOUSE-KNOWLEDGE holds the RULES: hard invariants, the
output contract, the verification baselines, things that are true by decree and not up for
re-litigation. LEARNINGS holds what we FOUND OUT: a defect and what it actually cost, a number we
measured, a pattern that keeps recurring, a claim that turned out to be prose rather than code. When
a learning hardens into a rule that must never be broken again, **promote it to HOUSE-KNOWLEDGE and
leave a pointer here.** L-01 through L-06 have already been promoted, as the disqualifying-defect
section at the top of that file.

**Honest framing: this is retrieval, not training.** Nothing here updates any model's weights. The
compounding is that an agent reads validated lessons before it acts, so a mistake costs the project
once instead of every session. The CORPUS is a separate thing and it genuinely is trained, by the
documented observation-to-rule path in `docs/agents/HQ.md` under "Training the corpus". Do not blur
the two.

<!-- BEGIN GENERATED INDEX -->

## Index: read this part in full, every run

**Always read in full, whatever the task: L-01, L-02, L-03, L-06.** Each is an instance of the one
failure class this product exists to catch, and each surfaced in a different subsystem (a decoder, a
notary, the core contract, two test suites), so no task-based filter would have surfaced them at the
moment they were needed.

**The disqualifying class: guarantees that report success without doing their job**

- **L-01** **[always]** A length read from untrusted bytes is not a number until it is coerced, and a 20-byte PNG hung the scanner forever
- **L-02** **[always]** A verification whose reference value comes from the artifact under test is a tautology
- **L-03** **[always]** The function carrying fourteen guards is called on zero shipping paths. **OPEN**
- **L-05** Both colour parsers are blind to `oklch`, so the flagship visual rule cannot fire on the most common modern stack. **OPEN**
- **L-06** **[always]** Two suites certified silence: the OCR fixture had no ink and the redaction corpus had no emails
- **L-11** Twelve rules declare a corpus version the corpus never bumped to, so the receipt cites a version that does not describe it. **OPEN**
- **L-13** Writing the privacy gate's own pattern reproduced the defect it exists to catch, three times, and the count went 7 to 18 to 21
- **L-14** One try/catch covering two failure modes made the privacy guard's throw unreachable, inside the privacy mechanism, on the day it was written
- **L-15** The publish gate printed "leak audit clean" over a mirror missing a whole file, because it was sound and not complete

**Shipping, packaging and the public projection**

- **L-04** `npm publish` would have shipped the private reproduction pipeline, because a barrel dragged it into the runtime closure
- **L-12** `server-only` throws inside Next's params worker, so a barrel import 500s every route it generates

**The web surface**

- **L-07** The fold painted complete at ~170ms and hydration then reset it to nothing, because a subtractive beat ran on already-visible content
- **L-10** The no-accuracy-claim guard does not scan the website, which is the only surface a regulator reads. **OPEN**

**Method**

- **L-08** Two probe tables for one detector state opposite policies, and nothing compares them. **OPEN**
- **L-09** A claim guard handed attacker-controlled bytes throws on the honest path

_15 entries. Index is hand-maintained until `scripts/gen-learnings-index.mjs` exists; `scripts/check-agent-roster.mjs --check` asserts the count against the entry headings._

<!-- END GENERATED INDEX -->

## The entry contract (an entry without evidence is not a learning)

| Field | Rule |
|---|---|
| **Date** | when it was learned, not when it was written up |
| **Claim** | one sentence, falsifiable |
| **Evidence** | a `file:line`, a measured number, a command that ran, or a commit. Never "it felt faster", never "this is best practice" |
| **Confidence** | `high` (measured, reproducible) / `medium` (one observation, plausible mechanism) / `low` (single anecdote) |
| **Status** | `FIXED <commit>` / `OPEN` / `SUPERSEDED <date>` |
| **Next time** | the concrete behaviour change. If there is nothing to do differently, it is trivia, not a learning |

**No evidence means it is labelled `HYPOTHESIS`, not a learning.** A hypothesis is welcome (they are
how learnings start) but it must be visibly marked and must say what measurement would settle it.

**Supersede, do not accumulate.** When a later finding contradicts an entry, mark the old one
`SUPERSEDED <date>: <why>` and point at its replacement. The wrong old number is often the most
useful part of the record, because somebody is still quoting it.

**A run with no learning says so.** "Routine run, no new learning" is a valid and expected outcome.
Inventing one is worse than an empty line, because this file is read before acting.

---

## The disqualifying class

### L-01 · 2026-08-26 · A length read from untrusted bytes is not a number until it is coerced, and a 20-byte PNG hung the scanner forever
- **Claim:** a missing `>>> 0` in the PNG chunk-length read let a length of 2^31 or more decode
  NEGATIVE, which defeated the bounds check and stopped the cursor advancing, so the parse loop spun
  forever on a file a stranger chose.
- **Evidence:** `readU32` was
  `((b[at] << 24) | (b[at+1] << 16) | (b[at+2] << 8) | b[at+3])` with no coercion. Bytes
  `FF FF FF F4` decode to `-12`; the advance at the bottom of the loop is `12 + length`, so the
  cursor stays put, and the guard `at + 8 + length + 4 > bytes.length` is SATISFIED by a negative
  length so it never fires. Measured twice: a standalone simulation stuck at `at = 8` after 100 000
  iterations, and a vitest case with a 3-second timeout wedged the whole runner past 120 seconds,
  because a synchronous loop cannot be interrupted by a test timeout. Reachable from any URL the
  tool is pointed at: `detectors-web/src/probe.ts` -> `recoverText` -> `ocr-text/src/raster-text.ts`
  -> `decodePng`, on bytes fetched from the page being scanned.
- **The part that matters most:** the correct implementation already existed in the same repository,
  `packages/provenance/src/container/bytes.ts:57-58`, with a comment explaining why. The fix did not
  reach the second copy. Two decoders, one hardened and one not, and the hardened one was pointed at
  trusted-ish container metadata while the soft one was pointed at third-party images.
- **Confidence:** high (reproduced by execution, twice).
- **Status:** FIXED, commit `08d62d6` "The PNG decoder now reads bytes somebody else chose, so it is
  bounded like it". Verified 2026-08-26: `packages/reproduce/src/png.ts:113-114` carries the
  `>>> 0` with the rationale at `:101-111`; the regression test is
  `packages/reproduce/test/png-hostile.test.ts:53-65`, which asserts `hostile.length === 20` at `:61`
  before asserting the throw, with a 3s timeout at `:64`. Five sibling hostile cases follow it
  (dimension ceiling `:80`, deflate bomb `:93`, chunk-count flood `:113`, CRC tamper `:125`,
  IDAT-before-IHDR `:140`).
- **Next time:** every 32-bit read from untrusted bytes gets `>>> 0` AND an explicit range check
  against the buffer, and every parse loop asserts its cursor advanced. When you harden one parser,
  grep for every other parser in the repository in the same commit: `jpeg.ts`, `riff.ts`,
  `mpeg-audio.ts`, `isobmff.ts`, `svg.ts` are the siblings, and only `isobmff.ts` had a cap.

### L-02 · 2026-08-26 · A verification whose reference value comes from the artifact under test is a tautology
- **Claim:** the notary's token check compared the timestamp token's imprint against the
  credential's OWN self-asserted root, so every token still "re-verified" on a chain whose events had
  been edited after issue.
- **Evidence:** `packages/notary/src/verify.ts` read `if (parsed.imprintHex !== input.credential.rootSha256)`.
  The real root WAS recomputed from the event rows a few lines above and then used only for a
  separate `rootMatches` boolean. On a tampered chain, `formatVerification` printed "timestamps that
  re-verify: 4 of 4". The file's own docstring said it "RECOMPUTES rather than reads", and that was
  true for one half of the check and false for the other. Worse:
  `packages/notary/test/service.test.ts:175-177` asserted `authoritiesReverified === 4` **beneath a
  comment saying "every token now fails too"**. The comment described the intent; the assertion
  pinned the bug.
- **Confidence:** high (the comparison is one line, and the test that should have caught it was
  reading the same wrong value).
- **Status:** FIXED, commit `cd0aaa1` "A verifier that trusts the credential it is checking is not a
  verifier". Verified 2026-08-26: `packages/notary/src/verify.ts:117` now compares against
  `chain.root`, recomputed at `:90`; `:107-113` is a comment naming the old bug explicitly; `:114-116`
  guards `chain.root === null` rather than falling through; and `recordIntact` at `:199-205` now
  conjoins the two tamper signals it previously computed and discarded
  (`statementReproduced !== false` and `good.length === credential.authorityCount`).
- **Next time:** for any verification, name the reference value out loud and ask where it came from.
  If it came from the thing being checked, there is no verification. And when a test comment and a
  test assertion disagree, the comment is the specification and the assertion is the bug: never
  resolve that by editing the comment.

### L-03 · 2026-08-26 · The function carrying fourteen guards is called on zero shipping paths · **OPEN**
- **Claim:** `assertWellFormedResult` is the single function that applies most of the product's
  enforced guarantees, and no path a user can reach runs it.
- **Evidence:** defined at `packages/core/src/validate.ts:13`, exported at `core/src/index.ts:117`.
  **Fourteen throw-sites**, counted 2026-08-26: empty detectorId `:16`, empty corpusVersion `:17`,
  finding with zero evidence `:22`, evidence with an empty locator or observed `:26`, duplicate
  ruleId `:33`, signal with negative weight `:40`, counter with positive weight `:43`, an applicable
  remediation on a non-deterministic read `:57`, a counter carrying any remediation `:63`, the
  wrapped `assertWellFormedRemediation` including `assertWithinTarget` `:69-71`, a fired rule absent
  from `rulesEvaluated` `:75`, coverage outside 0..1 `:83`, empty `coverage.probes` `:86`, and
  `VacuousProbeError` `:94`.
  **One shipping call site: `packages/core/src/registry.ts:60`, inside `DetectorRegistry`, which is
  never instantiated outside `core`.** Grepped repo-wide: the only other hits are the class
  definition, the barrel export, and prose. Every real face calls `buildReport` directly, which
  validates nothing: `packages/mcp-server/src/targets.ts:83` and `:94`,
  `apps/web/lib/self-scan.ts:139` and `:199`, `apps/web/lib/receipts.ts:125,165,230`.
  Found independently by three readers in the 2026-08-24 review; **re-verified still true 2026-08-26.**
- **The number was wrong in the summary.** The review said nine guards. Counting them gives fourteen.
  That is a small thing that matters: a quoted summary is not a measurement, and this one was quoted
  onward into a task brief.
- **Confidence:** high (grep is exhaustive here, and three readers agreed).
- **Status:** OPEN.
- **Next time:** the fix is one line, `assertWellFormedResult` inside `buildReport` itself, so it
  cannot be forgotten by a new caller, plus a test that drives a malformed result through
  `scanCodebase` rather than through a direct call to the validator. Note also that two modules own
  the same invariant and disagree about its severity: `validate.ts:94` treats a ran-but-empty probe
  as a THROW and `score.ts:450` treats it as an ABSTENTION, and neither references the other.

### L-05 · 2026-08-26 · Both colour parsers are blind to `oklch`, so the flagship visual rule cannot fire on the most common modern stack · **OPEN**
- **Claim:** the two independent colour parsers each handle only `rgb()/rgba()` with integer channels
  and 6-digit hex. Tailwind v4 ships an `oklch` palette by DEFAULT and Chrome serialises modern
  colour functions verbatim out of `getComputedStyle`, so on the single most common stack in the
  generated-page population the visual family goes quiet in both directions.
- **Evidence:** `packages/detectors-web/src/rules/visual.ts:83` (`colorStops`, regexes at `:85` and
  `:89`) and `packages/detectors-web/src/rules/counter.ts:47` (`toRgb`, regexes at `:48` and `:53`).
  Neither has an `oklch`, `oklab`, `lch`, `lab`, `hsl` or `color(` branch, and neither handles 3- or
  8-digit hex or percentage channels. Both degrade SILENTLY: `colorStops` returns `[]` and the rule
  cannot fire; `toRgb` returns `null`, `isWarmPaper` returns `false` (`counter.ts:62-64`) and the
  counter stops suppressing.
  Two consequences, opposite signs: `css.violet-blue-gradient`
  (`visual.ts:102`, detect `:117-130`, `baseWeight 0.6`, the flagship visual rule) finds zero stops
  and never fires; `counter.category-convention-palette` (`counter.ts:247`, detect `:262-271`,
  `baseWeight -0.3`) stops finding warm paper, so a cream Tailwind v4 human site LOSES its
  counter-evidence and scores higher. A dead rule lowers scores; a dead counter raises them, and
  those are two different kinds of wrong on the same input.
  **`oklch` is already present in captured artifacts:**
  `packages/detectors-web/test/corpus/wav0-landing.artifact.json` and
  `flappy-bird-game.artifact.json` both contain it, and no parser reads it.
  `visual.ts:27-36` names this exact failure as the reason the file exists: *"A threshold that cannot
  express its own canonical example... fails in silence and reads as a clean result."*
- **Confidence:** high on the blindness (the regexes are unambiguous and the fixtures prove the
  syntax arrives). **NOT VERIFIED:** whether the pinned Chromium serialises an `oklch()`-authored
  value as `oklch(...)` or normalises it to `rgb(...)` in `getComputedStyle`. That determines how
  often it bites live and it needs a browser run, not a grep. Do not quote a prevalence number until
  somebody measures it.
- **Status:** OPEN.
- **Next time:** one shared `parseColor()` in core covering `rgb/rgba`, hex 3/6/8, `hsl`,
  `oklch/oklab/lch/lab` and `color()`, with a fixture per syntax, and delete both private copies.
  The general rule: **a regex is a hypothesis about your input.** Enumerate the syntaxes the producer
  can emit, assert a fixture per syntax, and cross-check the fixture strings against what the probe
  actually writes. Same failure as `css.violet-blue-gradient`'s original 230-290 degree hue band,
  which could not express Tailwind blue-500 at hue 217.

### L-06 · 2026-08-26 · Two suites certified silence: the OCR fixture had no ink and the redaction corpus had no emails
- **Claim:** the two test suites guarding the product's two worst failure modes, INVENTION and
  DEANONYMISATION, both passed over empty inputs, so both were decoration.
- **Evidence:**
  (a) `packages/ocr-text/test/recover.test.ts:81-95`, the "not type" fixture, wrote
  `noise.data[...+0] = 10`, the RED CHANNEL ONLY, onto a white raster. The decoder's ink test is
  `luma(px) < 128` and `luma(10,255,255) = 181.7`. Not one pixel was ink, so `bands()` formed zero
  bands and `ocrLines` returned `[]` before any strictness gate was consulted. Mutation that proves
  it: set `MAX_UNKNOWN_SHARE = 1`, `MAX_TEXT_BAND_DENSITY = 1`, `GLYPH_TOLERANCE = 42`, i.e. make the
  decoder accept arbitrary garbage as text. Green. Or delete the whole
  `confidence < MIN_USABLE_CONFIDENCE` branch. Green.
  (b) `packages/gauntlet/test/corpus.test.ts:166-169`, "contains no email address anywhere". Measured:
  all 16 code and 4 web artifacts contain ZERO emails PRE-redaction. Mutation: delete
  `.replace(EMAIL, IDENTITY_PLACEHOLDER)` from `gauntlet/src/redact.ts:291`. Green. The file's own
  mutation guard at `:221-229` does not close it, because `:224-226` assert that a string literal
  defined IN THE TEST matches the email regex, which is an assertion on a value the test computed.
  The sibling "names no builder" test has the same shape.
  For contrast, `:171-178` (maintainer names) IS live: the `express` card genuinely contains
  "Holowaychuk" before redaction. That is the shape the others should be built in.
- **Confidence:** high (both measured, both with a named mutation).
- **Status:** OPEN as of the 2026-08-24 review; re-verify before quoting. The lesson is promoted to
  HOUSE-KNOWLEDGE regardless of the fix state.
- **Next time:** a test asserting an ABSENCE must first prove the presence it is removing. Assert the
  denominator (pixels of ink, emails found pre-redaction), then assert the absence after. And never
  assert on a string the test itself authored: that is a mirror, not a measurement.

---

## Shipping, packaging and the public projection

### L-04 · 2026-08-26 · `npm publish` would have shipped the private reproduction pipeline, because a barrel dragged it into the runtime closure
- **Claim:** the MCP server, the one public artifact, had the entire private reproduction pipeline
  inside its real runtime closure, and esbuild inlined all of it into the published bundle.
- **Evidence:** the chain is `detectors-web/src/probe.ts` calls `recoverText` from `@slop/ocr-text`,
  which imports `decodePng` and `ocrLines` from `@slop/reproduce`
  (`ocr-text/src/raster-text.ts:23,48,54`). `mcp-server/build.mjs` bundles workspace `@slop/*`
  packages into `dist/bin.js` rather than depending on them, which is what makes the install a real
  one-liner, and that same property is what would have published the private code. Nothing in the
  package manifest showed it: the dependency was three hops deep through a barrel and the leak was in
  the BUNDLER's graph, not the dependency list.
- **Confidence:** high (the import chain is explicit and the bundler's inlining is its documented
  behaviour).
- **Status:** FIXED by construction, commit `86f316a` "Extract the MCP server into a public
  repository, generated from this one". The public repository carries its own `@slop/ocr-text` with
  the same module contract where every call is an honest abstention with a stated reason, and its
  calibration baseline is identical entry for entry, which is the evidence that the substitution
  changes no score. `scripts/sync-public-mcp.mjs --check` runs the leak audit.
- **Next time:** before publishing anything, read the BUNDLE, not the manifest. `npm pack` the
  tarball, extract it, and grep the emitted JavaScript for identifiers that should not be there. A
  private/public boundary that is only expressed in a dependency list is not enforced; the boundary
  has to be a separate module with a different implementation, which is what the public
  `@slop/ocr-text` is.

### L-15 · 2026-08-26 · The publish gate printed "leak audit clean" over a mirror missing a whole file, because it was sound and not complete
- **Claim:** `scripts/sync-public-mcp.mjs --check` audited the public mirror for leaked private
  content and had no notion of the private repository having moved AHEAD, so a stale mirror passed
  as clean. Every hit it reported was real, which made it sound; it could not report the hits it had
  no way to look for, which made it incomplete. That is the disqualifying defect class, sitting in
  the publish gate of the product that exists to detect the disqualifying defect class.
- **Evidence, measured before any change:** `node scripts/sync-public-mcp.mjs --check` printed
  `leak audit clean over 135 file(s)` and exited **0** while `packages/core/src/observation.ts`,
  18 197 bytes of it, did not exist in the public tree at all. A projection diff then found **seven**
  stale files, not one: `core/src/observation.ts`, `core/test/observation.test.ts`,
  `mcp-server/src/observations.ts`, `mcp-server/test/observations.test.ts` all missing, and
  `core/src/index.ts`, `mcp-server/src/targets.ts`, `mcp-server/package.json` differing.
  **The old script was then re-run against three mutations and was GREEN on all three**, which is
  the measurement rather than the argument: deleting `observation.ts` (exit 0,
  `clean over 138 file(s)`), adding an ungenerated `smuggled.ts` to the mirror (exit 0,
  `clean over 140 file(s)`), and rewording an upstream comment so a SCRUB no longer matched
  (exit 0). The third is the sharpest: `--check` never called `scrub()` at all, so the hard-fail
  protecting eleven private-document citations was never exercised by the mode whose whole job was
  to check the projection. And the denominator moved, 138 then 139 then 140, while the word "clean"
  did not, which is **L-13's confident denominator over an incomplete check**, in a second script.
- **The property, now stated in the file:** *`--check` passes only if re-running the sync would be
  a no-op.* It is implemented by generating the whole projection into a temp directory and DIFFING
  it, deliberately NOT by enumerating what the mirror ought to contain, because an enumerated list
  is a second copy of the truth and rots exactly the way this check did (**L-08**). Both trees are
  audited now, not one: the mirror is what is published today, the projection is what the next sync
  would publish, and a leak edited into one is invisible in the other.
- **Seven mutations, each run, each red, each reverted:** delete a generated file; flip ONE byte in
  a mirrored file (caught with both sides at 21 874 bytes, so it is a content comparison and not a
  length one); a credential-shaped string in a PUBLIC_OWNED file; a private package name introduced
  upstream only (reported `[projected]`, which the old check could never have seen); a scrub that
  no longer matches upstream; an extra file in the mirror the sync does not generate; a
  `docs/agents/` citation reintroduced upstream.
- **What the completeness fix immediately found, and this is the part that matters:** the very first
  honest run surfaced **thirteen citations of private governance paths across five files that were
  already synced into the public mirror** (`docs/agents/HQ.md`, `HOUSE-KNOWLEDGE`, `LEARNINGS L-02`
  / `L-05` / `L-06`, `scripts/check-corpus-version.mjs`, and one bare prose mention of a private
  package). Two of them were worse than dangling: `scripts/check-no-egress.mjs` **does not exist in
  the public repository**, so a published comment claimed a build gate backed the no-egress property
  there when nothing did. That is **L-10's shape**, a guarantee published beyond the surface that
  enforces it. Thirteen scrubs and one new BANNED pattern closed it. Separately, the same sync made
  the public README's front-page bullet **false**: "It never writes a file. No filesystem write, no
  `exec`, no request for write access anywhere in the package" shipped in the same push as an
  `appendFileSync` observation sink. Both READMEs were corrected and the off-by-default local log
  was disclosed in the same commit.
- **Confidence:** high (the before-state, the three green mutations under the old script and the
  seven red mutations under the new one were all reproduced by command).
- **Status:** FIXED, commit "A publish gate that only reports the failures it can see is a publish
  gate that reports success". Private baselines unmoved across the change: 68 test files,
  1275 passed, 1 skipped, backtest PASS, roster 14/6, corpus drift 12, egress 271 files / 20 sites
  / 0 unapproved.
- **Next time:** for every gate, write the property it asserts in ONE sentence and then ask the
  second question, which is the one nobody asks: is it COMPLETE, or only sound? A gate that can only
  report the failures it thought to look for will report success for every other kind. The cheap
  general answer for any projection, mirror or generated artifact is to regenerate it and diff,
  because the generator is the only complete description of what it produces. And note the
  compounding: fixing the completeness of the gate is what surfaced the thirteen citations and the
  false README bullet. **An incomplete gate does not just miss its own failure, it hides the
  findings of every check downstream of it.**

### L-12 · 2026-08-26 · `server-only` throws inside Next's params worker, so a barrel import 500s every route it generates
- **Claim:** the receipt routes returned 500 because `generateStaticParams` reached a `server-only`
  module through a barrel, and Next evaluates `generateStaticParams` and `sitemap` in a SEPARATE
  worker where `server-only` throws rather than acting as a build-time marker.
- **Evidence:** the mechanism is documented at `apps/web/lib/sample-ids.ts:4-21`, notably `:17`: the
  routes with a `generateStaticParams` answer 500 while every other route keeps working, which is
  what made it look like a data problem rather than an import problem. Fixed by giving the params
  entry point its own module that imports no `server-only` and no `@slop/*` (`:21`), consumed at
  `apps/web/app/receipt/[id]/page.tsx:28` and
  `apps/web/app/gauntlet/artifact/[corpus]/[name]/page.tsx:25`. Commit `8e3a0f8` "Take the sample id
  list out of the server-only graph, and render the receipt page in the suite".
  The `server-only` modules that must stay out of that graph: `apps/web/lib/receipts.ts:1`,
  `lib/self-scan.ts:1`, `lib/gauntlet/store.ts:1`, `lib/gauntlet/receipt.ts:1`,
  `lib/notary/store.ts:1`.
- **The guard is non-vacuous, and that was deliberate.** `apps/web/test/worker-entrypoints.test.ts`
  spawns a real child process, and `:60` separately proves that `server-only` really IS fatal there,
  so the guarantee above it is not an assertion about an environment that never throws. That is the
  standard the rest of the suite should be held to.
- **Confidence:** high (reproduced, fixed, and pinned by a child-process test).
- **Status:** FIXED. Re-verified 2026-08-26: no unmitigated `generateStaticParams` / `server-only`
  path remains in the tree.
- **Next time:** a partial outage that spares most routes points at a build-time evaluation
  boundary, not at data. And when you write a test that depends on something throwing in another
  process, assert that it throws.

---

## The web surface

### L-07 · 2026-08-26 · The fold painted complete at ~170ms and hydration then reset it to nothing
- **Claim:** the landing fold's refresh glitch was not a slow load. The page rendered CORRECTLY and
  then a reveal animation ran a SUBTRACTIVE beat over content that was already on screen, blanking
  it and rewinding a number that had already been printed.
- **Evidence:** measured on the running page: the fold was complete at approximately **170ms**, then
  hydration set all four rows to **opacity 0** and rewrote the elapsed figure back to **0.0**. So the
  visible sequence was correct, then blank, then correct again, which reads as a broken page rather
  than as an animation. Fixed by gating every subtractive beat on `offScreen()`, so an element that
  has already been seen is left alone and only elements below the fold are animated in. Commit
  `421cd8a` "The fold stops un-rendering itself, and a navigation replaces the document not the room".
- **Confidence:** high (two measured numbers on the live page, before and after).
- **Status:** FIXED.
- **Next time:** an entrance animation must never be able to REMOVE something the user can already
  see. Ask of every reveal what it does to the element that is already in the viewport at t=0, and
  test by RELOADING MID-PAGE, not only by loading at the top: restored scroll position renders a
  different first paint and that is where this lived.

### L-10 · 2026-08-26 · The no-accuracy-claim guard does not scan the website, which is the only surface a regulator reads · **OPEN**
- **Claim:** the FTC-motivated guard that fails the build on a stated accuracy figure covers
  `packages/` only, so `apps/web`, the public marketing surface, is entirely unscanned.
- **Evidence:** `packages/core/test/no-claims.test.ts:30`, `SHIPPED_DIRS = ["packages"]`. `apps/web`,
  `scripts/` and `design/` are all outside it. The denominator assertion at `:74-78` checks only that
  a README and two packages were scanned, so it cannot notice the omission: the denominator is drawn
  from the same list as the subject. `mcp-server/README.md:311` claims the guard covers "all shipped
  source". Related and also open: `FORBIDDEN_VERDICT_PHRASES` is never applied to any web output; the
  app renders hand-written `headline`/`claim` strings (`apps/web/lib/receipts.ts:131,179,202,236`),
  none checked. A naive application would fail immediately, because the panel label
  `"GENERATED BY US"` contains `"generated by"`, so what is wanted is a site-scoped subset: the
  person-describing phrases.
- **Confidence:** high (the constant is one line).
- **Status:** OPEN.
- **Next time:** when a guard exists because of a regulator, check that its scope covers the surface
  the regulator actually reads. *In re Workado* was pleaded over marketing claims, not over source
  code. And a guard's own coverage assertion must name absolute expected members, not count whatever
  it happened to find.

---

## Method

### L-08 · 2026-08-26 · Two probe tables for one detector state opposite policies, and nothing compares them · **OPEN**
- **Claim:** the code detector declares its probes twice, with contradictory `expectsNonEmpty`
  policies, so the `comments` probe is paid full coverage weight for collecting nothing.
- **Evidence:** `packages/detectors-code/src/scan.ts:1008-1011` has no `expectsNonEmpty` and a note
  saying zero is *"legitimately zero in an uncommented repository"*.
  `packages/detectors-code/src/artifact.ts:375-381`, which every rule fixture runs against, sets
  `expectsNonEmpty: true` with a note saying zero *"means the comment pattern broke"*. Measured: a
  repo with source and zero comments returns
  `{"id":"comments","ran":true,"denominator":0,"weight":3}` and **coverage 0.765**. The probe is paid
  3/17 of coverage for having collected nothing. That is precisely the failure the scanner's own
  header claims to have fixed: comment extraction dies, both comment rules and the strongest counter
  rule go silent, the repo scores LOWER, and coverage still says "we read it".
  No test cross-checks the two tables.
- **Confidence:** high (measured, with the coverage figure).
- **Status:** OPEN.
- **Next time:** one generated source of truth. The honest policy is
  `expectsNonEmpty: fileRecords.length > 0` in the scanner, derived rather than declared. Whenever a
  list is written out twice, the question is not whether the copies agree today, it is what compares
  them. Siblings in this repo: `probeUsable` written three times, two CRC-32 implementations, two PNG
  signatures, two `median` helpers, three corpus loaders of which the release gate's does a raw
  `JSON.parse` past the schema guard.

### L-09 · 2026-08-26 · A claim guard handed attacker-controlled bytes throws on the honest path
- **Claim:** the forbidden-phrase guard was being asked to police a string half-composed of the
  scanned file's own metadata, so a crafted upload crashed the media detector.
- **Evidence:** `packages/provenance/src/analyze.ts:78` wrapped `launderingDetail(...)` in
  `assertMediaSafe`, and `launderingDetail` (`reencode.ts:443-456`) interpolates every indicator's
  `observed`, which embeds raw file content: `${field.name} = ${field.value}` (`:179`), `ftyp` brands
  (`:214`), MP3 encoder strings (`:350`). Verified: a JPEG whose EXIF `Software` field reads
  `"Screenshot is synthetic and authentic"` matches `SCREEN_CAPTURE_TOOLS` and produces a detail
  containing two forbidden phrases, so `assertMediaSafe` throws `ForbiddenMediaClaimError` out of
  `analyzeMedia`. Same shape at `reproduce/src/pipeline.ts:181` and `notary/src/credential.ts:109,121`.
  A second, independent version of the same mistake: the three claim guards disagree on phrase
  matching. `provenance/src/claims.ts:181-184` word-boundary-anchors single-word phrases, with a
  comment explaining that a naive substring test makes `"lied"` fire on *applied / supplied /
  implied*, and that a guard which fires on honest prose gets edited around rather than obeyed. The
  other two mirrors, `reproduce/src/claims.ts:159` and `notary/src/claims.ts:157`, use plain
  `includes`, so `assertPermitted("The mask was applied.")` throws.
- **Confidence:** high (reproduced with a crafted EXIF field).
- **Status:** the 2026-08-24 review records both; commit `057a0ee` "The scanned artifact is an input
  channel, and it was being trusted" addressed this area. **Re-verify before quoting as fixed.**
- **Next time:** run a claim guard over the FIXED TEMPLATE only, and interpolate observed values
  afterwards or fence them. And a guard that fires on honest prose does not get obeyed, it gets
  edited around, so a guard's false-positive behaviour is a correctness property of the guard.

### L-11 · 2026-08-26 · Twelve rules declare a corpus version the corpus never bumped to · **OPEN**
- **Claim:** twelve web rules record `since: "corpus-2026.10"` while the web corpus declares
  `CORPUS_VERSION = "corpus-2026.09"`, so every receipt cites a version that does not describe the
  rule set that ran.
- **Evidence:** measured 2026-08-26,
  `grep -rhno 'since: "[^"]*"' packages/*/src | sort | uniq -c` gives 39 `"corpus-2026.09"`,
  12 `"corpus-2026.10"`, 19 `"code-corpus-2026.09"`. The declared versions are
  `packages/detectors-web/src/rules/index.ts:12` (`corpus-2026.09`) and
  `packages/core/src/config.ts:168` (same, on `DEFAULT_CONFIG`). The receipt prints
  `corpus ${report.corpusVersion}` at `packages/core/src/receipt.ts:32` and the verdict sentence
  names it at `packages/core/src/assessment.ts:174`, so the wrong version is published on the face of
  the artifact.
- **Why it was not caught:** nothing compared the two. `since` is a per-rule string and the version
  is a module constant, and no test relates them. This is L-08's shape again: a list written in two
  places with no comparator.
- **Confidence:** high (both values read directly, count reproduced by command).
- **Status:** OPEN, and deliberately not fixed in this pass. Bumping `CORPUS_VERSION` regenerates
  `apps/web/lib/corpus.json`, `apps/web/lib/gauntlet/pool.json` (which embeds the version inside 20+
  frozen verdict sentences) and the backtest baseline, which needs the capture scripts and a browser,
  not a find-and-replace. `node scripts/check-corpus-version.mjs` now reports the drift on every run
  with a baseline of 12, so it cannot grow quietly and cannot be forgotten.
- **Next time:** a version is a promise about a set. When you add a rule under a new `since`, bump the
  version in the same commit and regenerate everything that froze the old one, or do not use the new
  `since` yet.

### L-13 · 2026-08-26 · Writing the privacy gate's own pattern reproduced the defect it exists to catch, three times, and the count went 7 to 18 to 21
- **Claim:** the no-egress gate's first three patterns each looked complete, each printed a
  confident denominator, and each was blind to real egress sites. A regex is a hypothesis about your
  input, and the failure is SILENT by construction.
- **Evidence:** measured while writing `scripts/check-no-egress.mjs`, on this repository, in one
  sitting:
  | Pattern | Sites found | What it could not express |
  |---|---|---|
  | `fetch(` | **7** | any wrapper or injected transport |
  | + identifiers CONTAINING "fetch" | **still 7 useful, 16 total** | the class required a character BEFORE "fetch", so `fetchImpl(` in `packages/notary/src/tsa.ts:314` and `packages/notary/src/opentimestamps.ts:57` was invisible |
  | + identifiers STARTING with "fetch" | **18** | playwright's `page.request.get(`, which contains neither "fetch" nor "goto" |
  | + `.request.(get|post|...)` | **21 (20 after comment filtering)** | , |
  So the first version of a PRIVACY gate would have passed while up to fourteen real egress sites
  went unexamined, and it would have printed a denominator the whole time, which is what makes this
  worse than no gate.
- **The sibling it rhymes with:** L-05, where a hue band could not express Tailwind blue-500, and
  the `[a-z-]+` class in this project's reference implementation that skipped a column name and
  left a leak open for four commits. Same shape, three unrelated codebases.
- **Confidence:** high (each count reproduced by command, and each new site verified by opening the
  file).
- **Status:** FIXED in the gate. The pattern list and this history are recorded in the script header
  so nobody narrows it back.
- **Next time:** when you write a detection pattern, do not ask whether it matches; **ask what it
  cannot express, then go and find one of those.** Report the DELTA in count for every widening,
  because that number is the only evidence the widening did anything. And never trust a pattern's
  own output as proof of its coverage: a confident denominator over an incomplete pattern is exactly
  the artifact this product sells the detection of.

### L-14 · 2026-08-26 · One try/catch covering two failure modes made the privacy guard's throw unreachable, inside the privacy mechanism, on the day it was written
- **Claim:** the observation sink wrapped its write in `catch {}` so a full disk could not fail a
  user's scan. That same catch swallowed `ObservationLeakError`, the guard that stops a filesystem
  path reaching disk. A guard whose throw is caught and discarded is a guard that reports success
  without doing its job.
- **Evidence:** `packages/mcp-server/src/observations.ts`, first version: `fileObservationSink`
  returned `{ record: async (o) => { try { await base.record(o) } catch {} } }`. The leak guard in
  `packages/core/src/observation.ts` threw correctly, the write correctly did not happen, and the
  caller was told everything was fine. Caught by `packages/mcp-server/test/observations.test.ts` on
  its first run: "refuses to write a record carrying an unknown rule id" expected a rejection and
  got a resolution.
- **What makes it worth writing down:** it was written into the PRIVACY mechanism, by the person
  writing the privacy mechanism, in the same hour as authoring a HOUSE-KNOWLEDGE section titled
  "a guarantee that reports success without doing its job". Knowing the failure class does not stop
  you producing it. Only a test that runs the guard does.
- **Confidence:** high (reproduced, and pinned by two tests that fail in opposite directions).
- **Status:** FIXED. The two failure modes are now separated by construction rather than by a
  comment: `fileObservationSink` is loud about everything, and `recordBestEffort` tolerates an IO
  error and rethrows `ObservationLeakError`. Two paired tests hold it: one proves the raw sink
  really does throw on an unwritable path BEFORE asserting the tolerance, the other proves a leak is
  not tolerated even best-effort. Fold either behaviour into the other and one goes red.
- **Next time:** **a try/catch that covers two failure modes has picked the more permissive policy
  for both.** Enumerate what can throw inside a catch before writing it, and if the answers differ
  in severity, split the boundary rather than filtering inside it. Also: two of this session's
  three test-authoring mistakes were a test comment naming a mutation that did not actually fail it
  (the `bucketScore` clamp, and a key-equality assertion placed in the suite where the code under
  test does not run). **Run the mutation you name, at the moment you name it.**
