# Market Research: "GPTZero, but for EVERYTHING"

**Concept under validation:** A single AI-slop / AI-generation DETECTOR that scores ANY artifact 0-100 with CITED EVIDENCE ("97% AI, and here is the evidence"), across ALL modalities (image + website/vibe-coded build + voice/audio + text), delivered as (1) a consumer app with a native SHARE-TO-APP flow, and (2) a DETECTOR-AS-MCP-SERVER so agents can query the rules and avoid producing the tells.

**Date:** 2026-08-22. Research method: web search across vendor sites, App Store/Play, GitHub, MCP registries, review roundups, and standards bodies.

---

## 1. Executive summary / verdict

The market is CROWDED at the single-modality level and at the enterprise-aggregator level, but the SPECIFIC combination the concept proposes is largely UNOCCUPIED:

- **Text detection:** saturated (GPTZero, Originality.ai, Turnitin, Copyleaks, ZeroGPT, Winston). GPTZero was acquired by Superhuman/Grammarly in June 2026 at an $88M valuation (19M users, $30M ARR) - this is the "essay prior" and it is a solved, commoditized category.
- **Image detection:** crowded (Hive, AI or Not, Illuminarty, Sightengine, SynthID, DeepAI). Point solutions.
- **Voice/audio detection:** crowded at enterprise (Pindrop, Resemble Detect, Reality Defender, ElevenLabs classifier). Consumer options thin.
- **Website / "vibe-coded" detection:** NEW and fast-moving but fragmented into a dozen single-purpose novelty sites (detectvibecode.com, isthatvibecoded.com, VibeCheck, isvibecoded.com, A5 Chrome extension). None are part of a broader detector.
- **Multi-modal aggregators:** exist (Reality Defender, Sensity, TrueMedia, Resemble) but are (a) enterprise/API-first, (b) deepfake/fraud-framed, NOT slop/authorship-framed, (c) they do NOT include the "vibe-coded website/code" modality, and (d) mostly return a probability, not a cited-evidence breakdown a layperson can act on.

**The four differentiators, scored for whitespace:**

1. **ALL-modalities in one product** (image + site/code + voice + text): PARTIALLY OPEN. Aggregators cover image+audio+video+text, but NONE add the website/vibe-coded-build modality. That fourth axis is unique to this concept.
2. **CITED EVIDENCE, not black-box %:** MOSTLY OPEN for consumers. Illuminarty shows heatmaps; the "vibe-coded" tools list specific tells; the AI-slop MCP servers return raw tell counts. But no consumer-facing, cross-modality product unifies "here is the score AND here are the specific tells" as its core promise.
3. **Consumer SHARE-TO-APP:** NARROW but OCCUPIED for image only. "Fake or Not" (iOS) already ships a Share Extension for images. So the UX is proven and NOT novel by itself, but no one offers it across all modalities (share a link -> vibe-coded check; share audio -> voice check).
4. **Detector-as-MCP-for-prevention:** EMERGING, EARLY. Several AI-slop-checker MCP servers exist (parweb ai-slop-checker, anti-ai-slop, AI-SLOP-Detector, Slop or Not) but they are TEXT/CODE style-tell counters, not multi-modal, and not tied to a consumer detection product.

**Whitespace verdict:** The defensible wedge is NOT "another detector." It is the UNIFICATION: one 0-100 evidence-cited score across text + image + voice + WEBSITE/vibe-code, wrapped as a consumer share-to-app AND exposed as a prevention-loop MCP. Each piece exists somewhere; nobody has assembled all four, and the website/vibe-code axis + the MCP-for-prevention axis are the least contested. The bundle is the moat, exactly as with prior all-in-one plays.

---

## 2. Landscape table

| Product | Modalities | Evidence cited? | Consumer or API/Enterprise | Share-to-app? | Notes |
|---|---|---|---|---|---|
| **GPTZero** (Superhuman/Grammarly) | Text (image upload = weak add-on) | Sentence-level highlights (text) | Consumer + API | No | The essay prior. 19M users, $30M ARR, acq. Jun 2026. Image detection lags badly. |
| **Originality.ai** | Text (+ some image) | Partial | API/Pro (SEO/agency) | No | Paid, publisher-focused. |
| **Turnitin / Copyleaks / ZeroGPT** | Text | Highlights | Edu / API / Consumer | No | Essay/plagiarism incumbents. |
| **Winston AI** | Text + AI image | Some | Consumer + API | No | One of few text tools adding image. |
| **Hive Moderation** | Image, video, audio, text (moderation) | Score only (free demo) | API/Enterprise infra | No | ~94% image accuracy; licensed to platforms, not consumer-first. |
| **AI or Not (Optic)** | Image (+ some audio) | Minimal | Consumer + API | Web/app upload | Fast no-signup checks. |
| **Illuminarty** | Image (+ text) | YES - region heatmaps + generator ID | Consumer (5/day free) + API | No | Best example of cited visual evidence + model attribution. |
| **Sightengine** | Image, video | Score/attributes | API | No | Developer moderation API. |
| **Google SynthID / C2PA Content Credentials** | Watermark / provenance metadata | Provenance record | Platform/infra standard | N/A | Provenance, NOT detection. Commoditizing at capture (Pixel, Galaxy). |
| **Reality Defender** | Text, image, audio, video | Ensemble score | API/Enterprise (50/mo free) | No | Broadest true multi-modal; deepfake/fraud-framed; no website/code. |
| **Sensity AI** | Image, video, audio | Forensic multilayer | Enterprise (KYC) | No | Visual/forensic specialist; weak on text/voice breadth. |
| **TrueMedia** | Image, audio, video | ~90% verdict | Free (journalist nonprofit) | No | Status in flux/relaunch; no text, no code. |
| **Resemble Detect (DETECT-3B)** | Audio, image, video | Explainable output | API/Enterprise | No | From a voice-cloning vendor; #1 DFBench speech+image. |
| **Pindrop Pulse** | Audio (live calls) | Liveness signals | Enterprise (call centers) | No | Real-time voice-fraud; not consumer. |
| **ElevenLabs Speech Classifier** | Audio (ElevenLabs only) | SynthID watermark | Free web tool | No | Provider-specific; not general. |
| **Fake or Not** (iOS) | Image | Confidence % + verdict | Consumer app | YES - iOS Share Extension | Closest consumer share-to-app; IMAGE ONLY. (Android build = counterfeit-product focus.) |
| **AI Detect / Detect AI / AI Detect: Fake Image** (App Store) | Image (some text) | % breakdown | Consumer apps | Share report out; some share-in | Cluster of thin single-modality consumer apps. |
| **detectvibecode.com / isthatvibecoded.com / VibeCheck / isvibecoded.com / A5 ext** | Website / code only | YES - lists specific tells, 0-100 VibeScore, 7 categories | Consumer web / Chrome ext | Paste URL (no native share) | Fast-moving novelty niche; heuristic fingerprints (shadcn/Lucide/gradients/builder meta/CLAUDE.md). No other modality. |
| **AI-slop MCP servers** (parweb ai-slop-checker, anti-ai-slop, AI-SLOP-Detector, Slop or Not) | Text / code style-tells | YES - raw tell counts (em-dash density, "delve", empty functions) | MCP for agents (Claude/Cursor/Codex) | N/A (MCP) | Deterministic, actionable, prevention-loop friendly. Text/code only. Not tied to a consumer product. |

---

## 3. Detailed findings by research-agenda item

### Text/essay detectors (the "essay prior")
Saturated and commoditizing. GPTZero remains the most benchmarked text detector and was acquired by Superhuman (Grammarly) in June 2026 ($88M, 19M users, $30M ARR). Originality.ai, Turnitin, Copyleaks, ZeroGPT, Winston round out the field. Text is table stakes, not a differentiator. Note none publish verified accuracy/false-positive rates - a credibility opening if the new product does.

### AI-image detectors (point solutions)
Hive Moderation (~94%, but infra/API licensed to platforms), Illuminarty (~91%, region heatmaps + generator identification - the strongest example of cited visual evidence), AI or Not (fast casual), Sightengine (dev API), DeepAI. Best practice per reviewers is to ensemble multiple tools - which itself argues for a unifying product. Key caveat: "No tool exceeds ~45% accuracy against authenticity-optimized generators."

### AI-voice/audio detectors
Enterprise-dominated: Pindrop Pulse (live-call fraud, ~2s clone detection, liveness), Resemble Detect (DETECT-3B, cross-generator, deployable), Reality Defender, Hiya. ElevenLabs classifier is provider-specific. Accuracy drops sharply on compressed phone/WhatsApp audio (~94% clean -> ~71% compressed). Consumer-facing voice detection is thin - an opening.

### "Vibe-coded" website / code detectors (the newest axis)
A genuine 2026 micro-boom of single-purpose tools: detectvibecode.com, isthatvibecoded.com, VibeCheck (GitHub, 0-100 across 7 categories, pure heuristics no LLM), is-vibecoded.vercel.app, isitvibecoded.com, isvibecoded.com (repos), and the A5 Chrome extension (local, deterministic, gives reasons). "Vibe coding" was Collins Word of the Year 2025. Tells: builder fingerprints (generator meta, CDN/CNAME, DNS TXT), visual patterns (purple-blue gradients, shadcn/ui, Lucide icons, glassmorphism, gradient hero text, sparkle/rocket emoji), structural uniformity, and leftover artifacts (CLAUDE.md, .cursorrules, commit trailers in JS/source maps). Critically: NONE of these are part of a broader multi-modal detector, and none have a native share-to-app. This is the least contested modality and the one the concept can most credibly "own" first. (Directly relevant: Lark's own audit-frontend-hygiene tell corpus is exactly this kind of ruleset.)

### Multi-modal aggregators
Reality Defender (text+image+audio+video, broadest true coverage, but API/enterprise and CEO-impersonation/fraud-framed), Sensity (forensic, visual-heavy, KYC), TrueMedia (free journalist tool, image/audio/video, no text/code), Resemble (audio/image/video). NONE cover website/vibe-code. NONE are consumer-share-first. Most return a probability rather than a layperson-actionable evidence breakdown. This is where the concept's "consumer + evidence + fourth modality" reframing separates it.

### Share-to-app consumer UX
Proven but shallow. "Fake or Not" (iOS) explicitly ships a Share Extension to analyze images forwarded from other apps (Messages, Photos, Safari, social) - marketed for exactly the use cases in the concept (verifying profile pics, news images, dating matches). Several other App Store apps (AI Detect, Detect AI) offer share-OUT of reports and some share-IN. BUT: all are image-only, none handle a shared LINK (-> vibe-coded site check) or shared AUDIO (-> voice check). No confirmed Instagram-DM-forward bot. The multi-modality of the share target is open.

### MCP-for-prevention
Emerging and early. parweb's ai-slop-checker (in the official MCP Registry) counts deterministic style tells (em-dash density, "delve/tapestry/furthermore", "not only...but also", even sentence lengths) and returns raw counts an agent can act on in a write->score->fix->re-score loop - explicitly better for agents than a "87% likely AI" verdict. anti-ai-slop pairs each rule with a rewrite instruction. AI-SLOP-Detector targets AI code smells (empty functions, fake docs, inflated comments) with confidence/action_class/evidence over MCP. Slop or Not runs a local text+image detector as MCP for Claude/Codex/Cursor. All are text/code only; none are multi-modal; none connect to a consumer product. The detection->prevention loop is validated as a pattern but wide open as a unified multi-modal offering.

---

## 4. Strongest competitor to watch

**Reality Defender** - it is the closest thing to "one detector for everything": genuine text+image+audio+video coverage, ensemble models, developer API/SDK, and a consumer-accessible free tier (50 scans/mo). If any incumbent decides to add a website/vibe-code modality, a consumer app, and evidence citations, it is the most likely. Its weaknesses are the wedge: enterprise/fraud framing, no code/website axis, no consumer share-to-app, and probability-not-evidence output.

**Runner-up watch: GPTZero-under-Grammarly/Superhuman.** With Grammarly's consumer distribution, 19M users, and a text-authorship brand, a push into multi-modal consumer detection is plausible and would be the most dangerous brand-led entrant. Currently its image detection is weak ("grammar checker evaluating a painting").

**Third: the vibe-coded-detector cluster** (detectvibecode.com / isthatvibecoded.com / VibeCheck). Individually tiny, but they own the newest modality and could aggregate upward.

---

## 5. Honest risks

- **Detection is an arms race.** Every accuracy claim decays as generators improve; reviewers note ~45% ceiling against authenticity-optimized image generators and sharp voice-accuracy drops on compressed audio. A cited-evidence approach ("here are the tells") is more durable than a black-box % (tells degrade more gracefully and stay explainable), but it still erodes.
- **False-positive liability.** Accusing real human work of being AI (essays, art, code, a real person's voice) is reputationally and legally fraught. The vibe-code tools already warn legit shadcn/Tailwind/Vercel sites trip signals. Framing as a "style/slop score, not an authorship accusation" (as parweb explicitly does - stripe.com scores 61 and was written by pros) is the safer, and honest, posture.
- **Provenance may commoditize parts of this.** C2PA Content Credentials + SynthID are moving to capture-time signing on mainstream phones (Pixel 10, Galaxy S25/S26), and EU AI Act Art. 50 (enforcement Aug 2026) + California SB 942 (Jan 2026) mandate machine-readable disclosure. For SIGNED content, "is this AI" becomes a metadata lookup, not a detector. BUT: signing outpaces verification, intermediaries strip metadata, CA certs are expensive (~$289/yr, no Let's Encrypt equivalent), absence of a manifest proves nothing, and vibe-coded WEBSITES/CODE and un-watermarked outputs are entirely outside C2PA. Detection retains a large residual market, especially for the unsigned/adversarial long tail and the code/website axis.
- **No verified benchmarks industry-wide.** None of the major tools publish verified accuracy/FPR. This is a credibility risk for the whole category AND an opportunity to differentiate by publishing honest, benchmarked, evidence-first numbers.
- **Consumer willingness-to-pay is unproven** for standalone detection; the strongest consumer apps are cheap/freemium novelties. The MCP-for-prevention (developer/agent) and any B2B evidence-API may monetize better than the consumer app alone.

---

## 6. Sources

- https://ddiy.co/ai-image-detection-tools/
- https://fast.io/resources/ai-image-detector-tools-2026/
- https://imagera.ai/blog/ai-image-checker-tools-2026
- https://www.unite.ai/best-deepfake-detector-tools-and-techniques/
- https://sensity.ai/
- https://toolradar.com/tools/reality-defender
- https://github.com/ai-detected/ai-detectors
- https://chromewebstore.google.com/detail/vibe-coding-detector-by-a/bofemcmdnfeomiobgkpcilllbogkladc
- https://github.com/ashish-jabble/vibe-check
- https://www.detectvibecode.com/
- https://isthatvibecoded.com/
- https://isvibecoded.com/
- https://apps.apple.com/us/app/fake-or-not/id6737012807
- https://play.google.com/store/apps/details?id=com.app.ai.fake.or.not.identifier
- https://apps.apple.com/us/app/detect-ai-ai-content-detector/id6743627428
- https://www.analyticsinsight.net/artificial-intelligence/best-ai-voice-detectors-in-2026
- https://deepfakedetector.ai/blog/best-ai-voice-detectors
- https://elevenlabs.io/ai-speech-classifier
- https://mcpmarket.com/server/ai-slop-checker
- https://mcpservers.org/servers/slop-or-not-mcp
- https://github.com/dharmawan-id/anti-ai-slop
- https://glama.ai/mcp/servers/parweb/mcp-ai-slop-checker
- https://slopornot.ai/en/mcp
- https://github.com/flamehaven01/ai-slop-detector
- https://originality.ai/blog/gptzero-ai-content-detection-review
- https://imagera.ai/blog/gptzero-ai-image-detection-2026
- https://editorsweblog.org/2026/04/12/c2pa-adoption-tracker-platforms-content-credentials-2026
- https://www.softwareseni.com/c2pa-adoption-in-2026-hardware-platforms-and-verification-reality/
- https://internet-pros.com/blog/ai-content-provenance-watermarking-c2pa-2026/
- https://www.mdpi.com/2410-387X/9/4/61 (explainable/glass-box deepfake forensics)
