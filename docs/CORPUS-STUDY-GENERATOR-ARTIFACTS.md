# Studying generator output to derive rules, not a classifier

**Design document. Research pass, 2026-08-26. Nothing here is a shipped rule.**

The founder's brief: study what ElevenLabs, Fish Audio, Wispr Flow and the image generators actually
emit, so the corpus knows what machine-made media looks like. This document answers it under the one
constraint that decides the shape of the answer: **a corpus study here must produce RULES WITH CITED
EVIDENCE, never a trained classifier.** The moment a signal becomes a model, every claim on `/method`
stops being falsifiable and the *In re Workado* substantiation defence goes with it.

Three of the four research streams behind this document reached the same conclusion independently,
and it is worth stating before anything else: **the deterministic surface is entirely container and
metadata.** Every pixel-domain and every waveform-domain method with a published error rate bottoms
out in a trained model. That is not a gap to be closed later. It is the boundary of what this
product is allowed to be, and this document is written to be excellent inside it and to publish the
outside as a gap.

Everything below is tagged. **MEASURED** means a command in this repository produced the number.
**VERIFIED** means a research pass fetched a page that says it, with a URL and a date. **REPORTED**
means a search summary or a secondary source said it and the primary was not opened. **INFERRED**
means it is a derivation, mine or a researcher's, that no source states. A proposal resting on
REPORTED or INFERRED evidence may not be promoted until somebody measures it, and the promotion path
in section 6 enforces that rather than trusting it.

---

## 1. What already exists

The house's most common error is proposing something already built. So this section is a rule-by-rule
inventory, taken by running the corpus ratchet rather than by reading prose.

**MEASURED**, `node scripts/check-corpus-version.mjs`, 2026-08-26:

```
image  image-corpus-2026.09          10 rules  digest 76032755216e42c6  since-ahead 0
audio  audio-corpus-2026.09           9 rules  digest aa0278bd8fe1d88c  since-ahead 0
audio-stream audio-stream-corpus-2026.09  5 rules  digest 8a9a93c8d8c32dc0  since-ahead 0
```

### 1.1 The shared media corpus: ten rules, all of them declarations

`packages/provenance/src/rules.ts` is a factory. The image, video and audio corpora are the same ten
rules at three type arguments. Audio drops one (`prov.camera-capture-metadata`, because a RIFF file
has no EXIF MakerNote), which is why image is 10 and audio is 9.

| Rule | Family | Weight | Reads |
|---|---|---|---|
| `prov.c2pa-declares-trained-algorithmic` | declared-provenance | **+3.2** | a VERIFIED manifest's `c2pa.actions[].digitalSourceType` in the trained-algorithmic family |
| `prov.c2pa-declares-capture` | provenance-counter | **-2.2** | the same field carrying `digitalCapture` |
| `prov.iptc-digital-source-type` | declared-provenance | **+2.4** | `Iptc4xmpExt:DigitalSourceType` / `iptcExt:DigitalSourceType` in XMP, unsigned |
| `prov.sidecar-declares-generative-tool` | declared-tooling | **+2.6** | a `generative-only` signature hit in EXIF / XMP / IPTC / PNG text |
| `prov.sidecar-declares-mixed-tool` | declared-tooling | **+0.9** | a `mixed` signature hit (Photoshop generative fill) |
| `prov.encoder-declares-generative-tool` | declared-tooling | **+2.2** | the container's single writer field (`EXIF:Software`, `ISO-BMFF:©too`, `RIFF:ISFT`, `ID3v2:TSSE`, `LAME`) |
| `prov.watermark-detected` | watermark | **+2.2** | a `present` result from an external detector, which this build never produces |
| `prov.camera-capture-metadata` | provenance-counter | **-1.4** | Make + Model + capture time + MakerNote, all four |
| `prov.hand-edit-history` | provenance-counter | **-1.1** | three or more `stEvt:softwareAgent` steps, none of them a signature hit |
| `prov.pristine-original-with-credential` | counter-evidence | **-1.3** | phase 2: no laundering indicator, a credential box, two or more pristine markers |

### 1.2 The generator signature table: eleven entries

`packages/provenance/src/generators.ts`. Every entry is an anchored match on a named field, never a
substring search. Three classes: `generative-only`, `mixed`, `editor-or-transcoder`.

- `gen.sd-webui-parameters` (A1111, PNG `tEXt:parameters`, requires `Steps:` AND `Sampler:` AND `CFG scale:` together)
- `gen.comfyui-workflow` (PNG `tEXt:prompt` / `workflow`, requires `"class_type"` AND `"inputs"`)
- `gen.invokeai-metadata` (`invokeai_metadata`, `sd-metadata`, `invokeai_graph`)
- `gen.firefly-creator-tool`, `gen.dalle-openai-tag`, `gen.gemini-image-tag` (anchored product names in creator-tool fields)
- `gen.elevenlabs-tsse` (anchored `^elevenlabs` in TSSE / ISFT / Software / CreatorTool)
- `gen.photoshop-generative` (mixed)
- `gen.lavf-transcode`, `gen.handbrake-transcode`, `gen.lame-encoder` (editor-or-transcoder)

### 1.3 The re-encoding gate, which outranks every rule

`packages/provenance/src/reencode.ts` decides, before any rule runs, whether these are even the
original bytes. It trips at 1.0 and produces `status: "inconclusive"` with no number. Nine laundering
codes and six pristine codes. It already contains a curated exact-match display-geometry table for
screenshots, and a note explaining that 1920x1080 and friends were deliberately REMOVED from it
because they are capture resolutions. That note is directly relevant to section 5 and I have honoured
it there.

### 1.4 The audio stream rules: five, and the only probabilistic family in the product

`packages/detectors-audio/src/stream.ts`. Fenced five ways: cannot run on a laundered file, cannot
run without a local decoder reading, capped at 12% family share, every title contains the word
"probabilistic", and the counter rule outweighs every signal.

| Rule | Weight | Threshold |
|---|---|---|
| `stream.silence-has-no-room-in-it` | +1.1 | noise floor at or below **-70 dBFS**, with 2+ measured pauses |
| `stream.pauses-are-uniform` | +0.9 | gap-length coefficient of variation below **0.35**, 4+ spans |
| `stream.spectral-ceiling-below-the-container` | +1.0 | 30 dB cliff between adjacent bands, upper band below -80 dBFS, **lossless only** |
| `stream.declared-duration-disagrees-with-decoded` | +0.7 | header vs decoder, both absolute and proportional |
| `stream.room-tone-in-the-pauses` | **-1.5** | noise floor above -55 dBFS |

### 1.5 Watermarks are already modelled correctly, and this is the part not to redo

`packages/provenance/src/watermark.ts` is tri-state by construction: `present` / `not_detected` /
`not_checked`, with `not_checked` as the default and `citableWatermarks` filtering so only a
`present` from a NAMED detector can ever produce a finding. Six schemes are enumerated, each with a
sentence saying why it was not checked. **The research in section 4 confirms every one of those
sentences is still correct.** Do not propose wiring a watermark detector; propose nothing here.

### 1.6 Text rules, and the answer to the Wispr Flow half of the brief

There is **no text modality package.** The three prose rules live inside `detectors-web` and run over
rendered page text: `copy.slop-lexicon` (+0.25), `copy.em-dash-density` (+0.2), `copy.arrow-cta`
(+0.15). The `copy-tell` family is capped at 5%, the smallest positive cap in the product, with a
header saying the rules earn their place by being ACTIONABLE rather than by being good evidence.

`packages/detectors-audio/src/transcribe.ts` already contains the full analysis of running text rules
over a transcript, including the terms fence and `TRANSCRIPT_EXCLUDED_RULES = ["copy.em-dash-density"]`
with the reason: an em dash is not a sound, so every dash in a transcript was inserted by the
transcriber.

### 1.7 What the calibration corpus actually is

**MEASURED**, 76 entries in `calibration/baseline.json`: image 7 human / 6 generated / 5 unknown,
audio 7 / 8 / 3, plus web, code and video.

**Every media member is a CONSTRUCTED file**, built to the container specification, labelled by what
it declares. `packages/detectors-image/src/fixtures/corpus.ts` says so at the top and `CONTRIBUTING.md`
repeats it: "nothing computed over them is a false-positive rate." **This is the real gap the
founder's idea addresses, and it is a licensing and logistics gap rather than a coding one.**

---

## 2. Three defects this pass measured

These are findings, not proposals. Each was produced by running code.

> **Status, 2026-08-26, added after the repair pass.** 2.1 and 2.2 are FIXED, in the commit "A
> parser that cannot read a chunk now says so to somebody who is listening", with the measurements
> re-run before and after. See LEARNINGS L-16, L-17, L-18 and L-19. Two corrections to what is
> written below, both found by re-measuring rather than trusting the write-up. First, compressed
> `iTXt` fails identically to `zTXt` and section 2.1 measured only `zTXt`; the same defect also had
> two instances in `mpeg-audio.ts` and one more in the PNG XMP branch, four in total (L-18). Second,
> `digitalArt` and `minorHumanEdits` are RETIRED IPTC concepts, not terms absent from the
> vocabulary, so the "unresolved" line in 2.2 is answered: keeping them is correct, and the earlier
> count had compared against the active half of a three-state list (L-17). Section 2.3 and every
> candidate rule in section 5 remain untouched: candidates enter only through the reviewed
> promotion path in section 6, never through a repair.

### 2.1 A compressed PNG text chunk is invisible, and the file reports full coverage

**MEASURED.** Two PNGs, identical AUTOMATIC1111 parameter strings, differing only in whether the text
chunk is `tEXt` or `zTXt`:

```
--- tEXt ---  coverage: 1  probes: container=4 metadata=1 ...  fired: prov.sidecar-declares-generative-tool
              parseErrors: []                                  laundered: false score 0.3
--- zTXt ---  coverage: 1  probes: container=4 metadata=0 ...  fired: (none)
              parseErrors: ["text chunk \"zTXt\" at 0x00000021 was compressed and was not decompressed"]
                                                               laundered: false score 0.65
```

`packages/provenance/src/container/png.ts:163` returns `null` for `zTXt` and `:166` returns `null` for
an `iTXt` whose compression flag is set. The caller records a parse error. **Nothing consumes
`container.parseErrors`.** `mediaProbes` in `packages/provenance/src/artifact.ts:138-186` builds five
probe rows from segment counts and field counts and never reads it, so the container probe is paid
full weight for a walk that explicitly failed, and the report says coverage 1.0.

Two things make this worse than a missed rule. First, `zTXt` is not exotic: Pillow writes it whenever
a caller passes `zip=True`, and **REPORTED** that ComfyUI falls back to it for large workflow graphs
and NovelAI has both `tEXt` and `iTXt` variants in the wild. Second, the unread chunk actively
manufactures a FALSE citation: `payloads.length === 0` is what gates the `lossless_resave` indicator,
whose observed value reads `"no tEXt, iTXt, eXIf or XMP chunk present"` when a text chunk demonstrably
is present. That is a fabricated locator value in the product's core promise, which HOUSE-KNOWLEDGE
classes as a correctness defect and not a cosmetic one.

This is the disqualifying class from HOUSE-KNOWLEDGE, shape 4: a rule that cannot express the syntax
it detects. It is L-05 and L-13 again, in a third place.

### 2.2 The IPTC vocabulary enumeration cannot express twelve of the seventeen published terms

**MEASURED**, against the concept list at `https://cv.iptc.org/newscodes/digitalsourcetype/`
(**VERIFIED** fetched 2026-08-26):

```
ours          : 8   trainedAlgorithmicMedia, compositeWithTrainedAlgorithmicMedia, algorithmicMedia,
                    digitalCapture, digitalArt, composite, minorHumanEdits, unknown
IPTC published: 17
IPTC terms WE CANNOT NAME: computationalCapture, negativeFilm, positiveFilm, print, humanEdits,
    algorithmicallyEnhanced, digitalCreation, dataDrivenMedia, screenCapture, virtualRecording,
    compositeCapture, compositeSynthetic
terms WE name that IPTC's list does not: digitalArt, minorHumanEdits
```

Three consequences, and they point in different directions, which is what makes it a real finding
rather than a tidiness one.

- `screenCapture` decodes to `unknown`. A file that DECLARES it is a screen capture does not reach
  the laundering gate through the DigitalSourceType path at all. The gate catches screen captures only
  through `SCREEN_CAPTURE_TOOLS`, a regex list over Software fields.
- `computationalCapture` decodes to `unknown`, so `prov.c2pa-declares-capture` cannot fire on it.
  That is the L-05 asymmetry exactly: **a dead counter raises the score.** A modern computational
  photography pipeline declaring itself honestly would LOSE its counter-evidence. Whether anyone
  actually writes that term is **UNVERIFIED** and is a thing to measure, not to assume.
- `digitalArt` and `minorHumanEdits` are in our list and not in the published one. Either the
  vocabulary moved or they were never there. Unresolved.

### 2.3 Two shipped prose statements about third parties have gone stale

`packages/provenance/src/watermark.ts:114-117` states that SynthID for audio "is applied by Google to
its own speech and music output". **VERIFIED**: ElevenLabs announced SynthID embedding in its own
generated audio on `https://elevenlabs.io/blog/synthid`, published 2026-06-25, last updated
2026-08-19, starting with free-tier text-to-speech and expanding. So the sentence is now
under-inclusive about who applies the mark. The rest of the module, including the refusal to check and
the reason for it, remains correct: **VERIFIED** that ElevenLabs' own page states Google's verifiers
cannot yet detect ElevenLabs' SynthID audio watermarks, which if anything strengthens the module's
position.

Separately, `apps/web/app/method/page.tsx:72` publishes "It cannot read audio". That is true of the
website's URL scanner and false of `packages/detectors-audio`. It reads as a product-wide scope claim
on the page a regulator would read. This is L-10's shape and belongs to `claims-officer`, not to me.

---

## 3. What is genuinely new, and what is not

The rigorous version, because this is where the house errs.

**Already built. Do not re-propose.**

- C2PA manifest LOCATION in JPEG APP11, PNG `caBX` and ISO-BMFF, and the refusal to read an
  unverified manifest's contents.
- `absent` / `unparseable` / `invalid` never contributing generation evidence. `mayContributeGenerationEvidence`
  returns true only for `verified`.
- Absence of a manifest reading as absence of evidence. `ABSENCE_IS_NOT_EVIDENCE` is a shipped string
  attached to findings, not an FAQ entry.
- IPTC `DigitalSourceType` as a rule, with `trainedAlgorithmicMedia` and `compositeWithTrainedAlgorithmicMedia`.
- The A1111, ComfyUI and InvokeAI PNG text keys. All three, by their real key names.
- The screenshot geometry table, including the decision to exclude capture resolutions from it.
- Every watermark scheme as `not_checked` with a stated reason, and `not_detected` producing nothing.
- The re-encoding gate and the abstention it produces.
- Noise floor, pause-length uniformity, spectral ceiling and duration disagreement in audio.
- The whole terms analysis for ElevenLabs transcripts, in `transcribe.ts`.

**Genuinely new.** Section 5 ranks these. In one line each: canonical generation dimensions as a
container-shape rule; canonical TTS container tuples; the NovelAI and Google `Credit` signatures;
leading and trailing silence duration; inter-word gap quantisation to a sample grid; the LAME tag's
declared lowpass versus the measured spectral cliff; and the three defect fixes in section 2, which
are repairs rather than rules.

**A new epistemic category, and this is the architectural point of the document.** Every existing
media family is a DECLARATION family, plus `stream-consistency` for measurements. A canonical
dimension is neither. `1216x832` is a deterministic byte fact that nobody wrote down to tell you
anything, and it is not a statistic over a stream either. It needs its own family, capped low, for
the same reason `stream-consistency` has one: so that a reader can see at a glance which kind of thing
they are being shown. Proposed as `container-shape`, cap 0.12, ordered after `watermark`.

---

## 4. The research, by signal family

### 4.1 C2PA is the only fully usable provenance family

**VERIFIED** from the C2PA 2.2 specification, fetched 2026-08-26: the manifest store is a JUMBF
superbox; in JPEG-1 it "shall be embedded as the data contained in an APP11 Marker as defined in JPEG
XT, ISO/IEC 18477-3"; in PNG it is an "ancillary, private, not safe to copy, chunk type of `caBX`";
in BMFF it is a `uuid` box with identifier `D8FEC3D6-1B0E-483C-9297-5828877EC481`. All three match
what `packages/provenance/src/container/` already locates.

**VERIFIED**: v1's flat `claim_generator` string is deprecated in favour of v2's `claim_generator_info`
map with a required `name`, and the c2pa-rs library version moves to a reserved key `org.cai.c2pa_rs`.
A real ChatGPT manifest dump shows `claim_generator_info: [{"name":"ChatGPT","org.cai.c2pa_rs":"0.51.1"}]`,
`signature_info.issuer: "OpenAI"`, `alg: "Es256"`. **Our `C2paManifest` type carries only the flat
`claimGenerator`.** A verifier integration would have to normalise the v2 map into it, and that is a
type change, not a rule.

**VERIFIED**: C2PA 2.x defines its own `http://c2pa.org/digitalsourcetype/` namespace alongside the
IPTC one. `digitalSourceTypeOf` splits on `/` and takes the tail, so IPTC URIs work and
`c2pa.org/digitalsourcetype/trainedAlgorithmicData` decodes to `unknown` (**MEASURED**, section 2.2).

**The offline verification question, which is the one that matters here.** **VERIFIED**: the official
trust list is a static downloadable PEM at
`https://github.com/c2pa-org/conformance-public/blob/main/trust-list/C2PA-TRUST-LIST.pem`, and the
Interim Trust List was frozen 2026-01-01 with no new certificates being added. **VERIFIED**: c2pa-rs
ships no bundled trust list and takes the PEM as a setting; `verify.ocsp_fetch` is a separate toggle.
**REPORTED**: `c2patool` accepts a file path as well as a URL for trust anchors and the docs recommend
caching locally.

So: **signature validation, hard-binding hash validation and chain-to-anchor validation are all
achievable with zero network egress against a vendored PEM.** OCSP revocation, remote cloud-stored
manifests and trust-list freshness are not, and a stale trust list fails toward "untrusted" rather
than toward "trusted", which is the safe direction. One load-bearing detail is **UNVERIFIED** and the
whole offline argument rests on it: that the COSE_Sign1 `x5chain` header carries the full signer
certificate chain inside the file. Confirm that from the specification text before anyone writes a
line of verifier.

**Stripping.** **VERIFIED** that CAI's own material says metadata "is very easily stripped away on
many platforms and websites", which is why Durable Content Credentials pair the hard binding with a
soft binding. Per-platform behaviour is **REPORTED and contradictory**: sources disagree about
LinkedIn, and several of them are metadata-removal vendors with an interest. **Do not encode a
per-platform preservation table.** The only safe rule is the asymmetric one this repository already
ships.

### 4.2 SynthID and every other invisible watermark: a coverage gap, confirmed

**VERIFIED** from `https://deepmind.google/science/synthid/` and
`https://blog.google/innovation-and-ai/products/google-synthid-ai-content-detector/` (post dated
2025-05-20), fetched 2026-08-26: detection is offered through Gemini or the SynthID Detector portal;
the portal is gated behind an early-tester waitlist for journalists and researchers; no API and no
open-source detector is mentioned for image, audio or video.

**VERIFIED** from `https://ai.google.dev/responsible/docs/safeguards/synthid`: SynthID **Text** is open
sourced in Hugging Face Transformers from v4.46.0. It is text only, and detection "requires the
private watermarking configuration". Google's production keys are not published. So even the open
half is closed.

Every other scheme fails on one of two grounds, and the distinction is worth publishing because they
are different kinds of impossible:

| Scheme | Why it is a gap |
|---|---|
| SynthID image / audio / video | proprietary detector, portal-gated, no API |
| SynthID Text | open source, but a statistical procedure over logits AND keyed |
| Meta AudioSeal, VideoSeal, Stable Signature | MIT and runnable offline, but a **neural detector**. This product ships no model |
| Adobe TrustMark (durable soft binding) | neural decoder AND a network lookup in a manifest repository |
| AWS Titan / Nova | requires a `DetectGeneratedContent` call to Bedrock. Network egress |
| ElevenLabs AI Speech Classifier / Audio Detector | hosted, web dashboard only, no API. **VERIFIED** at 99% precision and **80% recall** on unmodified ElevenLabs audio, and self-described as statistical |
| Resemble DETECT-2B | Wav2Vec2 plus Mamba ensemble, API only |

One thread worth pulling and not pulled: **REPORTED** that the Stability reference pipeline used the
`invisible-watermark` library, which is DWT-DCT, i.e. fixed signal processing rather than a model.
That would be the only model-free watermark in the field. It is a research task, not a proposal.

`packages/provenance/src/watermark.ts` already says all of this. The research changes exactly one
sentence in it, per section 2.3.

### 4.3 Image generator container fingerprints

**Canonical dimensions.** The most usable finding in the whole pass, and the numbers are wildly
uneven in quality.

- **VERIFIED**, Vertex AI Imagen 4: 1024x1024, 896x1280, 1280x896, 768x1408, 1408x768, and a 2x tier
  at 2048x2048, 1792x2560, 2560x1792, 1536x2816, 2816x1536.
- **REPORTED**, SDXL's nine training buckets: 1024x1024, 1152x896, 896x1152, 1216x832, 832x1216,
  1344x768, 768x1344, 1536x640, 640x1536. Canonical and stable, hardcoded in ComfyUI helper nodes.
- **REPORTED**, Recraft's size enum includes 1365x1024, 1820x1024, 1434x1024, 1707x1024. Distinctive.
- **VERIFIED**, gpt-image-1: 1024x1024, 1024x1536, 1536x1024. **VERIFIED**, gpt-image-2 abolished the
  enum: any multiple of 16 up to a 3840 long edge. **VERIFIED**, DALL-E 3 was retired 2026-03-04.
- **REPORTED**, Midjourney: 1024 SD and 2048 HD square, with 16:9 at 1456x816 and 2912x1632.
  docs.midjourney.com 403s automated fetches, so this table cannot be cheaply kept fresh.
- **VERIFIED**, Ideogram explicitly refuses to publish a pixel table and tells you to generate it from
  the model catalog. Not fingerprintable from documentation.
- **VERIFIED**, Anthropic does not generate images at all. There should be no Anthropic image bucket.
  A screenshotted Claude artifact fingerprints the browser's encoder, not Anthropic.

**Encoder shape.** **VERIFIED** from Pillow's `PngImagePlugin.py` source: `_save` writes `iCCP` only
if an ICC profile was passed, `cHRM`/`gAMA`/`sBIT`/`sRGB`/`tIME` only if present in the passed
`PngInfo`, `pHYs` only if a dpi was passed, `eXIf` only if exif was passed; the interlace byte is
hardcoded `b"\0"`. So a plain `img.save(path)` produces IHDR, then whatever text was passed, then
IDAT, then IEND, and nothing else. Pillow is the near-universal save path for A1111, ComfyUI,
InvokeAI, diffusers and most Python API wrappers.

**INFERRED and unpublished**: ComfyUI sets `compress_level = 4` while Pillow's default is `-1`, which
maps to zlib level 6, and zlib encodes the level in the FLEVEL bits of the second stream byte, so the
first two bytes of the first IDAT payload would be `78 5E` for ComfyUI and `78 9C` for the default
path. The zlib semantics are RFC 1950 and the `compress_level = 4` is verified source; **the join is
an inference and must be validated against real files before anybody writes it as a rule.**

**A caveat that decides the weight.** `pnger` exists specifically to reorder PNG chunks, so chunk-order
fingerprints are trivially forgeable. And Skia now lets callers choose between libpng and a Rust
encoder, so a "browser signature" moves with the Chrome version.

**JPEG quantisation tables** have real literature: Kornblum, *Digital Investigation*, DFRWS 2008;
Farid, Dartmouth TR2006-583; Mahdian, Saic and Nedbal, IWCF 2010. **REPORTED** in each case. The
method is a literal byte-array equality test on the DQT segment, which is a perfect fit for
rules-as-data. `packages/provenance/src/container/types.ts:50-64` already carries `quantTables`,
`quantTableSums`, `qualityEstimate` and `chromaSubsampling`, and `reencode.ts` already uses the IJG
inverse. The literature's own caveat applies: a quantisation table is a class characteristic, never a
unique fingerprint, and replacing one is easy and published.

**EXIF absence.** **REPORTED** corroboration exists and is uniformly hedged, and the honest assessment
is that it is a near-worthless standalone signal because every social platform strips EXIF, so the
base rate of EXIF-free real photographs is enormous. `reencode.ts` already weights
`capture_metadata_absent` at 0.3 precisely so it cannot trip the gate alone. That is the right answer
and it does not need changing.

### 4.4 Synthetic speech container fingerprints

**VERIFIED** output-format defaults, all fetched 2026-08-26:

| Provider | Default | Notable |
|---|---|---|
| ElevenLabs | **`mp3_44100_128`** | naming is literally `codec_samplerate_bitrate`; 44.1 kHz PCM needs Pro+, so free tier clusters hard on 44100/128/mono |
| OpenAI TTS | mp3, native **24 kHz** mono; PCM documented as "raw samples in 24kHz (16-bit signed, low-endian), without the header" | |
| Google Gemini TTS | raw 16-bit PCM, mono, **24000 Hz**, MIME `audio/L16;codec=pcm;rate=24000` | Google's own sample writes a 44-byte-header WAV via Python `wave` |
| Google Cloud TTS classic | `MP3` documented verbatim as **"MP3 audio at 32kbps"** | nobody distributes human speech at 32 kbps by choice |
| Azure Speech | header-required, every format string contains `mono`, no stereo option exists | and verbatim: "44.1kHz is downsampled from 48kHz" |
| Cartesia | wav pcm_s16le 44100; mp3 **44100 / 128000** | collides exactly with ElevenLabs |
| Fish Audio | **mp3**, bitrate default **128**, sample rate default **44100** | |
| Hume Octave | mp3, "The default sample rate is `48000 Hz`" | separates it from the 44100 and 24000 clusters |
| PlayHT | **the company is gone.** play.ht and play.ai fail DNS; team acquihired by Meta 2025-07-12, platform terminated 2025-12-31 | remove from any plan |

Two cross-cutting facts are worth more than any single row. **Every speech TTS provider above returns
mono**, so `channels == 2` is close to a negative test for synthesised speech. And the sample-rate
space collapses to three clusters: 24000 (OpenAI, Gemini, Azure native), 44100 (ElevenLabs, Cartesia,
Fish), 48000 (Hume, Azure hi-fi). **24000 Hz is the standout, because consumer capture chains
essentially never produce it.**

**Encoder signatures in the container.** This is the weak half and the research says so plainly: **no
TTS vendor documents what library writes their bytes.** What is spec-level solid: **VERIFIED** that
LAME writes `Xing` for VBR and `Info` for CBR with a nine-ASCII-byte encoder short string, and that
`LAME3.100` exactly fills nine bytes leaving no room for the revision letter, which makes parsers that
require a trailing character misreport it. `packages/provenance/src/container/mpeg-audio.ts:157` already
reads exactly those nine bytes and the file header already documents the conflict case. **VERIFIED**
that the LAME tag also carries a declared **lowpass filter frequency**, which we do not read and which
is the seed of a genuinely good rule (section 5.7). **VERIFIED** that ffmpeg has no native MP3 encoder
and writes an ID3v2 `TSSE` frame reading `Lavf<version>`, which `gen.lavf-transcode` already matches.
**VERIFIED** from RFC 7845 that `OpusHead` carries an **Input Sample Rate** field describing the
pre-encode rate, and that Opus always decodes at 48 kHz regardless, so the header field is the only
honest source for a rate check on Opus.

**Everything about what ElevenLabs and OpenAI actually leave in an MP3 is UNVERIFIED.** One
`ffprobe -show_entries format_tags:stream_tags` sweep over real generated files settles it in an hour.
Until somebody runs it, `gen.elevenlabs-tsse` may be a rule that can only fire on a tag the vendor
does not write, which is a `detector-coverage` question and should be measured before it is defended.

### 4.5 Acoustic tells, and the two that survive

**The strongest documented one is silence duration.** **VERIFIED**, Müller et al., "Speech is silver,
silence is golden", ASVspoof 2021 Workshop, `https://arxiv.org/abs/2106.12914`: bonafide instances have
significantly longer leading and trailing silences; a model on **leading silence duration alone**
reaches roughly 85% accuracy at 15.1% EER; and trimming silence in preprocessing degraded a
state-of-the-art detector from 3.6% to 15.5% EER. **Read that citation carefully before using it.**
The paper frames this as a dataset artefact and a leakage warning, not as an endorsed forensic
feature. Cite it as the measurement it is, never as an endorsement.

**The most promising untried one is gap quantisation.** A vocoder emits on a frame grid. If inter-word
gap durations snap to exact multiples of a hop size (10 ms, or 256 or 512 samples), that is arithmetic
rather than taste, and it is a different claim from `stream.pauses-are-uniform`, which measures
dispersion. A rehearsed human reader produces low dispersion; nobody produces gaps that are exact
integer multiples of 256 samples. **No published source measures this. It is INFERRED and it is the
single best candidate in the audio set for original work.**

**Things to compute and never threshold.** **VERIFIED** that the jitter and shimmer literature
disagrees on the sign of the effect: "Pitch Imperfect" (`https://arxiv.org/html/2502.14726v1`) reports
bonafide having SMALLER average jitter and shimmer, while US patents 9865253 and 11081115 claim
synthesised speech has jitter and shimmer of LOWER amplitude and propose flagging when variability
falls below a threshold. Two credible sources, opposite signs, almost certainly because the effect is
vocoder-vintage-dependent, and the units are not portable between perturbation packages. **Do not ship
a jitter or shimmer threshold.**

**Things that are weaker than they look.** Breath absence is a 2023 tell, not a 2026 one: ElevenLabs
v3 and Octave synthesise breaths on request. **VERIFIED** from a vishing study
(`https://arxiv.org/pdf/2602.20061`) that attackers deliberately add ambient noise and normalise
loudness, which is the same point `stream.room-tone-in-the-pauses`'s false-positive note already
makes. DC offset and clipping are **negative** tests for human capture only: their presence argues
for an analogue chain, their absence argues nothing.

### 4.6 Wispr Flow is a text problem and must not be merged with the audio detectors

The founder's list conflates two opposite things and the distinction is load-bearing. ElevenLabs and
Fish take text and emit audio. **Wispr Flow takes audio and emits text.** There is no audio artifact
to detect. Every tell lives in the produced text.

**VERIFIED** from `https://docs.wisprflow.ai/articles/5373093536-how-do-i-use-smart-formatting-and-backtrack`,
fetched 2026-08-26. Smart Formatting adds context-aware capitalisation mid-sentence, creates numbered
lists from spoken sequence words, applies automatic punctuation, converts spelled numbers to numerals
("seven" becomes "7"), and **removes trailing periods in detected messaging apps** while preserving
`!` and `?`. Backtrack removes "filler words, false starts, and self-corrections", triggered by
"actually" or "scratch that", using the full dictation as context.

**The finding that inverts our own rule**, verbatim from those docs: *"Some names (like em dash) may
not produce a symbol, Flow avoids inserting em dashes automatically."* **Wispr Flow will not emit em
dashes.** So `copy.em-dash-density` is not merely useless against Wispr Flow output, it points the
wrong way: dash absence is expected and dash presence argues against it. `transcribe.ts` already
excludes that rule from transcripts for an adjacent reason, and this is independent corroboration
from a different direction.

**The characterisation, INFERRED**: Wispr Flow output is spoken-register content in written-register
form. Oral phrasing and vocabulary, near-zero disfluency, perfect mechanics, no typos, numerals rather
than words, spontaneous numbered lists, no em dashes, and register that shifts by destination
application rather than by author. Genuine typing has typos. Genuine transcription has fillers.
Generic LLM prose has the opposite profile: written-register syntax and a fondness for em dashes.

**My recommendation is that this does not become a rule.** The signal is a CONJUNCTION of absences
over a text sample whose length we do not control, its strongest member is "no typos", and a rule
that fires on well-edited writing by a careful person is precisely the rule that would libel the
earnest. If it is ever built it belongs in a text modality that does not exist, under a family capped
like `copy-tell`, and it should be routed to abstention on any sample under a few hundred words.
**Recorded here so nobody proposes it fresh next quarter without reading this paragraph.**

---

## 5. Ranked candidate rules

Ranked by evidence quality times evasion cost, not by how interesting they are. Every entry carries a
draft `falsePositiveNote`, because `assertWellFormedCandidate` refuses a candidate without one, and
every entry carries an evasion price, because `evasion-red-team`'s question is how cheaply a motivated
person defeats it.

**None of these may be added to the shipping corpus in this pass.** They enter through section 6.

### The repairs, which outrank every new rule

**R1. Decompress `zTXt` and compressed `iTXt`.** Not a rule, a parser fix. Bounded inflation via the
existing `maxOutputLength` discipline, because a deflate bomb in a text chunk is exactly the hostile
input L-01 was about. **This is the highest-value item in the document**, because it makes three
existing `generative-only` signatures fire on files where they currently do not, and it removes a
fabricated observed value from the laundering gate. Measured evidence in section 2.1.

**R2. Make `container.parseErrors` lower coverage.** A container walk that explicitly failed to read a
chunk must not report full coverage. The honest form is a derived probe field rather than a declared
one, per L-08: the container probe's health is a function of `parseErrors.length`, not a constant.
Note the tension to resolve deliberately: `validate.ts:94` treats a ran-but-empty probe as a THROW and
`score.ts:450` treats it as an ABSTENTION, and neither references the other (L-03).

**R3. Complete the IPTC vocabulary.** All seventeen published terms, plus the `c2pa.org` namespace,
plus a decision on `digitalArt` and `minorHumanEdits`. Route `screenCapture` into the laundering gate
and `computationalCapture` into the capture counter. Per L-13: report the DELTA in what the
enumeration can express, because that number is the only evidence the widening did anything.

### The new rules

**C1. `container.canonical-generation-geometry`** *(new family `container-shape`, proposed weight +0.6, cap 0.12)*

- **Signal:** the exact pixel dimensions are a documented generator output size that no capture device
  or content management system produces.
- **Deterministic check:** exact integer pair match, both orientations, against a curated table. Start
  with the highest-confidence members only: the SDXL buckets `1216x832`, `832x1216`, `1152x896`,
  `896x1152`, `1344x768`, `768x1344`, `1536x640`, `640x1536`; Imagen 4's `896x1280`, `1280x896`,
  `768x1408`, `1408x768`, `2816x1536`, `1536x2816`; Recraft's `1365x1024`, `1820x1024`, `1434x1024`,
  `1707x1024`.
- **Deliberately EXCLUDED, and this is the whole design of the rule:** `1024x1024`, `1024x1536`,
  `1536x1024`, `2048x2048`, `512x512`, `768x768`. Every one is a legitimate export preset, a common
  CMS crop and a standard social image size. Including them would be the exact mistake
  `reencode.ts:97-110` documents and warns against, where 1920x1080 was removed from the screenshot
  table because it is the capture resolution of every phone made this decade. **The rule's value is
  entirely in the odd numbers.**
- **Draft `falsePositiveNote`:** "This is a coincidence of arithmetic, not a declaration. Any image
  can be cropped or exported to any dimensions, and a person working from a generated image as a
  reference, or matching a template a colleague sent, produces these numbers by hand. The table also
  goes stale in one direction only: a generator that adds a size stops being caught, and a size that
  becomes a common export preset starts producing false positives silently. Dimensions are the
  cheapest thing in a file to change and this is weighted as the weakest kind of evidence we cite."
- **Evasion cost: near zero.** One crop. One pixel off any edge defeats it entirely. Weight
  accordingly and never sell it as strong.
- **Evidence quality: REPORTED for SDXL and Recraft, VERIFIED for Imagen 4.** The SDXL and Recraft
  members cannot ship until measured against real files.
- **Coverage note:** **VERIFIED** that gpt-image-2 abolished OpenAI's fixed enum, so this rule has low
  and falling recall against the largest generator. Say that on `/method` rather than discovering it
  in a support ticket.

**C2. `container.tts-canonical-tuple`** *(family `container-shape`, proposed weight +0.5)*

- **Signal:** the (codec, sample rate, channel count) tuple is a documented default of a
  text-to-speech API, in a file that also carries no descriptive metadata of any kind.
- **Deterministic check:** `container.shape.sampleRate` and `container.shape.channels` are already
  extracted for both RIFF and MPEG audio (`riff.ts:59-60`, `mpeg-audio.ts:57-59`). Bit rate is
  currently folded into the `codec` display string and would need promoting to a numeric field, which
  is a probe change. **Require the conjunction**, not the tuple alone: a 44100/128/mono MP3 is a
  perfectly ordinary human file, and only the joint improbability of canonical tuple AND mono AND zero
  descriptive metadata is worth citing.
- **The strongest single member is 24000 Hz**, because **VERIFIED** OpenAI and Gemini are both native
  24 kHz and consumer capture chains essentially never produce it. `channels == 2` should be a hard
  disqualifier for the whole rule.
- **Draft `falsePositiveNote`:** "A sample rate and a channel count are properties of an export
  setting, not of how a sound was made. Any voice memo transcoded for the web, any podcast bounced to
  a delivery spec, any file that passed through a normalising pipeline can land on these numbers, and
  a producer who exports mono at 44.1 kHz because that is their house preset trips this every time. It
  is also defeated by one re-encode in either direction, so the absence of a canonical tuple means
  nothing at all."
- **Evasion cost: near zero.** One `ffmpeg -ar 48000`.
- **Evidence quality: VERIFIED for the defaults themselves.** The conjunction's other half, that TTS
  output carries no descriptive metadata, is **UNVERIFIED** and is the ffprobe sweep in section 4.4.

**C3. `gen.novelai-metadata`** *(existing family `declared-tooling`, proposed weight +2.6, the existing generative-only weight)*

- **Signal:** the NovelAI PNG text key set. **REPORTED**: `Software` = "NovelAI", `Title` = "AI
  generated image", `Description` = the prompt, `Source` = e.g. "Stable Diffusion 1D44365E", `Comment`
  = JSON carrying `steps`, `sampler`, `seed`, `strength`, `noise`, `scale`, `uc`.
- **Deterministic check:** a conjunction in the style of `gen.sd-webui-parameters`, which requires
  `Steps:` and `Sampler:` and `CFG scale:` together rather than any one alone. Require `Software`
  anchored to NovelAI plus at least one of the JSON keys, so that a person typing "NovelAI" into a
  caption cannot trip it.
- **Draft `falsePositiveNote`:** inherit the existing generative-only note verbatim. It already says
  the right thing: metadata is editable, it survives into files assembled from several sources, and it
  disappears on re-save, which is why its absence says nothing.
- **Evasion cost: one metadata strip**, same as every sibling in the table. That is the accepted
  bargain for this family.
- **Blocker:** the key set is REPORTED, from a PyPI package and an ImageMagick discussion, not from
  NovelAI. **A fixture must be cross-checked against a real file before this ships**, which is exactly
  the `counter.anti-spam-plumbing` failure the promotion path exists to stop.

**C4. `gen.google-ai-credit`** *(family `declared-tooling`, proposed weight +2.6)*

- **Signal:** the IPTC `Credit` field reading "Made with Google AI". **REPORTED** from
  `https://iptc.org/news/google-ai-transparency-based-on-iptc-standards/`.
- **Deterministic check:** exact anchored string in the IPTC `Credit` dataset. Note that
  `metadata.ts:175` currently reads only IIM dataset `0x41` (Originating Program); `Credit` is a
  different dataset number and would need adding.
- **Draft `falsePositiveNote`:** "A credit line is a caption field. Anybody can type this string into
  any file, a stock library can carry it forward into a composite whose visible content came from
  elsewhere, and an honest photographer crediting a generated element in a composite writes exactly
  this. It also disappears on every re-save, so its absence says nothing."
- **Evasion cost: one metadata strip.**

**C5. `stream.leading-silence-absent`** *(family `stream-consistency`, proposed weight +0.7, title must contain "Probabilistic")*

- **Signal:** the file begins and ends with speech, with essentially no leading or trailing silence.
- **Deterministic check:** the existing `SilentSpan` list already carries `startSec`, so leading
  silence is `silences[0].startSec` when the first span starts at zero, and trailing silence is
  derivable from the last span against the decoded duration. Arithmetic over an existing reading, no
  new probe.
- **Draft `falsePositiveNote`:** "An editor trims heads and tails. That is the first thing anybody
  does to a recording, it is the default behaviour of every podcast and audiobook workflow, and a clip
  cut out of a longer take has no leading silence by construction. The paper this threshold comes from
  reports the effect as a DATASET ARTEFACT and a leakage warning rather than as a validated forensic
  feature, and we cite it that way. It also cannot survive the transform that removes it: any
  concatenation or re-edit changes it completely."
- **Evasion cost: near zero**, and unusually so. Prepending 300 ms of anything defeats it.
- **Evidence quality: VERIFIED** as a measurement (15.1% EER standalone), and explicitly NOT verified
  as an endorsed feature. That distinction has to survive into the published rationale.

**C6. `stream.gaps-snap-to-a-frame-grid`** *(family `stream-consistency`, proposed weight +0.9)*

- **Signal:** inter-speech gap durations are exact integer multiples of a vocoder hop size.
- **Deterministic check:** convert gap lengths to samples using the known sample rate, then test
  divisibility against a small candidate hop set (256, 512, and 10 ms at the file's rate), requiring a
  minimum count of gaps so a coincidence over three spans cannot fire it. Pure integer arithmetic.
- **Why this is the best of the audio candidates:** it is a QUANTISATION artefact, not a statistical
  one, so it has a crisp deterministic form, and it is a different claim from
  `stream.pauses-are-uniform`. A rehearsed reader produces low dispersion. Nobody produces gaps that
  are exact integer multiples of 256 samples.
- **Draft `falsePositiveNote`:** "A digital audio workstation snaps edits to a grid, and a producer
  working to a tempo or a frame rate lays gaps down on exactly this kind of lattice on purpose. Any
  sample-rate conversion destroys the property, so a file that has been resampled once cannot trip
  this and its absence therefore says nothing. Named separately from the pause-uniformity rule because
  the two measure different things and must never both be cited as though they corroborated each
  other."
- **Evasion cost: one resample**, which also happens by accident constantly.
- **Evidence quality: INFERRED. No published source measures this.** It needs its own measurement
  before it is a candidate at all, and that measurement is the most interesting original work in this
  document.
- **Family correlation warning for `corpus-steward`:** this and `stream.pauses-are-uniform` read the
  same `silences` array. HOUSE-KNOWLEDGE says one family is a correlated observation and not
  corroboration. Two rules over one array inside one capped family is closer to one observation seen
  twice than the cap alone admits.

**C7. `stream.declared-lowpass-disagrees-with-measured`** *(family `stream-consistency`, proposed weight +0.8)*

- **Signal:** the LAME tag declares a lowpass frequency and the measured spectral cliff is somewhere
  else.
- **Deterministic check:** the LAME tag's declared lowpass field, which **VERIFIED** exists and which
  `mpeg-audio.ts` does not currently read, compared against the existing `bands` reading. Both numbers
  are already in the pipeline shape; only the LAME field needs extracting.
- **Why this is the best-formed rule in the document.** It is a CONTRADICTION between two things the
  file says about itself, not an inference about origin. That is the same epistemic object as
  `stream.declared-duration-disagrees-with-decoded`, which already ships, and it is the only kind of
  audio finding the research would let anyone call hard evidence. It also self-corroborates: neither
  number comes from us.
- **Draft `falsePositiveNote`:** "A disagreement between a declared lowpass and a measured one means
  the bytes passed through more than one encoder. It says nothing whatever about whether a person or a
  model produced the sound, and the most common cause by far is an ordinary transcode. Cited as an
  observation about the encoding chain, and note that the re-encoding gate above these rules may
  already have withheld the score for the same reason."
- **Evasion cost: one re-encode, which removes the tag entirely.**
- **Open design question:** this may belong in `reencode.ts` as a laundering indicator rather than in
  the corpus as a rule. `encoder_chain_conflict` at weight 1.1 already occupies exactly this territory
  for the case of two named encoders. Resolve that before writing either.

**C8. JPEG quantisation-table attribution** *(deferred, no id proposed)*

`reencode.ts` already inverts the tables onto the IJG ladder. Extending that to a table of known
encoder fingerprints (libjpeg-turbo per quality, Pillow's default 75, mozjpeg, Adobe's scale, major
phone cameras) is a corpus-of-tables problem, not a rule problem, and the tables have to be MEASURED
because no published set covers 2026 pipelines. Recorded so it is not lost. Its natural home is the
laundering gate, where it argues about the encoding chain, not the corpus, where it would look like an
argument about origin.

**C9. The zlib FLEVEL discriminator** *(rejected as a candidate, recorded as research)*

`78 5E` for ComfyUI versus `78 9C` for a default Pillow path. This is INFERRED, unpublished, and it
discriminates between two GENERATOR pipelines rather than between generated and human, so it could
only ever corroborate a rule that had already fired for a better reason. It is also destroyed by any
re-save. Recorded so nobody re-proposes it without reading this line.

### The ranking

| # | Item | Evidence | Evasion cost | Ship order |
|---|---|---|---|---|
| R1 | decompress `zTXt` / `iTXt` | **MEASURED** | n/a, a repair | **first** |
| R2 | `parseErrors` lowers coverage | **MEASURED** | n/a, a repair | **first** |
| R3 | complete the IPTC vocabulary | **MEASURED** | n/a, a repair | **first** |
| C7 | declared vs measured lowpass | VERIFIED field exists | one re-encode | second |
| C3 | NovelAI signature | REPORTED | one strip | second, after a real file |
| C4 | Google `Credit` | REPORTED | one strip | second, after a real file |
| C1 | canonical geometry | VERIFIED / REPORTED, mixed | **one crop** | third, odd sizes only |
| C2 | TTS canonical tuple | VERIFIED defaults | **one transcode** | third, conjunction only |
| C5 | leading silence | VERIFIED as a measurement | **near zero** | fourth |
| C6 | gap grid quantisation | **INFERRED** | one resample | fourth, needs its own study |
| C8 | quantisation tables | REPORTED literature | table replacement | deferred |
| C9 | zlib FLEVEL | INFERRED | any re-save | rejected |

---

## 6. Corpus acquisition

### 6.1 The finding that decides the plan

**Public datasets cannot substitute for self-generation, and the reason is not licensing.** It is
preprocessing. Every image set except Synthbuster, RAISE, OpenFake and Deepfake-Eval-2024 has been
cropped, resized or re-JPEGed. Every audio set has been resampled to 16 kHz and re-wrapped in FLAC.
**That destroys exactly the container and encoder signals this document is built on.** Specifics:

- **VERIFIED** ArtiFact's README: "All images went through RandomCrop and Random Impairments (Jpeg
  Compression and Downscale)", cropped to 200x200.
- **REPORTED** GenImage: fakes are PNG, reals are JPEG at ImageNet QF 96, a published format confound
  (arXiv 2403.17608). A rule derived from it might be reading the format, not the origin.
- **VERIFIED** CIFAKE is 32x32 thumbnails.
- **REPORTED** every ASVspoof set ships 16 kHz FLAC, and the 2021 evaluation plan states "codec meta
  data is not provided for individual utterances". The spectral residue survives; the container does
  not.

And the two image sets with intact containers are both non-commercial:
- **VERIFIED** Synthbuster is CC BY-NC-SA 4.0, and it is the one image set stating "None of the images
  suffered degradations such as JPEG compression or resampling."
- **VERIFIED** RAISE, the natural real-photo counterpart with 8,156 camera RAWs and best-in-class
  metadata: "The RAISE dataset is to be used for non-commercial research and educational purposes."

Also flagged: **VERIFIED** GenImage is CC BY-NC-SA 4.0 while **GitHub's licence API reports
`NOASSERTION` for that repository**, so an automated licence scan will not catch it. **VERIFIED**
Chameleon: "Commercial use in any form is prohibited." **VERIFIED** MLAAD is CC BY-NC 4.0 since v8.
**VERIFIED** Codecfake is CC BY-NC-ND, non-commercial and no-derivatives. **REPORTED** WildFake has no
licence at all and its fakes are scraped from Civitai and a Discord.

Commercially usable and worth the founder's time: **VERIFIED** ASVspoof 2019 and ASVspoof 5 are
ODC-By 1.0, whose licence text says "These rights explicitly include commercial use, and do not
exclude any field of endeavour"; **VERIFIED** WaveFake is CC BY-SA 4.0 and is 16-bit PCM WAV direct
vocoder output with no lossy stage, which makes it the best-preserved audio set available on a
commercial licence. Note ASVspoof 2021 DF is **ODbL**, not ODC-By, which carries database copyleft and
is a different animal.

Two risks no licence field discloses: In-the-Wild and SpoofCeleb are scraped audio of named
celebrities and politicians, so personality rights, GDPR and platform terms sit on top of whatever CC
tag was applied. And In-the-Wild has a licence conflict between its Hugging Face card and the
Fraunhofer page.

### 6.2 Terms of service, per provider, and the one that plainly forbids this

**Two pages blocked the research and their absence is load-bearing.** Every `openai.com/policies/*`
URL returned 403, and `docs.midjourney.com` returned 403. **No OpenAI or Midjourney clause below is
verbatim-verified.**

**ElevenLabs is the one provider whose current text plainly reaches this work.** **VERIFIED** from
`https://elevenlabs.io/use-policy`, last updated 2026-08-17:

> **(j)** "Using any part of our Services or their Output to **research and develop** products,
> models, or services that compete with ElevenLabs, or otherwise compete with ElevenLabs."
>
> **(l)** "Using any part of our Services or their Output as part of a dataset that may be used for
> training, fine-tuning, **developing, testing, or improving** any machine learning or artificial
> intelligence technology."

Clause (j) says "research and develop", not "train". Clause (l) reaches a corpus used to TEST, not
just to train. And ElevenLabs sells an AI Speech Classifier, so the "compete with ElevenLabs" predicate
is not hypothetical. **This is not a new discovery for this repository.** `packages/detectors-audio/src/transcribe.ts:11-29`
already reads that clause the same way, in more detail, and draws the same line: transcribing one
user's own artifact to report back to that user is allowed; putting the output into our corpus,
calibration set, baseline or threshold-fitting is not. **The design consequence is that ElevenLabs
cannot be a corpus source, and this document does not propose making it one.**

The rest, sorted by whether the wording reaches non-model analysis:

| Provider | Operative verb | Reaches non-model analysis? |
|---|---|---|
| **ElevenLabs (j), (l)** | "research and develop"; "developing, testing" | **YES, expressly** |
| Adobe (REPORTED) | "create, train, test or otherwise improve" ML algorithms or AI systems | probably as to a test corpus; object is still ML systems |
| Anthropic (**VERIFIED**, Commercial Terms D.4, effective 2025-06-17) | "build a competing product or service, including to train competing AI models" | not model-limited; turns on undefined "competing" |
| Stability (**VERIFIED**, effective 2025-07-31) | "develop products or services that compete ... including to develop or train" | same |
| Midjourney (REPORTED) | "developing or offering competitive products or services" | same. The 2022 version said "competitive research" outright |
| **Google Gemini** (**VERIFIED**, updated 2026-04-28) | "develop **models** that compete" | **NO** on that clause. The live risk is the separate sentence: "attempt to reverse engineer, extract or replicate any component of the Services" |
| **Fish Audio** (**VERIFIED**, but last updated 2024-08-18) | "develop **models** that compete" | **NO** on plain text. Output ownership is not addressed at all, which is its own gap |
| **BFL / FLUX** (**VERIFIED**, effective 2026-08-01) | "train, distill or fine-tune any other **AI models**" | **NO. Cleanest text in the set.** No competing-services clause, no benchmarking clause |

Three more facts the founder needs before spending anything.

- **REPORTED but decisive if true:** OpenAI's Services Agreement carries a "Permitted Exception"
  allowing Output to be used to "develop artificial intelligence models primarily intended to
  categorize, classify, or organize data (e.g., embeddings or classifiers), as long as such models are
  not distributed or made commercially available to third parties." Read plainly it permits private
  study and **excludes a commercial detector**, because that is distribution to third parties. It is
  also framed entirely around "models", which a rule set is not. **This is the single most
  consequential sentence in the whole legal picture and it could not be verified.** Counsel should
  pull it from a browser.
- **Midjourney is out on a separate ground.** **REPORTED** that its terms forbid using "automated tools
  to access, interact with, or generate Assets", and it has no API. Scripted bulk corpus generation
  breaches the terms regardless of what is done with the images.
- **PlayHT is gone.** Both domains fail DNS; the team was acquihired by Meta 2025-07-12 and the
  platform terminated 2025-12-31. Remove it from the founder's list.

**Enforcement reality, and it changes the risk calculus.** No lawsuit was found in which a model
provider sued an AI-detection vendor over a competing-model or reverse-engineering clause. The most
provoked test of that clause, OpenAI versus DeepSeek in early 2025, produced **no case**: the accounts
were banned. **The realistic downside is losing an API account and the corpus behind it, not being
sued.** But the founder will have clicked "I agree" on every one of these, which puts him at the
*hiQ v. LinkedIn* pole (consent judgment 2022-12-08, $500,000 plus a permanent injunction and
source-code destruction) rather than the *Meta v. Bright Data* pole. And *Thomson Reuters v. Ross
Intelligence*, where fair use was **rejected** for a non-generative analytical downstream use, is on
appeal in the Third Circuit (No. 25-2153, argued 2026-06-11, undecided). That is structurally the
closest live case to detector-building. **Any plan should be robust to an affirmance**, which in
practice means: keep per-provider corpora separable so losing one account does not destroy the work.

The paper to hand an attorney: Henderson and Lemley, "The Mirage of Artificial Intelligence Terms of
Use Restrictions", arXiv 2412.07066, forthcoming *Indiana Law Journal*.

### 6.3 Cost

Cheaper than the licensing problem, which is the argument for self-generation.

**Images, per thousand:** flux-schnell on Replicate $3; gpt-image-2 low or gpt-image-1-mini $5;
flux-dev $25; Stability Core $30; Midjourney Standard $30 for a month of Relax (but see the automation
clause); gemini-2.5-flash-image $39; gpt-image-2 high $165. **VERIFIED** that OpenAI no longer
publishes a flat per-image table and meters images as output tokens, and that DALL-E 2 and 3 are no
longer listed. **VERIFIED** that Imagen 4 was marked deprecated with a shutdown of 2026-08-17, which
is nine days before this document.

**Speech, per 500,000 characters, roughly nine to ten hours:** Google Cloud TTS **$0**, because
**REPORTED** its stacking monthly free tiers exceed that volume; OpenAI tts-1 $7.50; Fish Audio $7.50;
tts-1-hd $15. ElevenLabs would be $25 to $50 on PAYG, and is excluded on terms.

**A study corpus adequate to promote every candidate in section 5 costs well under $200.** Cost is not
the constraint. Terms and preprocessing are.

### 6.4 Storage: derived features and a hash, never the files

This is not a close call, and four independent constraints all point the same way.

1. `packages/provenance/src/artifact.ts:9-12` already states the policy: "THE ARTIFACT IS THE STORED
   THING, NOT THE MEDIA ... The pixels and the samples are never retained: this package never reads
   them in the first place." A `MediaArtifact` is a few kilobytes of parsed structure that is
   re-scorable against a later corpus.
2. Copyright. A generated image's ownership is assigned to the founder by most of these terms, but a
   real-photograph negative corpus is somebody else's work, and `CONTRIBUTING.md` already sets the bar:
   licensed originals from named photographers.
3. Privacy. `privacy-steward` owns the no-egress guarantee, and speech is the most sensitive artifact
   this product will ever be handed. A repository of voices is a liability with no upside.
4. The ToS analysis above is materially easier if no vendor Output is retained as a dataset.
   ElevenLabs clause (l) is about a "dataset", and the safest posture is not to have one.

**So: store the ingested `MediaArtifact` plus a SHA-256 of the source bytes, and keep the bytes out of
the repository entirely.** That is the same contract `scripts/capture-code-corpus.mjs` already uses,
which clones into a gitignored `.corpus-cache/` and stores the SCAN rather than the source.

The one place this loses something and it must be said: an artifact captured under schema v1 cannot
answer a question a later parser would have asked, and `asMediaArtifact` correctly refuses to replay
across a schema bump. So a study whose whole point is to discover which bytes matter has to keep the
bytes reachable while it is running. **The resolution: bytes live in a gitignored local cache with a
manifest of hashes committed, so the corpus is reproducible by whoever holds the cache and nothing
third-party enters git.** Nothing in this arrangement phones home, and `scripts/check-no-egress.mjs`
stays at its baseline of 0 unapproved sites.

---

## 7. The pipeline, through the existing promotion path

There is no new pipeline. This is the existing one from `docs/agents/HQ.md`, with the corpus study
attached at stage 1 and one addition at stage 3.

**Stage 1, observation.** The study replaces the JSONL observation sink as the source of candidates.
The sink records what fired on real scans; a study records what a controlled population contains.
Those are different inputs to the same stage and both feed stage 2. **Both are subject to the same
rule: an observation is not a rule and never becomes one automatically.**

**Stage 2, candidate.** `corpus/candidates/<id>.json`, validated by `assertWellFormedCandidate`, which
refuses a candidate without a specific non-empty `falsePositiveNote`. Section 5 supplies drafts. Note
the existing hard requirement: `support.observations` must equal `support.days.length`, so the count
and its evidence are two independent statements that can disagree, and **five distinct observations is
the floor** (`MIN_SUPPORTING_OBSERVATIONS`). A study of ten generated files is not five observations
of a pattern; it is one observation of ten files. The steward should say so.

**Stage 3, review, plus one addition.** `corpus-steward` on the merits and `false-positive-hunter`
adversarially, never one alone. **The addition this document proposes: an EVIDENCE-CLASS gate.** Every
candidate above carries a tag of MEASURED, VERIFIED, REPORTED or INFERRED, and a REPORTED or INFERRED
candidate may not be promoted at all. It goes back for measurement. This is not a new principle; it is
`CONTRIBUTING.md`'s "make the fixture the real thing" and the `counter.anti-spam-plumbing` lesson
turned into a gate, and it exists because **two of the eight candidates above (C3 NovelAI, C6 gap
grid) would otherwise ship on a PyPI package description and an inference.**

**Stage 4, promotion.** The steward writes the `falsePositiveNote` themselves rather than copying the
candidate's. A positive fixture and a mutated one differing in exactly ONE thing, **and every literal
in both grepped against the producer that emits it.** `since` set to the next corpus version, and the
version bumped in the same commit, with `apps/web/lib/corpus.json`, the gauntlet pool and the backtest
baseline all regenerated. Negative corpora re-run.

**Stage 5, the ratchet.** `node scripts/check-corpus-version.mjs`. Current baseline: 6 corpora, 104
rules, all digests matching the lock, recorded drift 12 (L-11).

### 7.1 The backtest question, answered honestly

The brief asks how a proposed rule's true and false positive rate gets measured, and what the minimum
evidence bar is. The honest answer has three parts and the first is uncomfortable.

**Today, it cannot be measured, and the repository says so.** `npm run backtest` replays 76 labelled
entries, of which every media member is a CONSTRUCTED file. `CONTRIBUTING.md`: "The three media
corpora are STRUCTURAL, not real-world, and nothing computed over them is a false-positive rate." So
the backtest is a REGRESSION gate, not a measurement instrument. It fails on exactly two things, which
is the right design: a human negative moving up a band or over the base rate, and a generated positive
falling a band.

**The consequence for section 5's rules is specific.** Every existing media rule reads a DECLARATION,
so a structural corpus is a faithful test of it: a constructed file that declares
`trainedAlgorithmicMedia` exercises the rule exactly as a real one would. **That is not true of a
single new rule in section 5.** A canonical dimension, a TTS tuple, a leading silence, a gap grid: all
of these are properties of a real population, and a constructed fixture for one is a fixture that
agrees with its author. **A structural corpus can prove a container-shape rule fires. It cannot say
anything about how often it is wrong.**

**So the minimum bar, which is a real cost and should be quoted as one:**

1. **A generated positive set the founder produces**, at least fifty files per generator family, under
   permissive terms only (BFL, Fish, Google, self-hosted SDXL), stored as artifacts plus hashes.
   Label basis: the founder made it, which is the strongest provenance any corpus member can have and
   is stronger than `CONTRIBUTING.md`'s bar for a captured positive.
2. **A human negative set that clears the existing published bar**, which is the expensive half:
   named authorship, substantial pre-2022 history, an institution behind it, and crucially
   **UNMODIFIED originals**, because what survives a re-save is the entire subject. RAISE is the
   obvious candidate and is non-commercial, so it cannot be it. **This is a licensing job with a cost
   and it is the real blocker on the whole programme.**
3. **The negative set must include the population most likely to be falsely accused**, and
   `image-detection-reality.md` already names it as unmeasured by anybody: computational photography
   and AI-denoise output (Lightroom Denoise, DxO DeepPRIME, Topaz, phone Night Mode), plus human
   digital illustration and 3D renders. That document calls it "plausibly our biggest false-positive
   source" and "cheap to measure. Do it first." Section 5's C1 fires on dimensions, and a 3D render at
   an SDXL bucket size is exactly the artifact that would be libelled.
4. **Only then is a rate publishable**, and only computed by the harness at test time against a named
   corpus on the version being shipped, per `packages/core/test/no-claims.test.ts`.

**Until step 2 exists, every rule in section 5 should ship with a weight that assumes it is wrong more
often than we can prove**, which is what the low weights and the 0.12 family cap encode. That is the
same answer `stream-consistency` already reached, and reaching it twice independently is a reason to
believe it.

---

## 8. Coverage gaps to publish on `/method`

Publishing these is a feature. `detector-coverage` owns the list. Drafted in the register the page
already uses.

- **It cannot check any invisible watermark.** SynthID, AudioSeal, VideoSeal, Stable Signature,
  TrustMark and the AWS marks are all either detected by a neural network, which this product does not
  ship, or by a call to the vendor, which this product does not make. A file carrying every one of
  them reads to us exactly like a file carrying none.
- **It does not verify a Content Credential's signature.** It finds the box and says so. Everything
  inside an unverified box is a string somebody put in a file, and we decline to read it as provenance.
- **If it ever does verify one, it will not check revocation.** Signature and hard-binding validation
  work offline against a trust list we would ship as a dated snapshot. Certificate revocation needs a
  network call we do not make, and a stale trust list makes us say "untrusted" about something valid
  rather than the other way round.
- **It cannot see a manifest that was stored in the cloud rather than in the file.**
- **It reads no pixels and no waveform for content.** Every published pixel-domain and
  frequency-domain method ends in a trained classifier, and independent measurement puts those at or
  near chance on the transform most likely to reach us. We would rather report nothing than report a
  number we cannot re-derive.
- **It abstains entirely on a re-encoded or screenshotted file**, and that is most files. A screenshot
  replaces the encoder, resamples the pixels, strips the metadata and destroys the hard binding, all
  at once.
- **Its audio measurements need a decoder that is not installed by default**, so on most files it
  reports that nothing was measured rather than that nothing was found.
- **It has no rule for dictation software.** Wispr Flow and its kind produce human speech as text, so
  any tell is in prose, and the only prose signal we could find is a conjunction of absences that
  would fire on careful writing. We decline to guess.
- **Its generator tables go stale in one direction.** A generator that changes its output sizes stops
  being caught quietly. OpenAI has already done this: gpt-image-2 replaced a three-size enum with any
  multiple of sixteen.
- **It does not name a generator.** Several signals would support a guess. We report what the file
  declares and what we measured, and never which product we think made it.

---

## 9. What the founder must provide

**Accounts and budget, in priority order.** Nothing here has been signed up for and nothing spent.

1. **Nothing, for the three repairs in section 5.** R1, R2 and R3 need no corpus, no account and no
   money. They are the highest-value items in the document and they are pure engineering.
2. **Roughly $50 to $100 of image generation**, on the providers whose terms are model-limited on
   their face: **BFL / FLUX** (cleanest text in the set), **Google Gemini** image, and self-hosted
   **SDXL / ComfyUI / A1111**, which involves no vendor terms at all and covers the three signatures
   already in the table plus the proposed NovelAI one. **Not Midjourney**, whose terms forbid the
   automation this requires and which has no API.
3. **Roughly $10 of speech generation**, on **Google Cloud TTS** (likely $0 inside the stacked free
   tiers), **OpenAI TTS** and **Fish Audio**. **Not ElevenLabs.**
4. **An `ffprobe` sweep over the results.** One command settles the entire unverified half of section
   4.4, which is what these vendors actually leave in a container.
5. **The real human negative corpus**, which is the blocker and is a licensing job rather than a
   coding job. Licensed, UNMODIFIED originals from named photographers, plus the computational
   photography and AI-denoise population named in `image-detection-reality.md`.

**Legal sign-off, three items for counsel and only three.**

1. **Pull `openai.com/policies/services-agreement` in a browser** and read the "Permitted Exception".
   It returned 403 to every automated fetch. Read plainly it permits classifier development from
   Output but conditions it on non-distribution, which a commercial detector is not. Whether a
   non-model rule set is inside the restriction at all is a separate and better argument. **This is
   the single most consequential unverified sentence in the document.**
2. **Confirm the ElevenLabs read.** This document and `transcribe.ts` both conclude ElevenLabs Output
   cannot enter the corpus, on clauses (j) and (l) of the 2026-08-17 use policy. Confirm that is
   right, because it is the one place a provider's text plainly reaches non-model analysis, and it is
   already shaping code.
3. **Decide the retention posture.** The recommendation is artifacts plus hashes with bytes in a
   gitignored cache, which keeps every vendor's Output out of anything describable as a dataset.
   Confirm that reading before any generation happens.

---

## 10. What I could not verify

Stated plainly, per the house rule, and none of it is decoration.

**Blocked outright.** Every `openai.com/policies/*` page (403). `docs.midjourney.com` and
`midjourney.com` (403). Adobe's legal pages (four timeouts). The OpenAI C2PA help article (403). The
Adobe Firefly manifest structure.

**Asserted from a doc or a secondary source, never run.**

- That the COSE_Sign1 `x5chain` header carries the signer chain inside the file. **The entire offline
  C2PA verification argument rests on this and no page stating it was opened.**
- The NovelAI PNG key set (C3). From a PyPI package and an ImageMagick discussion.
- The Google IPTC `Credit = "Made with Google AI"` string (C4).
- The SDXL bucket list and the Recraft size enum (C1).
- Midjourney's dimension tables, and Midjourney's current terms.
- That TTS output is typically free of descriptive metadata. **This is half of C2's conjunction and it
  is unmeasured.**
- Whether `gen.elevenlabs-tsse` can fire on any real file, i.e. whether ElevenLabs writes that tag at
  all.
- Whether anything writes IPTC `computationalCapture`, which is what would make the section 2.2 counter
  gap bite.
- Per-platform C2PA stripping behaviour. Sources contradict each other on LinkedIn and several are
  conflicted vendors.
- The Stability `invisible-watermark` DWT-DCT question, which would be the only model-free watermark
  in the field.

**Inferred, with no source at all.** The zlib FLEVEL discriminator (C9, rejected). The gap-grid
quantisation signal (C6), which is the most interesting idea in the document and has the weakest
support. The Wispr Flow text characterisation.

**Not attempted.** I did not run `npm test` or `npm run backtest` in this pass, because this pass
changed no code. The three fast gates were run and match their baselines: roster 14 agents across 6
departments; 6 corpora, 104 rules, all digests matching the lock, drift 12; egress 271 files, 20 sites,
0 unapproved. `git status --porcelain` is clean apart from this file. The two measurement scripts in
section 2 were written to a temporary directory outside the repository and left nothing in the tree.
