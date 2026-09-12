# Agent HQ, the portable brain for any seat

Drop this repository into **any Claude Code, Codex or Cursor login** and this file is the single
entry point that gives that seat the full picture: the knowledge, the house rules, the CLI set, the
agent team, and the loop that turns real scans into corpus rules. Everything it references lives in
the repository, so a fresh seat becomes useful without re-learning what past sessions already paid
for.

**slop-scorer** (the name is older than the product; see `docs/POSITIONING-2026-09-11.md`): a team
of specialist agents that find flaws in a codebase, a site and the business around it, delivered as
an MCP server, where every finding cites a locator a stranger can go and read. Rules as data,
published false-positive conditions per rule, abstention as a first-class status, a reproduction
pipeline and a notary. No model, LLM or classifier is a dependency of any package.

**Retired on 2026-09-11, so a seat does not go looking for it:** the 0 to 99 score, the band, the
verdict sentence about an artifact's origin, and the gauntlet. The engine underneath them is kept
and is what makes an agent's finding checkable. The internal weighting still exists; what left is
the PUBLISHED number.

---

## 60-second quickstart (per seat)

**Any seat, first:** read these three, in order.

1. `docs/agents/HOUSE-KNOWLEDGE.md`, the RULES. It opens with the disqualifying defect class, which
   is the one thing to read if you read nothing else, then the output contract, the rules-as-data
   invariants, the untrusted-input rules and the verification baselines.
2. `docs/agents/LEARNINGS.md`, the FINDINGS. What outcomes actually taught us, each carrying its
   evidence (a `file:line`, a measured number, a command that ran). Read the Index in full, then read
   in full every entry touching your task plus the always-read set (**L-01, L-02, L-03, L-06**).
3. `README.md` at the repository root, for the architecture and the package map.

Then, by seat:

- **Claude Code**: `.claude/agents/` loads automatically. Invoke one with the Task tool, for example
  "run the vacuous-test-hunter over `packages/gauntlet`".
- **Codex**: run from the repository root. The agent definitions in `.claude/agents/*.md` are plain
  Markdown; paste one in as the system prompt to run that agent's job.
- **Cursor**: point Cursor's rules at `docs/agents/HOUSE-KNOWLEDGE.md` **and**
  `docs/agents/LEARNINGS.md` (both, or the seat gets the rules without the memory). Use the
  `.claude/agents/*.md` files as prompt templates the same way, and honour their closing instruction
  to append what a run taught back to LEARNINGS.

## The CLI set

| Tool | Install | Auth |
|---|---|---|
| node 20+ / npm | required by the repository | , |
| git | present | , |
| gh | `winget install GitHub.cli` | `gh auth login` |
| playwright browsers | `npx playwright install chromium` | , |
| vercel (apps/web only) | `npm i -g vercel` | `vercel login` |

`.env.local` holds `apps/web` secrets and is gitignored. **Never paste it into a shared or hosted
seat**; a review seat does not need production credentials, and no package outside `apps/web` reads
any secret at all.

## MCP

This repository IS an MCP server, so the useful wiring is pointing a seat at your own build:

```sh
npm run build && npm run install:local --workspace slop-scorer-mcp
```

That registers the local `slop-scorer` server so an agent can call `scan_codebase`, `scan_ui`,
`list_rules`, `propose_fixes` and `verify_fix` against the code you are editing. Dogfooding is the
point: a change that makes our own scan worse is a finding.

For browser work the seat needs playwright, which is a dev dependency here and an optional peer
dependency of the published server.

---

## The org chart (14 agents, in `.claude/agents/`)

The roster is built from THIS product, not copied from another one. Every agent below exists because
of a specific, load-bearing property of a deterministic detector that publishes its corpus and scores
strangers' work. Each opens by reading `docs/agents/HOUSE-KNOWLEDGE.md` and
`docs/agents/LEARNINGS.md`, so they share one brain and one memory, and each closes by appending what
its run taught.

**Corpus**
- **corpus-steward** - owns rule quality, weights, false-positive notes and corpus versioning, and
  runs the observation-to-rule promotion path. Exists because rules are DATA here: the thing that
  decides what a score means is a set of fields, not a model, so somebody has to be accountable for
  that set line by line to a reader who disagrees with it.
- **detector-coverage** - finds what the corpus structurally cannot express or reach: dead rules,
  fixtures whose values no probe produces, hand-enumerated lists gone narrow, populations nobody has
  scored. Exists because a dead rule does not crash, it silently lowers every score it would have
  raised, and the meta-suite cannot catch a rule and its fixture sharing one wrong assumption (L-05).
- **abstention-auditor** - proves "inconclusive" and "not assessed" are used honestly, that a
  withheld score is never published one screen over, and that an empty read is never sold as a clean
  result. Exists because abstention is a first-class status here and is the thing that makes the
  product defensible.

**Adversarial**
- **false-positive-hunter** - tries to make the corpus fire on legitimate human work. Mandatory
  second reviewer on every corpus promotion, because a rule's author is the worst judge of its
  false-positive surface. Exists because at consumer prevalence a 5% false-positive rate is roughly
  coin-flip precision, which is structural and not a tuning problem.
- **evasion-red-team** - tries to defeat the published corpus, and prices every successful evasion in
  lines changed and skill required. Exists because publishing the rules teaches evasion and that
  trade was made deliberately, so somebody has to keep measuring what it costs.
- **mcp-surface-auditor** - the public attack surface: path containment, prompt injection through
  scanned artifacts, SSRF, secret leakage, resource exhaustion, and the patch-proposal gate. Exists
  because `packages/mcp-server` is the only published artifact, it runs on a stranger's machine
  inside an agent that has file-write and shell tools, and its arguments are attacker-influenced.
- **untrusted-bytes-auditor** - every parser and decoder pointed at bytes somebody else chose: PNG,
  JPEG, RIFF, ISOBMFF, MPEG audio, SVG, DER, the repository scanner. Exists because a detector is a
  parser farm aimed at hostile input, and a missing `>>> 0` already made a 20-byte file hang the
  scanner forever, unrecoverably (L-01).

**Integrity**
- **vacuous-test-hunter** - hunts guarantees that report success without doing their job: checks
  never called, verifications comparing a value to itself, tests certifying silence, denominators
  drawn from their own subject. The house's most important seat, because that is the exact failure
  class this product exists to catch, so shipping one is disqualifying.
- **receipt-integrity** - proves the receipt reconciles to the number in integers, cites a corpus
  version that describes the corpus that ran, carries its disclaimer where a reader sees it without
  clicking, and never publishes a withheld score. Exists because the receipt IS the product: a score
  without one is an accusation.
- **notary-verifier** - the hash chain, RFC 3161 multi-authority timestamps, inclusion proofs, the
  DER parser, credential verification and the persistence layer's atomicity. Exists because the
  credential's whole value is that a stranger can check it without trusting us, and the verification
  has already been a tautology once (L-02).

**Governance**
- **claims-officer** - every claim the product makes about itself: accuracy figures, verdict
  phrasing, disclaimer scope, published verification scopes, README and marketing copy. Exists
  because *In re Workado* was lost on what was published rather than on what was built, and because a
  published scope that overstates is the same class of defect as an overstated accuracy number.
- **privacy-steward** - the no-egress guarantee, the local observation sink, and redaction and
  deanonymisation in what we publish. Exists because the tool is pointed at private repositories on
  developers' laptops, and because a redaction test over an input that never contained the thing is a
  guarantee that reports success without doing its job (L-06).

**Product surface**
- **ui-craft** - hands-on craft audit of `apps/web` in a real browser: motion, first paint,
  hydration, type, colour, dark mode. Exists because the site sells the detection of template-shaped
  websites and is scored by its own product in public on its own landing fold, so every tell of ours
  that appears on it has unusual leverage.

**Release**
- **release-verifier** - runs every gate against the recorded baselines and reports pass, fail or
  skipped with a **denominator** for each. Exists because this project has repeatedly shipped gates
  that scanned zero things and printed PASS.

### Deliberately NOT on the roster

Named so nobody re-proposes them without a reason:

- **A general code-auditor.** Its whole job here is already split, with sharper briefs, across
  `vacuous-test-hunter`, `untrusted-bytes-auditor` and `mcp-surface-auditor`. A generalist would
  duplicate three specialists and be worse than all of them.
- **A performance engineer.** There is no production traffic and no database under load. The one real
  performance property, ~0.7 MB/s scan throughput against a 256 MB byte budget with no deadline, is
  a resource-exhaustion finding and belongs to `mcp-surface-auditor`.
- **Marketing, growth, finance and support seats.** There are no users and nothing to support. Adding
  them would produce activity, not work.
- **A chief-of-staff.** With 14 agents and one founder, a coordinator layer is overhead. The two
  loops below have named owners instead.

### Model tier, and how to change it

Seven agents are pinned `opus`: `corpus-steward`, `false-positive-hunter`, `evasion-red-team`,
`vacuous-test-hunter`, `mcp-surface-auditor`, `untrusted-bytes-auditor`, `claims-officer`. Those are
the seats whose entire value is catching what a cheaper model would have agreed with: each of them is
adversarial or judgement-bound, and a run that nods along is worse than no run because it certifies.

The other seven are `sonnet`: they are checklist-and-measurement seats where the brief carries the
judgement.

To move one: edit the `model:` line in its brief, then run `node scripts/check-agent-roster.mjs` and
commit the regenerated roster.

---

## The learning loop (how outcomes turn into behaviour)

Recording what happened is not learning. The loop that makes outcomes compound is two-sided, and both
sides are enforced in the agent briefs rather than left to good intentions.

- **READ.** All 14 briefs open by reading `docs/agents/HOUSE-KNOWLEDGE.md` **and**
  `docs/agents/LEARNINGS.md`, including the always-read set the index names. A fresh seat therefore
  starts with the validated lessons in hand, not just the rules.
- **WRITE.** Every brief closes by requiring an append to LEARNINGS when a run teaches something.
  "Routine run, no new learning" is a valid and expected outcome; inventing one is worse than an
  empty line, because the file is read before acting.
- **PROMOTE.** When a learning hardens into a rule that must never be broken again, it moves up to
  HOUSE-KNOWLEDGE and leaves a pointer behind. L-01 through L-06 have already been promoted, as the
  disqualifying-defect section at the top of that file. **That section is the only part of
  HOUSE-KNOWLEDGE that was not written by decree**, and it is the most important part of it.
- **The evidence bar.** Every entry carries a date, a falsifiable claim, the EVIDENCE (a `file:line`,
  a measured number, a command that ran, or a commit), a confidence, a status (`FIXED <commit>` /
  `OPEN` / `SUPERSEDED`) and what to do differently. No evidence means it is labelled `HYPOTHESIS`.
  Contradictions are handled by marking the old entry `SUPERSEDED` with the date and the reason, not
  by piling up.
- **What this is, honestly: retrieval, not training.** Nothing in it updates model weights. There is
  no fine-tuning here. The compounding is that agents read validated lessons before they act, so a
  mistake costs the project once instead of every session. Do not describe it as training a model.
  **The CORPUS is a different thing and it genuinely is trained. That loop is below.**

---

## Training the corpus

This is the part of the product that must get better with use, and it is the one place the word
"training" is honest. It is a **human-reviewed, evidence-backed pipeline from real scans to versioned
rules**, and it never phones home.

### Stage 1: observation (automatic, local, off by default)

Every scan the MCP server performs can emit one candidate observation.

- **What is recorded:** the corpus version, a coarse day-granularity date, the modality, the status
  and band, the coverage ratio, which rules FIRED, which rules were evaluated and did NOT fire, which
  were skipped, and the per-probe denominators. Plus a **shape digest**: a coarse, bucketed
  description of the target (file-count bucket, extension histogram of the top few extensions,
  framework markers as booleans).
- **What is NEVER recorded:** a file path, a source line, a URL, a hostname, an identifier, a
  dependency name, or any `observed` value from any finding. Nothing that could identify the codebase
  or the person. `packages/core/src/observation.ts` strips by ALLOWLIST, not by denylist, because a
  denylist fails open for every field somebody adds later.
- **Where it goes:** a local JSONL file, appended, in a directory the user names. **There is no code
  path that transmits an observation anywhere.** The sink takes a directory, never a URL.
- **Consent:** off by default. It writes nothing until `SLOP_OBSERVATIONS_DIR` is set to a path the
  user chose. There is no remote default to fall back to and no opt-out to forget, because there is
  nothing on to opt out of.
- **Auditable by the user:** newline-delimited JSON they can read, grep and `rm`.

`privacy-steward` re-verifies all of the above by execution every pass, including a grep of the
emitted file for known strings from the scanned directory, with the hit count shown.

### Stage 2: candidate (a human writes it, from the observations)

An observation is not a rule and never becomes one automatically. A person or an agent reads the
accumulated JSONL, notices a pattern (a co-occurrence the corpus does not name, a rule that never
fires anywhere, a rule that fires on everything) and writes a **candidate** into
`corpus/candidates/<id>.json`.

The schema is enforced by `assertWellFormedCandidate` in `packages/core/src/observation.ts` and it
**refuses a candidate without a non-empty, specific `falsePositiveNote`.** That is the field that
takes the most work and is the easiest to skip, so the type will not let you skip it: the note is the
published condition under which the rule is WRONG, and `attachRemedies` injects it as the rebuttal on
every patch the rule proposes, so a missing or softened note travels attached to an edit somebody is
about to apply.

Every candidate carries: `id`, `family`, `proposedWeight`, `polarity`, `title`, `rationale`,
`falsePositiveNote`, `prevention`, `supportingObservations` (a count with the observation dates), the
`proposedSince` version, `status` and a `review` block.

### Stage 3: review (two agents, never one)

- **`corpus-steward`** judges the rule on the merits: is the tell real, is the weight defensible
  against its neighbours, is it corroboration or just another correlated member of a family that
  already has four?
- **`false-positive-hunter`** runs against it adversarially and its report is part of the record. **A
  candidate cannot be promoted on the steward's review alone**, because a rule's author is the worst
  judge of its false-positive surface.
- Fewer than the documented support threshold of distinct observations means it is not ready, and the
  steward says so rather than promoting it thin.
- **A rejected candidate stays in the directory with its rejection reason**, because a rejected idea
  is the most useful thing in there: it stops the same proposal being re-made every quarter.

### Stage 4: promotion (it lands, and the version moves)

- The steward writes the `falsePositiveNote` themselves rather than copying the candidate's proposal.
- Fixtures are added: a positive and a mutated one differing in exactly ONE thing, **and every
  literal in both is grepped against the producer that emits it.** This is where
  `counter.anti-spam-plumbing` went wrong: its fixture invented a string no probe writes, so the
  meta-suite green-lit a rule that was blind to the real producer.
- `since` is set to the NEXT corpus version, and **the corpus version bumps in the same commit.**
- Everything that froze the old version is regenerated: `apps/web/lib/corpus.json`,
  `apps/web/lib/gauntlet/pool.json` (which embeds the version inside frozen verdict sentences) and
  the backtest baseline. That needs the capture scripts and a browser, so plan for it or do not bump.
- The negative corpora are re-run. A rule that raises any labelled-human artifact into a finding band
  fails, and that failure is correct.

### Stage 5: the ratchet

```sh
node scripts/check-corpus-version.mjs
```

Per corpus it reports the declared version, a digest over every rule's scoring-relevant fields
against `docs/agents/corpus.lock.json`, and the count of rules whose `since` is AHEAD of the declared
version. **It fails if the rule set changed without a version bump**, so a receipt can never cite a
version that does not describe the corpus that ran.

**Live drift today: 12 web rules declare `since: "corpus-2026.10"` while `CORPUS_VERSION` is
`"corpus-2026.09"` (L-11).** The baseline is 12 and a move in either direction is a finding. It is not
zero because bumping regenerates frozen artifacts that need a browser, and a gate that is quietly
waived is worse than one that reports its own debt every run.

### What is built, and what is not

**Built and running:** the observation record and its allowlist projection, the local JSONL sink and
its off-by-default gate, the candidate schema and its `falsePositiveNote` refusal, the corpus-version
ratchet with its lock file, the no-egress ratchet, and the roster ratchet. All with tests, all
mutation-tested.

**Deliberately not built:** anything that moves an observation off the machine. There is no upload,
no aggregation service, no shared corpus and no consent dialog for one, because none of those exist
to consent to. Building that is a founder decision made in the open, with the README changed in the
same commit.

---

## The gates (a change is not done until these match; chain with `&&`, never `;`)

```sh
npm run verify                                   # typecheck + build + test + backtest
node scripts/check-agent-roster.mjs --check      # 14 agents, 6 departments
node scripts/check-corpus-version.mjs            # 6 corpora, drift baseline 12
node scripts/check-no-egress.mjs                 # 273 files, 20 sites, 0 unapproved
node scripts/sync-public-mcp.mjs --check         # 25 scrubs, leak audit, 121 files byte-identical
```

Baselines as of 2026-08-26: typecheck 0 errors, build green, **71 test files, 1312 passed, 1 skipped
(1313)**, about 110 seconds. **The test count is a baseline, not a target, and a move in either
direction is a finding.** `release-verifier` owns the table and the two-branch rule for reading a
drift.

## The don'ts (every seat)

- Never add network egress to any package. Privacy is a product claim, and
  `scripts/check-no-egress.mjs` fails closed.
- Never `npm publish` without `npm pack` + extract + grep of the emitted bundle. L-04 is a leak that
  lived in the bundler's graph and was invisible in the manifest.
- Never edit the public repository directly. It is a projection, regenerated by
  `scripts/sync-public-mcp.mjs`, never hand-edited.
- Never widen a baseline, weaken a disclosure, or fix a vacuous test by loosening what it accepts.
- Never write an accuracy, precision or recall number the harness cannot re-derive at test time.
- Never leave a mutation in the tree. `git status --porcelain` clean at the end of any run that
  mutation-tests.

## The standing passes

| Cadence | Agent | Trigger |
|---|---|---|
| Every release | `release-verifier` | before any publish or deploy |
| Every release | `vacuous-test-hunter` | before any publish |
| Every release | `claims-officer` | before any publish or public write-up |
| Every publish | `mcp-surface-auditor` | before `npm publish` |
| Every corpus change | `corpus-steward` | any rule, weight or version change |
| Every corpus change | `false-positive-hunter` | mandatory second reviewer on promotion |
| Every corpus change | `detector-coverage` | after any rule or probe change |
| On change | `abstention-auditor` | scoring engine, probes, coverage or a report surface |
| On change | `receipt-integrity` | scoring, receipt, export or a report surface |
| On change | `untrusted-bytes-auditor` | any decoder, parser or probe change |
| On change | `notary-verifier` | `packages/notary` or `packages/db` |
| On change | `privacy-steward` | networking, the sink, redaction or the gauntlet |
| On change | `ui-craft` | `apps/web` |
| Quarterly | `evasion-red-team` | and before any public release |

## Where the rest lives

- `docs/agents/HOUSE-KNOWLEDGE.md`: the rules, read before acting.
- `docs/agents/LEARNINGS.md`: the evidence-backed findings, read before acting, appended after.
- `docs/agents/corpus.lock.json`: the rule-set digest the version ratchet compares against.
- `docs/agents/egress-allowlist.json`: every permitted network call, with a reason each.
- `docs/agents/roster.generated.json`: the generated roster. Do not hand-edit.
- `corpus/candidates/`: proposed rules, including the rejected ones and why.
- `docs/CODE-REVIEW-2026-08-24.md`, `PRODUCT-CRITIQUE-2026-08-24.md`, `UI-AUDIT-2026-08-24.md`: the
  outside reads that most of LEARNINGS came from.
- `README.md`: the architecture and the package map.
