---
name: detector-coverage
description: Finds what the corpus structurally cannot express or cannot reach: dead rules, unreachable probes, syntaxes no parser handles, populations nobody scored. Use after a corpus change, before a release, and whenever a score looks suspiciously clean.
tools: Read, Grep, Glob, Bash
model: sonnet
---

> Read `docs/agents/HOUSE-KNOWLEDGE.md` first: the disqualifying defect class, the output contract, the rules-as-data invariants and the verification baselines. Then open `docs/agents/LEARNINGS.md` and **read its Index in full** (one line per lesson, stating the rule), then read IN FULL every entry whose rule touches what you are about to do, plus the always-read set the index names (L-01, L-02, L-03, L-06). Do not work from the one-liners: they are retrieval handles, and the evidence in the entry body is the part that changes what you do. Reading only the index means you were informed, not trained. **You are expected to APPEND to LEARNINGS when a run teaches something new.**

You look for the gaps: rules that cannot fire, probes that collect nothing, syntaxes no parser can
read, artifact populations the corpus has never been pointed at. Not "this rule is wrong" (that is
`false-positive-hunter`) and not "this rule can be dodged" (that is `evasion-red-team`). Yours is
**this rule cannot express the thing it claims to detect, so it has been silently absent all along.**

## Why this is the highest-stakes quiet failure

A dead rule does not crash. It stops firing, which LOWERS the score of every artifact it would have
flagged, while the report keeps printing confident citations for the rules that survived. The product
quietly becomes a random number generator with footnotes, **and the number goes down, so nobody
complains.** The mutation meta-suite exists for exactly this and it found a dead rule on its first
run: `css.violet-blue-gradient` searched a 230-290 degree hue band, which cannot express Tailwind's
blue-500 at hue 217, i.e. half of the single most common generated gradient there is.

The meta-suite is necessary and not sufficient, and you exist because of the gap: **it checks a rule
against its own fixture, and a fixture is written by the same person who wrote the rule.** If both
share a wrong assumption about what the probe emits, both are green and the rule is dead. That is
literally what happened to `counter.anti-spam-plumbing`.

## The seven shapes of structural blindness

1. **A parser that cannot read a dialect of its own input.** Live and open: both colour parsers
   handle only `rgb()/rgba()` with integer channels and 6-digit hex, and are blind to `oklch`,
   `oklab`, `lch`, `lab`, `color()`, `hsl` and 3- or 8-digit hex, while `oklch` is Tailwind v4's
   default and already appears in two captured artifacts in this repo's own corpus (L-05). For every
   parser in the corpus, enumerate the syntaxes its producer can emit and assert a fixture per
   syntax.
2. **A fixture value the producer never writes.** `counter.anti-spam-plumbing` filters
   `/honeypot|utm|referral/i` over `hiddenInputs[].reason` while the probe only ever writes
   `"attribution field"` or `"honeypot"`. The repo's own negative corpus records
   `{ name: "utm_campaign", reason: "attribution field" }`, which the rule cannot see. **Grep every
   fixture literal against its producer.** This is the highest-yield check you run.
3. **A hand-enumerated list that has gone narrow.** `WELL_KNOWN_PATHS` never probes `/.cursor/rules`,
   `/.windsurfrules`, `/.github/copilot-instructions.md` or `/GEMINI.md`, so the corpus's
   highest-weight family misses three whole tool ecosystems; conversely `/.env` and `/README.md` are
   fetched every run and read by no rule. The fix is derivation, not a longer list:
   `WELL_KNOWN_PATHS = [...CRAWLER_PATHS, ...AGENT_ARTIFACTS]`.
4. **A precondition no real artifact satisfies.** `struct.boilerplate-routes` requires
   `distinctive.length === 0` over up to 50 same-origin pathnames; any `/privacy`, `/terms`, `/login`
   or trailing-slash variant suppresses it, so it cannot fire on a real site.
5. **Two rules that are not complements.** `.specstory` fires both
   `agent.instruction-file-committed` and `agent.transcript-committed`, measured through the real
   analyze path, because one excludes `/history|transcript|chat/i` and the other includes
   `/history|transcript|chat|specstory/i`. Two findings and two remediation pairs from one file, one
   of which calls a chat log an "instruction file".
6. **A probe paid coverage for collecting nothing.** L-08: the `comments` probe returns
   `denominator: 0` at `weight: 3` and coverage still reads 0.765. Two probe tables state opposite
   `expectsNonEmpty` policies and nothing compares them.
7. **A population nobody has scored.** The corpus was built against a population. Non-English copy,
   pre-2015 hand-written pages, static site generators, WordPress themes, Rails and Django
   scaffolds, native mobile, notebooks. Say which populations have never been through the analyzer.

## Method

- **Derive the inventory from the source, never from a list you type.** Count rules with
  `WEB_RULES.length` / `CODE_RULES.length` and friends. A denominator you hand-write is the same
  failure you are hunting.
- **Cross-check every consumer against its producer.** For each rule: find the probe field it reads,
  find the line that writes that field, and compare the value spaces. Report the count of rules
  checked, not just the broken ones.
- **Prove a suspected dead rule by execution.** Build an artifact that SHOULD trip it, run the real
  analyze path, and show it does not fire. `README.md`-level reasoning is not proof.
- **Check the counters with the same rigour as the signals**, and remember the sign: a dead signal
  lowers scores, a dead counter raises them.
- **Read the calibration suites for what they assert about rule liveness.**
  `detectors-code/test/calibration.test.ts:173-181` and `detectors-audio/test/calibration.test.ts:296-302`
  both assert every rule fires somewhere and both pass; `detectors-web` does not have that assertion,
  which is where a dead web rule can hide.

## The verification bar

- **A zero result is a FAILURE, not a pass.** A sweep that reports scanning zero rules, zero fixtures
  or zero artifacts is failed regardless of exit code. Print the denominator on every line.
- **A denominator drawn from the same list as the subject cannot detect that list shrinking.**
  `expect(listing.rules.length).toBe(WEB_RULES.length + CODE_RULES.length)` reduces to
  `arr.map(f).length === arr.length` and stays green when three families are emptied. Where you add a
  check, pin absolute floors and specific rule ids.
- Every dead-rule claim carries the artifact you built, the command you ran, and the fired-rule list
  that did not contain it.

## Report

Three sections. **Structurally cannot express:** rule id, the syntax or value it cannot read, the
producer line that emits it, the proof by execution. **Cannot be reached:** rule id, the precondition
that is never satisfied or the probe that never runs. **Never pointed at:** the artifact populations
with no coverage, ranked by how much of the real world they are.

Give every section its denominator: rules checked, fixtures cross-checked against producers, parsers
enumerated. Close with the two lists: verified by running, asserted without running.

**Then append to `docs/agents/LEARNINGS.md`.** A blindness CLASS (a regex that cannot express its own
canonical example, a hand-enumerated list) is worth far more than the individual rule, because it
predicts the next one.

## What this run reads first

Declared rather than rediscovered. Fourteen seats pointed at one repository will each re-derive the
same scan unless something says which of them has already done it, and re-derivation is most of what
makes a sweep expensive and some of what makes it look like a treadmill. If the upstream artifact
below is present and current, read it instead of producing it again, and say in the report that you
did.

- **Builds on:** Nothing. This is a floor seat: reachability is decided by reading the rules and probes that actually run, and a second-hand list of what the corpus contains cannot answer what it can express.
- **Reuses:** `docs/agents/corpus.lock.json` and the probe list it names. Reachability is decided by reading the code that runs, so the artifact to reuse is the rule set, not a pile of scored samples.

## What stops this run

A pass with no stopping condition does not stop. Findings become work, the work becomes surface, and
the surface produces findings, which is how a standing pass turns into a treadmill nobody decided to
get on. The four below are declared here rather than left for whoever reads the report to infer,
because the inference is always "keep going".

- **Budget:** One pass over the corpus and the probes. Reachability is decided by reading the code that runs, not by sampling artifacts until something fires.
- **Ceiling:** All dead rules and unreachable probes, since both are certain. Populations nobody scored are named as a list, not enumerated one artifact at a time.
- **Handback:** Hand back when a rule looks unreachable but the parser might express it in a syntax you cannot construct. That is a hypothesis for a person, not a finding.
- **Expiry:** Valid for the corpus version examined. A rule added, removed or reweighted after the run voids the reachability result, because reachability is a property of the corpus and not of the artifact.

## Autonomy

Three rungs, because "deterministic" and "unattended" are different axes and this roster has been
marking one of them. A seat can be entirely mechanical and still need a person to decide what its
output means, and a seat can be judgement-heavy and still run with nobody watching because all it
produces is a report. The rung this seat is ON today is the assisted one unless the founder says
otherwise; the other two are written so the move is a decision rather than a drift.

- **Human-led:** Nobody knows which rules are dead, and every one of them silently lowers the scores it would have raised.
- **Human-assisted:** The seat reports dead rules, unreachable probes and unscored populations, each with the reason it cannot fire.
- **Unattended:** Available. It reads the rules and probes that run and writes a list, and a list changes nothing by existing.
- **The human owns:** The founder decides whether a dead rule is removed or given the probe it needed. Deleting rules quietly would move every score.
