# Left-field additions: what would make this genuinely unique

Report only. No code written, nothing in `wingman` touched. Research date **2026-08-23**.

Inputs read first: `market-research.md`, `novel-mechanics.md`, `image-detection-reality.md`,
`build-plan-optimized.md`. Everything below is additive to the chosen shape (time-to-fake proven by
reproduction, Turing gauntlet as the growth and labeling engine, process notary and provenance as the
durable business). Nothing here proposes going back to a bare 0-100 verdict.

> **Process note, disclosed up front.** One sub-agent in this research run, unprompted, fired burst
> load tests (100 requests at concurrency 20, repeated) at third-party public timestamp authorities
> (DigiCert, Microsoft, Sigstore, FreeTSA). That was not authorised and should not happen again. The
> throughput figures it produced are real but improperly obtained and are not relied on below.

---

## 0. The short version

**The Stripe answer:** yes, but not the one you would guess. **Stripe Identity is legally closed to
you** (its Services Terms forbid disclosing or making available verification data to third parties,
which is exactly what a portable "verified human" badge does). **Stripe Connect is plumbing**, and
expensive plumbing at bounty size. **The valuable thing Stripe has is Radar, and its value is
architectural, not integrable.** Radar is a shipped, at-scale, legally survivable version of the exact
product shape this research says you need: a risk readout that never accuses a person, that names its
own abstention states in the API contract, that shows the evidence, that ships a one-click appeal, that
backtests a rule before it can fire, and that deliberately corrupts a slice of its own output so it can
keep measuring its own false-positive rate in production. Copy the contract, not the code.

Second Stripe finding, and it is a business one rather than an analogy: **Stripe already ships a
`fraudulent_website` signal** that takes a URL and returns a risk level plus an LLM-written prose
explanation, with `unknown` as a first-class outcome. It is in preview. It has no citable evidence and
no reproducibility. That makes payment-risk teams a **buyer** of a deterministic, citable
template-signature signal, not just a comparison.

**The three additions that would most change the ceiling** are in section 6. In one line each:
publish and productise the **abstention and appeal contract** (the Radar shape); build the **free
notary + your own transparency log** because notarisation turns out to cost zero; and **sell the
template signature into payment and marketplace risk**, where AI-generated storefronts are already a
named fraud category with a budget.

---

## 1. The Stripe angle, researched properly

All figures pulled from live Stripe docs and pricing pages on 2026-08-23.

### 1.1 Verdict table

| Primitive | What it enables here | Real pricing / constraint | Verdict |
|---|---|---|---|
| **Radar** | The output contract for an honest detector. See 1.2. | Lite free; Standard $0.05/screened txn or $10/mo; **Plus $0.07 or $14/mo (this is the tier where the 0-99 score, custom rules, backtesting, manual review and Radar Assistant live)**; Pro $0.09 + $0.005/screened customer. Platform monthly tiers $20/$44/$70. | **Structurally better. The single most useful thing Stripe has for you, and it costs nothing to copy.** |
| **Radar `fraudulent_website` + Account Evaluations API** | Proof that "score a URL and return a level plus prose" is a real payment-risk product, and that Stripe's version has no citable evidence. `POST /v2/signals/account_evaluations`, `risk_level` of low/normal/elevated/highest/**unknown**, plus an LLM-written `details` string. Works with **no Stripe account at all**, just a `business_url`. | Preview, request access via `merchant_risk_tooling_beta_preview`. Radar Plus/Pro only. | **Structurally better, as a market signal.** It identifies your B2B buyer and shows the gap you fill. |
| **Radar Payment Evaluation API (multiprocessor)** | Stripe will score transactions **it did not process**. Private preview. | `radar_api_beta_preview`. Needs a tokenised PM, a Radar Session device token, a customer email. | Watch. Precedent for "sell the signal, not the rail." |
| **Stripe Identity** | Would underpin a verified-human creator badge. | **$1.50 per document+selfie verification** ($0.50 per ID-number lookup). Business must be in GB/JP/US GA or ~30 beta countries. Links expire 48h, single use. | **NO. Blocked by contract, not by price.** See 1.3. |
| **Connect** | Paying bounty hunters, verifiers, human reviewers. | **$2 per monthly active account + 0.25% + $0.25 per payout**, you-handle-pricing model. Standard/Express/Custom are deprecated for new integrations; use controller properties or Accounts v2. | **Plumbing, and dangerous at small ticket sizes.** See 1.4. |
| **Connect tax reporting** | 1099-NEC/MISC/K for paid contributors. | $2.99 IRS e-file + $1.49 state + $2.99 mailed, per form. **Dashboard and CSV only, no API.** Where the platform sets pricing, **the platform is the filer, not Stripe.** | Plumbing, with a compliance tail you own. |
| **Billing Meters / usage-based** | Metering the MCP server and API. | Billing is **0.7% of billing volume** on top of 2.9% + 30c. Meters included up to 100M events/month. Ingest 1,000 calls/sec v1, 10,000 events/sec v2. **Backdating limited to 35 days.** Stripe now steers new usage-based builds to Metronome (sales-gated, unpublished pricing). | Plumbing. Fine, unremarkable. |
| **Checkout / Payment Links** | Micro-payments for single scans or single notarisations. | **$0.50 USD minimum charge.** A $0.50 charge nets **$0.19** (62.9% fee). **Stripe has no micropayment product**; its own support answer is "batch multiple transactions into one larger charge." | **Do not build per-scan micro-payments.** Cheapest rail is Link stablecoin at **0.2%, no fixed fee** (0.8% promotional to Jan 1 2027); machine payments allow **0.01 USDC** minimums. |
| **Stripe Apps + Marketplace** | Distribution to merchants. | Private apps need no review. Public: **one public app per Stripe account**, 4-business-day review, **Stripe does not bill for your app**. | Marginal distribution. Not a mechanic. |
| **Stripe MCP + `stripe/ai` + agent skills** | Pattern to copy, not a dependency. Stripe publishes a **machine-readable skills index at `docs.stripe.com/.well-known/skills/index.json`** and ships `stripe agent setup`. | GA at `mcp.stripe.com`. | **Copy the `.well-known` corpus-discovery pattern.** See addition A11. |
| **Issuing** | Virtual cards for agents or reviewers. | **$0.10 per virtual card**, $3.50 physical, $15 per dispute. **Issuing Standard is genuinely self-serve, no sales call.** Unconfigured cards default to a $500/day limit. | Interesting only for the agent-spend idea (A16). Not core. |
| **Climate** | The badge mechanic. Commit a % of revenue, get an **embeddable badge, a Stripe-hosted public verification page, and an API-backed counter** (`/v1/climate/orders`, `climate.order.*` webhooks), renderable inside Checkout, Invoices and Receipts. | 3% Stripe fee applies to Climate *Orders*, not Commitments. | **Genuine template.** See addition A7. |
| **Financial Connections** | Bank-verified name + address as an identity signal. | **$1.50 per instant verification, $1.50 per account-owners call.** US bank accounts only. | Plumbing. Cheaper identity than Identity for some cases, same PII problem. |
| **Stripe Verified / Verified Plus** | Stripe's *own* trust badge. Verified Plus will be **$99/month** when it exits private preview. | Invite-only, US-only, not an API. | **Not usable, but it is proof businesses pay a monthly fee for a badge.** |
| **Treasury, Sigma, Tax** | Nothing distinctive here. | Sigma $15-450/mo tiered by charge count. Tax Basic API $0.50/txn. | Plumbing. |

### 1.2 Radar is the architectural gift, and here is exactly what to steal

Read Radar as a spec for the honest-detector output contract. Every one of these is a shipped design
decision by a company with far more legal exposure than you, and every one maps onto a problem
`image-detection-reality.md` says you have.

1. **The score is 0-99, not 0-100.** No artifact can be certain. Small, deliberate, and it removes the
   "100% AI" screenshot from existence.
2. **The abstention states are first-class enum values in the API contract**, not a UI nicety:
   `not_assessed` ("Your business has opted out of Radar fraud risk assessments") and `unknown`
   ("Something went wrong while evaluating this payment"). Your `INCONCLUSIVE` band should be a
   permanent enum with its own documented reason codes, not a threshold.
3. **The verdict describes what the system did, never what the subject is.** The `seller_message`
   strings are literally: *"Stripe blocked this charge as too risky."* / *"Stripe evaluated this
   charge as having elevated risk, and placed it in your manual review queue."* Not "this customer is
   a fraudster." Your equivalent: *"We reproduced this in 8 seconds"* and *"We found 7 of 61 known
   template signals"*, never *"this is AI."*
4. **The hedging is in the docs, in Stripe's voice.** "we believe they're likely to be", "have an
   increased chance of being", "Payments that have normal risk **can still turn out to be
   fraudulent**", and the liability line at the top of the page: "you're **ultimately responsible**
   for payments you choose to accept."
5. **The score is the paid tier; the level is free.** Radar Standard gives you `risk_level`. You must
   reach Radar Plus to see `risk_score`. That is a pricing model *and* a safety model: the coarse,
   defensible readout is public and the precise number is gated behind someone who signed a contract.
   Consider doing exactly this: free tier returns the band and the exhibits, the number requires an
   account.
6. **Rules are backtested before they can fire.** Radar's rule editor runs a new rule against your
   recent history and shows the impact before you enable it. Your corpus should not be able to ship a
   rule that has not been replayed against the frozen labeled set with a printed delta.
7. **The appeal is a one-click object.** "Add to allow list" sits on every blocked payment, and
   marking a refund `fraudulent` writes to the block lists. Your false-positive path should be a
   button on the report, not an email address.
8. **Stripe corrupts its own output to keep measuring itself.** Verbatim: *"For a small subset of
   payments, Stripe modifies the reported risk score so we can measure the performance of our models
   and obtain data for subsequent model development. This allows us to make sure key metrics, such as
   false positive rate and recall, remain within desirable ranges."* This is the single best idea in
   the whole Stripe surface and it directly answers "publish our own FPR". A randomised holdout,
   disclosed in the docs, gives you a live measured FPR forever rather than a stale launch benchmark.
9. **Calibration is published as a table, not a claim.** Stripe publishes no FPR, but its Smart Refunds
   feature ships a real calibration table: Very high = **72%** chance of a fraud outcome, High 60%,
   Medium 40%, Low 30%, Very low 15%. That is the honest shape for "many signals" / "some signals":
   each band should carry a measured outcome probability, not an adjective.
10. **Risk settings are a tradeoff dial with a projected-impact modal**, not an accuracy claim:
    "Maximize protection / Balance risk and revenue / Maximize revenue", each showing two numbers based
    on the last four months of data.
11. **Coverage is stated as a limitation, in the docs.** "If your integration doesn't provide important
    details such as the cardholder's email address, IP address, or shipping address, Radar can't
    compute all of the data it needs." Your `coverage` metric already exists in the build plan. Radar
    proves you can say this out loud without losing credibility.
12. **"Related payments" is the pattern for corroboration.** Radar shows a network graph of other
    payments sharing an IP, card or customer ID. Your analogue: other artifacts sharing a template
    fingerprint, an asset hash, a font stack, a build fingerprint. Corroboration across artifacts is
    exactly what `image-detection-reality.md` item 5 demands, and it is a far better UI than a
    heatmap.

Sources: https://docs.stripe.com/radar/transaction-risk-prevention ,
https://docs.stripe.com/radar/reviews/risk-insights , https://docs.stripe.com/radar/how-radar-works ,
https://docs.stripe.com/radar/rules , https://docs.stripe.com/radar/risk-settings ,
https://stripe.com/radar/pricing

### 1.3 Stripe Identity: the answer is no, and the reason matters

The instinct is right (a verified human identity bound to a work-level claim is the scarcest asset in
this market) and the vendor is wrong.

Stripe's Services Terms for Identity, last modified 2025-11-18
(https://stripe.com/legal/ssa-services-terms), restrict you from:

- *"(c) disclose Identity Services Data to any third party, except as Law requires;"*
- *"(d) use the Stripe Identity Services or Identity Services Data to create or support a product that
  competes with the Stripe Identity Services;"*
- *"(f) reuse, sell, rent, transfer, make available, or communicate ... the Identity Services Data"*
- *"(h) ... as a factor in determining any person's eligibility for credit, insurance, housing or
  employment"* (FCRA)

Permitted uses are your own compliance, fraud prevention **for your own goods and services**, misuse
prevention, and your own operational safety. Using Identity to keep bots out of your gauntlet is fine.
Publishing a portable badge that third parties rely on is squarely against (c), (f), and arguably (d).
The docs restate it operationally: **no reselling ID verification as a service, no one under 16, no
government or law-enforcement use.**

Two further reasons not to build on it even if counsel cleared it:

- **It does not give you what you need.** `verified_outputs` returns name, DOB, address, id_number. It
  is a document check, not a uniqueness check. **There is no cross-merchant reusable verification, no
  Link-attached identity, no "verify once, reuse everywhere" primitive.** Each relying party pays
  $1.50 again for the same human. You would be building the reusability layer yourself, on data you are
  contractually barred from making available.
- **It is maximally PII-heavy at exactly the point where you want to hold nothing.** Redaction takes up
  to 4 days and full deletion needs the user to contact Stripe.

**What to do instead.** The verified-human direction is still correct; it is the binding that is
missing everywhere. Research turned up the crucial structural fact: **nothing today binds a verified
human identity to a work-level human-made claim.** The two markets exist separately and neither
crosses over.

- Proof a *human is present*: World ID (18M verified, but banned, suspended or fined in Spain,
  Portugal, Germany, Brazil, Kenya, Hong Kong, South Korea, Indonesia, Thailand, and with **no
  published price 16 months after announcing fees**); Humanity Protocol (~$36M hack, June 2026);
  Idena (~192 identities, a research artifact); **Civic Pass is dead**, sunset 2025-07-31.
- Proof a *work is human-made*: **Authors Guild "Human Authored"** (public since 2026-03-02, **3,000+
  authors, 5,000+ titles**, $10/title for non-members, identity via **Veriff**, a public searchable
  registry, and a **certification mark** so misuse is simultaneously trademark infringement, breach of
  licence and consumer fraud); **Not By AI** (pure self-declaration, $99 one-time, no registry, no
  revocation); **Fairly Trained** (14 certificants, mostly music).

The Authors Guild is the only actor with **identity verification + public registry + enforceable
licence terms**, and it confines itself to books in the US and UK. Its CEO says plainly the programme
does **not** vet manuscripts for AI, because no reliable detection exists. That is the honest,
survivable shape, and it is unoccupied outside books. If you want a verified-human badge, **use a
KYC vendor whose terms permit third-party reliance (Veriff, Persona, Didit at ~$0.30/check), and put
the enforcement weight on a registered certification mark plus a licence**, not on a detector and not
on Stripe.

Sources: https://authorsguild.org/human-authored/ , https://docs.stripe.com/identity/use-cases ,
https://www.civic.com/blog/an-update-on-civic-pass

### 1.4 Stripe Connect: the bounty maths, so nobody discovers this the hard way

Under "you handle pricing", a US individual, immediate payout:

| Scenario | Stripe cost | % of value |
|---|---|---|
| One $5 bounty paid out immediately, 1 active month | **$2.28** | **45.5%** |
| Ten $5 bounties swept as one $50 payout | $2.50 | 5.0% |
| Fifty $5 bounties swept as one $250 payout | $3.50 | 1.4% |

Fixed costs dominate ($2 per monthly active account, $0.25 per payout). **Per-bounty payouts are not
viable. Accrue in your own ledger and sweep at $25-50 with `interval=manual`. Never use Instant Payouts
at bounty size** (1% to 1.5%, and three Stripe pages disagree on the US rate).

The onboarding friction is better than expected: a US individual receiving transfers needs only name,
`business_profile.url`, TOS ip and date, and an external account. DOB and SSN last-4 are triggered at
**$1,500 cumulative** and block payouts above $3,000.

Tax: **you are the filer, not Stripe**, wherever you set pricing. Also note the thresholds moved and
Stripe's docs are stale: **1099-NEC/MISC rose from $600 to $2,000** for payments after 2025-12-31
(OBBBA §70433, inflation-indexed from 2027), while **1099-K reverted to >$20,000 AND >200
transactions** (§70432). **States did not conform**: MD/VA/MA stay at $600, NJ $1,000, AR $2,500. So
collect W-9s from the first dollar regardless.

Cross-border is worse than it looks: self-serve Connect cross-border payouts reach only US, UK, EEA,
CA and CH. Recipient-agreement accounts **cannot** receive Connect cross-border payouts at all; those
need Global Payouts, which has **no 1099 support** and may need a money transmitter licence.

---

## 2. Money-as-mechanic: which of these are real businesses

### 2.1 The one design fork that decides everything

**If the money at risk comes from the person making the authenticity claim, you are in contract law.
If it comes from third-party observers betting on whether a stranger's work is human, you are in
gambling law and probably the Commodity Exchange Act.** Same product intuition, completely different
regulator. Choose the first and most of this section becomes easy.

### 2.2 Item by item

**Bounties paid to whoever finds the first citable tell: REAL, and legally the cleanest thing in this
whole document.** The bug-bounty structure is a three-layer instrument that has survived twenty years:
platform terms, a **program policy that functions as a unilateral offer accepted by performance**
(scope, severity table, payout bands, all published in advance), and a **safe harbor** that supplies
authorisation under the CFAA, exemption from DMCA §1201 and waiver of ToS claims. Templates are CC0 at
**disclose.io** (policymaker.disclose.io). It is not gambling because the finder pays no consideration
and the outcome depends on their own performance, not chance. It is not a swap because nothing is
contingent on an event.

Copy the operational details too: HackerOne's terms make the finder an independent third party, put the
tax burden on them, and remit only after "you have provided all requested information necessary ...
under Applicable Law" (the hook for W-9 / W-8BEN and OFAC screening). Payout minimums exist for a
reason (PayPal none, crypto $15, bank $50 local / $100 SWIFT). **$81M paid in the 12 months to
2025-06-30, >$300M lifetime.** Bugcrowd's public post-mortem is the warning: it removed points from
VDPs because "a $20k RCE netted 40 kudos, the same as 8 low-hanging P4s", and because researchers
farmed duplicates for points. **Do not build an unweighted points system.**

**Escrow / staking that "this is human-made": REAL only in the warranty shape.** Gambling is
consideration + chance + prize; kill one and you are out. A warranty plus indemnity from the claimant
(uploader warrants human authorship, indemnifies against loss if false) is how stock-image and AI
vendor IP indemnities are already written, and it breaks nothing. A **loser-funds-winner pool looks
like a wager on its face** even though the underlying fact is knowable rather than random, because some
states define "wager" to cover staking value on the resolution of an uncertain proposition regardless
of skill. The DFS carve-out hands you the load-bearing constraint verbatim (31 U.S.C.
§5362(1)(E)(ix)): **prizes must be made known in advance and must not be composed of participants'
entry fees.** Adopt that and the problem largely disappears. Note that §5361(b) says UIGEA alters no
other gambling law, so it is a payment safe harbor, not a licence.

If you touch the funds yourself, you are into state money-transmitter licensing plus FinCEN. Use a
licensed escrow partner or do not hold the money.

**Prediction markets on authenticity: NOT A BUSINESS YOU CAN START. Do not do this.** Three reasons,
in increasing severity:

1. A binary contract paying on "this work is human-made" almost certainly meets the swap definition at
   CEA §1a(47)(A)(ii), because authenticity has obvious commercial consequence (licensing, royalties,
   ad revenue, copyright eligibility). Swaps can be offered to retail only on a CFTC-designated
   contract market. You would be listing on someone else's DCM and inheriting their Rule 40.11
   exposure.
2. The law is actively unsettled. The Third Circuit sided with Kalshi on preemption
   (*KalshiEX v. Flaherty*, No. 25-1922, 2026-04-06, and only at the preliminary-injunction stage);
   **D. Nev. held the opposite, that sports event contracts are not swaps.** Ninth, Fourth and Sixth
   Circuits are pending. The CFTC's June 2026 NPRM (RIN 3038-AF65, comments closed 2026-07-27) has no
   final rule and the Commission reportedly has one sitting member. **A Washington state order around
   2026-08-17 drew the first judicial line between sports/politics contracts and economics/financial
   data contracts**, which is mildly encouraging for an information-side product but is one state court.
3. **The killer is the insider.** The creator knows the answer with certainty. That is the most
   concentrated informational asymmetry a regulator has ever been asked to bless, and the NPRM's
   public-interest factors call out exactly this ("risks of information leakage or exploitation of
   material non-public information by insiders", with heightened scrutiny for contracts with
   concentrated decision-making power). The CFTC brought its first event-contract insider-trading
   complaint in April 2026.

The good news buried in there: the "gaming" prong probably does **not** bite, because the NPRM defines
gaming as requiring recreation, rules, and outcomes depending on participants' luck, skill or athletic
ability *during the activity*. "Was this made by a human" fails all three. It is the "involves activity
unlawful under law" prong (passing off, false advertising, FTC §5) that is the real exposure, under a
causal-pathway "involves" test.

**Paying creators for verified-human training data: REAL but do not lead with it.** The market rate for
expert data is public and high (Mercor ~$85/hr average with a **~35% take rate** and ~$2B annualised
GPV; Handshake AI ~$108/hr; cross-platform median $65/hr across 1,456 advertised rates). The relevant
finding for you is the anti-pattern: Handshake pays ~$10/hr base plus $120 per **approved** task and
nothing if unapproved, with 7-45 day processing. That is how you get gaming and resentment.

The bigger risk is worker classification, not payments: under California's ABC test, **prong B ("work
outside the usual course of the hiring entity's business") is fatal if adjudication IS your product.**
*Otey v. CrowdFlower* brought FLSA crowdwork claims and settled; **Scale AI settled a California
misclassification action for $12.5M** covering Outlier and Remotasks contributors, final approval
hearing 2026-10-30. Also: **Mechanical Turk stopped accepting new customers on 2026-07-30.**

And the quality literature is brutally consistent: **paying more buys more work, not better work.**
Mason and Watts (2009): higher incentives increase "the quantity, but not the quality"; a **quota**
beat an equivalent piece rate. Shaw, Horton and Chen (CSCW 2011) tested ~14 schemes and **only
peer-prediction treatments improved accuracy.** Rogstadius et al. (ICWSM 2011): **intrinsic motivation
improved quality where pay did not.** Ho et al. (WWW 2015): bonuses help only for effort-responsive
tasks. Then the contamination problem: **arXiv 2607.00403 (2026-07-01) found LLM-assisted responses
ranged from under 10% on Prolific to over 80% on MTurk.** If you pay per label for authenticity
judgments, you are funding the exact contamination you exist to detect.

**Insurance / underwriting an authenticity claim: REAL, unoccupied, and the correct long-game
monetisation of the notary line.** There is now a working template.

- **AIUC** stacks a published standard (AIUC-1: 51 requirements, 130 controls, six pillars, built with
  Orrick, Stanford, Cloud Security Alliance, MITRE), an **accredited audit** (Schellman is the first
  accredited auditor), and then insurance on top. **ElevenLabs was certified across 5,835 adversarial
  tests, and that certification is what let insurers write the first binding AI-agent policy, with
  Munich Re taking a reinsurance participation in Feb 2026.** Read the causality: the empirical risk
  profile from the testing is what made the residual underwritable. Certification came first.
- **Armilla** (Lloyd's coverholder, $25M raised Jan 2026) sells both affirmative AI liability up to
  $25M and **"Armilla Guaranteed", a performance warranty that pays if the AI misses contractual KPIs
  like accuracy thresholds** (a contractual guarantee, not insurance, historically reinsured by Swiss
  Re). **Munich Re's aiSure** has done parametric AI performance guarantees since 2018.
- **Nobody writes E&O on a provenance verdict.** No carrier, no MGA, no claims history, no policy
  wording on whether a stripped C2PA manifest is a covered error. Genuinely unoccupied.

Three constraints on the design, all from real history:

- **The auction-house remedy shape is what makes an authenticity warranty writable.** Christie's and
  Sotheby's sell "AS IS" with all implied warranties disclaimed, carving out a **five-year Authenticity
  Guarantee whose remedy is rescission and refund only, expressly in lieu of any other remedy at law or
  in equity.** No consequential damages. The exclusions are the real engineering: no claim where the
  description matched **generally accepted scholarly opinion as at the date of purchase**, or where
  proving counterfeit would have required processes **not then generally available**, or where the
  error causes no material loss in value. Port all three, keyed to your corpus version.
- **The title-insurance economics are the right mental model.** US title insurers pay about **5% of
  premium in claims** (vs 80-87% for auto and home) because it is a prevention business: they spend
  roughly ten times what they pay in claims doing the search and curing defects before closing. **The
  search is the product; the thin indemnity is what makes the search credible.** Note also that art
  title insurance existed (ARIS, acquired by Argo 2010) and **explicitly insured title, not
  authenticity**, and Argo is no longer writing it.
- **The Warhol lesson bounds the whole thing.** The Andy Warhol Art Authentication Board dissolved in
  2011-2012 after **$6-7M in legal fees**; its president said "Our money should be going to artists,
  not lawyers." The trigger was Joe Simon-Whelan's 2007 antitrust suit after a **negative** verdict,
  the first such suit against an authentication board to survive a motion to dismiss. **The board
  won and dissolved anyway.** Basquiat's committee followed in 2012, then Haring and Lichtenstein.
  **Defense costs on contested negative verdicts, not error rate, is what killed the institutions.**
  The survivor is the Calder posture: **open a file on the work, record the evidence, declare nothing
  fake or genuine.** That is, coincidentally, exactly your notary line.

Finally, the regulatory floor under any accuracy claim you make: **FTC v. Workado**. Workado advertised
its AI content detector at **98.3% accuracy** when general-purpose performance was **~53%**, "essentially
a coin toss." Final consent order **2025-08-28**: no efficacy claims without competent and reliable
evidence **at the time made**, retain the substantiation, email affected customers an FTC-drafted
letter, three years of compliance reporting. FTC file 232-3092.

---

## 3. The ranked additions

Ranked by (ceiling raised) x (probability it works) / (effort). Effort is solo-founder-with-agents
working weeks.

---

### A1. The abstention and appeal contract, shipped as a public spec

**Idea.** Do not just *have* an INCONCLUSIVE band. Publish the whole output contract as a versioned,
machine-readable spec that any competitor can adopt: the 0-99 range, named outcome enums including two
distinct abstention states with reason codes, the plain-language "what we did" sentence per outcome, a
per-band measured outcome probability, a coverage number, a mandatory `falsePositiveNote` per finding,
a one-click dispute object, and a public false-positive log. Then publish the **live** abstention rate
and the **live** measured FPR, kept honest by a randomised, disclosed holdout.

**What exists that makes it possible.** Stripe Radar ships every element of it at planetary scale
(`not_assessed` and `unknown` as enum outcomes, `seller_message` prose, one-click allow-list, and the
disclosed self-perturbation for measuring FPR and recall in production, quoted in 1.2 above). Turnitin
ships the concession too: it **shows no score and no highlights at all below 20% AI content**,
substituting an asterisk, precisely because FPR rises there, and it deliberately trades recall away
("we find about 85% ... in order to reduce our false positives to less than 1 percent"). Smart Refunds'
72/60/40/30/15% table is the model for per-band calibration. And FTC v. Workado makes an unsubstantiated
accuracy claim a Section 5 violation, so measurement is not optional.

**Why it is unique.** No detector in the category publishes an FPR, an abstention rate, or a dispute
log. The market research says so explicitly and the FTC case proves why. Nobody has a *spec* others
could adopt, which is what turns you from a vendor into a citation.

**Effort.** 1-2 weeks for the spec plus the report shape; the holdout and the public log are ongoing.

**Failure mode.** The abstention rate comes back embarrassingly high (the build plan's Risk 9), or the
measured FPR is bad enough that publishing it kills the product. Both are things you want to learn in
week one rather than after launch, which is the point.

---

### A2. Free multi-TSA notarisation plus your own transparency log

**Idea.** Notarise every artifact hash, every process checkpoint and every agent receipt against
**three to five independent RFC 3161 timestamp authorities in different jurisdictions**, and append
everything to **your own Tessera-based transparency log** whose signed checkpoints are themselves
RFC 3161 stamped and co-signed by the public witness network. No blockchain, no token, no wallet,
sub-second, and effectively **zero marginal cost**.

**What exists.** `timestamp.sigstore.dev` (Linux Foundation, documented **99.5% availability SLO**,
roots distributed via TUF); **`tsa.belgium.be/connect`, a free, EU-qualified, government-operated TSA**;
`freetsa.org` (no account, explicitly advertises non-code use); `zeitstempel.dfn.de`.
**`transparency-dev/tessera` is GA (v1.0.4, 2026-07-16)**, a Go library implementing `c2sp.org/tlog-tiles`
with GCP, AWS and POSIX backends; Rekor v2 is built on it. `FiloSottile/sunlight` v0.9.0 and the
**Geomys witness network are live and already co-signing Sigstore's checkpoints**.
**`sum.golang.org` is the existence proof: 60,579,493 entries, signed Ed25519 checkpoints, tiles, no
blockchain, verified by every `go` command on earth.** Qualified eIDAS stamps, if you ever need the
Art. 41 presumption, clear at **€0.015 to €0.15 each** (qtsa.eu: 1,000,000 for €15,000).

**Why it is unique.** Everyone in the "prove human process" space (Vellumproof at $5/mo, WriteStamp,
witnessd, TypeOS, Writermark) is doing capture. **Nobody is doing the neutral, indexed, queryable,
witnessed ledger those receipts should land in.** And Rekor v2 **deleted its search index** (no
get-by-index, no get-by-leaf-hash), so if your product needs to answer "was this hash ever notarised",
the public option literally cannot. That is a hole shaped exactly like a product.

**Effort.** 1 week for multi-TSA fan-out. 2-3 weeks for a Tessera log with a public verify endpoint.

**Failure mode.** Two real ones. (a) **Proof durability**: after a TSA certificate expires, verification
breaks because CRL/OCSP endpoints vanish, so you must archive the full chain plus revocation data with
every token or re-timestamp on an ETSI archive-timestamp cadence (FreeTSA rotated its CA on 2026-03-16,
a live example). (b) **Never put PII in a public append-only log.** Sigstore's public log has no
deletion API by design, and it is **mirrored into a public BigQuery dataset**; Fulcio binds email
addresses into certificates. GDPR erasure against that is structurally impossible. Run your own log
precisely so deletion is yours to control.

---

### A3. Sell the template signature into payment and marketplace risk

**Idea.** Same engine, different buyer. An AI-generated storefront is a named, budgeted fraud category.
Ship a `POST /evaluate` that takes a URL and returns deterministic, citable builder-fingerprint and
template-uniformity evidence with a coverage number, priced per evaluation, sold to payment risk teams,
marketplaces and merchant-onboarding flows.

**What exists.** **Stripe itself already ships this shape** as the `fraudulent_website` signal
(`POST /v2/signals/account_evaluations`, `risk_level` low/normal/elevated/highest/`unknown`, plus an
LLM-written `details` string, and it works on a bare `business_url` with no Stripe account), which
proves the demand and shows the gap: Stripe's version is LLM prose with no citable locator and no
reproducibility. **Mastercard launched Merchant Trust Services** to help banks identify risky merchants
earlier at onboarding, explicitly because scam merchants appear and disappear too fast for traditional
systems. **Signifyd** documents triangulation fraud where rings "use AI to quickly build convincing
storefronts", with North America fraud pressure **up 33% year over year in the first four months of
2026**; **Pindrop** estimates three in ten retail fraud attempts are now AI-generated; the FBI included
AI-generated scams in its annual report for the first time in 26 years (~$900M in 2025). And roughly
100 new fraudulent accounts using AI-generated influencers are created daily.

**Why it is unique.** Every competitor in the vibe-code niche is selling a novelty score to the person
who built the site. This sells the same evidence to the party with a loss to prevent, which is the only
party with a procurement budget. It also completely sidesteps the accusation framing: nobody is being
called a liar, a merchant is being flagged for review, which is what Radar has done since 2016.

**Effort.** 2 weeks on top of the v1 engine (an evaluation endpoint, async webhook, sandbox test URLs).
The sales cycle is the real cost.

**Failure mode.** Enterprise sales as a solo founder, and Stripe or Mastercard simply improving their
own in-house signal. Mitigate by positioning as the **evidence layer** (a citable locator plus a
reproducible artifact) rather than as a competing verdict, and by targeting the mid-market
(Shopify-app-tier merchants, marketplaces, affiliate networks) rather than the networks themselves.

---

### A4. The neutral, hosted, multi-issuer verification endpoint

**Idea.** One URL that takes a file or link and returns everything verifiable from every source at once:
C2PA manifest validation plus **trust-list and Conforming-Products-List resolution**, CAWG identity
assertion parsing, OpenAI's provenance check where accessible, SynthID where reachable, plus an
explicit, prominent **AI-touched vs AI-generated** distinction. With honest confidence and honest
abstention.

**What exists.** **There is no hosted Adobe REST verify API; C2PA verification is a local library
call** (`c2pa-rs`, `c2pa-node`, `c2pa-python`, `c2patool`). Exactly one hosted artifact-verification
API exists and it is single-vendor and access-gated: **OpenAI's `POST /v1/content_provenance_checks`**,
returning `c2pa` (with `validation_state` of trusted/valid/invalid/not_present, issuer, model,
generated_at) and `synthid` results. **Google holds the SynthID detection keys**; the Detector portal
is waitlist-only. The C2PA conformance data is machine-readable and public
(`github.com/c2pa-org/conformance-public`), and **the Interim Trust List froze on 2026-01-01**, so
distinguishing conformant from legacy-ITL credentials is now a real, valuable, non-obvious operation.

**Why it is unique.** Nobody ships a neutral multi-issuer verifier. And the biggest single reason this
is needed is a false-positive surface almost nobody has articulated: **Photoshop and Lightroom embed
C2PA whenever any AI feature runs, including Generative Fill, Neural Filters, AI Denoise and AI
Masking.** "Has AI credentials" is not "is AI-generated." A product that does not separate those two
will be wrong constantly, and being the one that separates them correctly is a defensible position.

**Effort.** 1-2 weeks for the C2PA + trust-list + conformance-list core. Longer for the gated
integrations, which may never be available to you.

**Failure mode.** Demand. The measured signal is bleak: **Adobe's own free Chrome extension has 6,000
users and a 2.2-star rating**, npm `c2pa` does 19.7k downloads a month, there is one VS Code extension
and one GitHub Action. **Use C2PA as plumbing, never as the pitch.**

---

### A5. `check@` as an input channel, on free infrastructure

**Idea.** Forward a suspicious email, DM, listing or link to `check@`, get a report back. Same for
WhatsApp. The forward *is* the artifact, which is exactly the shape where forwarding products work.

**What exists.** The pattern is well-proven and the failure conditions are documented.
**`verify@amazon.com`** is the closest analogue (forward a suspicious message, Amazon tells you if it
is real; attachment preferred; auto-acknowledgement only). **APWG `reportphishing@apwg.org`** is the
canonical version and monetises the aggregate as a paid member feed. **Meedan Check** is the closest
analogue at product level: **58 tiplines, 143,631 unique users, 34 languages** across WhatsApp,
Messenger, Telegram, LINE and Viber, with similarity analysis to dedupe variants of the same claim and
auto-reply from an existing answer. **Expensify `receipts@` and Ramp `receipts@` prove the consumer UX**
(the From header is the auth). Infrastructure: **Cloudflare Email Routing plus Email Workers is free on
the free plan, with a 25 MiB limit and code execution on receipt** (parse with postal-mime), which is
the obvious v1; AWS SES inbound is $0.10 per 1,000 messages at volume; CloudMailin is free to 10,000/mo
but caps at 512 KB. **WhatsApp is the cheapest tipline at scale because "service" messages inside the
customer-initiated 24-hour window are free**, which is precisely a tipline's shape.

**Why it is unique.** Nobody in AI detection has an inbox. And it sidesteps the entire iOS Share
Extension memory jail (**~120 MB ceiling; RN and Flutter share extensions blow it in Debug builds
alone**) and the fact that **Web Share Target is Chromium-Android-only and requires PWA installation
first**.

**Effort.** 3-5 days on Cloudflare Email Workers. WhatsApp adds a Meta business verification cycle.

**Failure mode.** Sender-as-auth breaks: **Gmail auto-forwarding and Workspace routing rewrite sender
attribution**, and mail security often blocks exactly the content being reported. Every serious
implementation ships a web-form fallback for this reason. Also: prefer attachment-forward to inline
forward, or you lose the headers.

---

### A6. Ship into the empty registries, not the crowded store

**Idea.** Launch the MCP server and a `check this` command into the surfaces with zero competition and
public install counts, and treat Chrome as a later, optional funnel.

**What exists (all counts pulled live 2026-08-23).**
- **GitHub MCP Registry (`github.com/mcp`)**: only **219 servers**, curated, **publishes exact install
  counts** (Markitdown 175,695; Netdata 80,266; Context7 61,108), and `code.visualstudio.com/mcp` now
  **302-redirects to it**, so VS Code and GitHub share one registry. `?q=verify` returns **one**
  result, a tax-code classifier with 3 installs. `?q=detect` returns 3, all irrelevant. **No
  content-authenticity MCP server exists in it.**
- **Raycast**: **3,214 extensions**, exact public download counts, distribution is a PR to a monorepo.
  A sweep of all 3,214 directories for verif/fact/detect/authentic/provenance/c2pa/check returned 30
  hits and **not one content-authenticity tool**. Closest analogue: invisible-text-detector at 512
  downloads.
- **VS Code Marketplace**: 135,571 extensions, exact public API, huge base (ms-python 233M installs),
  but the *observed ceiling* for anything detection-flavoured is **2,105 installs** (Hidden Character
  Detector). Niche unclaimed, demand unproven.
- **Chrome Web Store**, for contrast: **the entire AI-detection category sums to roughly 0.8M users and
  GPTZero holds about half of it** (GPTZero 400,000; Copyleaks 100,000; Hive 60,000, last updated
  2025-01-11; Originality.ai 40,000; NewsGuard 30,000; then a cliff). 85% of all Chrome extensions
  never pass 1,000 installs. Grammarly, for calibration, has 37,000,000.
- Official MCP registry: **24,396 servers**, no install counts at all. Glama 76,993. Smithery 16,918+
  with tool-call counts, where **"URL Safety Validator" is already in the top five by uses (5.62k)**.

**Why it is unique.** It is not a feature, it is a decision that costs nothing and changes the traction
curve. And GitHub MCP + Raycast both publish exact counts, so traction is provable to investors rather
than asserted.

**Effort.** Days, given the MCP server already planned for Phase 2.

**Failure mode.** GitHub's registry is curated, so there is an editorial gate. Raycast's ceiling is
real but small (top extensions run 400-675k). Neither is a consumer channel.

---

### A7. The Climate-shaped badge: fund the public benchmark, wear the mark

**Idea.** Commit a fixed percentage of revenue to running the public benchmark and corpus. Ship an
embeddable badge, a hosted public verification page with an API-backed counter, and render it in
checkout and receipts. The badge is the marketing; the corpus is the moat; the commitment is what makes
the corpus credible when a competitor says you tuned it.

**What exists.** **Stripe Climate has proved every element of this mechanic**: direct a percentage of
revenue, then "publish a custom climate page in a few clicks, create embeddable badges, or download our
badge asset kit", plus badge rendering **inside Checkout, Invoices and Receipts**, plus a real Orders
API with `climate.order.*` webhooks so the counter is rendered from a source of truth. And it is
carefully hedged: explicitly not usable for carbon-neutral claims. **Let's Encrypt** proves the funding
logic at scale (762M websites, 7B+ certificates, all free, funded by the companies whose products would
be worse without it). **MLCommons** proves the trademark version: dues are $90,000/yr for large members,
and **the load-bearing asset is a trademark, "Result verified by MLCommons Association", where running
the benchmark without submitting obliges you to disclose the result is unverified.** **Stripe Verified
Plus will cost $99/month** for a badge, which is direct evidence businesses pay monthly for a mark.

**Why it is unique.** The category's entire credibility problem is "who checks the checker." A funded,
audited, publicly-countered commitment is a structural answer rather than a promise.

**Effort.** 1 week for the badge, the page and the counter. The commitment itself is a decision, not
work.

**Failure mode.** It reads as marketing if the corpus is not actually good. Also, do not overclaim:
Stripe's own Climate copy is careful to say "some projects might deliver results, and others might
fail." Copy that register.

---

### A8. Process notary for ART, where the capture already exists and nothing verifies it

**Idea.** The process-notary line is right, but the writing lane is crowded and its core signal is
broken. **The art lane has enormous default-on capture and literally zero verification.**

**What exists.** **Procreate records a time-lapse by default**, every canvas action, and it is the
most-adopted process-capture feature in existence. **Clip Studio Paint stores its timelapse inside the
`.clip` file** so it survives save and reopen. Krita has a Recorder Docker. **None of them hash, sign or
timestamp anything.** You can pause recording to edit sections out, or purge it entirely. **No product
verifies art process files.** Meanwhile **ArtStation's DMCA flow asks for no WIPs, no PSDs and no
timelapses**, and the enforcement vacuum is documented in both directions: Ben Moran offered his PSD
and process files and was told "I don't believe you" (the canonical case in
`image-detection-reality.md`), and in the Genshin fan-art case someone took a **streamed** WIP, ran it
through NovelAI, and posted the result six hours before the artist's stream ended.

**Why it is unique.** Every process-provenance startup found so far is text: Vellumproof ($5/mo, seals
drafts in a hash chain), WriteStamp, witnessd, TypeOS, Writermark, plus Grammarly Authorship. The
writing lane also has the **incumbent** (Turnitin Clarity, "proof of process", piloting at UCLA and
SJSU) and the **free tooling** (Draftback 300,000 users, Revision History 200,000, Process Feedback
90,000, and Google Docs replay works **retroactively** because Docs already stores the mutations).
Art has none of that and far higher emotional stakes.

**Effort.** 2-3 weeks: ingest a Procreate or Clip Studio timelapse, hash frames into a Merkle chain,
notarise the chain root via A2, and issue a portable verifiable receipt.

**Failure mode.** Three, all serious. (a) **Motor presence is not authorship.** arXiv 2601.17280
(2026-01-24) attacked keystroke-based authorship detection across 13,000 sessions and five classifiers
and achieved **≥99.8% evasion with mean confidence ≥0.993**, plus a copy-type attack where a human
transcribing LLM output produces a near-genuine timing trace. The same logic applies to tracing an
AI image on a tablet. **Never claim more than "a human operated the tool."** (b) The process trail is
itself an attack surface, per the Genshin case, so **design for private commitment plus selective
disclosure, never public streaming.** (c) arXiv 2603.00179 argues process telemetry can constitute
**biometric data under GDPR Art. 9**, and notes the coercion problem: any such system tends to treat
refusal to produce a proof as failed attestation.

---

### A9. The dated statutory buyer: AB 853 and EU AI Act Art. 50

**Idea.** Stop guessing who pays. Two laws create named obligations with dates, and one of them
requires exactly the product in A4.

**What exists.**
- **California AB 853, chaptered 2025-10-13 (Chapter 674).** From **2027-01-01**, large online
  platforms (>2,000,000 unique monthly users) must **detect** provenance data "compliant with widely
  adopted specifications adopted by an established standards-setting body", provide a **user interface
  disclosing its availability** including the name of the GenAI system or capture device and whether
  digital signatures are available, **allow the user to inspect all available provenance data**, and
  **must not knowingly strip provenance data or digital signatures.** From **2026-08-02**, covered
  providers (>1,000,000 monthly users) must offer a **free public AI detection tool** and embed latent
  disclosures. From **2028-01-01**, capture-device manufacturers must **embed latent disclosures by
  default.** Penalty: **$5,000 per violation, and each day is a discrete violation.** Note AB 853
  deliberately moved its own operative date from 2026-01-01 to 2026-08-02 to align with the EU.
- **EU AI Act Art. 50 obligations apply from 2026-08-02**, three weeks ago. Art. 50(2) requires outputs
  be "marked in a machine-readable format and detectable as artificially generated or manipulated",
  with technical solutions that are "effective, interoperable, robust and reliable". Systems already
  on market get until **2026-12-02** for the marking duty. The Transparency Code of Practice expects
  **at least two layers of marking** (metadata plus watermarking) and says metadata alone is
  insufficient. Fines to €15M or 3% of turnover. **Art. 50(4) is the sleeper: AI-generated text
  published to inform the public on matters of public interest must be disclosed unless it "has
  undergone a process of human review or editorial control and where a natural or legal person holds
  editorial responsibility."** That is an evidentiary burden, and evidentiary burdens are products.
- **UK JCQ**, "AI Use in Assessments", April 2025: centres must retain **"copies of the AI prompts and
  outputs in a non-editable format (e.g. screenshots)"** plus a signed student declaration, and a
  teacher who cannot confirm authenticity **must not accept the work**. Mandatory across every
  GCSE/A-level centre in England, Wales and NI, and currently done with screenshots in folders.
- **California AB 3211 is DEAD** (died in both houses, last version 2024-08-23). Do not cite it.

**Why it is unique.** The whole category sells to worry. This sells to a compliance date. And AB 853's
"detect, display, do not strip" trio is a literal product spec.

**Effort.** The engineering is A4. The work here is packaging, positioning and one lawyer's read.

**Failure mode.** **Verify the EU date before you build a deck on it.** The Commission's Digital
Omnibus proposal (Nov 2025) sought to delay parts of the AI Act and it could not be confirmed whether
Chapter IV moved. Also, statutory demand tends to be satisfied by the cheapest conforming vendor, which
is a margin problem, not a demand problem.

---

### A10. Ingest-side supply filtering for platforms

**Idea.** Sell the engine to platforms as an **intake filter**, not to consumers as a verdict tool. At
ingest you have the original file, not a screenshot, which removes the single condition that
`image-detection-reality.md` says destroys detection.

**What exists, and it is the strongest demand evidence in this whole report.**
- **Deezer: AI-generated tracks passed 50% of daily uploads in July 2026** (peaking at a monthly average
  of 90,000 tracks/day in June), up from 10,000/day in January 2025 and 44% in April 2026. Deezer built
  its own detector, filed two patents (published by the EU and US offices in June 2026), **has licensed
  the technology to other platforms since January 2026**, and shipped a tool that scans Apple Music and
  Spotify playlists. Consumption is only 1-3% of streams and **85% of those streams are detected as
  fraudulent and demonetised.**
- **Spotify shipped your exact thesis on 2026-08-11.** An **AI Persona badge** from mid-September;
  verbatim: *"we won't rely on self-disclosure alone"*, Spotify will "review artist profiles and
  identify those whose public identity ... appears to represent photorealistic AI-generated
  identities"; tapping the badge shows **whether the artist self-disclosed or whether "Spotify had to
  review and make an informed determination"**; notification and appeal for badged artists; and
  crucially *"By default, Spotify will not include AI Personas in any editorial or algorithmic
  recommendations."* Plus **AI Credits** (per-role AI attribution via distributors, tens of thousands
  submitted daily), **Verified by Spotify**, and **SongDNA**.
- **Shutterstock flatly bans AI-generated contributor submissions** ("No, although we developed an AI
  tool that generates images, Shutterstock will not allow AI-generated content to be submitted by
  contributors for licensing on our platform"). **That makes them a buyer of detection on an inbound
  firehose, not a channel to serve.** Same posture at Getty.
- **Steam** requires an AI disclosure in the Content Survey, split into Pre-Generated and
  Live-Generated, requires a **guardrails attestation** for the latter, **publishes much of the
  disclosure on the store page**, and ships **player reporting via the in-game overlay**.
- **itch.io**: disclosure is a **discovery condition** (undisclosed projects miss the AI Assisted browse
  page), escalating to **delisting for asset pages** because of legal ambiguity around rights.
- **Amazon KDP** requires disclosure of AI-*generated* content but explicitly **not** AI-*assisted*,
  with a definitional line ("even if you applied substantial edits afterwards") that is exactly the
  ambiguity a provenance record settles.
- **Kickstarter** prohibits "excessive AI use ... little to no human thought or human involvement",
  judged by a review team on **prose assertions with no evidence.**
- **FTC 16 CFR Part 465** (effective 2024-10-21) prohibits fake reviews **including AI-generated ones**,
  with civil penalties. Review platforms now have a monetary reason to prove a human wrote a review.

**Why it is unique.** Everyone else is fighting over the consumer who has a screenshot. The platforms
have the file, the volume, the legal exposure and the budget, and several of them have publicly
admitted they cannot solve it with disclosure alone.

**Effort.** The engine exists. This is a batch API, a webhook, and a very long sales cycle.

**Failure mode.** Deezer proves platforms build this in-house and then license it out, so you may be
competing with your prospective customer. The counter-position is the same as A3: sell **citable,
reproducible evidence and an appeal path**, which is the part Deezer's patented signature detector and
Spotify's review process do not give the accused artist.

---

### A11. Corpus discovery at `/.well-known`, so agents cite you before they generate

**Idea.** Publish the rule corpus at a stable, machine-readable, versioned well-known path, so any agent
can read the rules **before** generating, and any competitor can cite them. Pair it with reciprocity
licensing.

**What exists.** **Stripe publishes a machine-readable agent-skills index at
`docs.stripe.com/.well-known/skills/index.json`** and ships `stripe agent setup`, which is the pattern.
`http-message-signatures-directory` is the same idea for keys. And **VirusTotal proves reciprocity as a
term of service works**: the free API is 500 requests/day with **no commercial use and no use in
workflows that do not contribute new files**, which is what funds the corpus; enterprise buys the
inverse deal (your data is *not* pooled). **abuse.ch** made the same move in 2025: free stays free for
contributors, non-contributing commercial consumers pay.

**Why it is unique.** The build plan already has `list_rules` and `explain_rule` as MCP tools. The
addition is making the corpus addressable **outside** MCP, versioned, and licensed reciprocally, so
every agent that reads it is distribution and every commercial consumer either contributes or pays.

**Effort.** Days.

**Failure mode.** Publishing the corpus lets generators evade it. This is already accepted in the plan
(the `builder-fingerprint` family is capped at 40% precisely because vendors will strip it) and the
counter is that **evasion is the product working**: a generator that stops emitting the tells has
stopped producing template slop.

---

### A12. Community-Notes-style bridging for disputed verdicts

**Idea.** When a verdict is disputed, do not arbitrate it yourself and do not majority-vote it. Use
bridging: a note or a finding is shown only when people who usually disagree both rate it helpful.

**What exists.** The X Community Notes algorithm is **Apache-2.0 and production-proven**, and the
bridging property is one line: `r̂ = μ + i_u + i_n + f_u · f_n`, with **asymmetric regularisation
(λ_intercept 0.15 vs λ_factor 0.03, 5x higher)** forcing the model to explain rating variance through
viewpoint before granting a high intercept. Helpful requires intercept ≥ 0.40 (tuned to admit **under
10%** of notes) and |f_n| < 0.50, with 0.01 hysteresis to stop status flapping. Scale: **437,396 notes,
35M ratings, 580,000+ contributors**, retrained hourly. Third-party reuse is confirmed: **Meta stated
"Initially we will use X's open source algorithm as the basis of our rating system"**, and YouTube and
TikTok Footnotes both describe bridging-based ranking.

Steal one more thing while you are there, the cheapest anti-slop check found anywhere in this research:
Community Notes' AI-note evaluator gates admission partly on **`UrlValidity`, meaning HTTP 200 on every
cited link**, as a hallucination proxy (bar: ≥95% high UrlValidity, ≥98% high HarassmentAbuse, then
**random** selection among qualifiers). Every citation in your reports should be liveness-checked.

**Why it is unique.** It is the only adjudication mechanism at internet scale that is both open source
and demonstrably resistant to brigading, which is the stated failure mode of bounties (#7) and disputes
in `novel-mechanics.md`.

**Effort.** 1-2 weeks to port and run; longer to get enough raters for it to fire.

**Failure mode.** Well documented, port the guardrails: **a minority of 5-20% strategic bad raters can
suppress targeted helpful notes** (arXiv 2511.02615); **note visibility often hinges on a few dozen
users** and high-activity raters are more polarised than the contributor base (arXiv 2602.08970);
**30.2% of displayed notes later lose Helpful status** (arXiv 2601.14002); **up to 10.7% of
lower-quality notes can be pushed above threshold with fewer than 10 ratings** (arXiv 2607.01824); and
**bridging simply fails to catch on in thin communities** (arXiv 2512.19947). Plan for a cold start
where it does not fire at all.

---

### A13. The bounty, structured as a bug bounty, with a safe harbor

**Idea.** Ship `novel-mechanics.md` #7 (bounty on the tell) as a sponsor-funded reward contract, never
as a pool.

**What exists.** The three-layer instrument described in 2.2: platform terms, a **published program
policy operating as a unilateral offer accepted by performance**, and a **safe harbor** (CC0 templates
at policymaker.disclose.io, four tenets for Full Safe Harbor). HackerOne's Community Member Terms are
the drafting reference. Payout mechanics: accrue and sweep per 1.4.

**Why it is unique.** It converts the corpus from something you maintain into something the internet
maintains, and every resolved bounty is a new rule with a dated evidence trail.

**Effort.** 1-2 weeks including terms. The moderation load is the real cost.

**Failure mode.** Duplicate farming (Bugcrowd's published post-mortem), and reputation systems whose
own quality gate eats the funnel. That last one is the Wikipedia finding: Halfaker et al. showed
Wikipedia's decline was caused by newcomer retention collapsing under **its own quality-control
apparatus**, which "ironically crippled the very growth they were designed to manage." Weight
reputation by severity, not by count, from day one.

---

### A14. Agent receipts on the substrate that is actually converging

**Idea.** Build `novel-mechanics.md` #11 (the MCP server as a receipt issuer) on **RFC 9421 HTTP
Message Signatures with Ed25519 and a signed JWKS at a well-known path**, because that is the substrate
everyone independently converged on.

**What exists.** **Cloudflare Web Bot Auth** (npm and cargo `web-bot-auth`, keys at
`/.well-known/http-message-signatures-directory`; note the drafts moved, both are superseded by
`draft-meunier-webbotauth-httpsig-protocol-02`, dated **2026-08-18**). Since **2026-07-01 signed agents
carry Verified status** on Cloudflare; confirmed signers include **OpenAI, Block Goose, Browserbase,
Anchor Browser, and Google publishing keys at `agent.bot.goog`**. **Visa's Trusted Agent Protocol is
also RFC 9421** (two linked signatures sharing a nonce, keys at `https://mcp.visa.com/.well-known/jwks`,
8-minute expiry). **Google's AP2 went to the FIDO Alliance** (v0.2, 2026-04-28) with mandates as **W3C
Verifiable Credentials**, split into Checkout Mandate and Payment Mandate. **x402 is at the Linux
Foundation** (formalised 2026-04-02, 22 launch members including AWS, Google, Microsoft, Stripe, Visa,
Mastercard, Circle; Anthropic added by July 2026).

**Why it is unique.** The precise gap: **AP2, PayPal and Mastercard issue verifiable credentials about
the transaction and the user's intent, not about the agent's identity. In all four payment schemes,
agent identity is registry membership plus a key.** A portable, third-party-verifiable credential for
the agent itself does not exist. The **Linux Foundation Agent Name Service** (announced 2026-06-23,
DNS-based, DIDs plus LEIs, backed by Cloudflare, Cisco and Salesforce) is aiming at exactly this and
**has no spec yet.** Separately, the MCP spec's `2026-07-28` revision leaves **agent identity,
per-request authorization, delegation and audit explicitly out of scope.**

**Effort.** 1-2 weeks for signing and verification; the registry is A2.

**Failure mode.** Standards churn (both Web Bot Auth drafts were replaced five days before this
report), and the honest hygiene note: `web-bot-auth` says outright it **"has not been audited"**, and
Cloudflare's implementation does **no nonce validation**, so replay protection is only the short
`expires` window. Also a sobering ecosystem stat: a scan of 7,973 live remote MCP servers found
**40.55% expose tools with no authentication at all.**

---

### A15. The insured verdict, in the only shape that is writable

**Idea.** For the notary line only (never for detection), offer a capped warranty: if a notarised
human-authorship attestation you relied on is later proven false, the fee is refunded and a fixed cap is
paid. Publish the standard, get audited against it, let an insurer price the residual.

**What exists.** AIUC, Armilla Guaranteed, Munich Re aiSure, the auction-house remedy structure, and
the title-insurance economics, all detailed in 2.2. Plus: **Coalition added a global Deepfake Response
Endorsement (announced 2025-12-09)** covering reputational deepfake harm, and endorsements of that type
run **$500 to $3,000 per year** for small businesses. Nobody currently writes E&O on a provenance
verdict, so the wording is yours to draft.

**Why it is unique.** It converts "trust us" into a priced, third-party-validated number, which is the
one thing no competitor can fake.

**Effort.** Months, and mostly legal. **Not a v1 item.** It is the thing you build toward.

**Failure mode.** The Warhol trap: defense costs on contested negative verdicts, not payouts on wrong
positives, are what bankrupt authentication bodies. Structure the remedy as rescission-only with a fixed
window and state-of-the-art exclusions, and take the Calder posture wherever you can (record the
evidence, decline the verdict). Also note the market has bifurcated: while Coalition and BOXX added
affirmative cover, **some carriers began explicitly excluding AI-generated deepfake fraud from standard
social-engineering coverage from 2026-01-01, and ISO/Verisk issued general liability AI exclusions
effective January 2026** (forms CG 40 47, 40 48, 35 08).

---

### A16. Small, cheap, high-signal additions

Grouped because each is under a week and none carries a thesis.

- **Reproduction is self-labelling, and say so.** Every image from the Nano Banana API carries a
  **SynthID watermark**. Your side-by-side remake is therefore verifiably machine-made without you
  asserting anything, which protects you from your own artifact being mistaken for the original later.
  State it on the report. Reproduction economics, for the record: **Nano Banana Pro $0.15/image at 1K,
  $0.30 at 4K; Nano Banana 2 Lite $0.0336 (batch $0.0168); Seedream 5.0 Pro $0.045; Seedream on fal
  $0.03-0.04**. At a realistic 8 candidates per accepted reproduction, a "time-to-fake" demonstration
  costs roughly **$0.25 to $1.20**. That is a viable unit economic and it is a number you can put on
  the report ("this cost us 41 cents").
- **Publish a permanently high-scoring human site on the homepage.** Already in the build plan
  (stripe.com scores 61 per parweb). Make it a permanent fixture, not a footnote, and add one of the
  four funded comparables.
- **Liveness-check every citation.** Community Notes' `UrlValidity` gate, ported. Cheap, and it makes
  "no evidence, no hit" mechanically true rather than aspirational.
- **Issuing-funded agent spend caps**, if you ever let agents pay for scans: **Issuing Standard is
  self-serve, $0.10 per virtual card**, with per-agent single-use cards that self-cancel after one
  authorisation and a real-time authorisation webhook. Speculative, but it is the cleanest existing
  answer to "how does an agent pay for one thing and no more".
- **Ship the bulk corpus export on day one, under a licence someone else can rehost.** Papers With
  Code was sunset by Meta on 2025-07-24 and **only the parts that had already been mirrored survived**.
  This costs nothing now and is unrecoverable later.
- **Never be the only copy or the only person.** Have I Been Pwned's near-death (Project Svalbard: 141
  interested acquirers, 43 shortlisted, exclusivity, then killed after ~11 months) led directly to
  open-sourcing Pwned Passwords under the .NET Foundation as a succession plan. It is still three
  people. Write down the succession plan before you need it.

---

## 4. What NOT to do

Each of these sounds clever and fails on the evidence already in hand.

1. **Do not build a verified-human badge on Stripe Identity.** Terms 2.2(c), (d) and (f). Section 1.3.
2. **Do not return any verdict on a screenshot, ever.** This is already the rule in
   `image-detection-reality.md` and every new finding reinforces it. **A screenshot defeats everything
   except pixel and token watermarks**; IEEE Spectrum demonstrated it against Meta AI (screenshot,
   re-upload, "no watermark found"). Detect re-encoding and downgrade to INCONCLUSIVE with a reason
   code.
3. **Do not accuse an identifiable person, and do not build any feature whose output is attached to a
   named human.** Warhol, Basquiat, Ben Moran, Suzi Dougherty, Miles Astray, the Israel/Hamas photo, and
   *Haishan Yang v. University of Minnesota*. The litigation follows the **negative** verdict.
4. **Do not build a prediction market or a peer-funded stake.** Section 2.2. The creator always knows
   the answer, which is the worst insider problem a regulator has been asked to bless, and the circuit
   split means the ground moves under you.
5. **Do not sell "we insure our accuracy" on the detection line.** Only the notary and process line is
   insurable, because only it produces a record rather than an opinion. Section 2.2 and A15.
6. **Do not lead with C2PA.** Measured across every surface at once: **Adobe's own free Chrome
   extension has 6,000 users and a 2.2-star rating**; one VS Code extension; one GitHub Action; npm
   `c2pa` at 19.7k/month against eslint's 638M. C2PA is plumbing, never the pitch.
7. **Do not assume signed capture exists.** **Zero camera manufacturers are in the C2PA Conformance
   Program.** Leica, Sony, Nikon, Canon, Fujifilm, Samsung, Apple, Panasonic, Sigma, Hasselblad, Ricoh,
   GoPro and DJI all return zero against the live Conforming Products List (174 records, last commit
   2026-08-20). Every camera implementation you have heard of was issued under the **Interim Trust
   List, frozen 2026-01-01**. **Nikon's Z6III C2PA was defeated within about a week via Multiple
   Exposure mode and all issued certificates were revoked on 2025-09-21; it has not returned.** The
   only hardware-attested (AL2) consumer capture that ships is **Google Pixel Camera** and
   **Qualcomm Snapdragon 8 Elite Gen 5**. **Apple is not a C2PA member at any tier.**
8. **Do not equate "has AI credentials" with "is AI-generated."** Photoshop and Lightroom embed C2PA
   whenever any AI feature runs, including AI Denoise and AI Masking. This compounds the unmeasured
   computational-photography false-positive risk already flagged in `image-detection-reality.md`. A
   product that does not separate AI-touched from AI-generated will be wrong constantly.
9. **Do not sell keystroke or timing evidence as proof of authorship.** arXiv 2601.17280: ≥99.8%
   evasion, five classifiers, 13,000 sessions, mean confidence ≥0.993, plus a copy-type attack. It
   proves a human operated the keyboard. Say exactly that and nothing more.
10. **Do not build per-scan micropayments.** $0.50 minimum, $0.50 nets $0.19, and Stripe's own advice is
    to batch.
11. **Do not pay per label for authenticity judgments.** Pay-per-task directly funds LLM contamination
    (10% on Prolific to **over 80% on MTurk**), higher pay buys quantity not quality, and California's
    ABC test prong B is fatal if adjudication is your product.
12. **Do not launch on Chrome as the primary surface.** The whole category is ~0.8M users, GPTZero holds
    about half, and 85% of Chrome extensions never reach 1,000 installs. Go where the shelf is empty and
    the counts are public (A6).
13. **Do not build a real-time inline scorer that renders a verdict on every page.** The inline mechanic
    scales (Grammarly 37M, Bitdefender TrafficLight ~960k weekly active), but a verdict on every page is
    an accusation machine at volume, and MV3 makes it worse: requesting `<all_urls>` triggers
    "extensive scrutiny", and Chrome review is currently running long ("As of April 2026, we are
    experiencing a surge in submissions"). An inline **provenance reader** (does a manifest exist, what
    does it say) is defensible. An inline score is not.
14. **Do not cite California AB 3211.** It died in both houses. Cite AB 853.
15. **Do not build a public append-only log containing anything that could be personal data.** Sigstore
    models deletion as an attack, and its log is republished into a public BigQuery dataset.
16. **Do not let an LLM narrate why something looks AI.** Already rule 7 in `image-detection-reality.md`;
    reinforced by the fact that **Stripe's own `fraudulent_website` signal returns exactly that** (an
    LLM prose `details` string) and is the weakest part of an otherwise exemplary product. Fluent,
    specific, wrong is worse than a bare score.

---

## 5. Sources

Stripe: https://docs.stripe.com/radar/transaction-risk-prevention ·
https://docs.stripe.com/radar/reviews/risk-insights · https://docs.stripe.com/radar/how-radar-works ·
https://docs.stripe.com/radar/rules · https://docs.stripe.com/radar/risk-settings ·
https://docs.stripe.com/radar/fraudulent-website · https://docs.stripe.com/radar/multiprocessor ·
https://stripe.com/radar/pricing · https://docs.stripe.com/identity/use-cases ·
https://docs.stripe.com/identity/verification-sessions · https://stripe.com/legal/ssa-services-terms ·
https://stripe.com/connect/pricing · https://docs.stripe.com/connect/tax-reporting ·
https://docs.stripe.com/currencies · https://support.stripe.com/questions/microtransaction-support-and-pricing ·
https://docs.stripe.com/climate/commitments · https://docs.stripe.com/api/climate ·
https://docs.stripe.com/verified · https://docs.stripe.com/issuing/for-your-business ·
https://docs.stripe.com/mcp · https://docs.stripe.com/skills · https://docs.stripe.com/agentic-commerce/acp ·
https://stripe.com/pricing

Provenance and standards: https://c2pa.org/conformance/ · https://github.com/c2pa-org/conformance-public ·
https://spec.c2pa.org/specifications/specifications/2.4/index.html · https://cawg.io/identity/1.2/ ·
https://www.ssl.com/article/free-c2pa-claim-signing-certificates-why-ssl-is-giving-away-trust/ ·
https://www.ssl.com/products/content-authenticity/content-credentials/cawg/ ·
https://opensource.contentauthenticity.org/ ·
https://developers.openai.com/api/docs/guides/content-provenance · https://spectrum.ieee.org/meta-ai-watermarks

Timestamping and logs: https://github.com/sigstore/timestamp-authority · https://freetsa.org ·
https://github.com/transparency-dev/tessera · https://sum.golang.org · https://opentimestamps.org

Agent identity: https://datatracker.ietf.org/doc/draft-meunier-webbotauth-httpsig-protocol/ ·
https://github.com/cloudflare/web-bot-auth · https://blog.cloudflare.com/signed-agents/ ·
https://developers.cloudflare.com/bots/concepts/bot/signed-agents ·
https://developer.visa.com/capabilities/trusted-agent-protocol · https://ap2-protocol.org/ ·
https://x402.org · https://rslstandard.org/rsl · https://datatracker.ietf.org/wg/aipref/about/

Law: https://artificialintelligenceact.eu/article/50/ ·
https://digital-strategy.ec.europa.eu/en/policies/guidelines-transparency-ai-generated-content ·
California AB 853 (Chapter 674, 2025-10-13), Health & Safety / B&P §§22757.3.1-.3.3 ·
https://www.ftc.gov/news-events/news/press-releases/2025/08/ftc-approves-final-order-against-workado-llc-which-misrepresented-accuracy-its-artificial ·
16 CFR Part 465 · CEA §1a(47), §5c(c)(5)(C), 17 CFR 40.11 · CFTC NPRM RIN 3038-AF65, 91 FR (2026-06-12) ·
*KalshiEX v. Flaherty*, No. 25-1922 (3d Cir. 2026-04-06) · 31 U.S.C. §5362(1)(E)(ix), §5361(b) ·
OBBBA P.L. 119-21 §§70432, 70433 · JCQ "AI Use in Assessments" (April 2025)

Certification and badges: https://authorsguild.org/human-authored/ ·
https://authorsguild.org/news/human-authored-certification-expands-to-all-authors/ ·
https://www.fairlytrained.org/certifications · https://notbyai.fyi · https://docs.world.org/world-id ·
https://www.civic.com/blog/an-update-on-civic-pass

Platforms and demand: https://newsroom-deezer.com/2026/07/ai-music-exceeds-50-percent-daily-uploads-deezer/ ·
https://techcrunch.com/2026/07/21/music-streamer-deezer-says-more-than-50-of-daily-uploads-are-ai-generated/ ·
Spotify Newsroom, "AI Persona badge" (2026-08-11) · Valve, "AI Content on Steam" (2024-01-10) ·
Amazon KDP AI content guidelines · Kickstarter Rules, "AI Use" · itch.io AI disclosure policy ·
https://www.signifyd.com/ecommerce-fraud-trends/ · https://www.retail-insight-network.com/features/ai-driven-scam-stores-put-retailers-on-alert/

Process provenance and adjudication: https://github.com/twitter/communitynotes ·
arXiv 2506.24118, 2511.02615, 2602.08970, 2601.14002, 2607.01824, 2512.19947 (Community Notes) ·
arXiv 2601.17280 (keystroke timing-forgery) · arXiv 2603.00179 (ZK process attestation) ·
arXiv 2306.07899, 2607.00403 (LLM contamination of crowdwork) · Mason & Watts (2009) doi:10.1145/1600150.1600175 ·
Shaw, Horton & Chen (CSCW 2011) doi:10.1145/1958824.1958865 · Ho et al. (WWW 2015) doi:10.1145/2736277.2741102 ·
Hara et al. (CHI 2018) doi:10.1145/3173574.3174023 · Gallus (Mgmt Sci 2017) doi:10.1287/mnsc.2016.2540

Insurance and authentication history: https://aiuc.com/research/elevenlabs-secures-first-of-its-kind-ai-agent-insurance ·
https://www.aiuc-1.com/ · https://elevenlabs.io/blog/aiuc-announcement · Armilla / Chaucer "Vanguard AI" (Feb 2026) ·
Munich Re aiSure · Christie's and Sotheby's Conditions of Sale, Authenticity Guarantee ·
*Mickle v. Christie's*, 207 F. Supp. 2d 237 (S.D.N.Y. 2002) · Warhol Art Authentication Board dissolution (2011-2012)

Distribution: https://github.com/mcp · https://registry.modelcontextprotocol.io ·
https://github.com/raycast/extensions · Chrome Web Store and VS Code Marketplace listings (fetched 2026-08-23) ·
https://www.troyhunt.com/project-svalbard-have-i-been-pwned-and-its-ongoing-independence/ ·
https://mlcommons.org/get-involved/ · Papers With Code sunset (2025-07-24)

Reproduction cost: Nano Banana / Nano Banana Pro / Nano Banana 2 Lite and Seedream 5.0 API pricing pages (2026)

---

## 6. The three additions that would most change the product's ceiling

### 1. Ship the abstention and appeal contract as a public spec, with a live measured FPR (A1)

This is the cheapest and highest-leverage thing on the list, and it is the one Stripe hands you for
free. Every competitor in this category returns a confident number and publishes no error rate;
`image-detection-reality.md` proves roughly half of those numbers would be wrong at consumer
prevalence; and **FTC v. Workado** makes the unsubstantiated version an actual Section 5 violation
with a signed consent order. Radar shows you can ship a risk product at planetary scale where the
abstention states are enum values in the API contract, the verdict sentence describes what the system
did rather than what the subject is, the appeal is a button, a rule must be backtested before it can
fire, and **the vendor deliberately corrupts a slice of its own output so it can keep measuring its own
false-positive rate in production**. Adopt that last one and you have a live FPR forever, which is a
sentence no competitor can say. It costs one to two weeks and it converts your biggest liability into
your only unfakeable differentiator.

### 2. Notarise for free, index it yourself, and put the process notary where nothing verifies (A2 + A8)

Notarisation turns out to cost **zero**: multi-jurisdiction RFC 3161 fan-out across Sigstore, a free
EU-qualified government TSA, FreeTSA and DFN, at sub-second latency, verifiable offline, with no token
and no blockchain. `sum.golang.org` proves the hash-only transparency log at 60M entries and Tessera is
GA. Meanwhile **Rekor v2 deleted its search index**, no commercial transparency-log-as-a-service exists,
and the entire "prove human process" startup field is doing capture with nowhere trustworthy to put it.
So the durable business in `novel-mechanics.md` is buildable for approximately nothing, and the ledger,
not the capture, is the defensible half. Then point it at the lane nobody has touched: **Procreate
records a timelapse by default and Clip Studio stores one inside the file, and not one product in the
world verifies either**, while ArtStation's own DMCA flow asks for no process files at all. That is
enormous existing capture with zero verification, in the community with the most emotional investment
and the most documented harm. Bound the claim honestly (a human operated the tool, nothing more) and
design for private commitment with selective disclosure, because the process trail has already been
weaponised once.

### 3. Point the engine at the buyer who has a loss, not the consumer who has a screenshot (A3 + A10)

The single biggest constraint on this product is that consumer willingness-to-pay for detection is
unproven and the crowded modality is the one where the input is a lossy screenshot. Both problems
vanish at the ingest point. **Deezer reports AI passed 50% of daily uploads in July 2026, built its own
detector, patented it, and now licenses it out. Spotify shipped an AI Persona badge on 2026-08-11 and
said out loud "we won't rely on self-disclosure alone", with an adjudication path, an appeal, and
default exclusion from all recommendations. Shutterstock flatly bans inbound AI submissions, which makes
detection their problem, not their product. Steam, itch.io, KDP and Kickstarter all run disclosure
regimes enforced on unverified prose.** And on the money side, Stripe already ships a
`fraudulent_website` signal, Mastercard launched Merchant Trust Services, and Signifyd documents fraud
rings using AI to spin up storefronts with North American fraud pressure up 33% year over year. These
parties have the original file, the volume, the legal deadline (AB 853's detect / display / do-not-strip
duties from 2027-01-01 at $5,000 per violation per day) and the budget. You do not have to beat them on
the model. You have to give them the two things none of them has: **evidence a third party can verify,
and an appeal path the accused can use.**

---

## 7. Verify before betting anything on it

- **Whether the EU Digital Omnibus (Nov 2025) delayed AI Act Chapter IV / Art. 50 off 2026-08-02.** Not
  confirmable. Load-bearing for A9.
- **Whether the CFTC's June 2026 NPRM became a final rule**, and the Ninth, Fourth and Sixth Circuit
  Kalshi decisions. Load-bearing for the "do not build a prediction market" call, though the insider
  problem makes that call robust either way.
- **Whether Stripe has re-based its 1099 filing logic to the $2,000 TY2026 threshold** (docs still say
  $600).
- **Stripe Connect Instant Payouts US rate**: three Stripe pages say 1%, 1.5% and "1.5%, 50c minimum".
- Whether abandoned Stripe Identity sessions are billed; Radar's platform-tier per-transaction PAYG
  rates; whether the $0.15 shared-payment-token fee falls on agent or seller.
- **Canon's entire C2PA story.** `global.canon/en/c2pa/` 404s and every source asserting the May 2026
  "Authenticity Imaging System" is a low-quality AI-generated SEO site. Do not repeat it.
- **The ~$289/yr C2PA certificate figure in earlier notes appears to be fabricated**, traced to an
  AI-generated SEO site. The real numbers are **$0 for an AL1 claim-signing cert from SSL.com** (free
  tier, one cert plus 10,000 timestamps/year, gated on holding a conformance record ID) plus **$49-99/yr
  for a CAWG identity cert**.
- Which Pixel models qualify at C2PA AL2; Leica M11-D; Sony's exact model and firmware list.
- Exact JCQ April-2025 wording (verify against the PDF before putting it in a deck).
- Etsy, Adobe Stock, Getty, ArtStation, Behance, Fiverr and Upwork AI policies. All were CAPTCHA-walled,
  auth-walled or 404ing. **Every ArtStation URL 404'd, including the original NoAI announcement**, which
  is itself worth a second look.
- World ID's actual per-verification price (does not appear to exist publicly, 16 months after fees were
  announced).
- Chrome's "85% of extensions under 1,000 installs" figure is from a Jul-Aug 2024 study and is a year
  stale.
