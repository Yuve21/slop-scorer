# Publicity, defamation and FTC risk (research, 2026-08-23)

Companion to `market-check-reproduction.md` §(d). Primary-source research; not legal advice. Items
marked [unverified] were not confirmed against primary text.

## Ranked risk (this supersedes the earlier ranking)

| # | Head | Rating |
|---|---|---|
| 1 | **FTC Act §5 substantiation** (accuracy/efficacy claims) | **HIGH** |
| 2 | **Defamation by implication** (the side-by-side layout itself) | MEDIUM private / **HIGH** if named, shareable or quotable |
| 3 | Copyright / derivative work (see §(d), out of scope here) | HIGH, unsettled |
| 4 | Tennessee ELVIS Act **tool-liability prong** | MEDIUM (untested, criminal + seizure remedies) |
| 5 | Right of publicity in the report | LOW |
| 6 | Right of publicity **in our own marketing** | **MEDIUM-HIGH** |
| 7 | Trade libel | LOW-MEDIUM |
| 8 | False light | LOW (rejected in NY, TX, CO) |

## 1. The #1 risk: FTC substantiation. *In re Workado* is a template for how we lose.

FTC File 232-3092, Docket C-4822. Final order approved **2025-08-28**, **20-year duration**.
One count: false or unsubstantiated performance claim (98% accuracy) under **§5(a)**.

What the FTC pleaded reads like a checklist of what not to do: Workado did not build the model (an
off-the-shelf academic-abstract detector from Hugging Face), marketed it for use cases it never
tested, and the developers' own numbers were **74.5% on mixed non-academic content and 53.2% on
AI-generated non-academic text** — "barely better than a coin toss."

**The order's "Covered Product" definition is us, explicitly including images:** "any product
incorporating technology that detects or purports to detect content, **including text and images**,
generated or altered in part or in whole by artificial intelligence."

**Why this is rated above everything else: the FTC needed no falsely accused person at all.**
Liability attached purely to the accuracy claim plus the absence of use-case-matched testing.

**What the order requires (i.e. our engineering spec):** competent and reliable *scientific* evidence,
possessed **at the time the claim is first made and each time it is made thereafter**; retained
testing protocols, metric rationale, data sources and class distribution, processing steps, steps
taken to avoid **train/test overlap**, and "any statistical analysis... **including preliminary and
intermediary analyses such as confusion matrices**." Records created for 10 years, retained 5.
Future violations draw civil penalties (~$53k each).

**Direct implication for our mechanic:** "we remade this in 8 seconds for $0.004, therefore this was
cheap to make" is an *efficacy claim about an inference*. It must be substantiated and use-case
matched, or it is the Workado count with our name on it.

Also tracking: FTC proposed *Policy Statement Concerning the Suppression of Accuracy in AI Systems*,
91 FR (2026-07-07) — existence noted, content not analysed.

**Open and time-sensitive:** the FTC's SNPRM (89 FR 15072, 2024-03-01) proposed **16 CFR 461.5**, a
means-and-instrumentalities rule making it a violation "to provide goods or services **with knowledge
or reason to know** that those goods or services will be used to" falsely pose as an individual.
**That is the loosest standard in this whole memo** — constructive knowledge, no "primary purpose"
element — and it would carry §18 civil penalties. Current Part 461 has **only** §§461.1–461.3
(governments and businesses; **no 461.4, no 461.5**). The Unified Agenda (RIN 3084-AB71) shows a
"Recommendation to Commission, 07/00/2026." **Whether the FTC acted is unknown — ftc.gov blocked
every fetch. Check this before launch.**

## 2. The side-by-side layout is the single most dangerous design decision

*Milkovich v. Lorain Journal*, 497 U.S. 1 (1990): calling something "opinion" does not protect it;
the test is whether the statement is "provable as false." **A time and a dollar figure are
quintessentially verifiable.** Not puffery, not opinion.

**Defamation by implication is the real theory.** The literal statement can be entirely true and
still actionable if the juxtaposition carries a false sting:
- *Chapin v. Knight-Ridder*, 993 F.2d 1087 (4th Cir. 1993): where the expressed facts are literally
  true, the language must "**affirmatively suggest that the author intends or endorses the
  inference**."
- *White v. Fraternal Order of Police*, 909 F.2d 512 (D.C. Cir. 1990): asks whether the publisher did
  "something **beyond the mere reporting of true facts**" to suggest it endorses the inference — and
  illustrated with a case where **listing figures side by side itself supplied the "affirmative
  evidence"** that the inference was intended.

**Read that against the product spec.** A deliberate side-by-side, with the cost delta as the
headline, is not neutral reporting. Its entire communicative purpose is to carry an inference. Under
*White*, **the layout is the evidence that we endorse it.**

The defamatory sting: this creator used AI and passed it off, defrauded their client, or their work
is worthless. All classic libel-per-se territory (honesty, professional competence).

**Mitigations, in descending order of safety:** do not display original and recreation adjacently;
display on separate screens; or keep the side-by-side with a **same-size, same-prominence**
disclaimer in the frame. **A 10px grey footnote does not do this work** — *Hoffman* turned on
disclosure a jury would read as sincere.

## 3. Section 230 will not protect us

47 U.S.C. §230(f)(3): an information content provider is anyone "responsible, **in whole or in
part**, for the creation or development" of the information. **We generate the recreation.**

- ***Bouck v. Meta***, N.D. Cal. (2026-03-24): 230 motion **denied** where Meta's tools generated ad
  images/text. "Plaintiffs have averred that Meta participated in the construction of the ads by
  literally **generating**, using artificial intelligence, the images and text... **That degree of
  participation is not protected by section 230.**" [quotes via Volokh excerpts, pull the order]
- ***Forrest v. Meta***, N.D. Cal. (2024): same result on generative ad tools.
- ***Garcia v. Character Technologies*** (M.D. Fla., 2025-05-21) — widely **miscited** as a 230 case;
  it did not address 230. It did decline to hold LLM output is First Amendment speech: "The Court is
  not prepared to hold that the Character A.I. LLM's output is speech at this stage." **That tempers
  the First Amendment defences below when applied to machine output.**

**No appellate ruling. Plan on no 230 protection.**

## 4. Right of publicity: fine in the report, dangerous in our marketing

**The good news, and it is well-supported:**
- *Guglielmi v. Spelling-Goldberg*, 25 Cal. 3d 860 (1979): "The First Amendment is not limited to
  those who publish without charge." Charging money does not make it commercial use.
- *Bolger v. Youngs Drug*, 463 U.S. 60 (1983): economic motivation alone is insufficient.
- ***Hoffman v. Capital Cities/ABC***, 255 F.3d 1180 (9th Cir. 2001) — **the closest analog and it
  favours us.** A **digitally altered** image of Dustin Hoffman in a for-profit magazine was **not**
  commercial speech; commercial elements were "inextricably entwined" with editorial comment; actual
  malice required; and **the magazine's own disclosure of the "digital magic" negated intent to
  deceive.** Build around this: the disclosure was load-bearing.
- *Sarver v. Chartier*, 813 F.3d 891 (9th Cir. 2016): non-celebrities have weak claims. Most faces in
  uploaded artifacts are stock models or private people.

**The cliff:** LOW risk inside a user-requested report, **MEDIUM-HIGH the instant the same
side-by-side appears in our own marketing.** In an ad it becomes use "for advertising purposes"
(NY Civ. Rights L. §51) and "for purposes of advertising or selling" (Cal. Civ. Code §3344(a)), all
three *Bolger* factors align, and *Hoffman*'s editorial defence evaporates. **Hard rule: recreations
never appear in our marketing unless the original is ours or fully licensed.**

Note the transformative-use test (*Comedy III*, 25 Cal. 4th 387) **cuts against us on the pixels and
for us on the product**: a faithful regeneration is not transformative as an image, but its value
derives from the analysis, not the person.

## 5. Two states have TOOL-liability prongs (most trackers get this wrong)

**Tennessee ELVIS Act, Tenn. Code Ann. §47-25-1105(a)(3)** — liability for distributing "an
algorithm, software, tool... **the primary purpose or function** of such... is the production of a
**particular, identifiable individual's** photograph, voice, or likeness, **with knowledge that**
[it] was not authorized."

Three textual gates a general analysis tool clears: primary purpose is *analysis*; "particular,
identifiable individual" points at a targeted persona generator; and the **"with knowledge that... not
authorized" scienter fails outright when the uploader is the subject or has rights** — our strongest
structural defence, and it is textual.

**Trap:** the *as-introduced* bill said "an individual's photograph" with no scienter. The **enacted**
text added "a particular, identifiable" and the knowledge element. **Most law-firm summaries quote
the bill, not the law.**

Uncomfortable parts: no intermediary/§230-style safe harbour (unlike Illinois, Utah, Arizona,
Louisiana); remedies include **seizure of "all instrumentalities"**; violation is a **Class A
misdemeanour**; and §1107(a)'s exemptions ("comment, criticism, scholarship") are keyed to "**the use
of**" a likeness, not to *distributing a tool* — so on a strict reading they may not apply to the
tool prong at all. **No court has construed any of this.** Six of the seven ELVIS Act dockets are
image cases, not voice.

**Utah Code §45-3-3(1)(b)** is the second tool-liability state (every tracker misses it): knowingly
distributing a tool "whose intended primary purpose is the unauthorized creation or modification of
content that includes an individual's personal identity **for commercial purposes**." Expressly
covers still images and "any simulation, reproduction, or artificial recreation." But it is gated by
*commercial purposes* and carries a flat **§230(f)(2) interactive-computer-service carve-out**.
LOW-MEDIUM.

**Illinois has NO tool prong** — it was drafted then stripped by House Floor Amendment No. 2. Illinois
*does* have a DMCA-style safe harbour naming "application software providers" and "cloud service
providers." **CA AB 1836 is deceased-personalities-only and requires an audiovisual work or sound
recording** — the definition includes "image" but the *liability clause* does not (a
definition-vs-operative-clause gap that recurs in NY §50-f). **CA SB 11 was vetoed**, veto sustained
2026-03-02; trackers still list it as pending.

**Washington** (RCW 63.60, ~2026-06-10 [unverified date]) requires three *conjunctive* elements
including that the depiction "**misrepresent** the appearance... of the individual" and be "**likely
to deceive a reasonable person** into believing... [it] is **genuine**." **A labelled regeneration
displayed next to the original fails two of three.** **Arizona** (A.R.S. §16-1023) has the model
provision: a plaintiff must prove we "**did not reasonably convey**... that the image was a digital
impersonation." **A clear label defeats the claim at the element stage.**

**Not verified at all:** Montana, Arkansas, Pennsylvania, Ohio. Pennsylvania is reportedly
*criminal* — prioritise it.

## 6. Federal: NO FAKES not law; TAKE IT DOWN already in force

**NO FAKES Act:** the live vehicle is **S. 4591** (119th Cong., ordered reported 2026-06-18, Senate
Calendar No. 446), **not** S. 1367 — and it grew 39→98 pages, so old analysis is stale. Its tool
prong imports the *Grokster/Sony* triad: primarily designed / limited commercially significant other
use / **"marketed, advertised, or otherwise promoted... as designed to produce" a replica of a
specifically identified individual.** That third clause is **entirely within our control: never
describe the product as recreating a named person.** Also: it would designate itself an IP law for
§230(e)(2), foreclosing 230 for likeness claims.

**TAKE IT DOWN Act, Pub. L. 119-12** — duties are **already in force** (compliance date was
2026-05-19). 48-hour removal, plus "reasonable efforts to identify and remove any known **identical
copies**." Enforced as an FTC Act **§18(a)(1)(B)** rule violation (civil penalties + redress).
**It reaches only *intimate* visual depictions**, so our subject matter is out — **but if we publicly
host user-uploaded images we likely meet "covered platform" (§4(3)(A)) and owe the notice-and-removal
apparatus now anyway.** If uploads stay private to the uploader, that predicate is weak. **A one-line
architectural decision with a federal compliance consequence.**

## 7. The asymmetry that is our best argument — and how it evaporates

**Realized legal exposure has landed on institutions that ACTED on a detector's output, never on the
vendors.** *Newby v. Adelphi* — **student won**, Feb 2026 (Turnitin said 100% AI; two other checks
said human; court called the allegations "completely false" and the punishment "devoid of reason").
*Kato v. Palo Alto USD*, N.D. Cal. (filed 2026-05-05), **$150M demanded**. Meanwhile: **no US
lawsuit against an AI-detection vendor by a falsely accused person exists** (searched hard).

**But it evaporates the moment our output is the thing quoted as the accusation** — which is exactly
what happened to **Pangram** in the "Shy Girl"/Mia Ballard matter (Mar 2026): Pangram publicly
claimed AI hallmarks, the NYT ran its own detector analysis, **Hachette pulled the book**, and the
author said she was pursuing legal action (none filed). Also: US Dept. of Education OCR guidance
(2024-11-19) uses **an AI detector as Example 1** of discriminatory use (high error rate on
non-native English speakers) and concludes OCR "would likely have reason to open an investigation."

## Tier 1 design changes (do before shipping)

1. **Never name the creator, client or vendor.** Defamation and false light both require the plaintiff
   be identified. Highest leverage, nearly free.
2. **Never state or imply "this is AI" or "this was faked."** State only what is verifiable about
   *our own* action ("our reproduction attempt: $0.004, 8.2s") and say explicitly that
   reproducibility is not evidence of how the original was made.
3. **Break or seriously annotate the juxtaposition** (see §2). Same-size, same-prominence disclaimer,
   or don't show them adjacently.
4. **Substantiate the cost/time claims and match testing to marketed use cases** — the Workado order
   as an engineering spec (protocols, class distributions, train/test separation, confusion matrices).
5. **Written clickwrap consent covering regeneration by name.** Defeats the scienter element of TN
   §1105(a)(3) and Utah §45-3-3(1)(b) and the "without consent" element of CA §3344, RCW 63.60.050.
   **Cheapest defence in the memo, defends against the most statutes.**
6. **Refuse to regenerate identifiable faces** (decline, blur, or plainly non-matching face). Removes
   the publicity head almost entirely, plus WA's "indistinguishable," AZ's "would believe," and TN's
   "readily identifiable."
7. **Recreations never in our own marketing** unless the original is ours or licensed. Hard rule.

## Tier 2 (before meaningful traffic)

8. Decide deliberately whether uploads are ever public (TAKE IT DOWN "covered platform").
9. Build a **two-business-day takedown** capability — Cal. Civ. Code §3344(a)(2) (eff. 2026-01-01)
   gives claimants an **ex parte** route to a 2-business-day removal order.
10. Reports non-shareable by default, watermarked, not indexed.
11. Audit marketing copy against NO FAKES §2(c)(2)(B)(iii).
12. If we ever put an AI actor in our own ad, disclose it — NY GBL §396-b(3), eff. 2026-06-09.

## Needs a licensed attorney (short, unpadded)

1. **The Workado-style substantiation programme** — bring an FTC advertising-practices lawyer, not a
   generalist. Highest-value hour available.
2. **The report's exact factual claims and disclaimer, reviewed as libel copy**, by a media lawyer
   reading the actual UI. The *Chapin*/*White* question is about specific pixels; it cannot be
   resolved from a spec.
3. **Copyright** (out of scope here, probably the largest exposure).
4. **Tennessee**, if any TN nexus: does §1105(a)(3) reach a general-purpose tool, and do the §1107(a)
   exemptions apply to a tool prong at all? Both genuinely open, criminal + seizure remedies.
5. **TAKE IT DOWN "covered platform" determination** — 30-minute question, expensive to guess.
6. **Whether the FTC finalised 16 CFR 461.4/461.5** — a docket check, time-sensitive.

**Does NOT need a lawyer:** the CA/NY/IL/WA/AZ/LA publicity analysis. Those fail on their face for a
private, non-advertising report, for textual rather than arguable reasons.

## Corrections to circulating claims

- Do **not** cite the as-introduced text of TN HB 2091 or IL HB 4875 — both materially rewritten
  before enactment, both in the direction that matters to us.
- Recording Law's tracker has two verified errors: CA AB 1836's effective date, and the claim that
  Tennessee is the only tool-liability state (Utah is the second).
- *Kelly McKernan* is a **plaintiff** in *Andersen v. Stability*, not a victim of a false AI-use
  accusation. Do not use her as an example.
- "Antoine Collas / AI or Not" could not be verified at all. Drop it.
