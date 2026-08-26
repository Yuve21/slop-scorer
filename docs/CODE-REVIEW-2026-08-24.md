# Code review, 2026-08-24

First end-to-end read of the repository by a reviewer who did not write any of it. Scope: all 13
packages, `apps/web`, `scripts/`, and the claims made in `README.md`, `product-spec.md`,
`design/DESIGN.md` and the package READMEs.

Method: five readers (one per subsystem plus `packages/core`), each asked to trace real call
graphs rather than trust the prose, and to prove any vacuous test by naming the source mutation
that should fail it and would not. Findings marked **(measured)** were verified by execution, not
by reading.

Baseline at review time: ~1066 tests green, `250/250` in detectors-code/gauntlet/audio,
`262/262` in detectors-web/ocr/image/video. **Every CORRECTNESS defect below is invisible to that
suite.** That is the headline: the suite is large and the guards are real, but the guards and the
shipping paths have drifted apart.

Two notes on provenance of these line numbers:

- `packages/mcp-server/src/*` and `packages/detectors-code/src/scan.ts` were being edited by other
  agents during the review. Line numbers are against the working copy at ~14:00. One finding
  (a symlink-following file walker) was fixed mid-review and has been dropped. One
  (`codeTargetKey` omitting `maxFiles`/`readHistory`) was fixed mid-review and is recorded in
  "Fixed during this review" at the end.
- Where a reader could not reproduce a suspected defect, it is recorded as *not* a defect rather
  than left as a vague worry. Those are in "Checked and clear".

---

## The one-paragraph version

The repository's identity is a set of enforced guarantees, and the enforcement is real: `validate.ts`,
`remediation.ts`, `meta.ts` and the export-route mutation suite are genuinely good, better than
most shipped code. The problem is that **the single function that applies most of those guarantees
is called from exactly one place, and that place is dead code in production.** Three of the five
readers found this independently. Everything downstream of it, non-empty evidence, the
counter-not-remediable rule, the vacuous-probe error, and critically the "only a deterministic read
may propose an applicable patch" gate, holds today by the good behaviour of the rules rather than
by construction. Alongside that sit one verified remote DoS in a decoder pointed at third-party
bytes, a probabilistic-labelling channel that is severed in three of its four implementations, a
notary verification that compares a hash against the value it is supposed to be checking, and a
standing disclaimer that is not rendered on any always-visible web surface.

---

# CORRECTNESS

## C1. `assertWellFormedResult` is never called on any shipping path

**`packages/core/src/registry.ts:60` is the only call site in the repository.**
Confirmed independently by three readers.

`DetectorRegistry` is exported (`packages/core/src/index.ts:101`) and never instantiated by any
product code. Both live faces bypass it:

- `packages/mcp-server/src/targets.ts:65` and `:76`, `analyze(...)` then `buildReport([result])`.
- `apps/web/lib/self-scan.ts:139` and `:199`, same shape.
- `apps/web/lib/receipts.ts:125,165,230`, same shape.

`buildReport` (`packages/core/src/score.ts:330`) performs no validation of its inputs at all. So on
every path a user can actually reach, none of the following is enforced:

| Guard | Line | Status in production |
|---|---|---|
| Finding has non-empty evidence | `validate.ts:21` | dead (also caught by `makeFinding:16`, so this one survives) |
| Evidence locator/observed non-empty | `validate.ts:25` | **dead** |
| A rule fires at most once | `validate.ts:32` | **dead** |
| Signal/counter weight sign | `validate.ts:39,42` | **dead** |
| **Applicable patch only on a deterministic read** | `validate.ts:56` | **dead, see C2** |
| Counter carries no remediation | `validate.ts:62` | dead here; survives via `makeFinding` |
| `assertWellFormedRemediation` (incl. `assertWithinTarget`) | `validate.ts:69` | **dead, see C3** |
| `rulesEvaluated` completeness | `validate.ts:74` | **dead** |
| Coverage in 0..1, probes non-empty | `validate.ts:82,85` | **dead** |
| `VacuousProbeError` | `validate.ts:93` | **dead** (a weaker `probe_failed` abstention is re-derived at `score.ts:450`) |

Note the last row is a genuine seam: `validate.ts:93` treats a ran-but-empty probe as a **throw**,
`score.ts:450` treats it as an **abstention**. Two modules own the same invariant and disagree
about its severity. Neither references the other.

`packages/mcp-server/test/tools.test.ts:99` contains a comment attributing the vacuous-probe
behaviour to `assertWellFormedResult`, when the behaviour it observes actually comes from
`score.ts:450`. That misattribution is how the gap stayed invisible.

**Fix:** call `assertWellFormedResult` on every result inside `buildReport` itself (one line, and
it cannot be forgotten by a new caller), or delete the four direct `buildReport` call sites in
favour of `DetectorRegistry.analyze`. Prefer the former: the registry is not otherwise used and
routing through a class to get validation is a second thing to remember. Then add a test that
drives a malformed result through `scanCodebase`, not through a direct call to the validator.

## C2. The patch gate that protects probabilistic findings is inoperative, in two independent ways

This is the most consequential consequence of C1, and it has a second, separate cause.

The invariant (`README.md:136`, `remediation.ts:21-25`): *a detector that abstains from certainty
cannot ship a patch that asserts it.* A probabilistic finding may carry only a `manual` remediation.
It is enforced in exactly one place, `validate.ts:56`, which per C1 never runs.

The web corpus already ships probabilistic rules, `packages/detectors-web/src/rules/imagetext.ts:78,162,225`
all declare `evidenceKind: "probabilistic"`. None currently carries a `remediate`, so the
invariant holds by luck. The moment one does, `propose_fixes` hands a host agent an
auto-applicable patch derived from an OCR guess.

**Second cause, and the reason a fix to C1 alone is not enough:** the `evidenceKind` channel is
severed in three of its four implementations. The rule → descriptor projection is written out four
times, and only one copy forwards the field:

| Site | Forwards `evidenceKind`? |
|---|---|
| `packages/detectors-web/src/analyze.ts:90-106` | **yes** (with a comment saying the patch gate reads it from here) |
| `packages/detectors-code/src/analyze.ts:176-189` | no |
| `packages/provenance/src/analyze.ts:104-117` (image/video/audio) | no |
| publishing copies: `detectors-code/src/rules/index.ts:42-53`, `detectors-audio/src/rules.ts:60-71` | no |

So a probabilistic rule added to the code corpus or any media corpus prints as `deterministic`
and would pass the gate even if the gate were running.

Downstream, `packages/detectors-video/src/analyze.ts:42` computes the probabilistic downgrade as
`f.family === "stream-consistency"`, a hard-coded family string, directly beneath a comment
claiming it is *"computed from the findings themselves rather than declared, so a new
probabilistic rule cannot be added without the label following it automatically."* It is not.
`desyncRule` (`detectors-video/src/rules.ts:49-94`) never declares an `evidenceKind` at all.

**Fix:** (a) one exported `descriptorOf(rule)` in `@slop/core`, used by all four sites, deleting the
copies; (b) set `evidenceKind: "probabilistic"` on `desyncRule`; (c) compute the video downgrade
as `findings.some(f => f.evidenceKind === "probabilistic")`; (d) fix C1 so the gate runs.

## C3. `propose_fixes` ships patches that never pass the path-traversal or shape guard

`assertWithinTarget` and `assertWellFormedRemediation` (`packages/core/src/remediation.ts:218,238`)
are called from `validate.ts:69` (dead per C1), `core/test/meta.ts:204,213` (tests) and
`core/test/remediation.test.ts` (tests). **Nowhere else.**

`packages/mcp-server/src/fixes.ts` reads `line.remediation` straight off the report and emits it.
Three specific consequences:

1. **No runtime traversal refusal.** The blast-radius guarantee in `README.md:145` ("Absolute
   paths, drive letters, `~` and `..` traversal are all refused") is a property of the fixtures the
   meta-suite checks, not of the shipped payload. A remediator computing a path from artifact data
   would emit it unchecked.
2. **`fixes.ts:148` inverts an invariant the validator enforces.**
   `remediation.addresses.length === 0 || remediation.addresses.includes(e.locator)` treats
   "addresses nothing" as "addresses everything", while `remediation.ts:249` rejects
   `addresses.length === 0` outright. Two modules, one invariant, opposite readings.
3. **`sanitizeRemediation` asserts before it sanitises.** `fixes.ts:69` runs
   `assertWellFormedRemediation`, then `:77-85` rewrites `before`/`after`/`text`. The assertion
   rejects an empty `before` and a `before === after` no-op, both of which `sanitizeUntrusted` can
   *create* (a `replace_range` whose only difference is a credential collapses to identical
   `[redacted:…]` on both sides). The shape check does not cover the bytes that leave.

**Also unsanitised: `delete_file.path`.** `fixes.ts:96` is `case "delete_file": return r;`, and the
other three path-bearing kinds rewrite only text fields. A path carrying `‮` (bidi override)
renders in the host agent's confirmation prompt as a different filename than the one that gets
unlinked, on the one kind for which the codebase built a separate `destructive: true` type and a
confirmation gate.

**Fix:** sanitise first and assert second (`return assertWellFormedRemediation(id, sanitised)`);
sanitise `path` on all four path kinds and re-run `assertWithinTarget` on the sanitised value; make
`fixes.ts:148` fail closed on an empty `addresses`.

## C4. PNG decoder: infinite loop and unbounded inflate on attacker-controlled bytes (measured)

**`packages/reproduce/src/png.ts:101-102`:**

```ts
const readU32 = (b, at) => ((b[at] << 24) | (b[at+1] << 16) | (b[at+2] << 8) | (b[at+3]));
```

No `>>> 0`. A chunk length ≥ 2³¹ decodes **negative**. At `:150` the cursor advances by
`12 + length`; with `length === -12` (bytes `FF FF FF F4`) the cursor never moves and the `while`
at `:130` spins forever. The bounds check at `:134`
(`at + 8 + length + 4 > bytes.length`) is *satisfied* by a negative length, so it does not fire.

Verified twice: a standalone simulation stuck at `at = 8` after 100 000 iterations, and a vitest
case with a 3-second timeout wedged the whole runner past 120 s, a synchronous loop cannot be
interrupted by a test timeout.

**Reachability is not theoretical.** `packages/detectors-web/src/probe.ts:766` → `recoverText` →
`packages/ocr-text/src/raster-text.ts:48` → `decodePng`, on bytes fetched from the page being
scanned. A hostile site serving a 20-byte `.png` hangs the scanner process, the MCP server on a
user's machine, or the build container.

The sibling parser already does this correctly: `packages/provenance/src/container/bytes.ts:57-59`
has the `>>> 0` **and a comment explaining why**. The fix existed in the repo and did not reach the
second copy.

**Second defect, same file:** `png.ts:157` calls `inflateSync(concat(idat))` with no
`maxOutputLength`, and the size sanity check at `:158` runs *after* inflation. A few-KB IDAT
inflates to gigabytes. Same reachability.

**Third:** `decodePng` computes a CRC table (`png.ts:36-52`) that it uses only for *encoding* and
never verifies a chunk CRC on decode, while `provenance/src/container/png.ts:76-82` does verify,
with the stated reason that *"an unverified text chunk is a string an attacker chose."* The
verifying copy is the one pointed at trusted-ish container metadata; the non-verifying copy is the
one pointed at third-party images.

**Fix:** `>>> 0` in `readU32`; `if (length < 0 || length > bytes.length) throw new PngFormatError`;
`inflateSync(data, { maxOutputLength: height * (stride + 1) })` with `width`/`height` bounded from
IHDR first; verify chunk CRCs on decode; and hoist one `crc32` + `SIGNATURE` into a shared module
so there is only one of each.

## C5. `assertMediaSafe` is applied to attacker-controlled bytes and throws (measured)

`packages/provenance/src/analyze.ts:78`:

```ts
abstention.push({ code: "artifact_re_encoded", detail: assertMediaSafe(launderingDetail(artifact.laundering)) });
```

`launderingDetail` (`reencode.ts:443-456`) interpolates every indicator's `observed`, which embeds
raw file content: `${field.name} = ${field.value}` (`reencode.ts:179`), the `ftyp` brands
(`:214`), the MP3 encoder strings (`:350`).

Verified: a JPEG whose EXIF `Software` field is `"Screenshot is synthetic and authentic"` (matches
`SCREEN_CAPTURE_TOOLS` `/^screenshot\b/i`) produces a `launderingDetail` containing two forbidden
media phrases, `"is synthetic"` and `"authentic"`, so `assertMediaSafe` throws
`ForbiddenMediaClaimError` out of `analyzeMedia`. **A crafted upload crashes the media detector.**

The guard is being asked to police a string that is half attacker input. Same shape at
`packages/reproduce/src/pipeline.ts:181` and `packages/notary/src/credential.ts:109,121`.

**Fix:** run the claim guard over the fixed template only, interpolating observed values
afterwards, or fence them the way `reproduce/claims.ts:154` already handles
`PERMITTED_VERBATIM_QUOTATIONS`.

## C6. The three claim guards disagree on phrase matching, and two of them throw on honest prose

`packages/provenance/src/claims.ts:181-184` has `phraseHit`, which word-boundary-anchors
single-word phrases, with a comment explaining that a naive substring test makes core's `"lied"`
fire on *applied / supplied / implied*, and that a guard which fires on honest prose gets edited
around rather than obeyed.

The other two mirrors never got the fix:

- `packages/reproduce/src/claims.ts:159`, `neutral.includes(phrase)`
- `packages/notary/src/claims.ts:157`, `lower.includes(phrase)`

Both inherit `FORBIDDEN_VERDICT_PHRASES`, which contains `"lied"`, `"cheat"`, `"fraud"`, `"you "`,
`"your "`. So `assertPermitted("The mask was applied.")` throws, and `assertAttestable` throws on
any credential text containing "applied", reachable through `summariseRecording`'s
`unparsedFields` from a third-party parser.

**Fix:** hoist `phraseHit` into `@slop/core` and have all three import it; escape the phrase in its
regex.

## C7. Notary: the token check compares a hash against the value it is meant to verify

`packages/notary/src/verify.ts:82`:

```ts
if (parsed.imprintHex !== input.credential.rootSha256)
```

`chain.root` is **recomputed** at `:65` and then used only for the separate `rootMatches` boolean.
The token imprint is compared against the credential's own *asserted* root. On a chain whose events
were edited after issue, all four tokens still "re-verify", and `formatVerification` prints
"timestamps that re-verify: 4 of 4" over a broken record. The file's docstring, *"RECOMPUTES
rather than reads"*, is defeated for the token half.

`packages/notary/test/service.test.ts:175-177` asserts `authoritiesReverified === 4` **beneath a
comment saying "every token now fails too."** The comment describes the intended behaviour; the
assertion pins the bug.

Three more in the same subsystem:

- **`recordIntact` ignores two tamper signals it just computed.** `verify.ts:154` is
  `chain.intact && rootMatches && good.length > 0 && revokedAt === null`, omitting
  `statementReproduced !== false` (computed at `:137`) and
  `good.length === credential.authorityCount` (computed at `:118`). A credential whose statement
  text was rewritten reports `recordIntact: true`.
- **`verify()` falsely accuses untouched recording-backed credentials.** `service.ts:238` passes
  `options.recordingSummary ?? null`; the summary that went *into* the statement is never stored on
  the credential and `db.listRecordings` is never called by `verify`. So
  `await service.verify(id)` on any recording-backed credential returns
  `statementReproduced: false` and a tamper message. `service.test.ts:339` hides this by passing
  the summary back in by hand.
- **The nonce check is skippable and the published scope misstates it.** `tsa.ts:268` is
  `if (parsed.nonce !== null && parsed.nonce !== nonce)`, a token echoing no nonce is accepted.
  `TOKEN_VERIFICATION_SCOPE.checked` (`tsa.ts:62-68`) lists the nonce as *checked*, and
  `VERIFICATION_CAVEAT` quotes that scope onto every credential. Since the CMS signature is
  deliberately unverified, the nonce is the only anti-replay control there is.

**Fix:** compare against `chain.root` and report the credential-vs-recomputed disagreement
separately; add both conjuncts to `recordIntact`; reconstruct the summary inside `verify()` from
`db.listRecordings(chainId)`; reject a granted token with no nonce (or move the line to
`notChecked`).

## C8. The standing disclaimer is not rendered on any always-visible web surface

`REPORT_DISCLAIMER` (`packages/core/src/config.ts:193`) is carried on every `Report`, shipped as a
top-level field on every MCP payload (`format.ts:189`), and **pixel-verified for the PNG export**,
which fails closed if the band cannot be read back out of the finished image
(`apps/web/app/api/receipt/[id]/export/route.ts:95`). That part is excellent.

On the site it is rendered in exactly one place: `apps/web/components/receipt/receipt-actions.tsx:242`
inside a Radix `DialogContent`, behind a "Show the prompt and the method" trigger. It is not in
the server HTML, not in the DOM until a click, not in view-source, and not in a screenshot.

- `apps/web/components/receipt/receipt-view.tsx:57-119` renders headline, claim, evidence list and
  the full arithmetic table with **no disclaimer at any point**.
- `apps/web/components/landing/self-scan-card.tsx` renders a real score and band and never
  references `view.disclaimer`. This is the fold, the highest-traffic surface, and per the design
  mandate the intended marketing screenshot ("we score 12/100 on our own tool, here is the
  receipt"). That screenshot travels without the disclaimer.

The `DisclaimerBand` in `reproduction-figure.tsx:80` is a *different* string about the reproduction
juxtaposition, and renders only in the `succeeded` figure state.

Mitigating: the fold currently scores our own site, so there is no third party to defame. That
stops being true the first time the card is pointed at a user-submitted URL.

**Fix:** render `view.disclaimer` in `ReceiptView` as a sibling of the arithmetic section, and in
the self-scan card footer. Not in a dialog.

**Related, same component tree:** `apps/web/components/receipt/arithmetic.tsx:125` prints
`view.computedScore.toFixed(1)` unconditionally, so an `inconclusive` receipt publishes the
withheld score one screen below the place it was withheld, and a `not_assessed` receipt prints a
total of **0.0**. The fold gets this right and says why (`self-scan-card.tsx:216`: *"a withheld
figure printed above the fold is still a figure above the fold"*); the reasoning was not carried
one component over.

## C9. `probe.ts` still hard-codes render success, the navigation-failure bug is half fixed

`packages/detectors-web/src/probe.ts:622-627` does `page.goto(...).catch(() => null)`, and
`:770` reports `probe("render", true, 1)`, unconditionally true, while the sibling `http` probe
at `:769` correctly reports `ran: status > 0`.

Two live consequences:

- **Hard navigation failure** (DNS, refused, timeout): the page is `about:blank`, yet every
  `requiresProbe: "render"` rule is evaluated against it. `craft.no-meta-description`,
  `no-og-image`, `no-lang`, `no-canonical` and `no-favicon` all fire on *absence*, so a blank page
  yields five confident craft findings citing a document that was never fetched. It abstains only
  by accident, because coverage lands ~0.42 against a 0.6 floor, a load-bearing invariant resting
  on arithmetic nobody asserted.
- **`waitUntil: "networkidle"` timing out on a page that rendered fine** (routine on sites with
  polling or analytics): `main` is null, so the artifact records `http.status: 0`, `headers: {}`
  and `finalUrl: url` (pre-redirect) while the rest of the read is complete and coverage is high
  enough to print a score. `craft.no-canonical`'s remediation then proposes the wrong URL.

**Fix:** `probe("render", !!main, main ? 1 : 0, { expectsNonEmpty: true })`; warn when `goto`
returned null but the DOM read succeeded; set `finalUrl = page.url()` unconditionally.

**Related race, same file:** `Promise.allSettled(pending)` is not awaited until `:745`, but the
`SCRIPT_MARKERS` loop at `:691` iterates `chunks` *before* that settle. Any chunk whose body read
has not resolved is absent from the scan, so `motion.library-fingerprint` fires or does not
depending on network timing, while `assets.chunks` and `totalJsBytes` at `:767` are computed after
the settle and are correct. Two collections from one array disagreeing about when the array is
complete, in the file whose header claims reproducibility. Move the `await` above `:683`.

## C10. Rules that cannot fire, and one artifact that fires two contradictory rules

- **`counter.anti-spam-plumbing` is half dead (`detectors-web/src/rules/counter.ts:227`).** It
  filters `/honeypot|utm|referral/i` over `hiddenInputs[].reason`, but the producer
  (`probe.ts:220`) only ever writes `"attribution field"` or `"honeypot"`. `"attribution field"`
  matches none of them. The repo's own negative corpus proves it: `fixtures/negatives.ts:505`
  records `{ name: "utm_campaign", reason: "attribution field" }`, which the rule cannot see. The
  positive fixture invents `reason: "hidden utm plumbing"`, a string no probe produces, which is
  exactly why the meta-suite did not catch it.
- **Four of seven `AGENT_ARTIFACTS` are unreachable (`rules/builder.ts:19-27`).**
  `WELL_KNOWN_PATHS` (`probe.ts:44-53`) never probes `/.cursor/rules`, `/.windsurfrules`,
  `/.github/copilot-instructions.md` or `/GEMINI.md`, so the highest-weight signal in the corpus
  (`baseWeight: 1.6`) silently misses Windsurf, Copilot and Gemini deployments. Conversely `/.env`
  and `/README.md` are fetched every run and read by no rule. Fix by derivation:
  `WELL_KNOWN_PATHS = [...CRAWLER_PATHS, ...AGENT_ARTIFACTS]`.
- **`.specstory` fires two mutually exclusive rules (measured).**
  `rules/agent-artifacts.ts:47` excludes `/history|transcript|chat/i`; `:92` includes
  `/history|transcript|chat|specstory/i`. Not complements, so `.specstory` escapes the first
  exclusion. Measured through the real analyze path:
  `[ 'agent.instruction-file-committed', 'agent.transcript-committed' ]`, two findings and two
  remediation pairs from one file, one of which calls a chat log an "instruction file".
- **`struct.boilerplate-routes` cannot fire on a real site (`rules/structure.ts:91-97`).** It
  requires `distinctive.length === 0` over up to 50 same-origin link pathnames; any `/privacy`,
  `/terms`, `/login`, or a trailing-slash variant suppresses it.

## C11. Two colour parsers, both blind to `oklch`, the default palette of the most common stack

`detectors-web/src/rules/visual.ts:83-98` (`colorStops`) and `counter.ts:47-56` (`toRgb`) each
handle `rgb()/rgba()` and 6-digit hex, anchored differently. Neither handles `oklch()`, `oklab()`,
`color(srgb …)` or 3/8-digit hex. Chrome serialises modern colour functions verbatim from
`getComputedStyle`, and **Tailwind v4 ships an oklch palette by default.** So on the single most
common stack in the generated-page population:

- `css.violet-blue-gradient`, the flagship visual rule, finds zero stops and never fires;
- `counter.category-convention-palette` finds no warm paper and stops suppressing, so a cream
  Tailwind-v4 human site loses its counter-evidence.

Both fail silently, which `visual.ts:27-36` explicitly names as the failure the file exists to
prevent: *"A threshold that cannot express its own canonical example… fails in silence and reads as
a clean result."*

**Fix:** one shared `parseColor()` covering `rgb/rgba`, hex 3/6/8, `oklch/oklab/lch/lab` and
`color()`, with a fixture per syntax. Delete both private copies.

## C12. The re-encoding gate has a public bypass flag on the shipped API

`packages/provenance/src/analyze.ts:51-58` says the bypass flag *"is not exposed through the
`Detector` interface and no product path sets it."* It **is** exposed on the exported analyze
functions: `detectors-image/src/analyze.ts:22`, `detectors-video/src/analyze.ts:29`,
`detectors-audio/src/analyze.ts:42` all accept `bypassLaunderingGateForTesting` in their public
options type. Any consumer of `@slop/detectors-image` can disable the headline invariant with one
boolean.

**Fix:** take it off the public options type; expose `__unsafeAnalyzeWithoutGate` from a
`./testing` subpath.

## C13. The `no_declared_provenance` abstention is suppressed by any single skipped rule

`packages/provenance/src/analyze.ts:133`: `if (findings.length === 0 && skipped.length === 0)`.
A run where every rule fired nothing *and* one rule was skipped emits **no abstention at all**.
Today that coincides with a dead probe so `score.ts:450` rescues it, accidentally, and only for
probes with `ran: true, expectsNonEmpty: true`. A modality adding a probe with `ran: false`
produces `status: "assessed"`, zero findings, prior-points score, band `few-signals`: a clean bill
on a read that did not happen. Drop the `skipped.length === 0` clause and report the skips in the
detail.

## C14. The headline duration is provider-self-reported

`packages/reproduce/src/pipeline.ts:309-310`: `const attempt = await provider.reproduce(...)` and
the result is spread through. The pipeline captures `startedAtMs` at `:295` but uses it **only** on
the error and timeout branches (`:313`). On the success path `elapsedMs`, `costUsd`, `providerId`,
`model` and `prompt` come from the provider verbatim into `successStatement(totals)` (`:262`) and
into the `SubstantiationLog` (`:240`): the record that is supposed to substantiate "we remade this
in N seconds for $X" under *In re Workado*.

`pipeline.test.ts:64-66` comments that *"Elapsed is MEASURED against the injected clock, not
returned by the provider as a number it made up."* That holds only because `MockProvider` happens
to read the same clock (`providers/mock.ts:117`).

Related: `pipeline.ts:229-231` charges the provider's self-reported `costUsd` to the ledger with no
clamp against the estimate or the remaining budget.

**Fix:** compute `elapsedMs` and `finishedAt` in `callProvider` from `clock`;
`costUsd = min(reported, estimate, remaining)`.

## C15. The `comments` probe is paid full coverage weight for collecting nothing (measured)

Two probe tables for one detector, stating opposite policies:

- `detectors-code/src/scan.ts:1008-1011`, no `expectsNonEmpty`, note: *"Legitimately zero in an
  uncommented repository."*
- `detectors-code/src/artifact.ts:375-381` (`allProbesRan`, which every rule fixture runs against),
  `expectsNonEmpty: true`, note: *"Zero from a repo with source in it means the comment pattern
  broke."*

Measured: a repo with source and zero comments returns
`{"id":"comments","ran":true,"denominator":0,"weight":3}` and **coverage 0.765**. The probe is paid
3/17 of coverage for collecting nothing. That is the exact failure the scanner's own header claims
to have fixed: comment extraction dies → both comment rules and the strongest counter rule go
silent → the repo scores *lower* → coverage still says "we read it".

No test cross-checks the two tables.

**Fix:** one generated source of truth. `expectsNonEmpty: fileRecords.length > 0` in the scanner is
the honest policy.

## C16. Postgres adapter breaks the atomicity its own port documents

`packages/db/src/port.ts:99-108`: *"The chain's `eventCount` and `rootSha256` move in the same call,
so a reader never sees a chain whose count disagrees with its events."*

`postgrest.ts:317-342` is **two separate HTTP requests**: insert into `notary_events`, then an
unconditional `PATCH` of `notary_chains`, with no transaction and no optimistic precondition on
`event_count`. A crash between them leaves a chain whose stored root is stale relative to its
events. `InMemoryDatabase.appendEvents` (`memory.ts:218-238`) *is* atomic, so the reference
implementation the whole suite runs against cannot express the production failure.

**Fix:** one `rpc/slop_notary_append_events` plpgsql function.

**Second, same file:** `recordTimestamp` (`postgrest.ts:352-358`, `memory.ts:244-254`) upserts on
(chain, root, authority). Calling `stamp()` a second time while an authority is down writes
`status: "unreachable", token: null` **over a stored `granted` token**, because `stampEverywhere`
records every outcome including failures. The credential then fails `verify`. Only overwrite when
the incoming status is `granted`.

## C17. Smaller correctness items

- **`apps/web` has no error boundary at all.** No `error.tsx`, no `global-error.tsx` at any level.
  Reachable render-time throws exist (`lib/export-figure.ts:71,49`, `lib/site.ts:18` calling
  `new URL` on an unvalidated env var). The result is Next's default unstyled "Application error"
  page, a scaffold default, on a product that sells the detection of scaffold defaults.
- **`siteUrl()` does not validate** (`apps/web/lib/site.ts:12-16`). `scripts/capture-self-scan.mjs:66-88`
  documents that `vercel build` passes this through as the literal `"[SENSITIVE]"` and defends
  against it; `landing-self-scan.test.ts:96-103` tests that defence *for `scanHost` only*.
  `absolute()` is called in `generateMetadata` on every receipt route and in `app/sitemap.ts` and
  would 500 on the same input. Validate once, in `siteUrl()`.
- **Unescaped `<` in JSON-LD** (`apps/web/app/page.tsx:80`). `JSON.stringify` does not escape `<`,
  and the value includes `siteUrl()`. `.replace(/</g, "\\u003c")`.
- **SSRF in `scan_ui`** (`packages/mcp-server/src/targets.ts:40-46`). No scheme allowlist, no
  link-local block, no post-redirect check. `http://169.254.169.254/...` passes verbatim;
  `probe.ts:647` follows redirects with no restriction, so even a validated public URL can 302 into
  the metadata service. `file://` is blocked only by accident (`https://` gets prepended, producing
  an unparseable URL). Mitigating: stdio server on the user's own machine, localhost scanning is the
  intended use, and evidence is redacted and fenced. The real exposure is a prompt-injected agent
  choosing the URL. Reject non-`http(s)` explicitly; refuse loopback/link-local/RFC1918 unless an
  explicit `allowPrivateHosts` is passed (default true for a bare `port`, false for a `url`);
  re-check `response.url()` after navigation.
- **`POST /api/scan?force=1` is unauthenticated and unrated** (`apps/web/app/api/scan/route.ts:45`),
  `maxDuration = 60`, and launches a browser. The in-flight dedupe is per-instance, which is exactly
  the protection that does not exist on a platform that fans out.
- **`install.ps1` silently refuses to patch an existing config on Windows PowerShell 5.1**,
  the invocation the README documents. `:55` uses `ConvertFrom-Json -AsHashtable`, which does not
  exist in 5.1; the binding failure is swallowed by the `catch` at `:56` and reported as *"existing
  config is not valid JSON, leaving it alone"*. `:61` also writes a UTF-8 **BOM**, which
  `install.sh:54`'s `JSON.parse` then rejects.
- **`install-local.mjs` cannot run on Windows** (`:29,40,42,49`, `execFileSync("claude", …)` with no
  `shell`). `claude` is a `.cmd` shim; every call throws `ENOENT`, and `:29` reports *"the claude CLI
  is not on PATH"* on a machine where it is. The header claims "Cross-platform on purpose".
  `scripts/capture-self-scan.mjs:105` already has the correct pattern.
- **Both installers clobber their own backup** (`install.sh:47`, `install.ps1:49`) on every run,
  and overwrite a customised `slop-scorer` entry unconditionally. Write the `.bak` only if absent.
- **`scripts/capture-code-corpus.mjs:418`**: `if (only && only !== spec.id) continue;`, `only` is
  an array (`:356`), so the comparison is always true and *both* synthetic specimens are skipped
  whenever `--only` is passed, including `--only synthetic-scaffold`. The two loops above use
  `only.includes(...)` correctly. Fails silently: the index merge preserves the stale artifact.
- **`sampleCount` defaults to 0** (`detectors-audio/src/listen/ffprobe.ts:307`) two lines under the
  comment forbidding exactly that pattern, and is printed as evidence (`stream.ts:105`: *"noise
  floor X dBFS over 0 samples"*).
- **The `-inf` sentinel is printed as a measurement.** `reading.ts:70-77` pairs it with
  `noiseFloorIsDigitalZero` *"so nothing downstream mistakes a sentinel for a measurement"*;
  `stream.ts:102-106` ignores the flag and prints `noise floor -150 dBFS`.
- **`checkNegativeCorpus` has no denominator** (`core/src/calibration/index.ts:174`). Zero
  `human`-labelled rows returns `[]` and `assertNegativeCorpus` passes silently, the exact shape
  `meta.ts` exists to catch, in the module that is the product's false-positive tripwire. Mitigated
  today: `detectors-web/test/calibration.test.ts:45,67` and `detectors-code/test/calibration.test.ts:74,105`
  both assert the count. `detectors-audio` does **not**. Add the denominator inside the function.
- **Fabricated evidence locators**: three, in a repo whose core invariant is a re-readable
  locator. `craft.ts:103` / `builder.ts:153` cite `GET ${c.url}.map` when the real map URL comes
  from the `sourceMappingURL` comment and is not stored. `craft.ts:71` cites
  `GET /a-path-that-does-not-exist` when the probe requested
  `/slop-scorer-probe-<Date.now()>`. `craft.ts:286` cites `/favicon.ico` with observed *"absent"*
  when `/favicon.ico` is never requested, producing false positives on every site serving a
  working favicon with no `<link>`.
- **`gitIgnored` is an exact-string match** (`detectors-code/src/scan.ts:928`). `.aider*`,
  `**/CLAUDE.md`, `/CLAUDE.md` or a trailing comment all miss, so a properly-ignored file is
  reported as *committed* at `baseWeight 1.4` in the strongest family. The file already has
  `globToRegExp`.
- **Retiring a pool artifact 500s the day's round for everyone** (`gauntlet/src/service.ts:371-379`
  + `db/src/postgrest.ts:146`).
- **Record caps truncate silently** (`detectors-code/src/scan.ts:853-855`) with nothing appended to
  `artifact.skipped`, unlike the byte budget three lines up which does name itself, and the
  truncated sample feeds a *ratio* rule (`rules/comments.ts:45-49`).

---

# HYGIENE

- **`ProbeOptions.staticOnly` and `.signal` are accepted and silently ignored**
  (`detectors-web/src/probe.ts:59-61`). `staticOnly` appears exactly once in the repo, its own
  declaration. The documented fetch-only `tier: "static"` path does not exist, yet
  `corpus.test.ts:72-84` tests that state by hand-constructing it. `detector.ts:42` threads
  `ctx.signal` in deliberately and it is dropped, so a caller that aborts gets a browser that runs
  to completion. `detector.ts:39` casts `ctx.options` to `ProbeOptions` with no validation.
- **`probeUsable` written three times** (`detectors-code/src/analyze.ts:52-55`, inlined again at
  `:202`, `provenance/src/analyze.ts:88-90`). They agree today.
- **Two CRC-32 implementations, two PNG signatures, two `median` helpers**,
  `reproduce/src/png.ts:36-52` vs `provenance/src/container/png.ts:20-34`;
  `reproduce/src/substantiation.ts:83-89` vs `db/src/memory.ts:33-39`.
- **Two file walkers**: `detectors-code/src/scan.ts:400-461` (async, bounded, symlink-refusing)
  vs `mcp-server/build.mjs:79-87` (recursive sync, `statSync` follows symlinks, unbounded).
  Different domains, so hygiene only.
- **Three corpus loaders, and the release gate skips the replay guard.**
  `detectors-code/test/corpus/index.ts:217` and `detectors-web/test/corpus/index.ts:47` both load
  through their `as*Artifact` guard; `scripts/backtest.mjs:42-50` does raw `JSON.parse` straight
  into `analyzeRepoArtifact`. Bump `REPO_ARTIFACT_SCHEMA_VERSION` and the tests fail loudly while
  the gate silently scores artifacts whose missing fields read as absent tells.
- **`SLOP_LEXICON` is a shared array of stateful global regexes** consumed by two modules
  (`copy.ts:54`, `imagetext.ts:241`), each of which must remember to reset `lastIndex`. Expose a
  `matchLexicon(text)` helper instead.
- **Unbounded quadratic paths on attacker bytes** (`ocr-text/src/svg.ts:76-77,97-99`). The lazy
  `[\s\S]*?` with a required closer means every *unclosed* `<text …>` scans to end-of-input; 50k
  unclosed opens in 5 MB is ~250 GB of scanning. The dedupe at `:97-99` is O(n²) substring search.
  No size cap anywhere on the fetched bytes. Not classic ReDoS, same outcome.
- **Attacker-supplied regexes are compiled and executed** (`detectors-code/src/scan.ts:222`) inside
  `definesItsOwnPattern`. Target strings are short constants so blowup is bounded, but it is
  unbounded compile work in a scanner pointed at strangers' code. (A suspected ReDoS in
  `eraseStrings` was tested to n=30 and **could not** be reproduced, not a defect.)
- **Unbounded segment accumulation** in `jpeg.ts`, `png.ts`, `riff.ts`, `mpeg-audio.ts`, only
  `isobmff.ts:34` has a `MAX_BOXES` cap. A file of repeated `FF D0` pushes one record per two input
  bytes. `png.ts:95-104` additionally retains full text-chunk payloads.
- **Scan throughput ~0.7 MB/s with a byte budget but no time budget (measured).** 300 files ×
  ~45 KB took 20.5 s. `MAX_TOTAL_BYTES` is 256 MB, so a scan at the budget is ~6 minutes of
  single-threaded work with no deadline and no cancellation. Add `maxMillis` beside the byte budget.
- **Debug instrumentation in a shipping module.** `detectors-code/src/scan.ts:770-771` defines
  `__t0`/`__t` writing to `console.error`, with 11 call sites, and it is already compiled into
  `dist/scan.js:599`, which is what `mcp-server/build.mjs` bundles. Appeared during this review;
  flagging in case its author is mid-task.
- **`render-printed-receipt.mjs` leaks a browser** (`:318-331`, no `try/finally`), **shells to
  `python` + PIL with no availability check** (`:296`, unlike `vendor-fonts.mjs:78` which does it
  right) *after* writing a 4 MB PNG, and has a dead `report.score ?? report.total` fallback
  (`:127,314`) for a field `Report` does not have.
- **Three unused imports in `scripts/vendor-fonts.mjs:34`**: notable only because "unused
  scaffolded dependencies" is a rule in this project's own corpus.
- **Rule prose that misdescribes `detect`**: `comment.section-banner-density`
  (`detectors-code/src/rules/comments.ts:107`, titled "Every file opens with the same shape of
  banner comment", `detect` never looks at position or banners, it measures density spread);
  `dom.eyebrow-count` ("sitting above section headings", no positional check exists);
  `css.stock-shadow` ("a tight 1-2px contact shadow", regex matches only exactly `0px 1px 2px`);
  `dom.numbered-steps` (filters `/^0[1-9]$/` while the probe collects `/^0\d$|^\d{2}$/`).
- **`counter.licensed-foundry-face` fires on trial fonts, which its own note says it should not**
  (`detectors-web/src/rules/counter.ts:106-113`). The negative corpus proves it:
  `negatives.ts:118-119` records `"Focal Maxi Trial"` and Overtone collects the full −0.8 global
  counter for a trial licence.
- **`counter.handmade-artifact` is trivially gameable** (`counter.ts:187-209`): a single element
  with any non-`normal` `mix-blend-mode` mints −0.5 of global counter-evidence.
- **`counter.team-apparatus` cites files that may not exist** (`counter.ts:180-181` hardcodes
  `.github/CODEOWNERS` while the artifact boolean is set from any of three paths).
- **`scaffold.unused-dependencies`' rebuttal omits its real blind spot**: `scan.ts:821` diverts test
  files before `parseSource`, so a dependency imported only from tests reads as unused.
- **`gapLengths` returns the opposite of its name** (`detectors-audio/src/listen/reading.ts:173-176`).
  Correct today by accident; the test at `stream.test.ts:197` bypasses it and recomputes.
- **`declaredDurationSec` silently collapses onto the decoded one**
  (`detectors-audio/src/listen/ffprobe.ts:261-263`, `Math.max(0, indexOf("[FORMAT]"))`), so
  `stream.declared-duration-disagrees-with-decoded` can never fire on such a file.
- **Column names hand-mapped at call sites** (`db/src/postgrest.ts:336,390`) directly contradicting
  `rows.ts:11` (*"Nothing hand-maps a column name at a call site"*).
- **Dead/unreachable code**: `detectors-web/src/probe.ts:687-688` (an `animate.css` marker tested
  against a `.js`-filtered array); `provenance/src/container/riff.ts:132` and `jpeg.ts:229`
  (`notRiff`/`notJpeg` unreachable, `inspectContainer` already matched); `notary/src/service.ts:206-207`
  (an unreachable `undefined` branch); `reproduce/test/claims.test.ts:178` and
  `notary/test/service.test.ts:196` (`void x;` no-ops).
- **`newNonce()` is 62 bits, documented as 64** (`notary/src/tsa.ts:138-139`).
- **`decodeInteger` is lossy on real TSA serials** (`notary/src/der.ts:162-167`, `v * 256 + byte`;
  RFC 3161 serials are 16–20 bytes).
- **`verifyInclusion` ignores `treeSize` and `index`** (`notary/src/chain.ts:137-143`): a path of
  any length from any tree that folds to the root is accepted.
- **`checkChain` compares timestamps as strings** (`notary/src/chain.ts:204`).
- **`curl | sh` installs an unpinned, `-y` auto-accepted package** (`install.sh:58`,
  `install.ps1:60`, `README.md:18,32,40`). Every client launch executes whatever is on the registry
  under that name, with the confirmation suppressed, and `README.md:21-23` presents this as a
  feature. For a tool handed a repository path, an unpinned auto-updating remote execution channel
  is the wrong default. Pin `slop-scorer-mcp@0.1.x`.
- **Prefix-match on the "already registered" check** (`install.sh:67`, `install.ps1:70`): a server
  named `slop-scorer-dev` makes both scripts skip the install.
- **The FTC no-accuracy-claim guard does not scan the website.**
  `core/test/no-claims.test.ts:30` is `SHIPPED_DIRS = ["packages"]`. `apps/web`, the public
  marketing surface, is entirely unscanned, as are `scripts/` and `design/`. The denominator
  assertion at `:74-78` checks only that a README and two packages were scanned, so it cannot
  notice. `mcp-server/README.md:311` claims the guard covers "all shipped source".
- **`FORBIDDEN_VERDICT_PHRASES` is never applied to any web output.** The app never renders
  `view.verdict` at all; it publishes hand-written `headline`/`claim` strings
  (`apps/web/lib/receipts.ts:131,179,202,236`) and marketing copy, none checked. Note a naive
  application would fail immediately, the panel label `"GENERATED BY US"` contains `"generated
  by"`, so a site-scoped subset (the person-describing phrases) is what is wanted.
- **`apps/web` carries a second, independently worded disclaimer.**
  `apps/web/lib/reproduction.ts:77-80` duplicates `reproduce/src/compose.ts:57-62`, and it is the
  web copy that ships on the receipt page and every og:image. It passes `findClaimViolations`
  today, by luck. Re-export from `@slop/reproduce` instead.

---

# STALE

- **`README.md:43` says detectors-code has 13 rules. It has 19 (measured:
  `CODE_RULES.length === 19`).** Web's 51 is correct.
- **`README.md:360` says "all three tools present"**; the server registers five
  (`server.ts:169-268`), which `README.md:3` also says. Left over from a three-tool build.
- **`README.md:142`: "the corpus throws at load if anyone attaches a fix to a counter."** It throws
  at *analyze* time (`core/src/finding.ts:20-24`). The difference matters: a counter rule with a
  faulty `remediate` ships fine and blows up in a user's `scan_ui` call rather than failing the
  build. (`attachRemedies` *does* throw at load, but only for the missing/extra-entry cases.)
- **`README.md:328-331`: "Confirmed unclaimed on the npm registry."** If still true, both headline
  install commands (`:18`, `:62`) are guaranteed to fail for every reader, and the unpublished
  state is disclosed 13 lines *below* the installer that depends on it.
- **`README.md:71-73` states the npm-existence precheck unconditionally**; it is wrapped in an
  `if npm is on PATH` in both installers.
- **`packages/reproduce/src/export.ts:5-8,15-17`: "`renderFigureExport` is the only way to obtain
  figure bytes… There is no second compositor in this product."** There is:
  `apps/web/lib/og.tsx` renders PNG bytes via `next/og` for five routes. It is a *reasoned* second
  renderer (it drops the plates, so there is no juxtaposition to disclaim) but it emits bytes that
  never pass `checkDisclaimerProminence`, and this is the docstring a legal reviewer would rely on.
- **`packages/db/src/port.ts:84-85`: "idempotent for a day already counted."** `memory.ts:151-152`
  and `supabase/migrations/0001_gauntlet.sql:179-180` both increment `rounds_played` and
  `rounds_correct` unconditionally; only the *streak* is idempotent. Both implementations agree with
  each other and disagree with the doc, and those counters feed the published discrimination
  figures.
- **`packages/detectors-video/src/analyze.ts:42`'s comment** claims the probabilistic label is
  derived from the findings; it is a hard-coded family string. (See C2.)
- **`packages/provenance/src/analyze.ts:51-58`** claims the laundering bypass is not exposed. It is.
  (See C12.)
- **`packages/detectors-code/src/artifact.ts:392`** pins the `agent-files` denominator at 12;
  `AGENT_FILES.length` is 14. Nothing compares them.
- **`scripts/render-printed-receipt.mjs:56`** references `buildScene()`, which does not exist
  (the functions are `buildReceiptData()` and `scene()`).
- **`scripts/vendor-fonts.mjs:6-8`** claims "anyone can re-run it and byte-compare"; the script
  writes over the committed files, so there is nothing left to compare against except `git diff`.
- **`packages/mcp-server/scripts/install-local.mjs:8`**: "Cross-platform on purpose." False on
  Windows.
- **`packages/mcp-server/test/tools.test.ts:99`** attributes behaviour to `assertWellFormedResult`
  that actually comes from `score.ts:450`.

---

# VACUOUS TESTS

Every entry names the exact mutation that should fail it and would not. This is the section to read
if you only read one.

### V1. `packages/detectors-web/test/calibration.test.ts:79-88`, asserts the absence of a rule that does not exist

```ts
expect(row.firedRules, `${row.id} must not be penalised…`).not.toContain("css.cream-palette");
```

`css.cream-palette` appears in exactly two places in the repository: this line, and a *prose
comment* at `counter.ts:18`. There is no such rule. The assertion is permanently true.

**Mutation:** add a positive rule `id: "css.warm-paper"` in `visual.ts` that fires on
`isWarmPaper(a.color.bodyBackground)` and penalises Overtone and Rodeo. The test, whose entire
stated purpose is to prevent exactly that, stays green.
**Fix:** assert on the property, not on a string: no `signal`-polarity rule in `visual-default`
fired on the warm-paper negatives.

### V2. `packages/ocr-text/test/recover.test.ts:81-95`, the "not type" fixture contains no ink

The fixture writes `noise.data[...+0] = 10` on a white raster, **the red channel only**. The
decoder's ink test is `luma(px) < 128`; `luma(10, 255, 255) = 181.7`. Not one pixel is ink, so
`bands()` forms zero bands and `ocrLines` returns `[]` before any strictness gate is consulted.

**Mutation:** set `MAX_UNKNOWN_SHARE = 1`, `MAX_TEXT_BAND_DENSITY = 1` and `GLYPH_TOLERANCE = 42`
in `reproduce/src/ocr.ts`, i.e. make the decoder accept arbitrary garbage as text. Green. Equally,
delete the whole `confidence < MIN_USABLE_CONFIDENCE` branch in `raster-text.ts:70-79`. Green.

Given this suite's stated purpose is *"a recovery module fails in one direction that matters: it
INVENTS"*, this is the one test that most needed to be non-vacuous.
**Fix:** make the noise inky (`[10,10,10]`), and add a case with a correctly-sized band full of
non-glyph ink so the density and unknown-share gates are the thing under test.

### V3. `packages/gauntlet/test/corpus.test.ts:166-169`, "contains no email address anywhere" (measured)

All 16 code and 4 web artifacts were extracted pre-redaction: **zero contain an email.**

**Mutation:** delete `.replace(EMAIL, IDENTITY_PLACEHOLDER)` from `gauntlet/src/redact.ts:291`. Green.

The file's own mutation guard (`corpus.test.ts:221-229`) does not close this: lines 224-226 assert
that a **string literal defined in the test** matches the email regex, and `:228` only checks the
cards are non-empty. That is an assertion on a value the test itself computed.
The sibling "names no builder" test (`:184-197`) has the same shape, measured, no card contains any
of the eight builder strings pre-redaction, and the test's own comment concedes `redactLine` would
not strip `v0` anyway.
For the record, `:171-178` (maintainer names) **is** live: the `express` card genuinely contains
"Holowaychuk" before redaction. Keep it and build the others in its image.

### V4. `packages/mcp-server/test/tools.test.ts:141`, a tautology

```ts
expect(listing.rules.length).toBe(WEB_RULES.length + CODE_RULES.length);
```

`RULE_DESCRIPTORS` is *defined* as `WEB_RULES.map(...)`, and `listRules` maps over it with a filter
that is inert when no family is passed. This reduces to `arr.map(f).length === arr.length`.

**Mutation:** empty `BUILDER_RULES`, `VISUAL_RULES` and `CRAFT_RULES` in
`detectors-web/src/rules/index.ts:21-28`. `list_rules` now returns a corpus missing three families;
green, because both sides shrink together.
**Fix:** an absolute floor plus specific rule ids that must be present.

### V5. `packages/mcp-server/test/fixes.test.ts:168-176`, restates the predicate instead of exercising the guard

The test re-implements `assertWithinTarget`'s condition inline and applies it to whatever the
fixture happened to produce.

**Mutation:** delete the body of `assertWithinTarget` (`remediation.ts:218-230`) entirely. Green,
no rule in the fixture proposes an escaping path, so there is nothing to catch and nothing to
observe. It asserts a property of the fixture, not of the guard.
Second-order: it restates the four traversal shapes the source owns, so a fifth shape added to
`assertWithinTarget` is silently outside the test.
**Fix:** feed a hand-built `Remediation` with `path: "../../../etc/passwd"` through
`sanitizeRemediation` and assert it throws.

### V6. `packages/mcp-server/test/tools.test.ts:130-133`, passes when `scanUi` throws for any reason

```ts
const payload = await scanUi({ port: 1 }).catch(() => null);
if (payload === null) return;
```

**Mutation:** make `uiReport` (`targets.ts:69`) `throw new Error("x")` on every input. Green. The
test whose stated purpose is *"returns `not_assessed` rather than a low score"* passes on a
`scan_ui` that cannot return anything at all.

### V7. `packages/reproduce/test/png-export.test.ts:108-124`, tests the error class, not the gate

The test never calls `renderFigureExport`. It calls `checkPanelSymmetry` on a hand-mutated layout,
then **constructs an `ExportRefusedError` by hand** and asserts on its own constructor arguments.

**Mutation:** delete the symmetry gate at `reproduce/src/export.ts:94`. Green.

Related: two of the four `ExportRefusalCode` arms are never driven through `renderFigureExport` at
all. **Mutation:** change `export.ts:98` to `if (false)` and `:105` to `if (false)`. Full suite
green. (`apps/web/test/export-route-mutation.test.ts` mocks `composeFigure` and then re-checks with
`checkDisclaimerProminence` *in the test*, so it does not close this either, though that suite is
otherwise the best in the repo.)

### V8. `packages/db/test/adapters.test.ts:221-244`, asserts on a string the test authored

`not.toContain("should-not-appear")` holds because the test itself wrote the mocked body as
`{ code: "22P02", message: "invalid input syntax" }`. `postgrest.ts:103-104` copies
`parsed.message` through verbatim and strips nothing, so the claim in `postgrest.ts:59-60`
("NOTHING from the request body") is unimplemented.

**Mutation:** none needed in the source, change the *fixture* to
`message: "duplicate key ... payload=(should-not-appear)"` and the assertion fails, proving the
code has no redaction.
**Fix:** do not forward `parsed.message`; emit the status, the SQLSTATE and the table.

### V9. `packages/detectors-image/test/corpus.test.ts:104-111`, "names a byte offset on every citation" never looks for one

Two `toBeTruthy()` calls standing in for the claim in the test name.

**Mutation:** change any provenance rule's locator from `jpeg:app1@0x1f4c` to the literal
`"somewhere in the file"`. Green, and the package's headline claim, that a reader can go to the
byte and re-read it, is now false with a green suite.

### V10. `packages/detectors-image/test/corpus.test.ts:64-75`, the "no pixel reads" guard sees only the outermost closure

`rule.detect.toString()` returns the source of that function only, not of anything it calls.

**Mutation:** add `const noiseResidual = (a) => …frequency analysis…;` at module scope in
`provenance/src/rules.ts` and write `detect: (a) => noiseResidual(a)`. The banned vocabulary never
appears in the stringified `detect`, and the guard whose comment says it *"stops somebody helpfully
adding 'just a small frequency check' in six months"* passes.
**Fix:** run the ban over the module source, as `motion.test.ts:116-136` already does correctly with
`readFileSync`.

### V11. `packages/detectors-code/test/scan.test.ts:109-116`, cannot fail on the branch it names

`expect(p.denominator).toBeTypeOf("number")` is guaranteed by `probe()`'s constructor, and the
meaningful branch is gated on `p.expectsNonEmpty`, which, per C15, the scanner never sets on
`comments`.

**Mutation:** break comment extraction entirely (return `[]` from `parseSource`'s comment
collection). This test passes, `corpus.test.ts` passes, and coverage still reports 0.76.
**Fix:** assert the specific denominators the fixture repo is known to produce.

### V12. `packages/detectors-video/test/corpus.test.ts:230-236`, checks a title prefix, claims to check more

The comment says it catches a rule *"which is probabilistic without saying so"*. The body only
asserts `title.startsWith(PROBABILISTIC_TITLE_PREFIX) === false`. There is no machine-readable
signal it could use, because `evidenceKind` is never set on a media rule (C2).

**Mutation:** add a rule in family `container-shape` whose `detect` returns a statistical estimate,
with an ordinary title. Green.

### V13. `packages/reproduce/test/export-figure.test.ts:207`, a tautology that hides unreachable code

`expect(layout.disclaimerHeightPx).toBe(layout.labelHeightPx)`. `compose.ts:307-308` assigns both
from the same local `glyph`.

**Mutation:** delete `compose.ts:472-474` (the `disclaimerHeightPx < labelHeightPx` branch of
`checkPanelSymmetry`) entirely. Green, the branch is structurally unreachable from the compositor.
(The pixel-level version of the same check at `compose.ts:417-421` **is** properly mutation-tested
at `export-figure.test.ts:133-169`. That one is fine.)

### V14. `packages/detectors-image/test/calibration.test.ts:83-85` and `test/corpus.test.ts:117-119`, 18 points of headroom, and the constant hardcoded

`expect(report.score ?? 0).toBeLessThanOrEqual(99)`. The highest score the image corpus produces is
81.

**Mutation:** change `MAX_SCORE` (`core/src/assessment.ts:111`) from 99 to 1000. Both green. They
also pass when `score` is `null`, because of the `?? 0`.
(`core/test/remediation.test.ts:203` *does* pin the constant, so the invariant is not unguarded
overall, but these two are named as if they guard it.)

### V15. `scripts/render-printed-receipt.mjs:313`, asserts a count it wrote six lines earlier

`if (data.findings.length !== 6) throw …` where `findings` is the literal six-element array at
`:73-85` in the same file. The header claims *"if this drifts from the page, the script stops"*,
but nothing here ever reads `apps/web/lib/receipts.ts`, where the page's sample actually lives.

**Mutation:** change a weight in `apps/web/lib/receipts.ts`. The homepage picture now shows a
different total than the receipt it is captioned as; the guard does not fire.

### V16. `packages/detectors-audio/test/stream.test.ts:491-496`, asserts on an object literal in the same file

`expect(Object.keys(vendor)).not.toContain("mayTrain")` where `vendor` is defined at `:470`.

**Mutation:** add `mayTrain?: boolean` to `Transcript` and honour it in `mayEnterCorpus`. Green.

### V17. Conditional assertions whose body never runs

- `packages/mcp-server/test/tools.test.ts:75-79`, `if (shape) { … }`. **Mutation:** delete the
  `uniform.file-length` rule; the finding disappears, the `if` never enters, green.
- `packages/detectors-audio/test/calibration.test.ts:325-330`, `if (status === "assessed")`. The
  single `AUDIO_AMBIGUOUS` member abstains, so the body is currently unreachable. **Mutation:** make
  the rule compute 95 while still abstaining. Green.
- `apps/web/test/landing-self-scan.test.ts:71-75`, early-returns when
  `builder.bare-platform-domain` is absent from the capture, on data the test does not control.

### V18. `apps/web/test/receipt-page.test.ts:72`, brittle and vacuous at once

Matches the literal Tailwind string `class="flex min-w-0 flex-1 basis-0 flex-col gap-3 p-5"` and
asserts two occurrences. It fails on a cosmetic class reorder that changes nothing, and it passes if
one panel gains an extra wrapper that breaks symmetry, since it only counts the inner div. It tests
string identity, not the property `reproduction-figure.tsx:26-34` says is load-bearing.

### V19. `packages/detectors-code/test/calibration.test.ts:96-99`, a floor looser than the engine's

`toBeGreaterThanOrEqual(0.6)` while `CODE_CONFIG.minCoverage` is `0.65` (`families.ts:104`). A
member drifting to 0.62 passes here and abstains in production.

### V20. `packages/{provenance,notary,reproduce}/test/claims.test.ts`, the "is bigger than core's" assertion

`expect(FORBIDDEN_MEDIA_PHRASES.length).toBeGreaterThan(FORBIDDEN_VERDICT_PHRASES.length)` and its
two siblings. Each list is constructed as `[...FORBIDDEN_VERDICT_PHRASES, …additions]`, so the
assertion is true as long as one addition exists.

**Mutation:** delete every modality-specific phrase except one. Green. The check proves nothing
about coverage of the phrases that modality actually needs.

---

## On the meta-suite's coverage

The brief asked whether the vacuous-check meta-suite covers all detector packages or only the two it
was written for. Measured answer:

- Checks 1–5 (`expectNeutralSilence`, `expectRuleIsAlive`, `expectStaleProbeFailsLoudly`,
  `expectProbeRegistryIsHonest`, `expectDescriptorsAreComplete`) run in **all five** detector
  packages: web, code, image, video, audio.
- **Check 6, `expectRemediationsAreHonest`, runs in exactly two**: `detectors-code/test/remediation.test.ts:19`
  and `detectors-web/test/remediation.test.ts:26`.
- `packages/provenance` has no meta-suite participation at all.

The gap is narrower than it looks, and I want to be precise rather than alarming:
`attachRemedies` is called only by the web and code corpora, and image/video/audio define no
`remediate` at all, so there is currently nothing in those packages for check 6 to check. It is a
latent gap, not a live hole. It becomes live the moment a media rule grows a remediation, which is
also the moment C2's severed `evidenceKind` channel would let it ship as auto-applicable.

**Fix:** run `expectRemediationsAreHonest` in all five packages now, so the day a media remediation
is added it is checked by default rather than by someone remembering.

---

## Checked and clear

Recorded so nobody re-spends the time:

- **There are not two OCR paths.** `packages/ocr-text/src/raster-text.ts:23,48,54` imports
  `decodePng` and `ocrLines` from `@slop/reproduce`. One decoder, correctly reused.
- **`apps/web/lib/plate-raster.ts` is not a second raster path.** It is an SVG→`Raster` rasteriser
  importing `createRaster`/`getPixel`/`setPixel` from `@slop/reproduce`, and never touches PNG.
- **No dead rules in the code or audio corpora**: `detectors-code/test/calibration.test.ts:173-181`
  and `detectors-audio/test/calibration.test.ts:296-302` both assert every rule fires somewhere, and
  both pass. The corpus tests would **not** pass with every rule dead.
- **The counter-not-remediable invariant holds on the live path**, via `makeFinding` (`finding.ts:20-24`)
  and `fixes.ts`'s polarity skip, independently of the dead validator.
- **A report cannot render with empty evidence**: `makeFinding:16-18` throws.
- **`MAX_SCORE` clamping is correct** (`score.ts:218`), and `report.score` is correctly `null` on
  both abstentions (`:508`).
- **No secrets or `server-only` modules cross into client components**; `lib/sample-ids.ts` is
  tested in a real child process (`worker-entrypoints.test.ts:55`), which is a genuinely good test.
- **`vendor-fonts.mjs` and `capture-self-scan.mjs` use fixed argv**: no argument injection.
- **The ticket HMAC path** is length-checked before `timingSafeEqual` and binds round + participant;
  the rate limiter bumps before validation.
- **No `any` in the public types** of core, detectors-code, gauntlet or detectors-audio.
- **A suspected ReDoS in `eraseStrings`' `/(["'`])(?:\\.|(?!\1).)*\1/g`** could not be reproduced on
  backslash runs to n=30. Not a defect.
- **`apps/web/test/export-route-mutation.test.ts` is the standard the rest of the suite should be
  held to**: it breaks the shared compositor, requires a 409, and separately proves each mutant fails
  the checker.
- **`packages/core/test/meta.ts`** carries denominators and mutation partners throughout, and
  `no-claims.test.ts:71-79,102-120` mutation-tests its own patterns. Both are exemplary.

## Fixed during this review

- `packages/mcp-server/src/targets.ts:61-68`, `codeTargetKey` now includes `readHistory` and
  `maxFiles`. Previously a `verify_fix` run with `maxFiles: 1` hit the same key as a full scan and
  reported every finding in the repository as resolved. Fixed by another agent mid-review.
- `packages/detectors-code/src/scan.ts`, a symlink-following file walker was replaced with a
  symlink-refusing, depth- and count-bounded one, with scan limits and secret redaction.

---

# The five most worth fixing

1. **Call `assertWellFormedResult` inside `buildReport` (C1, C2, C3).** One line restores nine
   guards across every shipping path, including the gate that stops an OCR guess being handed to a
   host agent as an auto-applicable patch. Everything else in this section is downstream of it.
   Pair it with the shared `descriptorOf()` (C2), or the patch gate will run correctly against a
   field that three of four corpora never populate.

2. **Fix the PNG decoder (C4).** `>>> 0` in `readU32`, a negative/oversize length check, and
   `maxOutputLength` on `inflateSync`. A 20-byte file hangs the scanner process forever, reachable
   from any URL the tool is pointed at, and the correct implementation already exists 40 lines away
   in `provenance/src/container/bytes.ts:57-59`. This is the only finding that is remotely
   triggerable and unrecoverable.

3. **Fix the notary verification (C7).** `verify.ts:82` compares the token imprint against the
   credential's self-asserted root instead of the recomputed one, so tokens "re-verify" on a chain
   whose events were edited, and `service.test.ts:175` pins that behaviour beneath a comment
   describing the opposite. Add the two missing conjuncts to `recordIntact`, and reconstruct the
   recording summary inside `verify()` so untouched credentials stop being accused of tampering. A
   verification that cannot fail is worse than no verification.

4. **Render the disclaimer where a reader will see it (C8).** It is pixel-verified in the PNG export
   and absent from the landing fold and `ReceiptView`, present only inside a dialog nobody opens.
   While the fold scores our own site this is a governance defect rather than a live one; it becomes
   live the first time the card takes a user-submitted URL. Fix the abstaining-receipt score leak in
   `arithmetic.tsx:125` in the same pass.

5. **Close the two tests that certify silence (V2, V3), then sweep the rest.** The OCR "not type"
   fixture contains no ink and the gauntlet redaction corpus contains no emails, so the two suites
   guarding *invention* and *deanonymisation*, the product's two worst failure modes, currently
   pass over empty inputs. Both are the exact "collection built by scanning, never asserted
   non-empty" shape that `core/test/meta.ts` was written to catch, which suggests the meta-suite's
   discipline should be applied to the hand-written suites and not only to the corpora.

Honourable mention, deliberately outside the five because it is a correctness bug rather than a
structural one: **C11, the colour parsers' blindness to `oklch`.** The flagship visual rule cannot
fire on a default Tailwind v4 site, which is a large share of the population this product exists to
score. It is a cheap fix and probably the highest-value single rule repair in the repository.
