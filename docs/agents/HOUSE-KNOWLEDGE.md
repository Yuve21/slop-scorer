# House knowledge (every agent reads this first)

The rules half of the brain. Hard invariants, the product's own definition of a defect, the
verification baselines, and the decisions that are not up for re-litigation.

`docs/agents/LEARNINGS.md` is the other half. This file holds the RULES: what must never be broken.
LEARNINGS holds the FINDINGS: what an outcome actually taught us, each carrying its evidence (a
`file:line`, a measured number, a command that ran). You read both before acting, and you append to
LEARNINGS when a run teaches something new. **When a learning hardens into a rule that must never be
broken again, promote it up here and leave a pointer in LEARNINGS.** That promotion is the only way
a rule gets added to this file.

**Honest framing: this is retrieval, not training.** Nothing in either file updates any model's
weights. There is no fine-tune here. The compounding is that an agent reads validated lessons before
it acts, so a mistake costs the project once instead of every session. Do not describe it as training
a model. The CORPUS is trained, separately and by a documented human-reviewed path; see "Training the
corpus" in `docs/agents/HQ.md`.

---

## What this product is

slop-scorer scores an artifact 0 to 99 for generated-template character and prints a receipt a
stranger can re-derive. It is deterministic: no model, LLM or classifier is a dependency of any
package. Rules are DATA (id, family, weight, cap, severity, rationale, `falsePositiveNote`,
`prevention`, `since`), so the corpus is publishable, auditable, disputable and versionable without
shipping a new engine.

Thirteen packages plus `apps/web`. `packages/core` owns the contract, the scoring engine, the
receipt and the calibration harness. `detectors-web` (51 rules) and `detectors-code` (19 rules) are
the deterministic corpora. `ocr-text`, `provenance`, `detectors-image|video|audio`, `reproduce`,
`notary`, `gauntlet`, `db` and `mcp-server` are the rest.

---

# THE DISQUALIFYING DEFECT: a guarantee that reports success without doing its job

**This is the first rule in the file because it is the failure class the product exists to catch.
Shipping one is disqualifying, not a bug to be triaged.**

Four shapes, every one of them found in this repository, every one of them with a green suite over
it at the time:

1. **A validator that is never called.** `assertWellFormedResult` carries **fourteen** throw-sites
   (counted 2026-08-26, `packages/core/src/validate.ts:16-94`; the review said nine, which is what
   happens when you quote a summary instead of counting) and has exactly one call site, inside a
   class no product path instantiates (L-03). Every guard downstream of it holds by the good
   behaviour of the rules rather than by construction. **Still OPEN.**
2. **A verification whose reference value comes from the artifact under test.** The notary compared a
   token imprint against the credential's own self-asserted root, so a chain whose events had been
   edited still reported "timestamps that re-verify: 4 of 4" (L-02). A verification that cannot fail
   is worse than no verification, because it stops the next look.
3. **A test that certifies silence.** The OCR "not type" fixture contained no ink, so the decoder
   returned `[]` before any strictness gate was consulted; the gauntlet redaction corpus contained
   no email addresses, so `not.toContain(EMAIL)` was permanently true (L-06). Both suites guard the
   product's two worst failure modes, invention and deanonymisation, and both passed over empty
   inputs.
4. **A rule that cannot express the syntax it detects.** Both colour parsers are blind to `oklch`,
   which is Tailwind v4's default output, so the flagship visual rule cannot fire on the most common
   modern stack (L-05). A dead rule does not crash. It silently lowers the score of every artifact it
   would have flagged, while the report keeps printing confident citations for the rules that
   survived. The product becomes a random number generator with footnotes, and the number goes DOWN,
   so nobody complains.

**The obligations this puts on you, and they are not optional:**

- **Every new check gets mutation-tested in the same commit.** Name the exact source change that
  should turn it red, make that change, watch it go red, revert. Write the mutation into the test's
  comment so the next reader can redo it. A test you have not seen fail is a decoration. **Name the
  GATE too, not just the expected colour:** a mutation aimed at a type is invisible to a runtime
  suite and is caught one gate earlier by `tsc`, so a survivor is a finding only after you have
  checked what the gate you ran can actually see (L-19).
- **Every collection asserts its own denominator.** A probe, a scan, a corpus loader or a redaction
  pass that reports having examined ZERO things is a FAILURE regardless of exit code. `expectsNonEmpty`
  exists for exactly this; use it, and cross-check the two probe tables that already disagree
  (`detectors-code/src/scan.ts` vs `artifact.ts`, L-08).
- **A denominator drawn from the same list as the subject cannot detect that list shrinking.**
  `expect(listing.rules.length).toBe(WEB_RULES.length + CODE_RULES.length)` reduces to
  `arr.map(f).length === arr.length` and stays green when three whole families are emptied. A count
  that only agrees with itself is not a verification. Pin absolute floors and specific ids.
- **Trace the call graph, do not trust the prose.** Three independent readers found the dead
  validator; the docstring above it did not. When a comment claims an invariant is enforced, find the
  line that enforces it and find the path that reaches that line.
- **A guard applied to attacker-controlled input must be tested on attacker-controlled input.** The
  claim guard was handed a string half-composed of EXIF fields, and a crafted JPEG threw it out of
  the media detector (L-09).

---

## Hard rules (standing, each has a scar behind it)

- **No em dashes anywhere in prose.** Commas, colons, periods, parentheses. Applies to code comments,
  docs, README, UI copy and commit messages.
- **No regressions.** A fix that breaks something else is not a fix. Baseline BEFORE touching
  anything, re-run after, and report both numbers.
- **Fix the PATTERN, not the instance.** A finding is evidence that siblings exist. `>>> 0` was
  already correct in `provenance/src/container/bytes.ts` and never reached the second PNG decoder.
  Ask of every finding: what CLASS is this an instance of, and where else does that class live? Then
  say the COUNT out loud, including when it is one.
- **Measure by execution, not by reading.** A claim not backed by a command that ran is a hypothesis
  and must be labelled one. "Two callers could interleave" and "the loop was stuck at `at = 8` after
  100 000 iterations" are different claims; only the second is evidence.
- **Say plainly what you did NOT verify.** Every report closes with two lists: what was verified by
  running it, and what was asserted from a doc or a table without running it. A gate reported as
  passing when it was skipped is the single most damaging thing you can write.
- **No half measures.** Re-verify anything interrupted mid-edit. Say out loud what is unfinished.
- **Commit and push to main after finishing.** Commit as `Yuve21 <yuvrajrobotics@gmail.com>`, which
  is the account Vercel and the CLI are tied to.

---

## The output contract (binding, and it is the legal surface)

- **`assessed` / `inconclusive` / `not_assessed` are enum values in the API type, not UI garnish.**
  Abstention is a STATUS, never a band. There is deliberately no "inconclusive" band, because a band
  invites a caller to sort "we could not read the page" next to "few signals" as though they were
  neighbouring amounts of one thing.
- **`MAX_SCORE = 99`.** The product cannot reach certainty and no path may print 100.
- **The verdict says what WE did, never what anyone IS.** `FORBIDDEN_VERDICT_PHRASES` and
  `verdictSentence` enforce it. A score is a statement about an ARTIFACT.
- **Low coverage withholds the score rather than reporting a low one.** `minCoverage`,
  `AbstentionCode.coverage_below_floor`.
- **One family is a correlated observation, not corroboration.** A HIGH score built on one family is
  withheld (`minFamiliesFired`, applying at or above `minFamiliesAppliesAtOrAbove`). A LOW score on
  full coverage is different and must NOT be withheld: refusing to clear artifacts that deserve
  clearing is its own dishonesty.
- **A withheld score must not be printed one screen below the place it was withheld.** The fold gets
  this right; `arithmetic.tsx` did not (L-07).
- **The receipt reconciles to the number, exactly, in integers,** or `ReceiptMismatchError`.
- **The receipt cites the corpus version it ran under,** and that version must actually describe the
  rule set that ran. See "The corpus version is a promise" below.
- **`REPORT_DISCLAIMER` rides on every report and is not configurable.** It must be rendered where a
  reader will see it without clicking, on every surface that publishes a score.

### No accuracy claim, anywhere

`packages/core/test/no-claims.test.ts` fails the build on a stated accuracy, precision, recall or
false-positive figure in shipped source or the README. Any such number is computed by the harness at
test time, from a named corpus, on the version being shipped. *In re Workado* (FTC, 2026) is a
consent order over a 98%-accuracy claim for an AI-content detector; the pleaded counts were that the
respondent did not build the model, did not test it against the advertised use cases, and could not
produce substantiation. Do not write a number this repo cannot re-derive on demand.

**Known gap, treat as live:** that guard's `SHIPPED_DIRS` is `["packages"]`, so `apps/web`, the
public marketing surface, is entirely unscanned (L-10).

### Every finding carries a locator a stranger can go and re-read

A file and a line, a CSS selector, a computed style value, a byte offset, a dependency name. The
`Finding` type requires a non-empty `evidence` array and `makeFinding` throws on an empty one. A
citation whose locator is fabricated (`GET /a-path-that-does-not-exist` when the probe requested
`/slop-scorer-probe-<ts>`) is a correctness defect in the product's core promise, not a cosmetic one.

---

## Rules as data, and the corpus version is a promise

- **Nothing that decides how much a rule MATTERS may be code.** `detect` is a function because a
  threshold has to be compared somewhere. Weight, cap, family, severity, polarity, the rationale, the
  false-positive note and `since` are fields.
- **`falsePositiveNote` is mandatory and must be specific.** It is the published condition under
  which the rule is WRONG, and `attachRemedies` injects it as the rebuttal on every patch the rule
  proposes, so a softened note travels attached to an edit somebody is about to apply. "May
  occasionally be wrong" is not a false-positive note. Name the legitimate artifact that trips it.
- **Counter-evidence is never remediable.** It argues FOR the artifact. A "fix" would delete the best
  thing about the thing being scanned. Enforced at corpus load by `attachRemedies` and at analyze
  time by `makeFinding`.
- **Every signal rule has a remediation.** A rule that can fire and cannot say what to change is a
  report line the loop stops at.
- **An enumeration is a hypothesis about your input, exactly as a regex is.** When the input's
  vocabulary is published by somebody else, VENDOR their list as data, keep it in a different file
  from yours, and compare the two in BOTH directions: the terms you cannot express, and the terms you
  express that they never defined. Deriving one list from the other makes the check a mirror. Sort
  the missing members by POLARITY before deciding what a gap costs: a gap on the counter side and a
  gap on the signal side are opposite bugs wearing the same clothes, and **a dead counter RAISES the
  score**, which is the direction that accuses honest work (L-05, L-17). Note also that a published
  vocabulary has THREE states: active, retired, and absent. Comparing against the active half alone
  reads a retired term as an invention.
- **Fixtures are mandatory, and the mutated fixture differs in exactly ONE thing.** The meta-suite
  runs five checks per rule on every test run: the neutral artifact fires nothing, the rule fires on
  its positive, the mutant does not fire, every citation has a non-empty locator and observed value,
  and zeroing the rule's probe removes it from `rulesEvaluated` with a warning NAMING it.
- **A fixture must be a string a probe actually produces.** `counter.anti-spam-plumbing`'s positive
  fixture invented `reason: "hidden utm plumbing"`, a string no probe emits, which is exactly why the
  meta-suite did not catch that the rule was half dead against the real producer's
  `"attribution field"`. Cross-check every fixture value against its producer.
- **The corpus version bumps when the rule set changes,** and a rule's `since` may never be ahead of
  the version its corpus declares. `node scripts/check-corpus-version.mjs` is the ratchet. A receipt
  citing a version that does not describe the rules that ran is a lie of exactly the kind this
  product sells the detection of. **Live drift as of 2026-08-26: 12 web rules declare
  `since: "corpus-2026.10"` while `CORPUS_VERSION` is `"corpus-2026.09"` (L-11).** Note what the
  digest covers and what it does not: it hashes the SCORING FIELDS of every rule, so a repair to a
  PARSER changes what the rules can see without changing the rule set. That is deliberate, it is the
  same treatment the `>>> 0` hardening got (L-01), and a fix of that kind is reported with its
  before-and-after digest rather than being waved through in silence.

---

## The published corpus is an attack surface, in both directions

- **Publishing the rules teaches evasion. That is the accepted trade,** because a detector nobody can
  audit is a detector nobody should believe, and *In re Workado* is what unauditable looks like when
  it fails. The mitigation is corpus breadth and counter-evidence, never secrecy.
- **A rule that is cheap to evade and expensive to be wrong about is a bad rule.** Weight accordingly.
  Evasion that makes the artifact genuinely better (real photography, licensed type, a history with
  reverts in it) is the product working, not a defeat.
- **Counter-evidence must not be mintable.** A single element with a non-`normal` `mix-blend-mode`
  currently mints -0.5 of global counter-evidence (`counter.handmade-artifact`). Any counter a
  generator can emit in one line is a hole, and global counters bypass family caps.

## Nothing writes a file on anybody's behalf

The MCP server proposes and the host agent disposes, inside the approval flow the user already has.
Duplicating a permission model inside a detector would be a second thing to get wrong and a worse
experience even when it was right.

- **Only a deterministic read may propose an applicable patch.** Where a detector abstains from
  certainty, its fix may only be `manual`.
- **Nothing outside the scanned target.** Absolute paths, drive letters, `~` and `..` traversal are
  refused, and an applicable patch may only touch a file the finding actually cited.
- **Deletion is its own kind.** `delete_file` carries `destructive: true` in the type so a host can
  demand a second confirmation for exactly that shape without reading prose.
- **Sanitise first, assert second.** `sanitizeUntrusted` can CREATE a shape the assertion rejects (a
  `replace_range` whose only difference is a credential collapses to identical `[redacted:...]` on
  both sides). Assert on the bytes that actually leave.
- **`verify_fix` reports the before and after finding sets, never a success.** A finding that
  disappears is the evidence. A finding that appears sets `regression: true` and is stated FIRST,
  because a fix that breaks something else is not a fix.

## The scanned artifact is an input channel

Everything the scanner reads was chosen by somebody else: page bytes, image bytes, repository
contents, file names, EXIF fields, dependency names, commit messages. Treat all of it as hostile.

- **A length read from untrusted bytes is not a number until it is coerced.** `>>> 0` on every
  32-bit read, then a range check against the buffer. A missing coercion made a 20-byte PNG hang the
  scanner forever, synchronously, where a test timeout cannot interrupt it (L-01).
- **Every decompression is bounded before it runs** (`maxOutputLength`), and every accumulator has a
  cap. A size sanity check that runs AFTER inflation is not a check.
- **A parser that can say "I could not read this" must have somebody listening.** Ask of every error
  list in the tree what CONSUMES it. If the answer is nothing, the guarantee above it is decorative.
  `container.parseErrors` was read by no one, so a walk that explicitly failed was paid full coverage
  and the report said 1.0 (L-16). The consumption is not optional and it has two halves that must
  always travel together: the failed region loses its coverage weight, AND it raises a coded
  abstention naming the probe. A silent coverage drop is just a smaller confident number.
- **Coverage means what was READ, never what was attempted.** A denominator answers "how many things
  came back" and cannot answer "was there a region I could not open at all". Those are different
  facts and a count collapses them. `ProbeStatus.complete` carries the second one.
- **When a check gates on a collection being EMPTY, ask whether empty can mean "not there" and "there
  but unreadable" at once.** If it can, the message it prints is wrong half the time, and a citation
  asserting the absence of something present is a FABRICATED locator, which is a correctness defect
  in the product's core promise (L-16). Derive the observed value from what was actually walked.
- **A skipped flag byte is an unexpressed branch.** Which other parser reads a field whose meaning
  depends on a version or a flag it currently skips? That question, not a grep for the symptom,
  found three more instances of the same defect in one pass (L-18). Rank the instances by what they
  produce: one that MANUFACTURES a value outranks one that produces silence.
- **Every parse loop must prove the cursor advances.** A zero or negative advance is an infinite loop.
- **Every scan has a time budget as well as a byte budget.** Measured throughput is ~0.7 MB/s against
  a 256 MB byte budget, which is about six minutes of uninterruptible single-threaded work.
- **A guard's own template is the only thing it may be asked to police.** Interpolate observed values
  after the check, or fence them.
- **Redaction and fencing are load-bearing, not hygiene.** Evidence is quoted into an agent's context
  window; an unfenced observed value is a prompt-injection channel.

## Privacy is a product claim, so it is a code invariant

**No package in this repository may make an outbound network request except the browser probe
navigating to the URL the user explicitly asked to scan.** No telemetry, no usage beacons, no
"anonymous" statistics, no model calls, no update checks.

The corpus observation sink writes to the local filesystem, is OFF by default, and requires an
explicit opt-in from the user's own config. It never leaves the machine. Anything that would change
that is a product decision for the founder, made in the open, with the README changed in the same
commit. `node scripts/check-no-egress.mjs` is the ratchet.

---

## Verification baselines (a change is not done until these match; chain with `&&`, never `;`)

| Gate | Command | Expected as of 2026-08-26 |
|---|---|---|
| Types | `npm run typecheck` | 0 errors |
| Build | `npm run build` | green |
| Tests | `npm test` | **71 files, 1312 passed, 1 skipped (1313)**, ~110s |
| Backtest | `npm run backtest` | green against the committed baseline |
| Everything | `npm run verify` | typecheck + build + test + backtest |
| Agent roster | `node scripts/check-agent-roster.mjs --check` | 14 agents, 6 departments |
| Corpus version | `node scripts/check-corpus-version.mjs` | 6 corpora, drift baseline 12 |
| No egress | `node scripts/check-no-egress.mjs` | 273 files, 20 sites, 0 unapproved |
| Public MCP | `node scripts/sync-public-mcp.mjs --check` | 25 scrubs match, leak audit clean, 121 generated files byte-identical |

**The test count is a BASELINE, not a target. A move in EITHER direction is a finding.** A drop
usually means files stopped being collected, which is worse than a failure. Report which of the two
branches it is (assertions added or removed, versus the same assertions producing a different result)
rather than picking the comfortable one; `git log -1 -- <file>` usually settles it.

**Do not widen a baseline to make a run go green.** No re-running until it passes, no quietly
dropping a failing gate, no "expected 1243, got 1241, close enough". If a gate is wrong, fix the gate
in the open and say you did.

---

## Publishing traps that have already fired

- **`npm publish` from this repository would leak the private reproduction pipeline.**
  `detectors-web` calls `recoverText` from `@slop/ocr-text`, which reads the PNG decoder and the
  bitmap-font OCR out of `@slop/reproduce`, and esbuild inlines the whole closure into
  `dist/bin.js`. The public repository carries its own `@slop/ocr-text`: same module contract, every
  call an honest abstention with a stated reason (L-04).
- **This repository is authoritative; the public one is a projection, regenerated and never edited.**
  Four packages travel: `core`, `detectors-code`, `detectors-web`, `mcp-server`. Make the change
  here, run `node scripts/sync-public-mcp.mjs`, verify and commit there. A scrub that no longer
  matches is a hard failure, not a warning, so a reworded comment cannot silently ship its original
  text.
- **`--check` passes only if re-running the sync would be a NO-OP.** It generates the projection
  into a temp directory and diffs it, so a STALE mirror fails as loudly as a leaking one, and it
  audits BOTH trees. It reported "leak audit clean" over a mirror missing four whole files for as
  long as it only knew how to look for leaks (L-15). Do not replace the diff with an enumerated
  list of what the mirror should contain: that list is a second copy of the truth and it rots.
- **A comment that cites anything the public reader cannot open is a scrub, not a shrug,** and a
  comment that cites a GATE the public repository does not ship publishes a guarantee nothing there
  backs. `scripts/check-no-egress.mjs` was cited in published source for one sync (L-15).
- **A change to what the server writes, reads or records changes the public README in the same
  commit.** The observation sink shipped in the same push as a README bullet reading "It never
  writes a file. No filesystem write ... anywhere in the package" (L-15).
- **`server-only` throws inside Next's params worker.** A module imported through a `server-only`
  barrel from `generateStaticParams` 500s every route it generates (L-08 sibling, see L-12).

## Decisions already made. Do not re-litigate these.

- **No model, LLM or classifier as a dependency of any package.** Determinism is the product.
- **Publish the corpus.** Auditability beats evasion resistance here, permanently.
- **The score is bounded at 99** and abstention is a status, not a band.
- **Nothing auto-applies a patch.** The host agent disposes.
- **No accuracy, precision or recall number that the harness cannot re-derive at test time.**
- **This repository is PUBLIC, deliberately, and that is a founder decision made 2026-09-09** so
  companies can see work in progress. It was described here as private until then, which was wrong,
  and the wrong version is worth knowing about because two other things were resting on it (L-20).
  What that changes: nothing in this repository is a secret, so do not reason as though a strategy
  document, `apps/web`, or the reproduction, notary, gauntlet, provenance, database and
  media-detector packages were unreadable by a stranger. Write every root document as though a
  competitor and a regulator will both read it, because both can.
  **What it does NOT change, and this is the part that matters:** `packages/mcp-server` is still the
  only PUBLISHED artifact, and the reason `@slop/reproduce` must stay out of its bundle was never
  secrecy. The public `@slop/ocr-text` is a module contract, an honest abstention with a stated
  reason, whose calibration baseline is identical entry for entry (L-04). A published comment citing
  `scripts/check-no-egress.mjs` is still a guarantee nothing in the public repository backs (L-15).
  So the scrubs and the leak audit keep their full force; only their THREAT MODEL narrows, from
  "somebody could read the private source" to "the published package must not claim what it does not
  ship".
