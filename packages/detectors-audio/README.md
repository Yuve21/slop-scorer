# @slop/detectors-audio

Provenance and declared-writer markers for audio. It reads the container, the tags, an XMP
packet and a Content Credential slot. **It never analyses the sound.**

## Read this first: voice cloning is contractually closed to us

This is not an engineering limitation and no amount of work removes it.
`market-check-reproduction.md` records the terms: ElevenLabs Instant Voice Cloning requires a
minute of audio and a consent attestation, Professional cloning requires identity verification,
and the terms state plainly that **even with a person's consent you may not clone somebody
else's voice.** The reproduction side of this product is therefore permanently closed to voice
cloning.

That has a direct consequence for detection:

> The honest audio offering is **provenance, plus a measured cost of producing a synthetic read
> of the same text**. It is never "this is a copy of a named person's voice."

The second half is not merely unsupported. It is the single most defamatory sentence this
product could form, it is the one with a criminal tool-liability statute attached in at least one
state (`publicity-defamation-risk.md`, the Tennessee ELVIS Act's tool prong), and we could not
substantiate it even if we wanted to — because we cannot legally build the comparison that would
be needed to test it.

**So it is unsayable by construction, not merely unsaid.** The claim guard in `@slop/provenance`
bans "cloned voice", "voice clone of", "clone of ", "is the voice of", "sounds like " and
"impersonat", and `test/corpus.test.ts` proves the guard rejects five attempts to write the
sentence and passes every string this package can actually emit. `src/scope.ts` states the scope
in words, exported as `AUDIO_SCOPE_STATEMENT` and `AUDIO_OUT_OF_SCOPE` so a UI can print it.

### Why no cost figure appears in this package

Because under *In re Workado* a stated performance or price figure is a substantiation-bearing
claim, held at the moment it is made and every time it is repeated. The reproduction pipeline
measures the cost per run, against the actual text and the actual prices of the day, and shows
it with a receipt. A constant in a source file would be stale within a month and unsubstantiated
on day one. A test asserts that none of this package's strings contains one.

## What it can honestly claim

- **The container's writer field names a synthesis service.** For audio this is the workhorse:
  `RIFF LIST/INFO/ISFT` in a WAVE, `ID3v2 TSSE` in an MP3, `XMP CreatorTool` in either. Synthesis
  services fill it in with their own product name.
- A validated Content Credential declaring a trained-algorithmic source, or a capture.
- An IPTC digital source type in an XMP `_PMX` chunk.
- A named external detector reporting a watermark (none ships with this build).
- Counter-evidence: a multi-step hand-edit history in real audio applications, a validated
  capture assertion.
- **The LAME tag versus the ID3 encoder tag.** Two encoders named in one file is the strongest
  re-encode fingerprint in this container family, and it closes the gate.

One shared rule is **excluded**: `prov.camera-capture-metadata` reads an EXIF MakerNote and a
RIFF file has no EXIF. Excluded explicitly rather than carried and left permanently silent.

## What it will never grow

Vocoder or codec artifact statistics, spectrogram features, speaker embeddings, similarity
scores. The argument that rules out pixel forensics applies at least as strongly here:
perceptual coding discards exactly the fine structure such a statistic would read, and almost
all audio that reaches anybody has been perceptually coded at least once. A similarity number
about a person is an accusation with a decimal point on it.

A test stringifies every rule's `detect` body and fails if it mentions a signal-analysis
concept. `evidenceKind` is `"provenance"` and there is no path by which it becomes anything else.

## Abstention

| Outcome | Code |
|---|---|
| `inconclusive` | `artifact_re_encoded` — two encoders named, or another rewrite indicator |
| `inconclusive` | `no_declared_provenance` — nothing declared, in either direction |

An untagged PCM recording — the most ordinary audio file there is — abstains, and that is the
correct outcome. A plain MP3 is *readable* rather than gated: lossy is not the same as
re-encoded, and its tags survive intact, so gating every MP3 would abstain on most of the audio
anyone will ever submit.

The rate is computed and printed by `npm test` and `npm run backtest` against the corpus in
`src/fixtures/corpus.ts`.

## The corpus

Structural: constructed RIFF and MPEG audio files whose label states what each declares. **It is
not a recording of anybody and no rate computed over it is a false-positive rate.** It is
deliberately the smallest of the three, and that is accurate rather than incomplete: this
modality has the fewest honest signals available to it, for the reasons above.
