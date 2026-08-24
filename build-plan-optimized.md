# Slop Scorer: optimized build plan (pre-code)

Status: REPORT ONLY. No product code written. Optimization pass over the concept in
`market-research.md`, run before any build.
Date: 2026-08-22.
Inputs read: `market-research.md`, `wingman/scripts/audit-frontend-hygiene.mjs`,
`wingman/scripts/audit-vacuous-checks.mjs`, `wingman/scripts/audit-copy.mjs`,
`wingman/docs/agents/reports/waitlist-competitive-look.md`,
`wingman/docs/agents/reports/waitlist-new-comparables.md`, `wingman/docs/agents/HQ.md`,
`wingman/.claude/agents/` (33 briefs), `~/.claude/skills/` (5 skills).
Nothing in `wingman` was modified.

---

## 0. The one insight that reorders the whole plan

The founder's two headline ideas were framed as separate bets: the **wedge** (website /
vibe-code, because it is least contested) and the **killer UX** (share-to-app, because a
screenshot-then-upload flow is dead on arrival).

They are the same bet, and the share sheet is the reason.

**A URL is the most reliable payload the native share sheet produces.** Instagram, TikTok,
X, Safari, Messages, Slack and Notes all hand a receiving extension a `public.url` (iOS) or
an `EXTRA_TEXT` string containing a link (Android). An image is only offered when the user
shares from Photos or a long-press save. So the modality the market has left open is
*also* the modality that the killer UX delivers natively and losslessly, while the crowded
modality (image) is the one where the share payload is a permalink you cannot read behind
Instagram's login wall.

Every plan that starts with "share an Instagram post and we tell you if the photo is AI" is
fighting Meta's auth wall to enter a saturated category. The plan that starts with "share
any link and we tell you what this site is built out of, with citations" is fighting nobody
and gets the share sheet for free.

That is the plan below.

---

## 1. Sharpest wedge

### The beachhead: **the link.** One modality, two faces.

**v1 scores web artifacts only:** a live URL, or a local build/repo directory. Output is a
0-100 score with every finding citing a selector, a header, a file path, a computed CSS
value or a network request.

It ships as two faces of one engine, in this order:

1. **MCP server first** (developer/agent distribution, zero CAC, prevention loop).
2. **Public web scorer + shareable report page** (consumer proof, the report URL is the
   viral unit).
3. **Share target** (Android PWA share_target, then a thin iOS Share Extension) accepting
   `public.url`.

### Why this and not "all four modalities"

- **Text is a closed category.** GPTZero at 19M users and $30M ARR was acquired in June
  2026. Entering text means competing with Grammarly's distribution on a commoditized
  signal. There is no version of this where a solo founder wins text.
- **Image is a model arms race with a published ceiling.** The research cites ~45% accuracy
  against authenticity-optimized generators. Worse, it violates the founder's hard rule:
  image detection cannot cite evidence a layperson can verify. A heatmap is not a citation,
  it is a prettier black box. Image would force the product to become the thing it exists
  to catch.
- **Voice is enterprise, compressed-audio-fragile (94% clean to 71% compressed), and has no
  self-serve wedge.** Also model-first by nature. Buy or partner later, never build.
- **Web/vibe-code is the only modality where the ground truth is literally readable.** A
  `<meta name="generator" content="Lovable">`, a reachable `/CLAUDE.md`, a
  `letter-spacing: -0.04em` on an 800-weight Inter H1, a `.map` file with a commit trailer
  in it: these are *facts about the artifact*, not inferences about a distribution. A rule
  engine can cite them, a user can verify them in DevTools, and a court cannot call them an
  accusation of authorship.
- **The competitive set here is a dozen weekend novelty sites** (detectvibecode,
  isthatvibecoded, VibeCheck, the A5 extension). Each owns one page. None has an engine, a
  benchmark, an MCP surface, a share target, or a published corpus. Fragmented incumbency
  is the easiest kind to consolidate.
- **The founder already owns the corpus.** Section 3 maps ~60 shippable rules out of
  material that already exists in `wingman`, plus a labeled human-professional calibration
  set that most competitors do not have at any price.

### v1 scope (build)

- URL scan: HTTP/DNS/header probes, rendered-DOM probes via headless Chromium, computed CSS
  sampling, font-face enumeration, asset and chunk sampling, well-known-path probes.
- Local scan: a directory or repo (the CI/agent path).
- ~60 rules across 6 families, each with an evidence extractor and a prevention hint.
- Calibrated 0-100 with an explicit INCONCLUSIVE band.
- MCP server exposing the engine as tools.
- Public report page with a permanent, re-scorable, versioned report URL.
- Published corpus + published benchmark methodology.

### Deliberately deferred (say so out loud, on the site)

| Deferred | Until |
| --- | --- |
| Image scoring | The link wedge has retained users. Then buy an ensemble (Hive/Sightengine/Illuminarty) rather than train. Position as "second opinion with provenance", never as the core. |
| Voice/audio scoring | Probably never in-house. Partner or skip. |
| Long-form text scoring | The corpus exists (see 3.4) but the category is closed; ship it only as an MCP tool for agents, never as a consumer verdict, and never labeled "AI detection". |
| Native iOS app (full) | Phase 4. A Share Extension plus a web report view is 90% of the value at 10% of the cost. |
| Instagram/TikTok post analysis | Structurally blocked (see 4.3). Ship the honest refusal instead. |
| Chrome extension | Phase 4+, and only because the incumbent novelty tools have one. |

---

## 2. Architecture

### 2.1 The core is a pure library. Everything else is a thin face.

```
                  ┌──────────────────────────────────────────┐
                  │  @slop/engine  (pure TS, no I/O)         │
                  │  score(Artifact, Corpus) -> Report       │
                  └──────────────────────────────────────────┘
                        ▲                    ▲
        ┌───────────────┘                    └────────────────┐
┌───────────────────┐                              ┌──────────────────────┐
│ @slop/probe       │  I/O layer: fetch, DNS,      │ @slop/corpus         │
│ (fetch/browser/fs)│  headless Chromium, fs walk  │ rules as DATA + tests│
└───────────────────┘                              └──────────────────────┘
        ▲                ▲                 ▲                 ▲
   ┌────┴────┐     ┌─────┴─────┐    ┌──────┴──────┐   ┌──────┴──────┐
   │  CLI    │     │ HTTP API  │    │ MCP server  │   │ Web app +   │
   │ (dev)   │     │ (paid)    │    │ (agents)    │   │ share target│
   └─────────┘     └───────────┘    └─────────────┘   └─────────────┘
```

The hard rule: **the engine never touches the network and never calls a model.** It takes
an already-collected `Artifact` (a bag of observations) and a `Corpus` (rules as data) and
returns a `Report`. That makes every score reproducible offline from the stored artifact,
which is what makes the benchmark honest and the appeals process possible.

### 2.2 A rule is data, not code-with-opinions

```ts
type Rule = {
  id: "css.crushed-tracking";          // stable, citable, permanent
  family: "visual-default";            // one of 6 (see 2.4)
  title: "Headline letter-spacing below -0.03em";
  probe: "computed-css";               // which probe must have run
  detect: (a: Artifact) => Hit[];      // returns 0..n hits, each with evidence
  weight: number;                      // log-odds contribution, CALIBRATED not guessed
  cap: number;                         // max hits that count (diminishing returns)
  counterEvidence?: (a: Artifact) => boolean; // suppresses the hit (see 2.6)
  falsePositiveNote: string;           // shown in the report, always
  prevention: string;                  // what to do instead. THIS is the MCP payload.
  fixtures: { positive: string[]; negative: string[] }; // mutation-tested, see 2.7
  since: "corpus-2026.09";             // versioned, so old reports stay explicable
};

type Hit = {
  ruleId: string;
  evidence: {                          // never optional. no evidence, no hit.
    kind: "selector" | "header" | "path" | "css" | "request" | "text";
    locator: string;                   // "h1.font-hero", "/CLAUDE.md", "meta[name=generator]"
    observed: string;                  // "-0.04em", "Lovable", "200 text/markdown"
    expected?: string;
    screenshotRegion?: BBox;           // for visual rules, a crop the user can see
  };
  contribution: number;                // points this hit added, printed in the report
};
```

Two properties of this shape earn their keep:

- **`prevention` is what makes the MCP server a different product from the scanner.** A
  detector returns "87% likely AI". A prevention tool returns "your H1 is at -0.04em; the
  tell is crushed tracking at heavy weights; use -0.02em or lighter." The existing AI-slop
  MCP servers proved agents act on the second and ignore the first.
- **`counterEvidence`** is the anti-false-positive machinery, and it is the thing every
  competitor lacks. See 2.6.

### 2.3 Scoring: additive in log-odds, printable in points, capped by family

Naive "sum the weights, cap at 100" is the failure mode of every VibeScore clone: eight
correlated shadcn signals stack to 80 and a legitimate Tailwind site gets accused.

The scoring model:

1. Each hit contributes a **log-likelihood ratio** `w_r`, calibrated from the labeled set
   as `log( P(hit | generated) / P(hit | human-pro) )`. Not hand-assigned.
2. **Within a family, hits decay**: hit 1 counts `w`, hit 2 counts `w/2`, hit 3 `w/3`,
   truncated at the rule's `cap`. Correlated evidence is not independent evidence.
3. **Each family is capped** at a fixed share of total possible logit (see 2.4). No single
   family can drive a verdict alone. Specifically: builder fingerprints are the strongest
   signal and are capped at 40%, precisely because they are the signal a vendor can delete
   overnight.
4. Sum in logit space with a calibrated prior, then `score = round(100 * sigmoid(z))`.
5. The report prints each hit's **contribution in score points** (the local derivative,
   i.e. the delta if that hit were removed). Points are additive-ish and legible even
   though the model is not linear. Removing every hit reconstructs the prior. That is what
   "not a black box" means operationally: **the report is a receipt that sums to the
   score.**

Non-negotiable output invariant: *sum of printed contributions + prior = printed score*. If
it does not reconcile, the report is a bug, not a rounding difference.

### 2.4 The six families (and their caps)

| Family | What it observes | Cap | Notes |
| --- | --- | --- | --- |
| `builder-fingerprint` | generator meta, CNAME/host patterns, `/CLAUDE.md` `/.cursorrules` `/AGENTS.md` reachable, commit trailers in source maps, vendor asset paths, DNS TXT | 40% | Strongest, most brittle. Vendors will strip these. |
| `visual-default` | crushed tracking, the cream palette, eyebrow pills, ping dots, gradient hero text, identical rounded-2xl card grids, icon-tile-above-heading, single-font monoculture, the AI-serif set, purple-blue gradients, shape-assembled illustration | 25% | Highest false-positive risk. Needs counter-evidence hardest. |
| `craft-floor` | the 54 hygiene checks: scaffold title, no meta description, no og:image, no canonical, no `lang`, missing alt, soft 404, published source maps, absurd bundle weight | 15% | **Absence of craft, not evidence of AI.** A lazy human trips these. Deliberately the smallest-weight family and labeled that way in the UI. |
| `structural-uniformity` | section rhythm, near-identical component shapes, template-grade DOM repetition, copy cadence, boilerplate route set | 10% | |
| `copy-tell` | em-dash density, "delve/tapestry/furthermore", "not only X but also Y", uniform sentence length, trailing-arrow CTAs, tracked-uppercase eyebrow count | 5% | Cheap, noisy, capped low on purpose. |
| `provenance` | C2PA manifests, SynthID presence, AIGC labels, explicit disclosure | +/- | **Signed and disclosed content is scored DOWN, not up.** Rewarding disclosure is the ethical posture and it is also the one that survives EU AI Act Art. 50 and CA SB 942. |

### 2.5 Confidence, honestly

Three separate numbers, never collapsed into one:

- **Score** (0-100): how many known signals are present, weighted.
- **Coverage** (0-100%): which probes actually succeeded. A JS-gated site that returns 403
  to a headless browser has ~20% coverage; the score from that is not comparable to a fully
  rendered one and the UI must say so, not print a confident number. (`overto.ne` returning
  403 to a fetch and rendering only under real Chromium is the exact case, already
  documented in the comparables report.)
- **Evidence density**: number of *independent families* that fired.

**Bands, and the abstention rule:**

| Band | Requires |
| --- | --- |
| `INCONCLUSIVE` | coverage < 60%, OR fewer than 2 independent families fired. Score is withheld entirely. |
| `few signals` | 0-29 |
| `some signals` | 30-59 |
| `many signals` | 60-84 |
| `heavy template signature` | 85-100, AND >= 3 families, AND at least one `builder-fingerprint` hit |

The top band cannot be reached on visual tells alone. That single constraint prevents the
category's signature failure: a well-designed human site with a cream palette and shadcn
being called 94% AI.

**Publishing the abstention rate is a feature.** No competitor abstains. "We refused to
score 11% of submissions" is the most credible sentence the product can say.

### 2.6 Counter-evidence: the anti-false-positive layer

Every visual rule carries suppressors, drawn from real observations already in hand:

- Cream palette (`#F4EFE4` and neighbours) fires alone: **suppressed**. Three of four
  well-funded human dating startups use `#F0EBDC` / `#FFFBF0` / `#F6F2EA`. Cream is
  category convention in 2026, not a tell. It only counts when it co-occurs with >= 2 other
  `visual-default` hits.
- A **paid foundry face** self-hosted (Focal Maxi, NaN Jaune, PP Mori, Seriously Nostalgic)
  is strong negative evidence. Generators do not license type. Detectable from
  `CSSFontFaceRule` src paths plus a known-free-font list.
- **Real photography of people** with non-generic alt text is negative evidence.
- A **custom non-generated artifact** (analog grain overlay, hand-drawn asset, photographed
  handwriting) is negative evidence. Lark's own 3.5% fractal-noise grain overlay is the
  documented example of a thing "almost nobody generates by accident."
- **Age**: a domain registered in 2019 with archived snapshots predating the generators is
  strong negative evidence.
- **Commit history depth** (local scans): a long, non-uniform history with human-shaped
  commit messages.

This layer is the moat. Detecting tells is a weekend. Knowing which tells lie is the corpus.

### 2.7 Rules that cannot fire are the top engineering risk

Directly transplanted from `wingman/scripts/audit-vacuous-checks.mjs`, which exists because
this exact bug shipped there three times, including a live security leak that stayed open
four commits because `[a-z_]+` could not express `wingman_nudge2_sent_at`, and a
source-map check that scanned zero chunks because Next 16 moved to
`/_next/static/immutable/chunks/`.

Applied here, the failure is worse than a silent test pass: a rule whose selector goes
stale silently *lowers everyone's score* and the product quietly becomes a random number
generator that still prints citations.

Three mandatory gates, in CI, before any corpus version ships:

1. **Every rule ships with positive and negative fixtures** (frozen HTML/CSS snapshots).
   A rule that does not fire on its positive fixture fails the build.
2. **Mutation test**: perturb the fixture so the rule *should* stop firing; if it still
   fires, fail.
3. **Denominator assertion per probe**: every scan asserts it collected something. "0 chunks
   sampled" is a FAIL, never a silent pass.
4. **Corpus drift alarm**: nightly re-score of the frozen labeled set. Any rule whose fire
   rate moves more than 20% without a corpus change means the web moved or the selector
   broke. Page it.

### 2.8 Measure the rendered page, not the server HTML

Second transplant, and the methodological line the whole product lives or dies on. The
hygiene script carries this comment for a reason: a static-HTML H1 count reported
"/auth/signin has 0 H1s" and was wrong, because the route is client-rendered.

> Static-only checks produce confident findings about the wrong document.

So: headless Chromium, `networkidle`, a settle delay, computed styles read from the live
CSSOM, `CSSFontFaceRule` enumerated from loaded stylesheets. Exactly the method the
comparables report used to read Focal Maxi and PP Mori out of live CSS instead of guessing
from a screenshot. Fetch-only scanning is allowed as a *fast path* but must set coverage
below the INCONCLUSIVE floor on its own.

### 2.9 One core, three surfaces

| Surface | What it returns | Who pays |
| --- | --- | --- |
| **Consumer app / web report** | Score, band, top 5 findings in plain language with a visible crop or a copyable selector, "what would change this score", the false-positive note, the corpus version. | Free, rate-limited; Pro for history and bulk. |
| **MCP server** | Findings and prevention hints, *score optional and de-emphasised*. Tools return structured tells so an agent can loop: write, score, fix, re-score. | Free (distribution). Team tier for private corpora. |
| **HTTP API / CI gate** | Same JSON, plus a `--max-score` exit code so a GitHub Action can fail a PR. | The actual revenue line. |

**The MCP server must not return a bare score as its primary output.** parweb's server
already demonstrated agents act on raw tell counts and ignore percentages. Score is a
secondary field.

Proposed MCP tools:

- `score_url(url)` -> full report
- `score_build(path)` -> local directory/repo scan, pre-deploy
- `check_before_ship(diff|path)` -> only rules that the changed files can trip, fast
- `list_rules(family?)` -> the corpus, so an agent can read the rules *before* generating
- `explain_rule(id)` -> title, evidence shape, false-positive note, prevention, fixtures
- `suppressors(url)` -> what counter-evidence was found (so an agent knows what *saved* it)

`list_rules` + `explain_rule` are the prevention loop. They are also free marketing: every
agent that reads the corpus is citing it.

---

## 3. Reuse map (concrete, named)

### 3.1 `wingman/scripts/audit-frontend-hygiene.mjs` -> the `craft-floor` family

Ships ~54 checks across 14 sections. Direct transplants, with the caveat that these become
the *lowest-weighted* family because they measure absent craft, not generation:

| Hygiene check | Rule id |
| --- | --- |
| scaffold titles (`vite + react`, `create next app`, `untitled`, `localhost`) | `craft.scaffold-title` |
| identical titles across pages | `craft.duplicate-titles` |
| missing meta description | `craft.no-meta-description` |
| missing og:image | `craft.no-og-image` |
| missing canonical | `craft.no-canonical` |
| missing `<html lang>` | `craft.no-lang` |
| `<img>` without alt | `craft.missing-alt` |
| soft 404 / 200 on a missing page | `craft.soft-404` |
| blank-body 404 | `craft.empty-404` |
| no robots.txt / sitemap / sitemap not referenced | `craft.crawler-files` |
| published `.map` files, `sourceMappingURL` comments | `craft.published-sourcemaps` |
| bundle weight | `craft.js-weight` |
| no favicon | `craft.no-favicon` |
| raw `*.vercel.app` indexable duplicate | `builder.bare-platform-domain` (promoted to fingerprint family) |

Also transplant, verbatim, the file's framing discipline: **every item phrased as a defect,
so a PASS means the defect is ABSENT.** Inverting it in the output is how you end up
reassured by the wrong line. That comment belongs at the top of the corpus.

The `.map` check is a double win here: a reachable source map is both a craft defect *and*
the richest builder-fingerprint substrate (original paths, commit trailers, generator
banners). One probe, two families.

### 3.2 `waitlist-competitive-look.md` -> the `visual-default` family

Section 3 of that report is a ready-made rule list, and critically each item is already
stated with a *measurable threshold* rather than a vibe:

| Documented tell | Rule id | Measurement |
| --- | --- | --- |
| crushed letter spacing | `css.crushed-tracking` | computed `letter-spacing <= -0.03em` at `font-weight >= 700` |
| cream/beige palette | `css.cream-surface` | body bg within delta-E of the `#F4EFE4` cluster. Suppressed alone. |
| single-font monoculture | `css.one-family` | one `font-family` across h1/body/ui |
| the AI-default sans set | `css.default-sans` | Inter / Geist / Space Grotesk as the *real* face |
| the AI-serif set | `css.ai-serif` | Instrument Serif / Fraunces / Playfair |
| oversized hero headline | `css.hero-scale` | h1 >= 3.4rem at mobile width |
| eyebrow / kicker pills | `dom.eyebrow-count` | tracked-uppercase labels above headings; the source page shipped **8** |
| pulsing status dot | `dom.ping-dot` | `animate-ping` or equivalent keyframe on a small dot |
| tiny numbered section labels | `dom.numbered-steps` | `01`-`05` numerals |
| identical card grids | `dom.uniform-cards` | n >= 6 blocks sharing radius + border + shadow signature |
| the diffuse two-layer shadow | `css.stock-shadow` | `0 1px 2px` + `0 6px 16px` pattern |
| icon tile above heading | `dom.icon-tile-stack` | |
| shape-assembled illustration | `dom.shape-illustration` | |
| trailing-arrow CTA | `copy.arrow-cta` | "Join the waitlist ->" shape |

Note what else that report gives free: it already flagged that **two of the brief's premises
were factually wrong** ("there is a serif on our page", "it is one email field") after
checking in a browser. That is the product's own operating standard as a document.

### 3.3 `waitlist-new-comparables.md` -> the LABELED CALIBRATION SET (the most valuable asset)

This is not a source of rules. It is a **ground-truth negative set measured in a real
browser**, which is exactly what nobody else in this category has:

- `overto.ne` / `overto.ne/intro` (Hinge founder, $18M) - Focal Maxi, `#F0EBDC`, 18 words
- `rodeorodeorodeo.com` ($8.5M seed) - NaN Jaune + Libre Franklin, `#FFFBF0`, 9 words
- `waitlist.joinsitch.com` (a16z speedrun) - Seriously Nostalgic + PP Mori, black, 53 images
- `amata.ai` ($6M) - Crimson Pro @300, documentary photography, handwritten manifesto
- plus `stripe.com` (parweb's cited case: scores 61 and was written by professionals)

Four funded, design-literate, human-made sites with fonts, hexes, word counts and page
heights **read out of live CSS, not guessed**. They immediately produce four calibration
facts:

1. **Warm cream is not a tell.** Three of four use it. If the v0 corpus scores these four
   above 50, the weights are wrong, and that is discoverable on day one.
2. **A paid, self-hosted foundry face is strong negative evidence.** Three of four bought
   one. Generators do not license type.
3. **A trial/demo font build in production** (Overtone's `Focal Trial`, Sitch's
   `Belmonte Ballpoint Trial` and `Padlock Script DEMO`) is a *sloppiness* signal that is
   explicitly NOT an AI signal. It belongs in a separate "craft" surface, and getting that
   distinction right is the whole credibility posture.
4. Honeypot fields, hidden UTM plumbing and a real anti-spam layer (Sitch's ~10 honeypots)
   are negative evidence: generators do not ship those.

The target on this set: **all five score below 45, none reaches the top band.** That is the
v1 acceptance gate.

### 3.4 `wingman/scripts/audit-copy.mjs` + the house copy rules -> the `copy-tell` family

`audit-copy.mjs` already extracts user-visible prose out of JSX (localized `t()` strings vs
raw text nodes) and enumerates every href for dead/placeholder links. That extractor is the
front half of copy scoring. The house rules it enforces elsewhere (no em dashes, no "AI" in
feature names, brand-term discipline) are the back half.

Note the reflexive irony and use it: the founder's own "no em dashes" rule exists because
em-dash density is a slop tell. The product's own copy is bound by its own corpus. Say that
publicly.

### 3.5 `wingman/scripts/audit-vacuous-checks.mjs` -> the CI meta-gate

Covered in 2.7. This is the single most transferable file in the repo. It should be ported
almost as-is, retargeted from "tests that scan nothing" to "rules that fire on nothing."
Its heuristic posture ("reports SUSPECTS, not verdicts; tuned to over-report") is also the
right posture for the product's own findings UI.

### 3.6 Sub-agents: which ones map in, and the hard line on where they may not go

**The hard line first.** No LLM agent may sit in the scoring path. An agent in the loop
reintroduces exactly the unfalsifiable output the product exists to catch, and it makes
scores non-reproducible across runs. Agents may **propose** rules offline, **label**
corpus candidates, and **review** reports. They may not compute a score.

**Agents that map to corpus/eval roles:**

| Agent (`wingman/.claude/agents/`) | Role here |
| --- | --- |
| `seo-specialist` | Owns the `craft-floor` family. It already owns the 52/54-check hygiene bar and indexability guards. |
| `copy-reviewer` | Owns `copy-tell`. Already enforces no-em-dashes, brand-term, i18n parity. |
| `product-critic` | Owns `visual-default` rule *proposals*, and imports its governing discipline: **verify current state before recommending** (it was born after 2 of 3 "obvious" recommendations turned out to be already built). Restated for this product: verify a signal on the labeled set before adding it as a rule. |
| `competitor-teardown` | Corpus expansion: one generator at a time (v0, Lovable, Bolt, Replit, Figma Make), deep, cataloguing its fingerprints and how it changes them. |
| `growth-researcher` | Harvests new tells and new labeled URLs from the wild. |
| `flow-auditor` | The eval-harness pattern: never returns empty, always produces improvements. Becomes the weekly corpus review. |
| `synthetic-user` | The pattern to copy for a **longitudinal drift monitor**: same frozen set, same probes, day after day, so decay shows up as a trend and not as a surprise. Note its termination condition design too. |
| `release-verifier` | Gate a corpus version against the benchmark before publishing. Corpus releases are deploys. |
| `security-auditor` | Adversarial review of the fetcher: SSRF, private-IP and metadata-endpoint access, redirect chains, decompression bombs, headless-browser escape. This is a real attack surface because the product fetches arbitrary user-supplied URLs. Non-optional. |
| `legal-compliance-officer` | Owns the framing and the disclaimer. Veto on any weakened disclosure. Section 5 is its brief. |
| `lark-historian` | The LEARNINGS evidence bar, transplanted: every corpus change carries a date, the claim, the evidence (a measured number or a live probe), a confidence, and what changes next time. No evidence means it is labeled HYPOTHESIS, not a rule. |
| `decision-brief`, `week-planner`, `chief-of-staff` | Operating cadence, unchanged. |

**Agents that could BE MCP tools** (as advisory tools alongside the deterministic ones,
clearly labeled as opinion, never feeding the score):

- `design_critique` (from `product-critic`) - "here is what a designer would say", explicitly
  marked non-scoring.
- `copy_review` (from `copy-reviewer`) - rewrite suggestions for copy tells.
- `hygiene_explain` (from `seo-specialist`) - how to fix a craft-floor finding.

Everything else in the 33-agent roster (billing, dating-domain, content pipeline, outreach)
does not transfer.

### 3.7 Skills

- `~/.claude/skills/atomic-transitions/` - directly applicable. A share-sheet tap is a
  double-submit machine, and scan jobs need canonical keys (`url + corpusVersion`),
  23505-is-a-win recovery, and idempotent scan creation. Read it before writing the job
  queue, not after.
- `lark-dating-design` - the *format* is the reusable part: exact tokens, scale, spacing
  grid as a machine-readable reference. The corpus needs the same shape so rules can cite
  thresholds instead of adjectives.
- `orient` - the pattern behind the MCP `list_rules` / `explain_corpus` tools: give a fresh
  agent an accurate picture before it acts.
- `lark-dating` / `locked-in-execution` - project-specific, do not transfer, but the "skill
  carries the invariants that caused real outages" convention should be recreated for this
  project from day one.

---

## 4. Share-to-app feasibility

### 4.1 iOS Share Extension: what is actually allowed

- A Share Extension declares `NSExtensionActivationRule` over UTIs:
  `public.url`, `public.image`, `public.movie`, `public.audio`, `public.plain-text`,
  `public.file-url`. You can accept several and branch.
- **Links are the reliable payload.** Safari passes the page URL plus title. Instagram,
  TikTok and X pass a permalink URL (their "Share to..." row). Messages/Notes/Slack pass
  text that may contain a URL, so the extension must run a URL extractor over
  `public.plain-text`, not assume `public.url`.
- **Images** arrive from Photos, Files, and long-press-save flows, as `NSItemProvider` you
  must `loadItem` asynchronously. Not from an Instagram post share.
- **Audio** arrives from Voice Memos, Files, and some messaging apps as a `public.file-url`
  or `public.audio`. Compressed, and often out-of-process large.
- **Hard constraints:** share extensions run in a tight memory jail (tens of MB, OOM-killed
  without a crash log you will enjoy), have a short wall-clock budget before iOS reclaims
  them, and cannot run a headless browser. **Therefore: never analyze in the extension.**
  Upload/enqueue, show a compact result or a "view full report" handoff into the app or a
  web report URL. App Groups + a shared container for the handoff.
- App Review will ask what the app does with shared content. Have the retention answer
  written before submission (see 5.4).

### 4.2 Android: strictly easier, and there is a no-store path

- `intent-filter` on `ACTION_SEND` with `text/plain` (URL arrives in `EXTRA_TEXT`, usually
  wrapped in marketing text, so extract), `image/*`, `audio/*`, and `ACTION_SEND_MULTIPLE`
  for batches.
- **PWA `share_target` in the web app manifest** lets an installed PWA appear in the
  Android system share sheet with no store submission, no Play review, no $25 account, and
  a same-day ship. `method: POST, enctype: multipart/form-data` even accepts files.
- This means the entire share-to-app thesis can be **validated on Android in days** before
  spending a week on Swift and a fortnight on Apple review. Do that.

### 4.3 The Instagram problem, stated honestly

Sharing an Instagram post gives you `https://www.instagram.com/p/XXXX/`. Server-side that
URL returns a login wall or a JS shell; the public oEmbed path is restricted; scraping it
is a ToS violation and a fragile arms race. **You cannot analyze the post's image from the
shared link.** Any plan that promises otherwise is promising a thing it will quietly fail
at.

The pragmatic v1, and the honest one:

1. **Shared URL, public web page** -> full scan. This is the product.
2. **Shared URL, known social permalink** -> detect the domain and return a specific,
   honest refusal: *"That is an Instagram permalink. We cannot read the post behind it.
   Screenshot the image and share that instead, or share the link in the bio."* Offer the
   one-tap alternative. A precise refusal builds more trust than a fabricated score, and it
   is exactly the posture Section 5 requires.
3. **Shared image** -> accept it, but in v1 return craft/provenance findings only (C2PA
   manifest present, EXIF absent, generator metadata, known-generator artifacts) rather
   than a model-based verdict. Ship the image *score* only when the ensemble lands.
4. **Shared audio** -> out of scope for v1, with a waitlist tap.

### 4.4 Fetch-and-analyze server side: the real engineering

- Headless Chromium in a sandboxed, short-lived, network-egress-restricted worker
  (Cloudflare Browser Rendering, Vercel Sandbox, or a Fly machine pool).
- **SSRF defense is mandatory and is the security-auditor's first job**: deny private and
  link-local ranges, cloud metadata endpoints, `file://`, `redirect` chains that end
  private, DNS-rebinding via resolve-then-pin.
- Timeouts, response size caps, decompression bomb caps, per-user rate limits, one scan per
  `(normalized-url, corpusVersion)` deduped and cached.
- Respect `robots.txt` for any *crawling*; a single user-initiated fetch of a page the user
  is looking at is a different act, and the policy should say which it is doing.
- Store the **Artifact** (the observations), not the site. That makes reports re-scorable
  against a new corpus version and makes the benchmark reproducible, at a fraction of the
  storage and none of the copyright exposure of storing pages.

---

## 5. Anti-slop credibility: the bar this product must clear

The product will be judged by its own standard, in public, on day one, by people who want
it to be wrong. Assume a screenshot of the product scoring something absurd is the first
thing that goes viral. Design for that.

### 5.1 Publish the corpus

Rules live in a public repo: id, family, threshold, evidence shape, weight, false-positive
note, fixtures. Anyone can audit a weight, dispute a rule, or file a false positive with a
URL. This is the single strongest differentiator available, because the entire category
(explicitly noted in the research: *"None of the major tools publish verified accuracy/FPR"*)
refuses to do it.

### 5.2 Publish a benchmark with a stated composition

- The labeled set: how many generated (by which generator, which month), how many
  human-professional (with the four comparables plus stripe.com named), how many
  human-amateur (the hardest and most important class).
- **Report FPR at every threshold, on the human-professional class specifically.** The
  headline metric is not accuracy, it is: *of well-made human sites, how many did we
  mislabel.*
- Report the abstention rate.
- Report per-family AUC so anyone can see which signals are decaying.
- Re-run and re-publish on every corpus release. Dated. Old numbers stay up.

### 5.3 Framing: a style score, not an authorship accusation

Fixed language, enforced by `copy-reviewer` and `legal-compliance-officer`:

- Say: **"shows 7 of 61 known template/low-effort signals"**. Never: "94% AI-generated."
- Never name or imply a person, an author, or a student.
- Every report carries the sentence: *"A high score means this artifact resembles
  generated-template output. It is not proof that a tool made it, and it is not a judgement
  of the person who made it."*
- Every finding carries its own `falsePositiveNote` inline, not buried in a FAQ.
- Every report carries a **"what would change this score"** block. A score you can act on
  is a score that is making a falsifiable claim.
- Precedent to cite openly, as parweb does: stripe.com scores 61 and was written by
  professionals. Put a known-high-scoring-but-human example on the homepage, permanently.

### 5.4 Terms, and the uses this product refuses

Written before launch, not after the first incident:

- Explicitly out of scope: academic misconduct decisions, hiring/firing, immigration,
  credit, content moderation at scale, or any adverse action against an individual. Say it
  in the ToS and enforce it in the API terms.
- An **appeals/dispute path** with a human, a public false-positive log, and a commitment
  to fix the rule (not the score) when a dispute is upheld.
- Submitted artifacts: observations retained, source content not retained by default,
  deletion on request, no training on user submissions (and no model, so that promise is
  cheap and true).
- Rate-limit and log bulk scanning of a single domain: someone will try to build a
  harassment campaign out of this.

### 5.5 Eat the dog food, in public

- The product's own site is scanned by the product, and the score is in the footer, live,
  linked to the full report. It will not be zero. Show it anyway. A `craft-floor`-clean
  site with two `visual-default` hits and an honest 24 is the most persuasive marketing
  asset available.
- The site must clear the 54-check hygiene bar itself before launch (`audit-frontend-hygiene`
  is portable as-is with a `AUDIT_BASE` change).
- Type: do not ship Inter, Geist, Space Grotesk, Instrument Serif, Fraunces or Playfair.
  The comparables research already did this homework: General Sans (Fontshare, variable,
  true italic, self-hostable) is the recommendation, with Cabinet Grotesk as a display
  companion if the hero feels light. Do not ship a trial or DEMO font build, which two of
  the four funded comparables did.
- No cream background. It is the correct palette for a dating app and the wrong one for the
  thing that flags cream backgrounds.

---

## 6. Risks and kill criteria

| # | Risk | Kill / pivot criterion |
| --- | --- | --- |
| 1 | **False positives on good human work.** The category's fatal flaw. | After two calibration rounds, if FPR on the human-professional set exceeds **10%** at the "many signals" band, or if any of the five named calibration sites reaches the top band: do not launch. Narrow the corpus until it clears. |
| 2 | **Signal decay / vendors strip fingerprints.** v0, Lovable and Bolt can remove generator meta in one release. | Track per-family AUC monthly. If `builder-fingerprint` AUC drops below 0.7, the family is dead and the score must survive without it, which is why it is capped at 40%. If *overall* holdout AUC on fresh 2026-Q4 sites drops below **0.75**, the modality is over: stop selling scores and sell the corpus/prevention only. |
| 3 | **MCP is a hobby, not a business.** | If by day 60 the server has under **100 installs** and under **20 weekly-active** clients, the prevention loop is marketing, not revenue. Keep it, stop investing in it, move budget to the CI gate. |
| 4 | **Share-to-app is not actually the killer UX.** | If under **15% of installs** use the share sheet at least once in week one, the premise is wrong. Ship a paste box and a browser extension instead and stop paying for two native surfaces. |
| 5 | **Consumer will not pay.** The research is explicit that consumer WTP for detection is unproven and the winners are cheap novelties. | Do not build consumer subscriptions before the API/CI line has revenue. If consumer conversion is under 1% at 5,000 free scans, the consumer app is a funnel, not a product. Price accordingly. |
| 6 | **An incumbent adds the modality.** Reality Defender or Grammarly/GPTZero ships web/vibe-code with evidence. | Do not fight on score. Pivot to the durable asset: the **open corpus and the prevention loop**. A competitor can copy a score; copying a public corpus makes them a citation, not a rival. |
| 7 | **Legal/reputational hit.** First credible claim of harm from a false positive. | Any upheld dispute triggers a same-week corpus fix and a public log entry. A second one in a quarter triggers a full framing review and, if needed, removal of the numeric score in favour of signal counts only. |
| 8 | **Provenance commoditizes the easy half.** C2PA + SynthID at capture, EU AI Act Art. 50 enforcement from Aug 2026, CA SB 942 from Jan 2026. | This is why v1 is web/code, which C2PA does not cover at all. If provenance ever covers generated *sites*, that is the exit signal for the whole thesis. Watch it quarterly. |
| 9 | **The abstention rate is embarrassingly high.** JS-gated, Cloudflare-challenged and login-walled pages defeat the probe. | If coverage is under 60% on more than **25%** of real submissions, the probe layer, not the corpus, is the bottleneck. Fix the browser tier before adding a single rule. |
| 10 | **Fetching arbitrary URLs gets the service abused.** SSRF, harassment scanning, DDoS-by-proxy. | Pre-launch security review is a gate, not a task. One SSRF finding in production and the fetcher goes behind a hardened proxy before anything else ships. |

---

## 7. Ranked build plan for v1

Sequenced so the thesis is proven or killed **before** the expensive surfaces are built.
Weeks are working-week estimates for a solo founder using agents.

### Phase 0 - Corpus and labeled set (week 1). No product. Highest leverage.

1. Port the rule discipline: defect-phrased checks, denominator assertions, mutation
   fixtures, rendered-not-static measurement.
2. Write ~60 rules as data across the six families, drawn from 3.1-3.4. No engine yet, just
   the corpus file plus fixtures.
3. Build the labeled set: **20 generated** (v0 / Lovable / Bolt / Replit / Figma Make
   gallery outputs, dated), **20 human-professional** (the four comparables + stripe.com +
   15 more, dated and archive-verified), **20 human-amateur** (the hard class: real small
   business sites, hand-built, ugly).
4. Freeze it. Store artifacts, not pages.

**Exit gate:** every rule has a positive fixture it fires on and a negative fixture it does
not.

### Phase 1 - Engine + CLI (week 2). This is the phase that proves or kills the thesis.

1. `@slop/probe` (fetch tier + Chromium tier), `@slop/engine`, `@slop/corpus`.
2. Calibrate weights as log-odds from the labeled set. Do not hand-assign.
3. `slop score <url> --json` and `slop score ./dir`.
4. Run the benchmark. Print FPR on the human-professional class.

**Exit gate, and it is a real gate:** all five named calibration sites score under 45,
holdout AUC >= 0.85, FPR at the "many signals" band under 10%. **If this fails, stop. The
wedge is not real and nothing downstream matters.** This is the cheapest possible place to
learn that, which is exactly why it is Phase 1.

### Phase 2 - MCP server (week 3). Distribution before UI.

1. Tools: `score_url`, `score_build`, `check_before_ship`, `list_rules`, `explain_rule`,
   `suppressors`. Findings and prevention hints primary, score secondary.
2. Publish to the official MCP registry and the aggregators (mcpmarket, glama, mcpservers).
3. Open-source the corpus repo alongside it.

Why before the web app: MCP installs are near-zero CAC, the audience (people building with
agents) is precisely the audience that cares, and every agent reading `list_rules` is
distribution. It also forces the corpus to be legible to a third party, which is a quality
forcing function.

### Phase 3 - Public web scorer + shareable report (week 4). The consumer proof.

1. Paste-a-URL, scan, report page at a permanent versioned URL.
2. The report page is the growth loop: its own `og:image` renders the score and the top
   three findings, so every share into a group chat or a timeline is an ad. This, not the
   app, is the viral unit.
3. Publish the benchmark page and the false-positive log on day one, not later.
4. Footer shows the site's own live score.

### Phase 4 - Share targets (weeks 5-6). Cheap side first.

1. **Android PWA `share_target`** first. Days, not weeks. No store, no review, no fee.
   Validates the share thesis against the kill criterion in Risk 4 before any Swift.
2. **iOS Share Extension**, `public.url` + `public.plain-text` only, thin: extract, POST,
   show compact verdict, deep-link to the full report. Requires the Apple Developer account
   ($99/yr) and days of review, so start the account in Phase 3.
3. Honest refusal path for social permalinks (4.3).

### Phase 5 - Monetization (week 7+), in this order

1. **CI gate / API** (`--max-score` exit code, GitHub Action). Teams have budgets and a
   real job to be done: "do not let our agents ship template slop." This is the revenue
   line and it is the same engine.
2. **Pro consumer** (history, bulk, private corpora) only after free volume proves demand.
3. Image modality via a bought ensemble, only if the link wedge retains.

### Standing cadence from week 2 onward

- Nightly drift re-score of the frozen set, alarm on >20% rule fire-rate movement.
- Weekly corpus review (the `flow-auditor` pattern: never returns empty).
- Monthly per-family AUC publication.
- Every corpus change carries date, claim, evidence, confidence (the `lark-historian`
  evidence bar). No evidence means HYPOTHESIS, not rule.

---

## 8. The five decisions, restated

1. **Beachhead is the link, not the image.** Web/vibe-code only in v1. The share sheet's
   most reliable payload and the market's least contested modality are the same thing.
2. **MCP ships before the consumer app.** Distribution is cheaper than marketing, and
   `list_rules` turns the corpus into the marketing.
3. **Rules are data with calibrated log-odds weights, family caps and mandatory
   counter-evidence.** The report is a receipt that reconciles to the score. No model in the
   scoring path, ever, including no agent.
4. **Abstain rather than guess.** An INCONCLUSIVE band with a published abstention rate and
   a published FPR on human-professional work is the credibility moat, because the entire
   category refuses to publish any of it.
5. **The Phase 1 benchmark is a hard kill gate.** If the four funded comparables and
   stripe.com do not score under 45 before any UI exists, the thesis is dead and it cost one
   week.
