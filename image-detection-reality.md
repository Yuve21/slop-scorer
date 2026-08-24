# Honest accuracy reality: AI-image detection (research, 2026-08-23)

Condensed from a full research pass (every figure below traced to a primary or named source).
**This is the most consequential document in the project so far. It should decide the product shape.**

## The one-line finding

There is no independently measured, general-purpose AI-image detector whose false-positive rate on
out-of-distribution *real* photographs is low enough to support an accusatory verdict at consumer
prevalence. And **screenshots / platform re-encodes — our primary input — are the exact condition
under which the literature shows the largest collapse.**

## The base-rate math that kills a bare score

Per 10,000 images, recall 90%:

| AI prevalence | FPR | True pos | False pos | **Precision** |
|---|---|---|---|---|
| 5% | 5% | 450 | 475 | **48.6%** (coin flip) |
| 1% | 5% | 90 | 495 | **15.4%** |
| 5% | 1% | 450 | 95 | 82.6% (1 in 6 wrong) |
| 5% | 0.25% | 450 | 24 | 95% ← **the FPR we would actually need** |
| 5% | 30% (Bellingcat, real photojournalism) | 450 | 2,850 | **13.6%** |
| 5% | 40% (NewsGuard, ScamAI) | 450 | 3,800 | **10.6%** |

Peer-reviewed corroboration: "AI Detectors are Poor Western Blot Classifiers" (arXiv 2407.10308)
measured **PPV 0.12–0.19** at 10% prevalence for three shipping detectors, concluding that at low
prevalence *most images labeled AI-generated would be false positives*.

**No independently measured detector is near 0.25% FPR on out-of-distribution real photos.**

## Independent measurements (vendor claims are marketing)

- **NewsGuard** (5 tools × 45 images): FPR on 15 authentic news photos — ScamAI **40%**, ZeroGPT 20%,
  AI or Not 6.7%, Hive 0%, Sightengine 0%. But the two with 0% FPR were the *worst* at catching real
  manipulation (Sightengine 66.7% false negatives). The precision/recall tradeoff, made visible.
- **Bellingcat** (AI or Not, 200 images): caught 100/100 Midjourney originals, but **6 of 20
  award-winning photojournalism images called AI (30% FPR)**. And recompressing 10 AI images to
  300–500 KB flipped **7 of 10 to "real"** (all 7 photorealistic ones).
- **Deepfake-Eval-2024** (CVPR 2026W, arXiv 2503.02857): moving from academic datasets to in-the-wild
  content costs image models **45% average AUC**. Off-the-shelf open detectors land at 0.52–0.56 AUC
  (coin flip). Finetuning on in-the-wild data recovers only **4.5%**.
- **AIGIBench** (arXiv 2505.12335) and **ITW-SM** (arXiv 2507.10236): detectors at 90%+ AUC on
  benchmarks fall to **54–80% AUC** on real social content. ITW-SM explicitly *excluded* memes,
  watermarks and screenshots — even the "in-the-wild" benchmark avoids our input.

## Degradation under the transforms we will actually receive

- Mild resize + JPEG 70–100 (B-Free, arXiv 2412.17671): LGrad **84.4 → 60.2 AUC**; DMID keeps AUC but
  loses **15 points of operating-point accuracy** (and we ship a threshold, not an AUC).
- Mild JPEG on text-rich images (arXiv 2606.19259): NPR **F1 82.66% → 33.98%**. PNG re-encode was
  fine — the lossy codec is the killer, not the re-save.
- GlobalForge (arXiv 2607.14684): at JPEG QF 95/90/85 artifact-driven methods sit at **~50–57%** —
  chance. Mechanism: detectors overfit to *local* generator artifacts that compression destroys.
- A screenshot simultaneously replaces the encoding, resamples, strips C2PA/EXIF, and lands in a lossy
  container — degrading **all four** detection families (pixel-forensic, frequency, watermark,
  provenance) at once. Nobody has published a solution.

## Documented harm: humans accused of being machines

- **Ben Moran** (r/Art, 2023): ~100-hour commissioned illustration removed, artist permanently banned.
  He offered the PSD and process files; the moderator said **"I don't believe you"** and told him a
  serious artist should "find a different style." **Dispositive proof did not matter once the verdict
  was public.** This is the canonical cautionary tale.
- **Suzi Dougherty** (2023): genuine iPhone photo disqualified from a contest on judges' "gut
  instinct"; later confirmed real and publicly apologised for. **Suspicion alone was treated as
  sufficient — and a 0–100 score is gut instinct laundered through a number.**
- **Miles Astray** (2024): a real Nikon photo won *third place in the AI category* of the 1839 Awards,
  judged by people from the NYT, Getty, Christie's and the Centre Pompidou. **Expert human ground
  truth is itself contested.**
- **Israel/Hamas photo (Oct 2023):** within hours, AI or Not's output was cited as "proof" a real
  photo was AI. Hany Farid found no signs of AI and called the tool ecosystem **"a second level of
  disinformation."** 404 Media: *"AI Images Detectors Are Being Used to Discredit the Real Horrors of
  War."* **Our product being weaponised is not hypothetical; it has already happened to a vendor
  advertising 98.9% accuracy.**

## Adversarial reality

- **Saberi et al. (ICLR 2024, arXiv 2310.00076):** proves a *fundamental* evasion/spoofing tradeoff,
  not an engineering gap. Diffusion purification drops watermark AUROC below 0.65; TreeRing to 0.14.
  Critically, **real images can be perturbed to classify as AI** — a harassment vector where our
  product is the weapon and a real artist is the target.
- **UnMarker (IEEE S&P 2025):** universal watermark attack, no detector feedback needed, cuts best
  semantic-watermark detection to **43%**.
- The cheapest evasion is free: Save-As JPEG. **We would catch the naive and libel the earnest** —
  the exact inverse of the intended selection.

## Legal exposure

Labeling an identifiable person's work as AI-generated is a statement of fact about their conduct,
published to third parties, capable of professional harm — textbook defamation shape. **Section 230
likely does not shelter our own model's output.** A false-AI-accusation defamation claim is already a
filed, named cause of action (*Haishan Yang v. University of Minnesota*, $760k defamation count).
EU: GDPR Art. 22 (automated decisions) and Art. 16/17 (rectification of inaccurate personal data);
EU AI Act Art. 50 applies from 2 Aug 2026 and pushes the ecosystem toward provenance as the legally
recognised signal — a verdict that *contradicts* a valid C2PA manifest is indefensible.

## What this means for the product (the strategic read)

1. **It vindicates dropping the 0-100 score.** A number is an accusation, and the math says roughly
   half of them would be wrong at consumer prevalence. This is not a tuning problem.
2. **It strongly favours the chosen mechanic** — *time-to-fake, proven by reproduction*. That output
   is a demonstration, not a claim about a person, and it survives the legal and statistical traps.
3. **It makes the provenance/process-notary line the durable business.** Detection accuracy decays as
   generators improve; **provenance compounds.** The EU AI Act is pushing the whole market that way.
4. **Never return a bare verdict on a screenshot.** Detect re-encoding/resampling and downgrade
   explicitly to INCONCLUSIVE. Abstention is a feature; nobody in the category does it.
5. **Require corroboration before any accusatory label.** One out-of-domain detector measured 20.7%
   FPR; two agreeing → 1.7%; three → 0% (at a real recall cost) — arXiv 2607.05434.
6. **Asymmetric thresholds:** make "likely AI" far harder to reach than "likely human."
7. **A VLM narrating *why* something looks AI is the worst failure mode** — Tow Center documented
   models "exploring latent space" to guess. Fluent, specific, wrong citations are worse than a bare
   score because they make a false verdict feel forensically established.
8. **Publish our own measured FPR on real photographer content.** Every competitor's headline number
   is marketing; measurement is the credibility wedge.

## Unmeasured risks we must generate data for ourselves

- **No controlled FPR study exists** for AI-denoise / upscale / computational photography output
  (Lightroom Denoise, DxO DeepPRIME, Topaz, phone Night Mode). This is now default in every flagship
  camera, and the mechanism — regenerating detail, erasing sensor-noise statistics — is exactly what
  detectors read as "synthetic." Plausibly our biggest false-positive source, and nobody has numbers.
  Cheap to measure. Do it first.
- **No FPR measurement on human digital illustration or 3D renders.** Treat as unbounded.
- Samsung "Space Zoom" injects synthetic lunar detail into *real* photos: sometimes the honest answer
  is "partly," which no binary score can express without libeling the photographer.
- Not yet researched: California SB 942 / AB 3211 (SB 942 has the closest thing to direct regulation
  of *detection tools*) and state deepfake statutes.
