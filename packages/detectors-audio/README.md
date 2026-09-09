# @slop/detectors-audio

Provenance and container forensics for audio, plus — where a local decoder is installed and
switched on — a small set of **measurements of the file**, fenced as probabilistic and capped
below everything else.

It reads the container, the tags, an XMP packet and a Content Credential slot. With
`SLOP_AUDIO_LISTEN=1` it also measures how quiet the pauses are, how much their lengths vary,
where the energy stops, and whether the header agrees with what actually decoded.

It never characterises a speaker.

---

## Read this first: voice cloning is contractually closed to us

This is not an engineering limitation and no amount of work removes it.
`market-check-reproduction.md` records the terms: ElevenLabs Instant Voice Cloning requires a
minute of audio and a consent attestation, Professional cloning requires identity verification,
and the terms state plainly that **even with a person's consent you may not clone somebody
else's voice.** The reproduction side of this product is therefore permanently closed to voice
cloning.

That has a direct consequence for detection:

> The honest audio offering is **provenance, container forensics, and a measured cost of
> producing a synthetic read of the same text**. It is never "this is a copy of a named
> person's voice."

That second sentence is not merely unsupported. It is the single most defamatory sentence this
product could form, it is the one with a criminal tool-liability statute attached in at least
one state (the legal risk memo (private), the Tennessee ELVIS Act's tool prong), and we could
not substantiate it even if we wanted to, because we cannot legally build the comparison that
would be needed to test it.

**So it is unsayable by construction, not merely unsaid.** The claim guard in `@slop/provenance`
bans "cloned voice", "voice clone of", "clone of ", "is the voice of", "sounds like " and
"impersonat". `test/corpus.test.ts` proves the guard rejects five attempts to write the sentence
and passes **every string this package can emit**, including every sentence the listening layer
added, the reading notes, the transcription strings and the findings a measurement rule
actually produces.

### Why no cost figure appears in this package

Under *In re Workado* a stated performance or price figure is a substantiation-bearing claim,
held at the moment it is made and every time it is repeated. The reproduction pipeline measures
the cost per run, against the actual text and the actual prices of the day, and shows it with a
receipt. A constant in a source file would be stale within a month and unsubstantiated on day
one. A test asserts that none of this package's strings contains one.

---

## Should we incorporate an existing MCP? The tool survey

The question was asked directly, so here is the direct answer, with the terms line drawn
explicitly.

| Capability | Tool | Licence / terms | Cost | Zero keys? | Verdict |
|---|---|---|---|---|---|
| Container and stream forensics: codec, sample rate, channel layout, bitrate, declared vs decoded duration, writer chain | **ffprobe** | LGPL/GPL, local binary | free | **yes** | **Shipped.** `listen/ffprobe.ts` |
| Levels and silences: noise floor, peak, RMS, pause positions and lengths | **ffmpeg `astats` + `silencedetect`** | LGPL/GPL, local binary | free | **yes** | **Shipped.** |
| Spectral ceiling: energy remaining above a set of probe frequencies | **ffmpeg `highpass` + `volumedetect`** | LGPL/GPL, local binary | free | **yes** | **Shipped**, lossless files only |
| Transcription, local | **whisper.cpp** / **faster-whisper** | MIT, open weights, runs offline | free | **yes** | **Recommended, not wired in.** The output is ours; see `transcribe.ts` |
| Transcription, vendor | **ElevenLabs MCP `speech_to_text`** | See the terms line below | per minute | no (API key) | **Fenced.** May serve a user; may never touch our corpus |
| Voice isolation | **ElevenLabs MCP `isolate_audio`** | Same terms | per minute | no | Not used. It *edits* the artifact under examination |
| Synthesis, speech-to-speech, voice library | **ElevenLabs MCP `text_to_speech`, `speech_to_speech`, voice search** | Same terms, plus the cloning bar above | per character | no | Not used. Reproduction-side only, and cloning is closed |
| Watermark detection | **AudioSeal** (Meta) | MIT, open weights and detector | free | **yes** | **Named as a probe, not wired in.** The one scheme we genuinely could run |
| Watermark detection | **SynthID for audio** (Google) | Detector not public | n/a | no | Listed as `not_checked`, with the reason |
| Synthetic-speech classification | **Resemble Detect**, **Pindrop Pulse** | Commercial API. Audio must be uploaded, and the standard terms carry no right to resell the verdict | per call, quoted per contract | no | **Rejected.** A probability we cannot reproduce, over audio we would have to upload |

### Is the ElevenLabs MCP reachable right now?

**No.** Checked this session: a `ToolSearch` sweep of the gateway returns no
`mcp__gateway__elevenlabs__*` tool. `speech_to_text`, `isolate_audio`, `text_to_speech`,
`speech_to_speech` and the voice-library tools are all absent from the live tool list. So it is
not an option today regardless of the terms question, and nothing in this package depends on it
being restored.

### The terms line, drawn precisely

ElevenLabs' terms bar using the Services **or Output** to "research and develop" a competing
product, and to "train, fine-tune, develop, **test**, or improve" any AI or machine-learning
model. The sharp edge is the word *test*.

- **Probably allowed:** transcribing **one artifact a user submitted**, to report back to that
  user what their own file said. That is the service used for its advertised purpose, on the
  user's own content, with the output delivered to the user rather than retained.
- **Not allowed:** putting that output into our corpus, our calibration set, our baseline, or
  any threshold-fitting run. That is "develop, test, or improve", and it does not matter that
  no gradient is involved — those are not machine-learning terms of art in that sentence.
- **Not allowed, and easy to miss:** reading their transcript, or their classifier's verdict,
  to see whether ours agrees. That is "research and develop" a competing product on their
  Output, however casually it is done. ElevenLabs ships an AI Speech Classifier of its own, so
  the competing-product limb is live rather than theoretical.

**This is enforced in code, not remembered.** `transcribe.ts` gives every transcript a
`TranscriptSource`, and `mayEnterCorpus` is a function of that provenance rather than a flag a
caller sets. `assertMayEnterCorpus` throws on vendor output. A test proves both halves.

The same line is why there is no committed audio corpus. See below.

---

## What it can honestly claim

**Declarations** (evidence kind `provenance`, the strong half):

- **The container's writer field names a synthesis service.** For audio this is the workhorse:
  `RIFF LIST/INFO/ISFT` in a WAVE, `ID3v2 TSSE` in an MP3, `XMP CreatorTool` in either.
- A validated Content Credential declaring a trained-algorithmic source, or a capture.
- An IPTC digital source type in an XMP `_PMX` chunk.
- A named external detector reporting a watermark (none ships with this build).
- Counter-evidence: a multi-step hand-edit history in real audio applications, a validated
  capture assertion.
- **Two different encoders named in one file.** The strongest re-encode fingerprint in this
  container family, and it closes the gate.

**Measurements** (evidence kind `probabilistic`, family capped at 12% of the scale, silent
unless somebody listened):

- `stream.silence-has-no-room-in-it` — the quiet passages measure below the self-noise of a
  microphone at working gain, with pauses long enough to attribute it to.
- `stream.pauses-are-uniform` — the pause lengths vary by less than a coefficient of variation
  of 0.35, across four or more pauses.
- `stream.spectral-ceiling-below-the-container` — **lossless files only**: a cliff of 30 dB or
  more between two adjacent probe bands, both below Nyquist, with nothing above it.
- `stream.declared-duration-disagrees-with-decoded` — the header and the samples disagree.
- `stream.room-tone-in-the-pauses` — **counter-evidence**, weighted harder than any signal in
  the family, and it bypasses the family caps. In a category whose documented failures are all
  false accusations, the exonerating measurement gets the bigger number.

One shared rule is **excluded**: `prov.camera-capture-metadata` reads an EXIF MakerNote and a
RIFF file has no EXIF. Excluded explicitly rather than carried and left permanently silent.

## What it will never grow

Speaker embeddings, similarity scores, voiceprints, vocoder-artifact statistics, spectrogram
features, cepstral coefficients, formant statistics, or a classifier trained to put a service's
name to a file. The line, stated in `scope.ts` and enforced by a test over every rule's own
source: **a measurement whose subject is the FILE is allowed; a statistic whose subject is a
PERSON is not.** The ban pattern in that test is itself mutation-checked, because the first
version of it ended in a word boundary and could not match `speakerEmbedding`.

`evidenceKind` is `"provenance"` for a declaration-only result and downgrades to
`"probabilistic"` the moment one measurement fires — the whole result, not just that line. It is
never `"deterministic"`, and the downgrade is one-way. A test proves both directions.

## Listening is off by default

`SLOP_AUDIO_LISTEN=1`, exactly that string and nothing else. No truthy-ish parsing, no
auto-detection because ffmpeg happens to be on PATH. With it unset:

- `listenToAudio` returns without touching the file system.
- The artifact carries a `not_attempted` reading with a sentence saying so.
- Every measurement rule is still **evaluated** and fires nothing, so "we listened and heard
  nothing" and "we never listened" never print the same way.
- Coverage stays above the floor, so a caller with no decoder still gets a report.

With it set and no ffmpeg installed, the reading comes back `tool_unavailable` with a sentence
saying that is a fact about the machine rather than about the file. Never a throw, never a
silent zero. The whole test suite runs with no decoder, no key and no network.

## The re-encoding gate outranks all of it

The gate in `@slop/provenance` runs **before every rule, including the ones that listen**. A
noise floor measured after a platform transcode is a measurement of the platform's encoder. A
laundered artifact produces `inconclusive`, a coded reason, and no number.

That has a cost, and it is worth stating rather than hiding: mp3 delivered by a speech
synthesis API is typically muxed by libavformat, which is indistinguishable from an ffmpeg pass
over somebody else's file. Both carry `Lavf` in the writer field, the gate cannot tell them
apart, and it therefore abstains on both. Abstaining is the honest answer, and it means this
detector will say nothing at all about a large class of synthetic speech.

## Abstention

| Outcome | Code |
|---|---|
| `inconclusive` | `artifact_re_encoded` — two different encoders named, or another rewrite indicator |
| `inconclusive` | `no_declared_provenance` — nothing declared and nothing measured, in either direction |

An untagged PCM recording that nobody listened to — the most ordinary audio file there is —
abstains, and that is the correct outcome. A plain MP3 is *readable* rather than gated: lossy is
not the same as re-encoded, and its tags survive intact, so gating every MP3 would abstain on
most of the audio anyone will ever submit.

The rate is computed and printed by `npm test` and `npm run backtest` against the corpus in
`src/fixtures/corpus.ts`. **It is an abstention rate. It is not an accuracy figure and it is not
a false-positive rate**, and the next section is why.

## There is no corpus of real recordings, and that is a refusal

The measurement rules have thresholds, and a threshold wants a labelled corpus. There is not
one, for two reasons that point in opposite directions:

1. **No provenanced human side.** A negative here has to be audio somebody can vouch for:
   known maker, known microphone, known room. Speech scraped off the internet is not that, and
   a corpus whose "human" label means "we found it somewhere" is the corpus the research
   literature keeps embarrassing itself with.
2. **The synthetic side we can reach is contractually unusable.** There is first-party
   text-to-speech output within arm's reach of this repository, with its voice, model and
   settings all recorded. Fitting a threshold against it is "develop, test, or improve" under
   the vendor's terms. See the terms line above.

So the shipped corpus is **constructed files and constructed readings**, every member says so
in its own provenance string, and `AUDIO_CORPUS_REFUSAL` says it in one exported sentence a UI
can print. A reading is a row of numbers, so writing one by hand fakes nothing — but no case in
here claims to be a recording of anybody, and none is.

If you hold audio you may lawfully use for this, `scripts/capture-audio-corpus.mjs` builds a
local corpus from it and prints the abstention accounting. It demands a provenance sentence per
directory and writes to a gitignored path, so a measurement of somebody's recording cannot be
committed by accident.

## Two bugs this package found by pointing at real files

Recorded because both were invisible failures of exactly the kind this repository is organised
around, and both were found by running against real audio rather than against fixtures.

1. **One encoder, read as two.** The Xing/Info writer field is nine bytes, so a library whose
   name is longer appears in full in the ID3 tag and truncated in the frame. `Lavf60.16.101`
   against `Lavf` was reported as `encoder_chain_conflict` — the heaviest indicator the gate
   has — on every file a speech API delivers that way. Fixed with a prefix comparison in
   `sameWriter`, which still calls `ElevenLabs` against `LAME3.100` a conflict.
2. **`-inf` dropped an entire level record.** `Noise floor dB: -inf` is what a decoder prints
   for literal digital silence, which is the single most interesting case for the rule that
   reads it. The first regex could not express it, so the level parse returned null and the
   report simply had no levels in it. Nothing crashed and nothing warned. Fixed with a finite
   sentinel that survives the JSON round trip a replayed artifact goes through, plus a flag so
   nothing downstream mistakes the sentinel for a measurement.

A third was caught before it shipped: probe bands **above Nyquist** return a meaningless figure,
and the genuine cliff down to them would have flagged every file ever recorded at a lower sample
rate. Fenced in the probe and again in the rule, so a replayed artifact captured before the
fence existed does not fire it either.
