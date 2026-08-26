# Product critique — 2026-08-24

**Scope:** report only, no code touched. Written after reading `product-spec.md`, `market-research.md`,
`market-check-reproduction.md`, `novel-mechanics.md`, `image-detection-reality.md`,
`publicity-defamation-risk.md`, `left-field-additions.md`, `human-verification-licensing.md`,
`docs/UI-AUDIT-2026-08-24.md`, the root and `packages/mcp-server` READMEs; after running
`npx vitest run` (1066 passing, 54 files), driving the MCP server over stdio against this repo, and
reading `https://slop-scorer.vercel.app` live.

**Citation convention:** every market fact below names the document it came from. Where I assert
something the docs do not, I mark it **[my judgement]**.

---

## What I am not disputing

The engineering is real and I verified it rather than taking it on trust. 1066 tests pass. The MCP
server answers `initialize`/`tools/list` over stdio with five tools. `scan_codebase` on this
repository returned a receipt whose arithmetic reconciles, whose four findings each cite a file and
a line, and which included two *counter-evidence* findings that lowered the score. The mutation
meta-suite, the vacuous-probe guard, and `no-claims.test.ts` are each a real defence against a real
failure that has actually happened to somebody.

None of that is the problem. **The problem is that this repository has zero users and no path by
which it acquires one, and every remaining hour spent on rigour widens that gap instead of closing
it.** The rest of this document is about that.

---

## 1. Who is the first user, precisely?

### The honest answer: nobody, today, and it is not close

I checked, rather than assumed:

- `npm view slop-scorer-mcp` → **404** (recorded in `packages/mcp-server/README.md`'s own
  publishing section and confirmed in `UI-AUDIT` §S2).
- `github.com/Yuve21/slop-scorer` → **404** (`UI-AUDIT` §B8).
- Both `curl` installers point at `raw.githubusercontent.com/Yuve21/slop-scorer/...` → **404**.
- On the live site: the hero input **does not scan what you type** and says so (`UI-AUDIT` §B5).
  `/receipt/self`, the nav item the marketing thesis rests on, prints *"Playwright is not installed
  on this server"* and a headline of `0.0 seconds`. The fold's self-scan card renders
  `Running / rendering this page in a real browser` and never resolves.
- `/llms.txt` → **404**. `/gauntlet` → **404**. `/notary` → **404**.
- `grep` across `apps/web` for pricing, signup, waitlist, subscribe: **nothing**. There is no
  account, no email capture, no follow-up mechanism of any kind. A visitor who loves this cannot
  tell you so and you cannot reach them again.

So of the four surfaces, **three cannot be touched at all** (MCP: not installable; gauntlet: no
route; notary: no route) and **the fourth is a brochure with a decorative input box**. This is not a
distribution problem yet. It is a "the door is locked" problem.

### The person, once the door is open

Not a segment. One person with a job today:

> A solo developer or two-person team who just had Claude Code or Cursor generate most of a feature
> and a landing page, and who has the specific low-grade dread that it *looks* generated. They
> already run Claude Code daily. They are about to deploy.

I am confident this person exists because **the founder is one**, and the corpus is the artifact of
his own attempt to solve it: `product-spec.md` says the source corpus is "54 encoded hygiene tells"
from Lark's `audit-frontend-hygiene.mjs`, a script that exists because — per the founder's own
standing note — the Lark waitlist UI "kept being hand-rolled in raw Tailwind and reading
vibe-coded." That is a validated N=1 with a paid-for scar. It is the strongest demand evidence in
the entire research pack, and it is stronger than anything in `market-research.md`.

**Which surface first:** the MCP plugin, `scan_codebase` on a repo they own. Not `scan_ui` — a URL
scan requires them to have deployed already, and `list_rules` (measured: **63,110 characters,
~15,800 tokens**) is not something an agent will call speculatively.

**What makes them come back a second time:** *nothing currently exists that does this,* and that is
the single sharpest gap in the product. I checked: `packages/mcp-server/src/fixes.ts:272` documents
that the baseline is **deliberately not persisted** and lives in an in-memory `Map` cleared with the
process. There is no `.github/` directory, no GitHub Action, no exit-code gate, no config file, no
ratchet. So a second use requires a human to *remember to ask*, and MCP tools that require a human
to remember them do not get used twice. This is treated more fully in §3.

---

## 2. The weakest link

Ranked, weakest first.

### 1. **Does anyone want this** — this is what kills it

The founder's own research says so, in its own words:

- `market-research.md` §5: *"**Consumer willingness-to-pay is unproven** for standalone detection;
  the strongest consumer apps are cheap/freemium novelties."*
- The comparable set is tiny. From `market-check-reproduction.md`: sloptrim **★185**,
  distil-ai-slop-detector ★92, sloppylint ★88, AI-SLOP-Detector ★81, vibecop **★56**. Half a dozen
  people have built this exact thing and the aggregate attention is four figures.
- The whole Chrome AI-detection category is **~0.8M users, half of it GPTZero** (from
  `left-field-additions.md` A6). Grammarly is 37,000,000. The category has been repeatedly tried at
  the scale of a rounding error.
- The one commercial success in the category, GPTZero — **19M users, $30M ARR, $88M exit to
  Superhuman/Grammarly, June 2026** (`market-research.md`) — is a *text* detector sold into
  *education*, where a specific institutional buyer has a specific compliance job. Not this.

Note carefully what this does *not* say. It does not say the engineering is wrong. It says the
question "was this made by a machine?" is one almost nobody currently pays to answer. The demand
that does exist is adjacent and differently-shaped: developers pay for code review (CodeRabbit,
Greptile, Graphite), and they pay because a *specific* person is *specifically* blocked. **[my
judgement]** The fix here is not more engineering. It is re-aiming which want you serve, and the
re-aim is §3.

### 2. **Will they pay** — weak, and untested by construction

There is no price, no plan, no paywall and no checkout anywhere in the repo. `novel-mechanics.md`
proposes the right model (Radar two-tier: band free, number paid; slop budget for teams;
notary for institutions) and `left-field-additions.md` A1 costs it out against real Radar pricing
($0.07/txn or $14/mo for the tier with the 0-99 score). None of it is built and none of it has been
put in front of a person. Willingness to pay is currently a hypothesis with zero observations.

### 3. **Can we reach them** — medium, and the cheapest asset is being left on the floor

`left-field-additions.md` A6 contains the best go-to-market finding in the pack, measured live:
the **GitHub MCP Registry holds only 219 servers**, is curated, publishes exact install counts
(Markitdown 175,695; Context7 61,108), and `?q=verify` returns **one** result — a tax-code
classifier with 3 installs. **No content-authenticity MCP server exists in it.** Raycast: a sweep of
all 3,214 extensions returned zero content-authenticity tools. That is an empty shelf in a store
with foot traffic and a public counter, and getting on it costs one `npm publish`.

### 4. **Can we deliver it** — strongest link, by a distance

Verified above. This is the only link that is not in doubt, and it is where roughly all the effort
has gone.

**The one that kills it first: nobody wants it in the framing it is currently sold in.** Not because
the work is bad, but because the work is aimed at a question the market has repeatedly declined to
fund.

---

## 3. Stress-testing the MCP plugin

I agree it is the sharpest wedge. Here is what it survives and what it does not.

### What it gets right, concretely

Running `scan_codebase` on this repository returned, among four findings:

```
+23  verify.tautological-tests  [verification-floor / high]
     evidence: file packages/provenance/test/abstention.ts = "75 lines, 0 assertions"
     evidence: file packages/reproduce/test/fixtures.ts   = "101 lines, 0 assertions"
```

That is a *good bug report*. A developer reads it, agrees or disagrees in ten seconds, and can act.
`propose_fixes` returning `readyToApply / needsConfirmation / needsSourceLocation / decideYourself`
is a genuinely better shape than a linter's flat list, and "this server never writes a file" is the
correct call — it is why a security-conscious dev will actually install it.

### Honest comparison

| | Why it gets installed | Why it stays |
|---|---|---|
| **ESLint / Biome** | CI already fails without it; zero marginal decision | It is a gate. You cannot merge past it. |
| **CodeRabbit** | Attaches to the PR, where review already happens; unprompted | It comments before you ask. Habit is structural, not remembered. |
| **Claude Code's own review** | Already there, free, zero install | Same. |
| **slop-scorer** | ...a human has to decide to install it, then remember to invoke it | **Nothing.** |

That table is the whole problem. Every durable dev tool has a **trigger that is not a human
remembering**. This one has none.

### What is missing, in the order I would fix it

**(a) A trigger. This is the difference between a toy and a habit.**
There is no `.github/workflows/`, no Action, no `npx slop-scorer --fail-above N`, no pre-commit
recipe, no Claude Code hook recipe. Three cheap options, and the third is nearly free:
`.github/workflows/slop.yml` posting a PR comment; a `Stop`/`PostToolUse` hook in
`.claude/settings.json` that runs `scan_codebase` after an agent finishes editing; a documented
`claude mcp add` **plus** a three-line `CLAUDE.md` snippet telling the agent to call `list_rules`
before building UI. Without one of these, retention is zero regardless of quality.

**(b) A ratchet, not a report.** `novel-mechanics.md` #12 — the **slop budget** — is the correct
mechanic and it is not built. First run on any real repo yields a wall of findings and gets
dismissed. First run against a *committed baseline* yields "you added two" and becomes a gate. The
current in-memory, session-scoped baseline (`fixes.ts:272-285`) is epistemically defensible and
forecloses exactly this. **[my judgement]** The right resolution: persist a checked-in
`.sloprc.json` baseline **with the commit SHA it was taken at**, and refuse to compare across a
dirty tree — which keeps the honesty and unlocks the mechanic.

**(c) Token economics.** Measured: `list_rules({modality:"all"})` = **15,778 tokens**. `list_rules`
is described in the server instructions as "the primary use" — call it *before* generating code —
and it costs a fifth of a small context window to do so. No agent will pay that prophylactically.
It needs a `compact` mode returning ~40 one-line prevention hints under 800 tokens, and the
prevention half should really ship as a **skill / `CLAUDE.md` fragment the agent reads for free**,
not as a tool call it must decide to make.

**(d) The rules are two products wearing one coat.** Of what fired on this repo, the *unique,
non-duplicative* value is a narrow set: committed agent instruction files and transcripts,
tests with no assertions, a history written in one sitting, blocks duplicated across three or more
files, unfilled placeholders. Biome, ESLint and knip already do unused deps and dead code better and
faster. Everything in the `visual-default` and `craft-floor` families is *taste*, which the corpus
itself concedes ("Highest false-positive risk in the corpus... skilled human designers converge on
the same defaults"). Selling taste to developers is hard; selling "your agent left its homework in
the repo" is easy. **These should be two tools with two names, and only one of them is the wedge.**

**(e) What makes them tell someone.** The tweetable object already exists and is buried:
`verify_fix` emits `Before: 9 finding(s). After: 6. ... Score moved by -14 point(s).` A number that
went down, that the developer caused, with citations. That should be the terminal output of every
session, formatted to be screenshotted. Right now it is a JSON field.

### The one-line version

**A developer installs this because their agent leaves debris and they know it. They keep it because
it fails their build when the debris comes back. They tell someone because the number went down.**
One of those three exists.

---

## 4. Is the honesty posture a market advantage, or a founder's principle?

### The case that it is a principle the market will not pay for

- **The market's revealed preference is documented in your own research.** GPTZero reached 19M users
  and a $88M outcome shipping precisely the thing `image-detection-reality.md` proves is
  structurally indefensible. Nobody was punished for that. Meanwhile *FTC v. Workado* punished a
  **false** claim (98.3% advertised vs ~53% real) — the regulator polices lying, it does not reward
  candour. There is no case in the pack of a vendor winning business *because* it abstained.
- **Abstention is worse UX for the actual integrator.** `market-check-reproduction.md` is blunt:
  Reality Defender, Hive, Sightengine and Sensity "sell a field in a JSON response." A three-valued
  `assessed | inconclusive | not_assessed` field is a null the buyer must write a branch for. You
  are shipping extra work to the person paying you.
- **Someone else is taking the accuracy lane anyway.** Pangram, 29 Jul 2026: **99.5% / 99.84% on
  clean ReLAION / 0.16% FPR**, with a heatmap. If that number survives independent measurement, the
  market has a defensible confident answer and does not need a careful abstaining one.
- The honesty is also currently *costing* you: the live site's fold spends its entire first screen
  arguing epistemics to a visitor who has not yet been given one reason to care.

### The case that it is a real advantage

- **The category's credibility is actively collapsing and the collapse is documented.** NewsGuard,
  2026-05-08: five detectors called authentic Reuters/AP/NYT/Guardian photos AI **13.33% of the
  time**. Bellingcat: **30% FPR** on award-winning photojournalism, and recompressing 10 AI images
  flipped **7 of 10** to "real". Hany Farid on the ecosystem: *"a second level of disinformation."*
  There is already a filed defamation cause of action over a false AI accusation (*Haishan Yang v.
  University of Minnesota*, $760k count).
- **The buyers who will exist in 18 months are statutory, and statutory buyers buy defensibility.**
  California **AB 853**: from 2027-01-01, platforms >2M MAU must detect/display/not-strip provenance
  at **$5,000 per violation, each day discrete**; from 2026-08-02 providers >1M MAU must offer a free
  public detection tool. EU AI Act Art. 50, fines to **€15M or 3% of turnover**. A compliance officer
  cannot buy a black box; they must be able to defend a decision. Published FPR + a coded abstention
  + an appeal path is the *only* purchasable artifact in that conversation.
- The credibility pattern in `human-verification-licensing.md` is exactly this: **Fairly Trained** —
  narrow literally-true claim, public methodology, published holder list. *"The pattern among the
  non-credible: a badge you buy."*

### My position

**The honesty posture is a licence to operate in the only lane that will eventually pay. It is not a
reason anyone installs anything, and it must stop being marketed as one.**

Keep every constraint — the abstention enums, the 99 ceiling, `FORBIDDEN_VERDICT_PHRASES`,
`no-claims.test.ts`, the counter-evidence rules. They cost nothing to hold and they are the thing
that makes the 2027 conversation possible. But they are **hygiene, not a pitch**. Nobody has ever
installed a tool because it was epistemically careful; they install it because it found something.

Concretely: the homepage H1 is currently *"This page has already been scanned by the thing it
sells"* and the fold's job is to prove intellectual honesty. That is a second-visit argument being
made on the first visit, to a visitor who has not yet seen the tool do anything. **Lead with the
finding. Let the honesty be the depth they find when they go looking — and they will go looking,
because `/method` is genuinely the best thing on the site.**

Sharpest version of the point, and it is uncomfortable: *Fairly Trained is the correct precedent and
it is also not a large business.* Honesty buys you the right to be trusted. It does not buy you the
right to be used.

---

## 5. What is missing in the first five minutes

Ordered by how much a first-time visitor loses. Everything here is verified live, not inferred.

1. **The product cannot be tried.** The hero input ignores its value and says so. `UI-AUDIT` §B5 is
   right that this is "the exact 'looks finished, isn't' defect our corpus was built to catch."
2. **The proof page is empty.** `/receipt/self` headlines `0.0 seconds` and prints *"Playwright is
   not installed on this server."* The fold's self-scan card shows a spinner that never resolves.
   The single load-bearing marketing claim — *we pass our own tool, here is the receipt* — currently
   renders as an internal error message on a marketing surface.
3. **There is no way to see value before doing work.** Every path requires the visitor to supply
   something. The fix is already written and unrouted: see §6 on the gauntlet.
4. **There is no reason to return.** No account, no history, no diff-over-time, no daily anything,
   no watch. And no way to be reminded — there is no email capture anywhere in `apps/web`.
5. **There is no shareable moment.** `GET /api/receipt/4F2A-9C/export?size=square` returns **200,
   image/png, 14,875 bytes** — the route works — and the button is **not on the live page**
   (`UI-AUDIT` §B6). The one asset built to travel has no exit door. And per §U3 it is currently the
   ugliest thing the product makes.
6. **`/llms.txt` 404s.** For a product whose entire distribution thesis is *other people's coding
   agents*, this is the cheapest high-leverage file on the site and it is absent.
7. **Onboarding does not exist**, and `novel-mechanics.md` already specified the right one: *"do not
   explain the product. Run the gauntlet immediately."* The site instead explains the product in 567
   words on `/` and 3,777 on `/method`, with **two images site-wide, both SVG wireframes that are
   indistinguishable from each other** (`UI-AUDIT` §U2).

**[my judgement]** The through-line: `product-spec.md`'s own DESIGN MANDATE says *"Show, don't tell
— do not explain the mechanic in prose when a live demo can perform it."* The site is the largest
single violation of the founder's own highest-leverage rule.

---

## 6. What should be cut

Four product surfaces, thirteen packages, one person. Line counts are measured.

### Load-bearing — keep

- **`core` + `detectors-code` + `detectors-web`.** The corpus and the engine. This is the asset. It
  is also the only thing `market-check-reproduction.md` lists as defensible that actually exists
  today: *"the deterministic rule corpus for web and code — 54 encoded tells + the live-measured
  negative set."*
- **`mcp-server`.** The distribution. One publish command away.

### Cut now, to zero

- **`reproduce` — 3,520 lines, the largest package in the repo.** This is the hardest call and I
  will argue it against the spec, which names it Feature 1.

  `market-check-reproduction.md` establishes that reproduction-as-verdict is **genuinely
  unoccupied** (medium-high confidence, three negative searches) and that it is **"yes as a wedge,
  no as a moat... a few hundred lines around commodity model APIs; a funded competitor could copy
  the demo in a month."** It then dismantles it as a *service*, using its own research:
  - Epistemically: *"This is the weakest joint in the mechanic."* A successful remake proves an
    artifact of this quality is cheap, not that this one was made that way. *"A failed remake is
    weak evidence of anything"* — confounded five ways, with bad prompt inversion "by far the most
    common cause."
  - Risk: the doc's own biggest-risk section names **inverse harassment** — successfully remaking a
    human's real work is *"the mirror image of a false positive,"* more persuasive and more
    shareable than a score. That is the Ben Moran scenario with better production values.
  - Economics: **$0.25–$1.20 per accepted reproduction** at 8 candidates; gpt-image-2 median
    latency **150s**, which "would break the '8 seconds' promise"; Kling p95 on fal **723 seconds**.
  - Supply: **Sora API discontinued 2026-09-24**. **Midjourney has no API and prohibits
    automation.** **FLUX.1 [dev] is non-commercial** and that follows the weights onto fal and
    Replicate. Anti-competing-model clauses at OpenAI 3.3(e), Google, Anthropic D.4(a), ElevenLabs,
    Runway, fal, Vercel — and *"Vercel bars benchmarking AI Services,"* so benchmarking v0 is out.

  **Verdict: reproduction is the *argument*, not the *product*.** Keep exactly one hard-coded
  side-by-side on the homepage as the thing that makes the thesis legible in three seconds. Do not
  accept user input into it, do not extend the pipeline, do not put it in the H1 while the input
  box is decorative. Reproduction-as-a-service is blocked by the founder's own research; the
  founder is the only person who has read that research and has not yet acted on it.

- **`notary` (2,034 lines) + `provenance` (2,702 lines) + the human-verification line.** Strategically
  correct and chronologically wrong. `novel-mechanics.md` #10 names the disqualifying property
  itself: *"requires adoption before the artifact exists (you cannot notarize retroactively)."* A
  cold-start mechanic cannot be started from zero users. And `human-verification-licensing.md` lists
  **ten items requiring an attorney before shipping**, headed by BIPA at **$1,000–$5,000 per
  violation with a private right of action and no injury requirement**. Freeze both. Revisit at 100
  users, not before.

- **`detectors-image` (423) + `detectors-video` (574) + `detectors-audio` (1,299).** Built, by
  design, to abstain — which is the intellectually correct response to `image-detection-reality.md`
  and also means they ship nothing a user can use. Correct code, zero product. Off the surface.

- **`apps/web` as a consumer product.** Reduce it to what it can actually be: a credibility and
  documentation site for the MCP plugin. **Remove the input box entirely.** A text field that
  ignores its own value is worse than no text field, and `UI-AUDIT` §B5 is right that it is
  self-incriminating on this specific product.

### Cut *or* finish this week — half-built is the worst state

- **`gauntlet` — 1,402 lines, `/gauntlet` returns 404.** This is the most wasteful thing in the
  repository right now: it is the answer to *"see value before doing work"* (§5.3), *"a reason to
  return"* (§5.4), *"a shareable moment"* (§5.5) and *"onboarding"* (§5.7) — four of my six
  five-minute gaps — and it is 100% written and 0% reachable. `novel-mechanics.md` #6 is right that
  it is simultaneously the growth loop and the labelling pipeline. **[my judgement]** Ship the route
  or delete the package; carrying it unrouted is paying full price for nothing.

### One more thing to cut: the effort model

`left-field-additions.md` offers **16 additions at 1–3 weeks each** — as the reading agent noted,
roughly a year of serial solo work presented as a menu. It is a good research document and a
dangerous roadmap. Treat it as a parked options list, not a backlog.

---

## 7. The first ten users

Not a channel strategy. Ten specific people, this week.

### Where they are, ranked by cost

1. **The GitHub MCP Registry.** 219 servers, curated, publishes install counts, `?q=verify` returns
   one result with three installs, **zero content-authenticity servers**
   (`left-field-additions.md` A6, pulled live 2026-08-23). Cost: one `npm publish` and a listing.
   This is the highest-leverage unexploited fact in the entire research pack.
2. **Ten people the founder already knows who run Claude Code or Cursor daily.** N=10 does not need
   a channel, it needs ten messages. This is the actual answer.
3. **r/ClaudeAI, the Claude Code and MCP Discords, the Cursor forum** — the places where *installing
   an MCP server* is an ordinary daily act rather than a decision.
4. **Not:** Hacker News (one shot, and §5 says the site is not ready to receive it); not Product
   Hunt; not the Chrome Web Store — `left-field-additions.md` A6: 85% of Chrome extensions never
   pass 1,000 installs and the whole detection category there is 0.8M.

### What you say

Two to three sentences, reads like a text, one ask — per the founder's own standing outreach rule:

> I built a linter for the stuff AI agents leave behind in a repo: committed CLAUDE.md files, tests
> with no assertions, a whole git history written in one sitting. It's an MCP server, one line to
> install, and it never writes to your repo — it proposes and your agent applies. Can you run it on
> one repo you know well and tell me which findings were real and which were noise?

Note what is absent: no score, no "AI detection," no honesty manifesto, no reproduction, no
"0-100." The pitch is a **linter for agent debris**. That is a category nobody owns, it is
immediately legible to the person receiving it, and it is 100% built.

### Their first session, scripted

1. `claude mcp add slop-scorer -- npx -y slop-scorer-mcp` — one line, 30 seconds.
2. *"Scan this repo."* Receipt back in under a minute with cited findings. (Measured on this repo:
   4 findings, 100% coverage, every one with a file and line.)
3. **The one question back, and it is the whole point of the exercise: which findings were real, and
   which were noise? Count both.** Ten developers × ten repos is the first real false-positive
   measurement this product will ever have — on repositories somebody actually owns, rather than
   five fixtures. It is also the number `image-detection-reality.md` §8 says to publish, and the
   only number that would make the honesty posture in §4 mean anything commercially.
4. `propose_fixes` on the ones they agreed with → they apply with their own agent → `verify_fix`.
5. **The session must end on a number that went down.** `Score moved by -14 point(s)` is the
   artifact. Make sure it is the last thing they see.

If six of ten say the findings were mostly real, there is a product and §2's weakest link has
moved. If six of ten say it was noise, that is the most valuable week of the project so far and it
cost ten messages instead of another package.

---

## The ONE thing to do next

**Run `npm publish --access public` on `slop-scorer-mcp`, make the GitHub repo public, and message
ten developers this week with the linter-for-agent-debris pitch — then count real findings versus
noise on the repos they run it against.**

Everything needed for this is built and tested. The only thing standing between this project and its
first user is a command the founder has not run, and the reason it has not been run is that there is
always one more thing to make correct first. The next correctness win is worth nothing; the first
user is worth everything, and the honest FPR number they generate is worth more than any of the
rigour already shipped, because it is the one number nobody else in the category has.

## The ONE thing to stop doing

**Stop building surfaces.** No new package, no new modality, no reproduction pipeline work, no
notary, no consumer web features, until ten people have run `scan_codebase` on a repository they
own. There are thirteen packages and zero users. The ratio, not the quality, is the emergency.

---

*Written by the product critic, 2026-08-24. Report only; no code in this repository was modified.*
