# @slop/provenance

The shared backbone for the image, video and audio detectors. It answers one question from
container structure alone:

> What did this file declare about itself, and are these even the original bytes?

No pixels are read. No audio samples are decoded. No model is called. There is no network in
this package and no API key anywhere near it.

## The two things to read first

### 1. `reencode.ts` — the gate

Before any rule runs, the artifact is assessed for signs that it was re-encoded, resampled,
screenshotted or platform-processed. If it was, **no rule runs, no finding is produced, and the
result carries an `artifact_re_encoded` abstention that turns into `status: "inconclusive"`
with the score withheld.**

This is the most important code in these packages, and it exists because of a measurement
rather than a preference. `image-detection-reality.md` collects the independent work: detectors
that score well on benchmarks fall to chance under ordinary JPEG quality settings; a mild
resize-plus-JPEG takes a leading method's separation apart; recompressing generated images to a
few hundred kilobytes flipped most of them to "real" in a shipping commercial tool. And a
screenshot — the most likely thing a user will hand us — replaces the encoder, resamples the
pixels, strips EXIF and XMP and destroys any C2PA hard binding, all at once. All four detection
families degrade simultaneously and nobody has published a solution.

Every indicator is an observation about the CONTAINER, with a byte offset: a JFIF marker, a
quantisation table on the libjpeg quality ladder, an `©too` atom naming a transcoder, an exact
phone-screen geometry, two encoders named in one file. None of them is about content and none is
evidence of origin in either direction. A screenshot of a photograph and a screenshot of a
generated image trip the gate identically. That is the point: the gate does not know which it is
looking at, only that it can no longer tell.

Two calibrations worth knowing about, both of which were wrong on the first attempt and are now
pinned by tests:

- **The JPEG quality inverse is elementwise, not on the table sum.** Inverting the sum returns a
  plausible quality for *any* table, so a camera's bespoke tables came back as "quality 85 on
  the standard ladder" and the gate abstained on pristine originals.
- **1920x1080, 1280x720, 3840x2160 and 1080x1920 are NOT screen geometries.** They are the
  standard capture resolutions of every phone and camera made this decade. Including them would
  have abstained on essentially all real video while claiming to have spotted a screenshot.

And one deliberate non-trip: a **lossless** re-save is not treated as laundering. The measured
degradation is caused by the lossy codec, not by the act of re-saving, and abstaining on every
metadata-free PNG would refuse a large class of artifacts that can still be read honestly.

### 2. `c2pa.ts` — absence is not evidence

`ABSENCE OF PROVENANCE IS NOT EVIDENCE OF GENERATION` is the single most common fallacy in this
category, and it is encoded here as a function with a test rather than a comment:

```ts
mayContributeGenerationEvidence(state)  // true only for "verified"
absenceIsNotEvidence(record)            // the rebuttal, printed with the finding
```

`absent`, `unparseable` and `invalid` all contribute nothing. `invalid` is the subtle one: a
manifest that fails to validate means the chain of custody is broken, which is a reason to trust
the *manifest* less, not a reason to trust an accusation more.

This build **locates** C2PA boxes and does not verify them. A manifest's contents are only read
when a caller hands in a result from a real verifier. There is no code path from "we saw a box"
to "the manifest says so".

## What else is in here

| Module | What it does |
|---|---|
| `container/` | Real byte-level parsers: JPEG markers, PNG chunks (CRC-verified), ISO-BMFF boxes, RIFF chunks, MPEG audio frames plus ID3 and the LAME tag. Every observation carries an offset. |
| `metadata.ts` | EXIF / XMP / IPTC normalised into one record, including the IPTC `DigitalSourceType` the EU AI Act ecosystem is converging on. |
| `generators.ts` | Known-generator signatures. The bar: the tool wrote the marker itself, into a defined field. No filename patterns, no aspect ratios, no name-similarity matching. |
| `watermark.ts` | Tri-state probes. `not_detected` produces no finding, ever; only a `present` result from a *named* detector is citable. |
| `claims.ts` | The forbidden-phrase and attribution guard. Every reader-facing string in all four packages is constructed through it. |
| `fetch-policy.ts` | Which URLs we will retrieve. Platform URLs get a typed `cannot_fetch` refusal; there is no scraper. |
| `fixtures/synth.ts` | Real files built byte by byte, so every fixture goes through the same parser a user's upload does. |

## Extending it

Adding a generator signature is a small change with a high bar. It must be a marker the tool
**writes itself, into a defined field**, that a reader can see in a hex editor. A signature that
matches a name mentioned in prose is not a signature; there is a test that proves the current
table matches none of four such decoys.

Adding a laundering indicator is a bigger change than adding a rule, because it decides when the
product goes silent in both directions. Weight it against the pristine markers, give it a real
byte locator, and add it to both halves of `test/gate.test.ts`: the laundered cases it should
trip, and the pristine ones it must not.

## What this package will never grow

A pixel read, a frequency transform, a noise residual, an embedding, a classifier, or a model
asked to narrate why something looks a certain way. The last one is specifically forbidden: the
Tow Center documented models "exploring latent space" to invent a fluent, specific, wrong reason,
and a fluent wrong citation is worse than no citation because it makes a false verdict feel
forensically established.
