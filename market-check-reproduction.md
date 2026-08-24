# Market check: is "reproduction as verdict" occupied?

**Date:** 2026-08-23. Research-only, no code.
**Question asked:** instead of returning a probability that something is AI-generated, the product
ATTEMPTS TO REGENERATE the artifact and shows the result side by side, framed as an effort gap
("we remade this in 8 seconds; a human would need a day"). **Is anyone already doing this?**

**Method note (honest):** the session's WebSearch budget was exhausted before this task started.
Research was done instead by direct retrieval: the arXiv API, the Semantic Scholar API, the GitHub
search API (authenticated), the Hacker News/Algolia API, the Hugging Face API, and Ecosia/Brave
result pages fetched with curl, plus direct page fetches of every candidate product. That is a
weaker net than a full search sweep for *consumer* products specifically, and the confidence
statements below are calibrated accordingly.

---

## (a) The answer: NO — reproduction-as-verdict is NOT occupied

**Verdict: the mechanic as specified (regenerate the artifact, SHOW the remake to the user as the
output, frame it as an effort/time gap) is unoccupied.** High confidence on the research side,
medium-high on the consumer-product side.

Split the claim into its two halves, because they have opposite answers:

| Claim | Occupied? | Confidence |
|---|---|---|
| (a) Reconstruction/regeneration used **internally as a signal** to compute a score | **YES, heavily.** An entire research line since 2023, across image, text and video. One CVPR paper, several thousand citations collectively. | High |
| (b) The regenerated artifact **shown to the user as the product's output/verdict** | **NO.** Not one paper, repo, Show HN, app or vendor page found that does this. | Medium-high |

Every reconstruction-based method found computes a distance and throws the reconstruction away.
The remake is an intermediate tensor, never a deliverable. The founder's insight is that the
intermediate is the interesting artifact.

**Three independent negative searches** support the consumer half:

1. **Named-phrase searches return literal zero results.** Brave returns the string "No results" for
   `"effort gap" AI generated authenticity` and for `"time to recreate" AI detection metric`. Not
   thin results, *no* results. (Verified the engine was not rate-limiting by re-running against a
   control query that returned 20 results.)
2. **GitHub:** searches for `ai slop detector`, `vibe code detector`, `DIRE diffusion
   reconstruction`, `AEROBLADE`, `image-to-prompt` return the expected clusters (sloptrim ★185,
   distil-ai-slop-detector ★92, sloppylint ★88, AI-SLOP-Detector ★81, vibecop ★56,
   jonasricker/aeroblade ★75, pharmapsychotic/clip-interrogator ★2982). **None** produce a remake as
   output; all produce scores, tell-counts or prompts.
3. **Hacker News (all-time Algolia):** `AI slop detector`, `regenerate to detect AI`, `prompt
   inversion`, `recreate this website AI` surface the score-based cluster (haystackeditor.com/slop-
   detector, "YouTube's AI slop detector") and recreation-as-*hobby* posts ("I failed to recreate the
   1996 Space Jam website with Claude") but nothing that fuses the two.

### The one thing that IS out there: the framing, as culture, with no product behind it

The exact phrase is already in circulation as commentary. Working Theorys, *Proof of Humanity*:
**"The insult is the effort gap."** The essay argues that what enrages an audience about AI content
is precisely the asymmetry between the creator's effort and the attention demanded, and that
"Attention is a relationship, not a transaction."
(https://www.workingtheorys.com/p/proof-of-humanity)

Sander van Dijk, *The Effort in the Image*, makes the same case for luxury imagery via the academic
"effort heuristic": "people use perceived effort as a mental shortcut for judging quality and
value." He explicitly does **not** propose measuring effort by regeneration; he proposes reading it
off the artifact's specificity. (https://sander-van-dijk.com/essays/the-effort-in-the-image/)

**Read this as the best possible market signal.** The thesis has a name, essayists are converging on
it, and nobody has built the instrument. That is the shape of a real wedge, not of a dead end.

---

## (b) The closest existing things, and exactly how they differ

### B1. Reconstruction-as-internal-signal (research). Crowded, and it validates the mechanism.

| Work | Year | arXiv | What it does | Shown to user? |
|---|---|---|---|---|
| **DIRE** (DIffusion Reconstruction Error) | 2023 | 2303.09295 | Inverts an image to noise with DDIM and re-generates it; diffusion-generated images reconstruct far more accurately than real ones. The gap is the score. | No |
| **AEROBLADE** (CVPR 2024) | 2024 | 2401.17879 | Training-free: pass the image through a latent diffusion model's **autoencoder** and measure reconstruction error. Real images reconstruct worse. No training, no diffusion loop. | No |
| **SeDID** ("Exposing the Fake") | 2023 | 2307.06272 | Uses deterministic reverse/denoising computation errors at specific timesteps. | No |
| **DistilDIRE** | 2024 | 2406.00856 | Distills DIRE for 3.2x faster inference — i.e. the field's direction of travel is *cheaper* reconstruction. | No |
| **ZeroFake / post-hoc distribution alignment** | 2025 | 2502.10803 | "Regenerating test images through a known generative model" to expose misalignment in unseen fakes. | No |
| **ExposeAnyone** | 2026 | 2601.02359 | Personalized audio-to-expression diffusion; reconstruction error as an identity distance for face forgery. | No |
| **Raidar** ("geneRative AI Detection viA Rewriting") | 2024 | 2401.12970 | **Text.** Asks an LLM to rewrite the input and measures edit distance. LLMs edit human text much more than they edit machine text. | No — score only |
| **DNA-GPT** | 2023 | 2305.17359 | **Text.** Truncates the input, has the model regenerate the remainder, compares n-grams. | No — score only |
| **Counterfactual Explanations for Face Forgery Detection** | 2024 | 2404.08341 | The single closest research artifact: "Counterfactual Trace Visualization," enhanced forgery images "useful to reveal artifacts by visually contrasting the original images." A generated image IS shown to a human. | **Partially yes** |
| **Frailty audit of training-free detectors** | 2026 | 2606.20488 | Audits the "autoencoder-reconstruction score" family under compression/preprocessing and finds it fragile. Read this before betting on reconstruction *error* as a number. | n/a |

Two things follow. First, **the mechanism works** — a decade of peer review says regeneration
distance carries signal, which de-risks the engineering. Second, **nobody has taken the last step**:
in all of it, the remake is a discarded intermediate. Even the counterfactual-explanation paper
shows a *diff overlay for researchers*, not a "here's ours next to theirs" for a consumer, and it is
an XAI paper with no product.

Also note the mirror-image literature: "**regeneration attack**" is a large, active field, but there
regeneration is the *attack* (noise-then-reconstruct to strip an invisible watermark — arXiv
2306.01953, and a dozen 2025-26 watermarking papers defending against it). Same verb, opposite
purpose. Expect terminology collisions when talking to technical people.

### B2. Consumer detectors. All return a number; the best one now returns a number plus a heatmap.

The category has NOT moved toward demonstration. It has moved toward better numbers:
**Pangram image detection** (announced 29 Jul 2026) claims 99.5% on an internal 5-detector
benchmark, 99.84% on clean ReLAION, and a **0.16% false-positive rate**, with a heatmap of "which
parts of the image were flagged as AI." Output = classification + confidence + heatmap. No
reconstruction. (https://www.pangram.com/blog/introducing-pangram-image-detection)

Everything else checked (Copyleaks, Sightengine, Winston, ZeroGPT, Quillbot, Decopy, wasitai.com,
Reality Defender, Hive, Illuminarty, AI or Not) is a score, sometimes with a heatmap. This matches
`market-research.md` and nothing has changed.

### B3. Prompt inversion / image-to-prompt. Adjacent, commoditized, and NOBODY frames it as detection.

This is the closest *shipping* neighborhood, and the gap is instructive.

- **CLIP Interrogator** (pharmapsychotic, ★2982) — BLIP+CLIP, the origin of the category; plus the
  A1111 extension (★544), ComfyUI ports, and a live HF Space.
  (https://github.com/pharmapsychotic/clip-interrogator)
- **Midjourney `/describe`** — first-party prompt recovery, shipped by the generator itself.
- A long tail of SEO-farm SaaS: clipinterrogator.org, imagetoprompt.dev, imaginprompt.com,
  promptsera.com, cococlip.ai, image2prompts.com, plus "best image-to-prompt tools 2026" roundups.
- Academic prompt inversion continues (arXiv 2408.06502, 2506.03067, 2608.13671).

**Every single one is positioned for CREATION** — "get the recipe so you can make one like it."
Zero are positioned as detection or as criticism. That is the arbitrage: the same primitive
(recover the recipe, re-run it) is a commodity when sold to imitators and unbuilt when sold to
skeptics. It also means the hardest technical component of the founder's mechanic — going from an
artifact to a prompt good enough to re-run — is off-the-shelf.

### B4. Screenshot-to-site. The web modality is fully solved as a primitive, unused as a verdict.

`abi/screenshot-to-code` (a top-tier OSS repo), Uizard Screenshot Scanner, v0, Lovable, Bolt,
Readdy, plus a genre of "watch AI build a website from a screenshot" content. All sold as *build*
tools. None says "your site was reproducible in 40 seconds, here it is." Given the existing
vibe-coded-detector cluster (detectvibecode.com, isthatvibecoded.com, VibeCheck, the A5 extension)
already lists tells, the remake-the-site verdict is a one-step extension nobody has taken.

### B5. The "N seconds" critique in design/dev tooling: not found as a product feature.

No tool found that annotates a design or a site with a reproduction-time estimate. The nearest
things are rhetorical: essays about "the era of the fake finished app," and the running discourse
about vibe-coded sites. Adjacent-but-different: YouTube's AI-slop demonetization signals and
platform "made with AI" labels, which are provenance/policy, not effort.

---

## (c) Feasibility: cost and latency per remake

All figures August 2026. **[V]** = quoted from the vendor's own pricing page. **[M]** = independently
measured (Artificial Analysis medians, image/video pulled 2026-08-22). **[D]** = arithmetic from
verified unit prices. **[C]** = vendor claim, unverified. **[?]** = not published.

### Headline table

| Modality | Cheapest credible remake | Typical remake | Wall-clock | Blockers |
|---|---|---|---|---|
| **Text paragraph** | **$0.0003** (GPT-5.6 Luna) [D] | $0.003 (Claude Sonnet 5) [D] | 1-3s | None. Effectively free. |
| **Image** | **$0.003** (FLUX.1 schnell, $0.003/MP on fal) [V] | $0.039 (Gemini 2.5 Flash Image / Nano Banana) [V] | **0.4-2.5s** cheap tier [M]; 16.5s Nano Banana Pro [M]; **150s median for gpt-image-2** [M] | Face/celebrity/brand safety filters. Prompt-inversion quality is the real constraint, not price. |
| **Voice clip (30s)** | **$0.0375** (ElevenLabs Flash, $0.05/1K chars) [V] | $0.075 (v2/v3) [V] | ~75ms TTFB, ~35x realtime [C/M] | **Cloning is the blocker, not TTS.** See below. |
| **Website from screenshot** | **$0.08-0.15** (screenshottocode.com hosted) [V] | **$0.15** one-shot on v0 Pro; ~$0.45-0.75 realistic over 3-5 messages [D] | 80-170s [D]; no third-party timing exists for any tool [?] | v0 is the only one with a real headless REST API (accepts image attachments). Lovable/Bolt are UI-only. |
| **Short video (5s)** | **$0.20** (Wan 2.2 480p on fal) [V] | **$0.35** (Kling v2.5 Turbo Pro, flat 5s) [V]; $0.50 (Sora 2 720p) [D] | **20s to 2min**; Kling p95 on fal is **723s** [M]; Sora 2 took 64s for a 4s clip [M] | Cost and tail latency. Nothing here is interactive. |
| **Short video, premium** | — | $2.00 (Veo 3.1 standard 720p) / $3.75 (Veo 3 with audio, fal) [V/D] | Veo: "min 11s, max 6 min at peak" [C] | Kills unit economics at consumer volume. |

### What this means operationally

- **Text, image and voice are solved.** A remake of an image or a paragraph costs less than a
  fraction of a cent to four cents and returns inside the span of a loading spinner. The "8 seconds"
  in the founder's copy is literally achievable on the cheap image tier and is an *overstatement of
  the cost* on text.
- **Video is the only modality that breaks the product's promise.** $0.20-0.50 per 5s clip is
  survivable as a paid feature and fatal as a free viral one; and the latency tail (Kling p95 = 12
  minutes) means the side-by-side cannot be synchronous. Design video as an async job with an email/
  push "your remake is ready," or gate it behind sign-in, or do not ship it at v1.
- **Host matters more than model.** Identical FLUX schnell weights measured 0.42s (Prodia) to 11.9s
  (Leonardo) to 2.48s (fal). Latency is a procurement decision.
- **Budget p95, not median.** Every video provider has a long tail.

### Hard blockers found

1. **The Sora API is being switched off.** OpenAI's help center states the Sora web/app experiences
   were discontinued 26 Apr 2026 and "The Sora API will be discontinued on **September 24, 2026**."
   Do not build the video path on Sora. (help.openai.com/en/articles/20001152)
2. **Midjourney has no API and forbids automation.** Community Guidelines: "Midjourney does not
   provide an API, nor provide third-party apps or scripts, and automating interactions with
   Midjourney service is strictly prohibited." Every "Midjourney API" is unofficial and ban-exposed.
   Consequence: **we cannot faithfully remake a Midjourney image with Midjourney**, which is the
   single most likely generator behind a viral AI image.
3. **Voice cloning is contractually closed.** ElevenLabs Instant Voice Cloning needs ≥1 minute of
   audio and a consent attestation; Professional cloning requires identity verification, and
   ElevenLabs states plainly: "**Even with their consent, you cannot clone someone else's voice.**"
   So the voice modality can demonstrate *"a synthetic voice reading these words costs 4 cents"* but
   **cannot** demonstrate *"here is your voice, cloned."* That is a real narrowing of the mechanic
   for audio, and it is a terms problem, not a technical one.
4. **Anti-competing-model clauses are near-universal** (OpenAI Business Terms 3.3(e), Google Gemini
   API terms, Google Cloud SST 17(a), Anthropic Commercial Terms D.4(a), ElevenLabs, Runway (viii),
   fal, Midjourney, Vercel, Lovable). A detector built *around* these models is fine; distilling
   their outputs into our own detector model is the clause that bites.
5. **Benchmarking clauses.** Only two vendors address benchmarking operatively. **Vercel permits
   benchmarking of its services "other than AI Services" — by exclusion, benchmarking v0 is
   forbidden.** Google Cloud permits it with reciprocity. OpenAI is affirmatively welcoming
   ("we welcome research publications related to the OpenAI API"). Anthropic is silent.
   **ElevenLabs is the one to avoid** for any published comparison: it bars using the Services "or
   Output" to "research and develop" competitors and to "train, fine-tune, develop, **test**, or
   improve" any AI. If the product publishes a leaderboard of "which model reproduced it best,"
   ElevenLabs and v0 are the two names to leave out.
6. **No vendor forbids style imitation by name.** Not one uses "in the style of." The two nearest
   bright lines: **fal.ai** forbids generating content that "replicates or closely mimics the
   original assets used to train" third-party models, and **Google Imagen** ships a filter that
   "detects a photorealistic representation of a celebrity in the request." Exposure runs through
   generic IP clauses plus our own rights warranty, i.e. **the vendors allocate the risk to us
   rather than policing it.**
7. **Watermark duties are thin but real.** Only Vercel forbids removing "metadata, digital
   signatures, or watermarks to identify AI-generated content." Google's Imagen SynthID is on by
   default and non-disableable in console; OpenAI applies C2PA + SynthID to images. Practically: our
   remakes will arrive pre-labeled as AI, which is *good* — the side-by-side self-discloses.
8. **Nano Banana 2 / Gemini 3.1 Flash Image per-image cost is genuinely underivable** ($60/1M image
   output tokens with no published tokens-per-image). And **gpt-image-2 measures 150s median** —
   2.5 minutes per image — which would break the "8 seconds" promise if chosen as the default.

### Softest numbers (do not quote these as facts)

Every website-clone wall-clock figure is a vendor phrase or arithmetic; no third-party timing exists
for v0/Lovable/Bolt, and neither Bolt nor v0 publishes typical tokens per message. Runway's
"10s video in ~30s" claim is **unverifiable** (announcement URL 500s, slug de-listed). Ideogram's
own pricing page never rendered; its numbers came from fal/Replicate. PlayHT/PlayAI is entirely
unverified.

---

## (d) Legal read

Researched 2026-08-23. Not legal advice; structured so a real attorney's review is short and cheap.
Items marked [recall] were not read from primary text today and must be confirmed before relied on.

### The headline: the copyright risk is not the big risk. The LABEL is.

**Ranked by actual exposure:**

1. **Defamation / trade libel / false light** from publishing a verdict about identifiable work. The
   only theory here with a live lawsuit behind it, a published false-positive rate available as an
   adverse exhibit, and **no safe harbour of any kind.** No vendor indemnifies it. DMCA does not touch it.
2. **Direct copyright infringement in the recreation** — probably *outside* DMCA 512(c) (see below),
   so it is a merits fair-use question. Good news: the best authority points our way.
3. **17 U.S.C. §1202(b), removal of copyright management information.** Regeneration will not carry
   through embedded CMI/watermarks/C2PA. **$2,500–$25,000 per violation, and it does not require
   proving infringement at all.** The most underrated risk in the product.
4. **Payment-processor deplatforming.** Faster, cheaper and less appealable than any court, and it
   does not require a rightsholder to complain. Civitai removed *all* real-person likeness content in
   May 2025 — in its own words, "a requirement to continue conversations with specialist payment
   partners." Visa and Mastercard were the lever. **For a Stripe-billed product this is the risk to
   plan for first.**
5. **Vendor account termination** — private, unappealable, invisible in the public record. Absence of
   news is not absence of enforcement.
6. **Lanham Act false endorsement / right of publicity** — only if we NAME the artist or brand.
7. **Secondary copyright liability** — now the *lowest*, after *Cox v. Sony* (decided 2026-03-25,
   reversed and remanded, Thomas for 7). Contributory liability now requires that the service be
   "tailored to that infringement." **But that makes our marketing copy a liability variable:** frame
   as critique of material the user encountered; never "recreate any image."

### The case that most helps us

***Sedlik v. Von Drachenberg*** — photographer sued over a hand-made close recreation of his Miles
Davis portrait **and** over social posts showing his photo next to the work in progress. Jury (Jan
2024): the recreation was **not substantially similar**, and the **side-by-side posts were fair use.**
**Ninth Circuit affirmed unanimously, 2026-01-02 (No. 24-3367).** That is two defence wins on the two
exact things this product does. Caveat honestly: a jury verdict affirmed on deferential review, not a
rule of law — but it is the best available authority and it points our way.

**The counterweight is *Warhol v. Goldsmith*** (598 U.S. 508, 2023): factor one turns on whether the
use has a *different purpose*; same-purpose substitution defeats transformativeness. **Concrete design
consequence: the recreation must function as evidence of a critique, never as a usable substitute.**
Watermark it, cap the resolution, label it, no download. Each of those is a factor-one and factor-four
argument.

### What does NOT exist (all findings, not gaps)

- **No takedown, C&D or suit anywhere 2023–Aug 2026 against a prompt-inversion / image-to-prompt
  tool.** CLIP Interrogator has been public since 2022 with dozens of monetised clones. Nothing.
- **No action against an image-to-image "recreate this" consumer app as such.**
- **No action against a side-by-side comparison site, an "is this AI" detector, or a criticism site
  for reproducing the criticised image.** The question has not been litigated.
- **Studio Ghibli took zero legal action** over the March 2025 style trend — the most viral
  style-appropriation event in AI history produced no case.

### DMCA: cheap, but it probably does not cover our recreation

**Honest read: 512(c) plausibly covers the user's upload; it probably does NOT cover the recreation.**
Three reasons: it is not "stored at the direction of a user" (we chose the model, wrote the prompt);
generating it is plausibly **our own** reproduction/derivative work, and 512(c) limits liability
*arising from storage*, not the provider's own copying; and transmitting the upload to a third-party
API is itself a reproduction. *Mavrix v. LiveJournal* [recall] cuts hardest — provider-side
intervention between submission and publication can knock material out of the phrase entirely.

**So design so we never need it:** treat the recreation as our own published content under our own
fair-use judgment, and **do not persist it.** Ephemeral, session-scoped, signed expiring URLs,
noindex, no public gallery, no share page that renders it. Every day hosted is a day of accruing
statutory damages — and note *Disney v. Midjourney* Dkt 160 (2026-08-11) is a **protocol for
compelling production of individual users' prompts and outputs**, so anything we store is discoverable
in someone else's litigation. Aggressive TTLs are a legal control, not housekeeping.

**Still register the agent — it is $6.** Copyright Office DMCA directory, $6 initial and $6 every
3 years (37 C.F.R. §201.38). Requires **two** acts: publish the agent's details publicly *and* file
with the Office; doing one is doing neither. Add a repeat-infringer policy that matches what we
actually do, and **keep the log** — *BMG v. Cox* [recall] turned on implementation, not the document.
The cheap failure is a good policy with no record of ever running it.

**Never counter-notice on a user's behalf, and never for our own recreations.** 512(g)(3)(D) requires
handing over a real name, address and **pre-consent to a federal venue.** Just delete.

### Vendor terms: nobody permits or prohibits this mechanic

**No vendor, anywhere, has a clause addressing image-to-image, reference images, or prompt inversion.**
"Recreate," "substantially similar," "imitate" and "style" appear in none of the binding documents.
Instead all of them route the question through one clause: **our warranty that we have rights in our
inputs** — a warranty we cannot honestly give for a stranger's upload. That single fact means **vendor
shopping cannot move the real exposure**, which is direct liability to the rightsholder.

Every output indemnity on offer (OpenAI, Google Vertex, Anthropic, Microsoft CCC) is **voided by this
mechanic** on input-rights and knows-or-should-know grounds — and our own UI copy advertising how close
the match is *is* the knows-or-should-know evidence.

**Specific traps found:**
- **Avoid Azure OpenAI.** Its Customer Copyright Commitment requires a metaprompt "directing the model
  to prevent copyright infringement" and an evaluation report where "significant ongoing reproduction
  of third-party content must be addressed." **That reproduction is the feature.** We would be in
  documented breach of a benefit we thought we had, and our own compliance artifact becomes the
  adverse exhibit. Worse than having no indemnity.
- **FLUX.1 [dev] is a hard blocker**, not a risk: its non-commercial licence excludes revenue-generating
  activity *and* "end-user interactions," so a public product breaches on day one — **and the
  restriction follows the weights onto fal and Replicate.** Use the BFL API/commercial licence, or
  FLUX schnell (clean Apache-2.0).
- **Never use the free Gemini Developer API tier** — it takes training rights in inputs we do not own.
- **BFL requires a written opt-out** (email legal@blackforestlabs.ai) or it holds a perpetual,
  sublicensable licence over our inputs and outputs.
- **Safest for the captioning/inversion leg: Anthropic** — not because its indemnity protects us (it
  does not), but because it imposes the fewest affirmative duties we are guaranteed to breach.
- Google's *Prohibited Use Policy* actually creates a **tailwind**: misrepresenting AI content as
  human-made is prohibited, so labelling our recreation loudly as machine-generated is affirmatively
  compliant.

### The single most important product decision to come out of this

***Rignol v. Yale*** [verified]: a student's exam was run through GPTZero; Yale suspended him. He sued
— now **13 causes of action including defamation, 125+ docket entries.** **GPTZero is not a defendant.
Yale is.** Liability attached to the party that *ran the tool, believed it, and published the
accusation.* **If our product publishes a verdict about a named person's work, we are Yale, not
GPTZero.** His evidentiary attack is the one to expect: he ran the detector on a Yale dean's and a
former president's own writing (some 30+ years old) and got "100% AI."

And the base rate a plaintiff would cite is already public: NewsGuard (2026-05-08) measured five
detectors declaring authentic Reuters/AP/NYT/Guardian images AI **13.33% of the time.**

**Therefore: score the ARTIFACT, never the named creator.** Defamation requires identification.
Hasselblad disqualified a shortlisted image for AI markers in May 2026 with no legal threat reported —
plausibly because contestants were **anonymous** at that stage. That is a product decision, not a
legal one, and it is the cheapest risk reduction available.

### Concrete mitigations (all cheap, mostly architectural)

1. **Ephemeral recreations.** No storage, no public gallery, no share page rendering it, aggressive TTL.
2. **Score artifacts, not people.** No named creator in any published output.
3. **Asymmetric claims.** Strong on success; "we could not reproduce this" on failure. Never "this is
   human," never a green check.
4. **Watermark in the pixels**, cap resolution, no download — Warhol factor-one/factor-four defence.
5. **Never strip CMI/C2PA**; add provenance marking our recreation machine-generated (§1202(b) + DMCA
   512(i) + vendor disclosure rules all at once).
6. **No URL-scraping ingest.** If we can fetch and regenerate an arbitrary site by URL, that is not
   user-directed storage under any reading.
7. **Marketing copy reviewed against Cox's "tailored to that infringement."** Cheaper to draft right
   than to un-say.
8. **Assume the payment processor is the real regulator.** Plan the content policy for Visa/Mastercard,
   not just for courts.

### What genuinely needs an attorney before launch

1. The direct-infringement / fair-use posture of the recreation itself — determines whether the
   product ships as designed.
2. The defamation exposure of the published verdict, including whether to score anonymously.
3. §1202(b) and whether regeneration constitutes CMI removal.
4. Landing-page and marketing copy against the Cox standard.
5. Whether to touch Azure OpenAI at all (my read: do not).
6. BFL's perpetual sublicensable content licence, before the first API call.

---

## What "failed to reproduce" means as evidence (and how to say it honestly)

This is the weakest joint in the mechanic and it must be designed for, not papered over.

**A successful remake is strong, self-evident evidence of one specific thing:** that an artifact of
this apparent quality is cheap to produce. It is *not* evidence that this particular artifact was
produced that way. The two are different claims and the UI must never let them blur. "We remade this
in 8 seconds" is true and demonstrable. "So they did too" is an inference the *viewer* draws, and we
should let them draw it rather than assert it — that separation is the entire legal and epistemic
advantage over a score.

**A failed remake is weak evidence of anything.** It is absence of proof, and it is confounded at
least five ways:
1. our prompt inversion was bad (by far the most common cause),
2. the model refused (safety filter on faces, brands, gore, minors, celebrities),
3. the artifact needs a capability our model lacks (long text-in-image, exact typography, a specific
   product, a real location, a real person),
4. the artifact is AI but from a model we cannot access or a bespoke LoRA/fine-tune,
5. the artifact really is expensive human work.

Only (5) is the interesting one, and it is the *least* likely explanation on any given failure. So
the honest presentation is an **asymmetric, one-directional claim**:

- On success: a strong, concrete, screenshotable statement — time, cost, model, prompt, side by side.
- On failure: **"we could not reproduce this"** and a short, literal list of what we tried (models,
  attempts, seconds spent, refusals hit). Never "this is human." Never a green checkmark. Never a
  "human score." A failure is a receipt of our attempt, not a verdict on them.
- Report the attempt cost either way, because "we spent $0.31 and 6 minutes and could not get close"
  is itself an interesting number and it makes the tool feel honest.

Two structural consequences worth deciding up front:
- **Publish the reproduction rate.** If the tool reproduces X% of known-AI images and Y% of known-
  human ones, those two numbers are the product's credibility and nobody in the category publishes
  anything comparable. They also feed the Turing-gauntlet labeling loop in the spec.
- **Beware the inverse-harassment vector.** Successful reproduction of a *human's* work is the mirror
  of a false positive: it will be screenshotted as "proof" they faked it. Every documented harm in
  `image-detection-reality.md` (Ben Moran, Suzi Dougherty, the Israel/Hamas photo) is a case of a
  tool's output being used as proof by people who did not read the caveat. A side-by-side is a far
  more viral object than a percentage, so this risk is *larger* here, not smaller. Watermark the
  output image with the disclaimer, in the pixels, so the screenshot carries it.

---

## (e) Verdict

**Is reproduction-as-verdict a defensible wedge? Yes as a wedge, no as a moat — and the distinction
decides what we build second.**

### Why nobody has done it (five real reasons, none of them "it doesn't work")

1. **The incumbents are API-shaped, not consumer-shaped.** Reality Defender, Hive, Sightengine and
   Sensity sell a *field in a JSON response* to platforms and enterprises. A side-by-side image is
   not a field. The output that makes this mechanic great is worthless to their actual buyer, so the
   whole category optimised away from it.
2. **It inverts the unit economics of detection.** A score is effectively free to compute at volume;
   a remake costs $0.003 to $0.50 and takes seconds to minutes. Every incumbent's margin structure
   assumes the cheap path. This is a genuine reason to hesitate, and it is why video must wait.
3. **The hard part is prompt inversion, not generation.** Anyone can call FLUX. Producing a prompt
   that yields a *convincing* near-match is the actual craft, and it is unglamorous, unpublishable
   work. Research rewards AUC on a benchmark; "we showed the user a picture" is not a metric.
4. **Legal timidity.** Regenerating someone else's posted artifact feels risky enough that a
   compliance-minded company would not greenlight it without a memo. See (d) — the memo is the
   unlock, and it is cheap to obtain relative to the differentiation it buys.
5. **Midjourney's closed door.** The single most likely generator behind a viral AI image cannot be
   called at all, so any team that prototyped this hit an immediate, visible failure case and
   probably concluded the mechanic was unreliable. It is not unreliable; it is *asymmetric*, and the
   honest one-directional framing above resolves it.

None of these are "the mechanic is bad." Four are structural incentives pointing incumbents
elsewhere, and one is a framing problem we have already solved.

### Defensibility, honestly

**The mechanic itself is not a moat.** It is a few hundred lines around commodity model APIs; a
funded competitor could copy the *demo* in a month. Anyone who tells the founder otherwise is
selling something.

**What is actually defensible, in descending order:**

1. **The published honesty contract.** Reproduction rate on known-AI vs known-human corpora, an
   abstention band, an appeal path, and Radar's self-perturbation trick to keep measuring FPR in
   production. Nobody in this category publishes any of it, the FTC has already acted against a
   detection vendor for inflated accuracy claims (Workado), and a competitor copying the demo cannot
   copy three months of published measurements without doing the three months.
2. **The deterministic rule corpus for web and code.** This is ours, it already exists (54 encoded
   tells + the live-measured negative set), it cites real locators, and it is the one modality where
   evidence is genuinely verifiable rather than probabilistic. It is also the MCP feature's engine.
3. **The labeling loop.** The gauntlet turns users into annotators, which compounds into the
   calibration corpus that backs (1). This is the only asset that gets *better* with distribution.
4. **Provenance/notary.** Detection decays as generators improve; attestation does not. The long game.

**Correct read of the sequencing:** the remake is the *wedge* — it gets attention, it is shareable,
it is honest, and it is cheap for text/image/web today. It is not the business. The business is what
the wedge lets us accumulate: measurements nobody else has, a corpus nobody else has, and eventually
a credential nobody else can issue.

### Ship / do not ship

- **Ship at v1:** text, image, web-from-screenshot. All three are cheap, fast enough to feel
  synchronous, and legally the least fraught.
- **Defer:** video (cost + a 12-minute p95 tail breaks the promise; revisit as an async paid job),
  and voice-as-cloning (contractually closed — we can only demonstrate "a synthetic voice reading
  this costs four cents", never "here is your voice").
- **Do not build on:** Sora (API discontinued 2026-09-24) or any unofficial Midjourney wrapper.
- **Design in from day one:** the asymmetric claim (strong on success, "we could not reproduce this"
  on failure, never "this is human"), and the disclaimer burned into the output *pixels*, because a
  side-by-side is a more viral object than a percentage and will be screenshotted without its caption.

### The single biggest risk

**Inverse harassment.** A successful remake of a *human's* work is the mirror image of a false
positive, and it is more dangerous here than in a scoring product precisely because the output is so
persuasive and so shareable. Every documented harm in `image-detection-reality.md` — Ben Moran,
Suzi Dougherty, the Israel/Hamas photo — is a tool's output being wielded as proof by people who
never read the caveat. A number can be argued with. A convincing side-by-side feels like a verdict.
This risk must be engineered against (asymmetric claims, in-pixel disclaimers, refusal to reproduce
identifiable private individuals' work on request), not disclaimed in a footer.
