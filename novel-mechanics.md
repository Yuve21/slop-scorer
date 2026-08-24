# Novel core mechanics — beyond the 0-100 score

Written 2026-08-23. The founder rejected "0-100 confidence score" as too generic: a readout, not a
mechanic. This doc proposes mechanics at the bar his dating app set.

## The bar (what made Lark structurally new)

Lark did not improve swiping. It inverted two things:

- **WHO ACTS.** Your friend (the matchmaker) writes and sends your pitch. The candidate holds an
  accept-gate. The dater is not the one grinding.
- **THE UNIT.** Duo mode pits a PAIR against a PAIR: two friends pitch two other friends.

So a qualifying mechanic must change at least one of: **who acts**, **the unit of interaction**,
**the artifact the product outputs**, or **the user's job**. Changing the *readout format* does not
qualify. A number in a circle is a readout.

---

## The 12 candidates

### 1. Reproduction as verdict ("we remade it")
**Inverts: the artifact.** Do not score it. REMAKE it. Attempt to regenerate the artifact and show
the result side by side. "We recreated this in 6 seconds with this prompt."
- Why it lands: the user judges with their own eyes. No trust in our black box required.
- Solves the hardest problem in the plan: for image/video we cannot cite deterministic evidence, but
  a near-identical regeneration IS evidence a normal person can evaluate.
- Inherently shareable (the side-by-side is the screenshot).
- **Failure modes:** cost and latency for video; regenerating someone else's copyrighted work raises
  IP questions; a failed reproduction is weak evidence of humanity (absence of proof).

### 2. Time-to-fake (the metric that replaces probability)
**Inverts: the artifact.** The output is not a percentage. It is TWO NUMBERS: how long this would
take a skilled human, versus how long a machine needs.
> "A human would need about 14 hours. A machine needed 8 seconds. Here is the machine's attempt."
- Why it lands: intuitive to anyone, no statistics literacy needed, and it reframes the question from
  the unanswerable ("was a model involved?") to the answerable and more useful ("how much human
  effort is actually in this?").
- Dodges the liability trap: it is an effort estimate, not an accusation of lying.
- Pairs naturally with #1 (the machine's time is measured by actually doing it).

### 3. Pairwise duel (the "duo" analog)
**Inverts: the unit.** Never judge one artifact alone. Two go head to head: "which of these is human?"
- Not a gimmick: relative judgment is measurably more reliable than absolute scoring, for models and
  for people. This is an accuracy win, not just a UX one.
- Natural tournament/bracket structure; natural leaderboard.
- **Failure mode:** the user usually arrives with ONE artifact. Needs a good opponent-selection
  strategy (our corpus supplies a matched human control).

### 4. Prove-human, not catch-AI
**Inverts: the job.** Stop accusing strangers. Let creators CLAIM their work with receipts.
- Scarcer and more defensible position: "verified human" is an asset creators want to hold, and the
  supply of proof is controlled by the person with the most incentive to provide it.
- Defuses false-positive liability almost entirely (we certify what is proven, we do not accuse).
- **Failure mode:** cold-start; needs creators to care before the badge means anything.

### 5. The witness / co-sign (matchmaker accept-gate analog)
**Inverts: who acts.** A third party vouches. Someone who watched you make it signs it. Human
attestation, socially enforced, exactly like a matchmaker vouching for a friend.
- Fraud-resistant in the way social graphs are: lying costs you a relationship.
- **Failure mode:** collusion rings; needs reputation weighting.

### 6. The Turing gauntlet (detection as a game — AND as the data pipeline)
**Inverts: who acts.** Five artifacts, one human-made. Spot it. Streaks, daily rounds, leaderboards
of the best human-spotters.
- The quiet genius: **the game IS the labeling pipeline.** Every round produces human judgments on
  real artifacts, which is exactly the corpus needed to calibrate the detector and publish honest
  accuracy numbers (which nobody in this category does).
- Growth engine: daily-puzzle mechanics (Wordle-shaped) are the cheapest consumer distribution there is.

### 7. Bounty on the tell
**Inverts: who acts.** Post a suspect artifact; the community and our agents compete to find the
first citable tell. Reputation for the sharpest eye.
- Turns detection into sport, and every bounty resolution adds a new rule to the corpus.
- **Failure mode:** brigading; needs adjudication.

### 8. The slop autopsy (case file, not a number)
**Inverts: the artifact.** Output a forensic case file with numbered exhibits, like a detective's
report. Exhibit A: the font is the free default. Exhibit B: this gradient ships with the template.
- Format alone is a differentiator in a category of probability bars, and it enforces the founder's
  hard rule (evidence per finding) structurally: no exhibit, no claim.

### 9. Generator vs detector duel (agents fighting in public)
**Inverts: who acts.** Two agents: one tries to produce something that passes as human, one tries to
catch it. The user watches the duel and sees which tells survived.
- Entertaining, educational, and it generates adversarial training data continuously.

### 10. Process notary (register the making, not the output)
**Inverts: the artifact AND the job.** Creators register the PROCESS as it happens: drafts, layers,
commits, revision history, keystroke cadence. We notarize the making.
- **Structurally the strongest long game.** Output can always be faked; a plausible multi-day process
  is enormously harder to fake. This is the thing that stays true as generators improve, which is the
  category's core risk (detection accuracy decays; provenance does not).
- Natural B2B: schools, publishers, marketplaces, hiring.
- **Failure mode:** requires adoption before the artifact exists (you cannot notarize retroactively).

### 11. Receipt chain for agents (the MCP feature, inverted)
**Inverts: who acts.** Agents self-report what they generated; the MCP server issues signed receipts.
The prevention loop becomes a provenance ledger rather than a linter.
- Makes our own MCP plugin the source of ground truth: work produced through it is *known*, not guessed.
- Aligns with #10: the agent's receipts ARE part of the process record.

### 12. Slop budget (the CI/team-facing inversion)
**Inverts: the job.** A team sets a slop budget the way they set a performance budget. The gate is
not "is this AI" but "did we exceed the amount of template we allow ourselves to ship?"
- Sellable to teams today; sidesteps the accusation framing entirely.

---

## Recommendation

**Face of the product: #2 Time-to-fake, proven by #1 Reproduction.**

The verdict a user sees:
> **8 seconds.** That is how long it took us to remake this. A person doing it by hand: about a day.
> Here is ours next to theirs. Here are the seven tells that let us shortcut it.

Why this one:
- It is not a score, it is a demonstration. The founder's "evidence or it is not the product" rule is
  satisfied structurally, not by policy.
- It works across every modality, including the ones where deterministic rules cannot cite anything
  (image, video, voice) — which is the problem that has been dogging this plan since the start.
- It is a screenshot. Consumer distribution is the side-by-side.
- It reframes away from the legally dangerous claim ("you lied") to a defensible one ("this is
  cheap to reproduce").

**Strong secondary features:**
- **#6 Turing gauntlet** as the growth engine and the labeling pipeline. Ship it early; it feeds the
  calibration corpus that lets us publish honest accuracy, which is the credibility wedge nobody in
  the category has taken.
- **#10 Process notary + #11 agent receipt chain** as the defensible long game and the B2B wedge.
  Detection decays; provenance compounds.
- **#8 Autopsy format** as the report style everywhere.

**Traps:** #3 pairwise is an accuracy technique, not a face (users arrive with one artifact — use it
under the hood). #7 bounties need heavy moderation before there is a community. #4 prove-human is
right but cold-starts badly on its own; it should ride in on #10.

## The rule engine does not go away

The deterministic rule corpus is the machinery underneath all of this:
- It supplies the **tells** listed in the autopsy and the shortcuts used in the reproduction.
- It estimates the **machine time** in #2 (which rules fired tells us which template shortcuts existed).
- It scores the **gauntlet** rounds and adjudicates **bounties**.
What changes is the surface: users get a demonstration and a case file, not a number in a circle.

## Applying the same thinking to the rest of the app

- **Onboarding:** do not explain the product. Run the gauntlet immediately — the user's first action
  is guessing human-vs-AI on five real artifacts and getting scored. They learn the product by
  playing it, and we get labels from minute one. (Same lesson as Lark's "show the pitch, do not
  describe the mechanic.")
- **The MCP plugin:** not a linter that reports. A **receipt issuer** (#11) that makes work produced
  through it verifiable, plus a **slop budget** gate (#12) the team sets. Who acts changes: the agent
  reports on itself rather than being judged afterward.
- **Pricing:** do not sell "detections per month" (metered black box). Sell the **budget** (teams) and
  the **notary/receipts** (creators, institutions). Consumer stays free and viral on the gauntlet.
- **Virality:** the shareable artifact is the side-by-side reproduction and the daily gauntlet score.
  Both are screenshots with our mark on them, not links people have to explain.
