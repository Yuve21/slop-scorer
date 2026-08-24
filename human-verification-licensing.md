# Can we get a license to verify people as human?

Research memo for Feature 3 (PROVE-HUMAN / "verified human") in `product-spec.md`.
Date: 2026-08-23. Author: research agent. **Not legal advice.** Written counsel-minded, but the
items in section 9 need a real attorney before anything ships.

**Research-quality caveat, stated up front:** the session's web-search budget was exhausted before
this memo, so everything below comes from direct fetches of primary sources (cited inline) plus
clearly-labelled prior knowledge. Where I could not fetch a source I say **[UNVERIFIED]** rather
than dressing it up. Do not quote an [UNVERIFIED] line to an investor or a customer.

---

## 0. The three-sentence answer

There is no such thing as a "license to verify humans" in the US: identity verification is an
unregulated commercial service, and the regulation people are thinking of (KYC/AML, FCRA, GLBA)
attaches to *what the relying party does with the answer* (moving money, deciding credit/employment/
housing/insurance), not to the act of checking a face against a document. So the honest answer to the
founder is: **no license exists, none is needed, and that is the bad news, not the good news** —
because the thing that actually bites is Illinois BIPA, where a face-liveness check on one Illinois
resident without a written release is $1,000–$5,000 in statutory damages with a private right of
action and no injury requirement. The correct architecture is therefore to **never touch a face**:
attest the *process* (C2PA/Content Credentials + CAWG identity assertions + free timestamping),
outsource any real identity check to Stripe Identity/Persona as an optional upgrade, and be careful
that the badge is not marketed as an independent identity-verification product, which Stripe's terms
expressly prohibit.

---

## 1. Do you need a license at all?

### 1a. The three things people conflate

| | What it claims | Who regulates it |
|---|---|---|
| **(a) Identity verification** | "This person is Jane Doe, DOB 1994, per a government document" | Nobody licenses the *verifier*. Obligations land on the relying party by sector. |
| **(b) Humanness / liveness** | "A live human being was present, not a bot, replay, mask or deepfake" | Nobody licenses it. But if done by face, it is **biometrics** → state biometric statutes + GDPR Art. 9. |
| **(c) Authorship attestation** | "This artifact was produced through this process, by whoever controlled this account" | Completely unregulated. Contract + tort law only. |

The founder's question presumes a licensing regime that does not exist. There is no federal
"identity verification provider" license, no state IDV license, and no accreditation body whose
stamp you must hold to check an ID. Stripe, Persona and Veriff are ordinary software companies
selling an ordinary SaaS. Stripe Identity's own eligibility page is a business-terms document, not a
regulatory one — it gates by business location and use case, with no mention of licensure
(https://docs.stripe.com/identity/use-cases).

### 1b. What actually triggers obligation

**KYC/AML (Bank Secrecy Act, FinCEN CDD rule).** Triggered by *being* a covered financial
institution or a money services business — bank, broker-dealer, MSB, money transmitter — not by
verifying identity. A provenance startup that never holds, transmits or exchanges customer funds is
outside it entirely. Selling subscriptions via Stripe does not make you a money transmitter (Stripe
is the payment processor; you are a merchant). **[UNVERIFIED as to specific CFR cites — confirm
31 CFR 1010.230 scope with counsel if the product ever touches payouts, wallets, or crypto.]**

**Money transmitter licensing (state).** Triggered by receiving money for transmission to a third
party. Irrelevant unless the product ever pays creators, holds escrow, or issues a token. **Note
for the roadmap:** a "verified human" credential with any on-chain token or transferable value
component drags you toward MTL and securities analysis. Keep the credential non-transferable and
non-monetary and this stays out of scope.

**FCRA (this is the sleeper).** You become a *consumer reporting agency* if you assemble or evaluate
information on consumers and furnish "consumer reports" to third parties for use in decisions about
credit, insurance, employment, housing or other permissible purposes. A "verified human" badge sold
to **hiring** platforms — which is listed in the spec as a B2B wedge ("schools, publishers,
marketplaces, hiring") — is exactly the shape that can convert you into a CRA, with adverse-action
notices, dispute procedures, accuracy duties and FTC/CFPB enforcement. Stripe bars using Identity
for any FCRA permissible purpose outright (https://docs.stripe.com/identity/use-cases). **This is
the single most likely way this product accidentally becomes regulated. Flag to counsel.**

**Private investigator / private detective licensing (state).** Several states license
"investigative services" about individuals, sometimes broadly enough to catch background-checking
and identity-research businesses. A pure provenance/attestation product should not reach it, but a
product that *researches whether a claimed author really made something* edges toward it.
**[UNVERIFIED — I could not fetch state statutes this session. Low probability, high embarrassment.
Worth ten minutes of counsel time.]**

**GLBA, HIPAA:** not applicable unless you become a financial institution or handle PHI. Stripe
Identity separately forbids HIPAA-covered PHI use (same source).

**State age-verification laws** (app-store and adult-content statutes): these impose duties on
*covered platforms*, not on the verification vendor. If a customer uses your badge for age gating,
their compliance problem, but expect contractual flow-down. Note Stripe Identity **may not be used
to verify anyone under 16** (https://docs.stripe.com/identity/use-cases) — which forecloses the
school/student market on that rail.

### 1c. Verdict on section 1

Authorship attestation: **build it yourself, no license, no permission.**
Humanness by face: **no license, but the highest legal risk in the product.**
Identity: **no license, but outsource it anyway** — for data-breach exposure, not licensure.

---

## 2. The provider route

### Stripe Identity — verified, best-documented, and has a specific trap for us

- **What it verifies:** authenticity of government photo IDs from 120+ countries, document↔selfie
  face-similarity ("biometric verification"), and US SSN lookup
  (https://docs.stripe.com/identity).
- **Price:** $1.50 per completed ID document + selfie verification; $0.50 per ID-number lookup
  (US SSN only); first 50 verifications free; volume pricing above ~2,000/month
  (https://stripe.com/identity).
- **Availability:** GA for businesses in US/UK/JP, self-serve public beta across ~30 more
  (https://docs.stripe.com/identity/use-cases).
- **THE TRAP.** Prohibited use includes "Reselling as an independent ID verification service or
  selling or renting the data you receive from Stripe Identity… For example, your primary business
  is selling ID verification to other businesses"
  (https://docs.stripe.com/identity/use-cases). A product whose headline feature is a purchasable
  "verified human" credential, sold B2B to publishers and marketplaces, is arguably exactly that.
  Also prohibited: FCRA purposes (kills the hiring wedge on this rail), HIPAA PHI, government/law
  enforcement, and **anyone under 16** (kills the schools wedge on this rail).
- **Read:** Stripe Identity is fine for verifying *our own users' accounts* as an anti-abuse measure.
  It is a poor foundation if the verification *is* the product being sold onward. That distinction
  should be designed for from day one, and confirmed in writing with Stripe before launch.
- Terms live at https://stripe.com/identity/legal and the Stripe Services Terms
  (https://stripe.com/ssa#services-terms).

### Veriff — verified pricing, B2B-native

- Self-serve tiers: Essential $0.80/verification ($49/mo min), Plus $1.39 ($99/mo min), Premium
  $1.89 ($209/mo min), Enterprise custom at 5,000+/mo. Add-ons: extended data retention +$0.30,
  PEP/sanctions +$0.64, ongoing monitoring +$0.09. All tiers include biometric and liveness checks;
  documents from 230+ countries; 15-day free trial (https://www.veriff.com/pricing).
- Veriff's business *is* selling IDV to other businesses, so the "no reselling" conflict that
  affects Stripe does not arise in the same way. **[Their actual reseller/sub-processor terms are
  UNVERIFIED — must be read before relying on this.]**

### Persona, Onfido/Entrust, Jumio, CLEAR, id.me, Yoti/Privately

**[UNVERIFIED — pricing pages returned 403 or could not be fetched this session, and search budget
was exhausted. Do not cite numbers for these.]** From prior knowledge, and to be re-checked:

- **Persona** — the most flexible workflow-builder of the group and the usual choice for
  marketplaces; typically quoted per-verification with a platform minimum. Attractive because it
  supports non-biometric verification paths (document-only, database, phone/email risk signals),
  which matters a lot for the BIPA strategy in section 3.
- **Onfido** (now part of **Entrust**) — document + biometric, strong EU footprint.
- **Jumio** — document + biometric, enterprise-priced.
- **CLEAR** — consumer-side identity network; CLEAR1 sells verification to businesses. Consumer
  brand recognition is real; integration is heavier and biometric by design.
- **id.me** — federal/state government-facing, NIST IAL2/AAL2 conformant; heavy compliance overhead
  and a poor fit for a consumer creative product.
- **Yoti / Privately** — age estimation and liveness; Yoti's facial age estimation is the
  best-known non-document age path. Both are face-based, so both re-open the biometric question.

### World ID / Orb — the only one whose actual claim is "human", not "identity"

- World ID is "a privacy-preserving protocol that lets people prove they are real and unique online
  without revealing anything else" (https://docs.world.org/world-id). Credentials: **Proof of Human**
  (Orb, highest assurance, one-person-one-action), **Document** (NFC gov-ID check), and **Selfie
  Check** (beta, medium-assurance liveness).
- Crucially, it issues **app-scoped identifiers** so activity cannot be correlated across apps
  (same source) — genuinely good privacy engineering.
- The catch is coverage and optics: Orb verification requires physically visiting an Orb, and the
  project carries iris-biometric regulatory baggage in multiple jurisdictions. Building the badge
  *on* World ID imports both. **[Developer pricing not published on the page I fetched — UNVERIFIED.]**

### Humanity Protocol

"Human ID" plus zero-knowledge credentials for claims like age or income, 8M+ IDs claimed
(https://www.humanity.org/). The site I fetched did not state the biometric modality. Same
structural note as World: crypto-adjacent proof-of-personhood is a real category, but adopting it
means adopting its regulatory and reputational surface.

---

## 3. Biometric-privacy landmines — the actual risk

### Illinois BIPA (740 ILCS 14)

- Regulates private entities collecting biometric identifiers/information — fingerprints, **facial
  geometry**, iris scans. Requires informed written consent before collection, a published retention
  and destruction schedule, no sale/profit from biometrics, no disclosure without consent, and
  reasonable care in storage.
- **Damages: $1,000 per violation, $5,000 per violation if intentional or reckless**, plus fees.
- **Private right of action, and no separate injury required** — *Rosenbach v. Six Flags* held that a
  bare statutory violation is enough (https://en.wikipedia.org/wiki/Biometric_Information_Privacy_Act).
- Settlement scale is the whole point: Facebook settled for **$650M** (same source).
- *Cothron v. White Castle* (Ill. 2023) held claims accrue **per scan**, which is what made the
  exposure existential; Illinois then passed **SB 2979 / P.A. 103-0769** in August 2024 limiting
  recovery to a **single** recovery per person per modality and blessing electronic signatures for
  the written release. **[The amendment is UNVERIFIED — the ILGA and Justia pages returned errors
  this session. I am confident it exists and this is its substance, but counsel must confirm the
  operative text and its retroactivity, which courts have split on.]**
- **Vendor liability does not save us.** BIPA reaches any "private entity in possession of"
  biometric data, and Illinois courts have allowed direct claims against biometric *vendors*, not
  only the customer-facing business. If we design a flow that causes an Illinois resident's face to
  be scanned, "our vendor did it" is not a defence. **[Confirm the current vendor-liability case law
  with counsel — it has moved.]**

### Texas CUBI (Bus. & Com. Code § 503.001)

AG-only enforcement (no private right of action), civil penalty up to **$25,000 per violation**.
The Texas AG has actually used it at scale — the Meta settlement was reported at $1.4B.
**[UNVERIFIED — the Texas statutes site returned only a nav page. Confirm the penalty figure and
the current enforcement posture.]**

### Washington (RCW 19.375) and the new comprehensive laws

Washington: AG enforcement through the Consumer Protection Act, no private right of action.
**[UNVERIFIED.]** Separately, the newer state comprehensive privacy laws (CA CPRA, CO, CT, VA, TX
TDPSA, OR, and the rest) classify biometric data used to identify a person as **sensitive data**,
which generally means opt-in consent, a data protection assessment, and honoring deletion. Washington
**My Health My Data** is the wildest card, since it has a private right of action and an expansive
notion of health data. **[All UNVERIFIED this session.]**

### GDPR (if any EU users)

Biometric data processed "for the purpose of uniquely identifying a natural person" is **Article 9
special category data** — prohibited unless an Art. 9(2) exception applies, realistically only
**explicit consent** for a consumer product, with an Art. 35 DPIA on top. A single EU user in a
face-liveness flow imports the whole regime. **[UNVERIFIED — not fetched, but this is settled law.]**

### The mitigation that actually works: do not do biometrics

Everything above evaporates if we never collect, capture, convert, store or direct the capture of a
face scan, voiceprint, or fingerprint. Three concrete options:

1. **Verify process, not face** (section 4) — no personal data of any kind beyond an account.
2. **Document-only or database identity**, no selfie — many providers (Persona notably) support
   document authenticity + data-source matching with no face-match step. **A photo of an ID is not
   automatically a biometric identifier under BIPA; extracting facial geometry from it is.** The
   line is thin and fact-dependent. **Counsel must draw it, not us.**
3. **Delegate the biometric entirely and never receive it** — the provider does the selfie match and
   returns a boolean. Reduces breach exposure, but as noted does **not** reliably eliminate BIPA
   liability for directing the collection. It is risk reduction, not risk elimination.

If we ever do ship face liveness: written release before capture, a published retention schedule,
immediate deletion, no sale, and seriously consider **geofencing Illinois and Texas** — which is why
so many products already do.

---

## 4. Attest the PROCESS, not the person — assess seriously

This is the strongest option in the memo. Verdict: **yes, this genuinely sidesteps both the
licensing question and the biometric question, and the standards are mature enough to build on
today.**

### C2PA / Content Credentials

- The spec is **an open standard under a royalty-free license — no license fee, and you can
  implement it without joining C2PA** (https://c2pa.org/faqs/).
- Content Credentials are signed by products holding certificates from CAs on the **C2PA Trust
  List**; those certs are issued only after **conformance and security evaluation**, and conforming
  products must present dynamic evidence such as **hardware-backed attestation** at certificate
  enrollment (https://c2pa.org/faqs/).
- The Conformance Program covers **generator products, validator products, and certification
  authorities**, and requires adherence to the Content Credentials spec, a risk-based governance
  process, and the Certificate Policy and Security Requirements (https://c2pa.org/conformance/).
- **Trust list timing matters:** the Interim Trust List operated through 2025-12-31 and was **frozen
  on 2026-01-01 — no new entries** (https://c2pa.org/conformance/). The real program is the only
  door now. Program documents are public at
  https://github.com/c2pa-org/conformance-public (docs/, trust-list/, conforming-products/,
  legal-agreements/, asset-rubrics/), current version v0.2 dated **2026-07-31**.
- **Costs: not published.** C2PA states certificate costs vary by CA and assurance level, set by
  each CA's commercial terms (https://c2pa.org/faqs/). Budget unknown; get quotes from CAs on the
  trust list (Truepic and DigiCert are the obvious first calls). **[Dollar figures UNVERIFIED.]**

### CAWG identity assertions — the exact mechanism for our feature

This is the piece the founder should care about most. The CAWG identity assertion is "a C2PA
assertion that allows a credential holder to prove control over a digital identity and bind the
identity to a set of C2PA assertions," creating "a non-repudiable, tamper-evident binding between
the named actor and the list of referenced assertions" — and it can record the actor's **role**
(creator, contributor, editor, producer, publisher, sponsor, translator)
(https://cawg.io/identity/1.1/).

Two credential types are supported: `cawg.x509.cose`, and **`cawg.identity_claims_aggregation`** —
"where a third-party aggregator verifies and presents identity signals like verified documents,
websites, affiliations, social media accounts, and crypto wallets" (same source).

**That aggregator role is the product.** It is a defined, standardized slot in an open spec, it does
not require us to be an identity provider, and it lets us pass through a Stripe/Persona result as
one signal among many — website control, social account control, domain, org affiliation — rather
than issuing a naked "this is a human" claim of our own manufacture.

Generator obligations under the spec: present the signer_payload for signature by the credential
holder, ensure referenced assertions match the C2PA claim, include a hard binding assertion, and
independently validate signatures (https://cawg.io/identity/1.1/).

### Timestamping — free, and legally clean

- **RFC 3161** time-stamp tokens attest proof-of-existence of a hash before a given time. The RFC is
  explicit that the TSA is "not to include any identification of the requesting entity in the
  time-stamp tokens," and "the time-stamp request does not identify the requester"
  (https://www.rfc-editor.org/rfc/rfc3161). **This is the cleanest fact in the memo:** the entire
  standard is built to attest existence *without* attesting identity. Exactly our thesis.
- **OpenTimestamps**: free Bitcoin-anchored timestamping, free public calendar servers, no
  registration or API keys, hashing done locally so the file never leaves the client
  (https://opentimestamps.org/). Zero marginal cost, zero PII, and independently verifiable by
  anyone forever without trusting us. Ship this in week one.

### Sigstore

Identity-based, keyless signing: Cosign makes an ephemeral key, **Fulcio** issues a short-lived cert
bound to an OIDC identity, **Rekor** records every signing event in an immutable public transparency
log; the private key is discarded after one use (https://docs.sigstore.dev/about/overview/). It is
built for software supply chain, but the primitives are artifact-agnostic. The relevant lesson for
us is architectural: **the identity Sigstore binds is an OIDC account, not a person** — "the entity
controlling this Google/GitHub account signed this at this time." That is a modest, verifiable,
never-overstated claim, and it is the register our badge should speak in.

### Hardware capture attestation (what ships today)

- **Leica M11-P** — first camera with built-in Content Credentials (Oct 2023).
- **Fujifilm** GFX and X series — announced May 2024.
- **Sony PXW-Z300** — professional video capture with Content Credentials, 2026.
- **Google Pixel 10** — C2PA credentials on a consumer phone, 2026.
- Nikon (2021) and Canon (2023) joined CAI with stated integration plans.
(All from https://contentauthenticity.org/blog and
https://contentauthenticity.org/blog/the-state-of-content-authenticity-in-2026)

CAI reports 6,000+ members and a new Conformance Explorer tool (same 2026 post). Truepic operates in
this layer commercially — trusted capture with verified time/date/device/location, enterprise C2PA,
and device/firmware-level attestation, with 50M+ verified photos and customers including Microsoft,
Ford, Equifax and the US State Department (https://www.truepic.com/). Truepic is the closest thing
to a direct competitor-or-partner for the provenance half.

### Assessment

A credential that says *"this file's hash existed at time T, evolved through these recorded steps,
and was signed by the holder of this account"* requires **no license, no biometrics, no PII beyond
an email, and no regulator's permission.** It is cryptographically verifiable by third parties, it
compounds rather than decaying (matching the spec's own strategic note), and it is honest — which
matters, because it is the same discipline as the spec's rule that a bare verdict on a screenshot
must degrade to INCONCLUSIVE.

The tradeoff, stated plainly: process attestation proves *a workflow*, not *a person*. Someone can
run a generated image through a "human" workflow. Do not oversell it. The mitigation is that the
recorded process itself is expensive to fake convincingly, and — pleasingly — Feature 1 is the
detector for a faked process.

---

## 5. Liability of issuing a credential

If we stamp something "verified human" and we are wrong, exposure comes from four directions.
**[This section is prior-knowledge legal analysis; almost none of it was fetchable this session.
Treat every case name as a lead for counsel, not a citation. UNVERIFIED.]**

1. **Negligent misrepresentation** (Restatement (Second) of Torts § 552) — liability for supplying
   false information for the guidance of others in business transactions, owed to the limited group
   for whose benefit it was supplied. The accountants' line — *Ultramares v. Touche*, *Credit
   Alliance* — is the canonical limit on how far that duty runs. This is the primary theory a
   publisher who relied on our badge would plead.
2. **Certification-seal precedent.** *Hanberry v. Hearst* (Cal. App. 1969) is the seminal case: the
   Good Housekeeping Seal could support negligent-misrepresentation liability to a consumer who
   relied on it. The Underwriters Laboratories line of cases is mostly defense-favorable, but turns
   on reliance and on what the seal was represented to mean. **The lesson is that the scope of the
   claim printed on the badge is the scope of the liability.** "Verified human" is an unbounded
   claim. "Signed by an account that completed a document check on 2026-08-23; process attested"
   is a bounded one.
3. **FTC Act § 5 and the Endorsement Guides** (16 CFR Part 255, including the provisions on
   certifications and seals of approval). A seal that implies verification we did not perform is
   deceptive, and the FTC has an active AI-claims enforcement posture. Competitors can also reach us
   under **Lanham Act § 43(a)** for false advertising. **This is the most probable real-world
   enforcement route** — not a lawsuit from a deceived publisher, but an FTC or competitor complaint
   about what the badge implies.
4. **Distrust risk, which is worse than damages.** The CA world's actual failure mode is not tort:
   DigiNotar was compromised and went bankrupt; Symantec's CA business was distrusted by browsers;
   Entrust's public TLS certs were distrusted by Chrome in 2024. In our case the analogue is Adobe,
   Google, Microsoft, LinkedIn or C2PA removing us from a trust list, which ends the business
   overnight. **Design for revocation from day one** — a public, queryable revocation and
   transparency log, so that when we are gamed we can say "revoked at T, here is the record" instead
   of "we were wrong."

C2PA's own posture reinforces this: trust-list inclusion requires conformance and security
evaluation, adherence to the Certificate Policy and Security Requirements, and a "risk-based,
transparent and unbiased governance process" (https://c2pa.org/conformance/). That governance
process is a deliverable, not a formality, and writing it is partly a legal exercise.

**Practical mitigations:** publish a precise definition of what the badge asserts and does not;
put limitation-of-liability and disclaimer-of-warranty terms in the customer contract and in the
badge's own linked page; carry tech E&O / media liability insurance before the first B2B customer;
never let marketing copy exceed the technical claim; and log every issuance immutably.

---

## 6. Who already sells "verified human"

- **World (Worldcoin)** — the most serious proof-of-personhood: Orb-based Proof of Human, Document,
  and beta Selfie Check, with app-scoped anti-correlation identifiers
  (https://docs.world.org/world-id). Legitimacy came from open protocol specs, published
  cryptography, and developer distribution — and it still carries heavy biometric-regulator
  attention.
- **Humanity Protocol** — "Human ID," 8M+ created, ZK credentials for age/income/identity claims
  (https://www.humanity.org/).
- **Adobe Content Authenticity Initiative** — 6,000+ members; enterprise Content Authenticity for
  brands and publishers; Conformance Program and Conformance Explorer
  (https://contentauthenticity.org/blog/the-state-of-content-authenticity-in-2026). Legitimacy came
  from convening an open standard first and shipping product second. **[The consumer web app and
  its LinkedIn-verified-identity attachment did not appear in the pages I could fetch — I believe it
  exists and is free in beta, but that is UNVERIFIED.]**
- **Truepic** — commercial trusted capture and enterprise C2PA; 50M+ verified photos/videos;
  Microsoft, Ford, Equifax, US State Department (https://www.truepic.com/). Legitimacy came from
  hardware/firmware-level attestation and enterprise references.
- **Not By AI** — pure self-attestation. Users agree to a "90% Rule"; the site states plainly that it
  is not a detection tool and that the user is accountable. Free for non-commercial, **$99 one-time**
  for commercial badge rights, **$5/month** for commercial plus a project page documenting the
  creative process (https://notbyai.fyi/). **This is the honest floor of the category** — and its
  paid "project page documenting your creative process" tier is a direct, cheap competitor to our
  process-attestation idea, executed without any cryptography. Worth studying, and worth beating on
  verifiability rather than on price.
- **Fairly Trained** — a nonprofit certifying that generative AI companies "don't use any copyrighted
  work without a license" (https://www.fairlytrained.org/). **The best precedent in this list for a
  startup issuing a credential:** small org, narrow and precisely-worded claim, application-based
  process, no regulator involved, legitimacy from the credibility of its founder and its certified
  cohort. Fees are not published (https://www.fairlytrained.org/apply).
- **Cloudflare** — worth noting for what it is *not*. Web Bot Auth verifies that a request comes from
  a *registered bot* via Ed25519 HTTP message signatures; it is bot attestation, not human
  attestation (https://developers.cloudflare.com/bots/concepts/bot/verified-bots/web-bot-auth/).
  Nobody at Cloudflare's scale is issuing a human credential. Instructive.

**The pattern among the credible ones:** narrow, literally-true claim; open specification or public
methodology; a published list of who holds the credential; and no claim that the credential proves
more than its method can support. The pattern among the non-credible: a badge you buy.

---

## 7. Recommended architecture

**Tier 0 — Provenance (build ourselves, ship first, no PII, no license, no biometrics).**
Client-side hashing; OpenTimestamps anchoring (free); RFC 3161 TSA tokens; a recorded edit/session
process log; C2PA manifest with CAWG identity assertion; public verification page. Claim: *"This
file's hash existed at T and evolved through these steps."*

**Tier 1 — Account control (build ourselves, low risk).**
OIDC sign-in, domain control (DNS TXT), social account control, org email verification — assembled
as `cawg.identity_claims_aggregation` signals. Claim: *"Signed by the holder of these accounts."*
This is the Sigstore register: modest, verifiable, never overstated.

**Tier 2 — Identity (outsource entirely, optional upgrade, never the default).**
Persona or Veriff for anything B2B-facing; Stripe Identity only for verifying our own users, given
its no-reselling term. Store the boolean and the provider's reference ID. **Never store the document
image, never store a face template, never receive raw biometrics.** Claim: *"A third-party provider
completed a document check on this account on date D."*

**Never touch:** face templates or any biometric in our own systems; anyone under 16; FCRA-shaped
uses (hiring/credit/housing/insurance decisions) unless and until counsel builds a compliant CRA
posture; PHI; any transferable or monetized credential.

**Naming.** Do not ship the words "Verified Human." It is an unbounded claim (section 5), it invites
the FTC/Lanham analysis, and it is not what the system proves. Ship the bounded claim and let the
marketing be the *evidence page*, not the adjective. This is the same discipline as the spec's rule
against bare verdicts.

---

## 8. Rough cost model

| Item | Cost | Source |
|---|---|---|
| OpenTimestamps anchoring | $0 | https://opentimestamps.org/ |
| C2PA spec license | $0, royalty-free, no membership required | https://c2pa.org/faqs/ |
| C2PA signing cert from a trust-list CA | Varies by CA and assurance level, **not published** | https://c2pa.org/faqs/ |
| C2PA conformance evaluation | Not published; program v0.2 as of 2026-07-31 | https://github.com/c2pa-org/conformance-public |
| Stripe Identity doc + selfie | $1.50/verification (first 50 free) | https://stripe.com/identity |
| Stripe Identity SSN lookup | $0.50/lookup | https://stripe.com/identity |
| Veriff Essential | $0.80/verification, $49/mo min | https://www.veriff.com/pricing |
| Veriff Plus / Premium | $1.39 / $1.89, $99 / $209 mo min | https://www.veriff.com/pricing |
| Persona / Onfido / Jumio / CLEAR / id.me | **UNVERIFIED** | — |

Note the unit economics implication: Tier 0 and Tier 1 are effectively free per credential, Tier 2 is
$0.80–$1.89. A badge business built on Tier 2 has a real COGS floor; one built on Tier 0/1 does not.

---

## 9. What genuinely needs an attorney before shipping

Ordered by how much damage the wrong answer does.

1. **BIPA / CUBI / Washington scope.** Precisely where the line falls between "photo of an ID" and
   "biometric identifier"; whether the SB 2979 single-recovery amendment applies as we expect;
   current vendor-liability case law; and whether to geofence Illinois and Texas for any face flow.
2. **FCRA.** Whether selling the credential into hiring, education admissions, or marketplace
   onboarding converts us into a consumer reporting agency. Get this answered *before* the B2B
   pitch deck names those verticals.
3. **The exact wording of the badge and its public definition page.** Draft it with counsel, not
   after. Every word is a liability boundary (§ 5) and an FTC Endorsement Guides / Lanham Act
   surface.
4. **Stripe Identity's "no reselling as an independent ID verification service" clause** — written
   confirmation from Stripe that our design is permitted, or a decision to use a B2B-native provider
   instead.
5. **Customer contract terms:** definition of the credential, limitation of liability, disclaimer of
   warranties, indemnity, and a revocation right.
6. **Insurance:** tech E&O and media liability, sized before the first paying B2B customer.
7. **C2PA conformance legal agreements** (in `legal-agreements/` of the conformance repo) and the
   required "risk-based, transparent and unbiased governance process," which is a written
   deliverable.
8. **Privacy program:** privacy policy, DPA and sub-processor list, retention/destruction schedule,
   sensitive-data handling under the state comprehensive laws, and GDPR Art. 9 / DPIA posture if EU
   users are in scope.
9. **Trademark and the badge mark itself** — a certification mark is a distinct USPTO filing type
   with its own rules (the owner may not use the mark on its own goods, and must control the
   standards). If the badge is meant to be applied by others to their work, this is likely the
   correct filing, and it changes how the program must be run.
10. **State private-investigator licensing** — ten-minute sanity check, low probability.

---

## 10. Sources

- https://docs.stripe.com/identity
- https://docs.stripe.com/identity/use-cases
- https://stripe.com/identity
- https://stripe.com/identity/legal
- https://www.veriff.com/pricing
- https://docs.world.org/world-id
- https://www.humanity.org/
- https://c2pa.org/conformance/
- https://c2pa.org/faqs/
- https://github.com/c2pa-org/conformance-public
- https://cawg.io/identity/1.1/
- https://www.rfc-editor.org/rfc/rfc3161
- https://opentimestamps.org/
- https://docs.sigstore.dev/about/overview/
- https://contentauthenticity.org/blog
- https://contentauthenticity.org/blog/the-state-of-content-authenticity-in-2026
- https://www.truepic.com/
- https://notbyai.fyi/
- https://www.fairlytrained.org/ and https://www.fairlytrained.org/apply
- https://developers.cloudflare.com/bots/concepts/bot/verified-bots/web-bot-auth/
- https://en.wikipedia.org/wiki/Biometric_Information_Privacy_Act (secondary; primary ILGA text was
  unreachable this session)
</content>
</invoke>
