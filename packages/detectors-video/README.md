# @slop/detectors-video

The image detector's backbone at ISO base media files, plus container and encoder fingerprints
and exactly one probabilistic signal.

## The platform-URL decision, documented because it is a decision

**Handed a TikTok, Instagram Reels, YouTube Shorts, X, Facebook or similar URL, this package
returns a typed `cannot_fetch` outcome. It does not download.**

```ts
import { reportForPlatformUrl } from "@slop/detectors-video";

const report = reportForPlatformUrl("https://www.tiktok.com/@someone/video/7300000000000000000");
report.status;                       // "not_assessed"
report.score;                        // null
report.abstention[0].code;           // "cannot_fetch"
report.abstention[0].detail;         // names the constraint and asks for the file
```

Two reasons, and the second is the one that makes it easy:

1. **Those platforms prohibit automated retrieval of member content.** A product whose whole
   pitch is "we tell you what is verifiable" cannot have a scraper in it, because then every
   receipt it prints rests on an act it would not want printed on the receipt.
2. **What a download returns is the platform's own transcode** — and the re-encoding gate
   already refuses to score re-encoded bytes. We would be breaking an agreement to obtain an
   artifact we had already committed to abstaining on.

The refusal is a full `Report` with `status: "not_assessed"`, so a consumer branches on the same
field it branches on for everything else and can never render it as a clean bill of health. A
URL on a host we have no objection to *also* abstains: this build has no fetcher at all, and
pretending otherwise would be worse than saying so. The host list lives in
`@slop/provenance/fetch-policy.ts`; adding to it is a one-line change with a test.

## What it can honestly claim

Everything the image detector can, read out of an MP4 or MOV instead:

- A validated Content Credential declaring a trained-algorithmic source or a capture.
- An IPTC digital source type, or a creator-tool property, in an `XMP_` box.
- **The `©too` / `©swr` encoder atom.** For video this is the workhorse. Every ffmpeg-family
  transcode leaves `Lavf<version>` there, which makes it a re-encode fingerprint rather than an
  origin one, and it is what closes the gate on nearly every platform download.
- `ftyp` brands and the movie timescale. A phone writes its own brands and a `©mak`/`©mod` atom;
  a bare `isom`/`mp42` file with a 90000 timescale and neither is the download fingerprint.

One shared rule is **excluded** from this corpus: `prov.camera-capture-metadata` reads an EXIF
MakerNote and no ISO base media file has one. It is excluded explicitly with a stated reason
rather than carried and left permanently silent, because a rule that fires on nothing anywhere
is indistinguishable from a rule that broke.

## The one probabilistic signal, and its fence

Audio/video desynchronisation. It is the only probabilistic line in this entire product, and
every one of these is enforced by a test:

- It is **supplied by an external measurer**, never computed here. This package does not decode
  video; doing so would mean a codec dependency, a frame pipeline and eventually a landmark
  model, which is the road to the pixel-forensic detector the research rules out.
- A measurement with **nobody named as its source does not fire it.** An unsourced number is not
  evidence.
- Its title begins **`Probabilistic signal:`** and its rebuttal begins `PROBABILISTIC.`, so it is
  visible as a statistic to a reader who never opens the documentation.
- Its family cap is the smallest in the config and its weight is the smallest positive weight in
  the corpus. A silent file plus a large measured drift still lands in the lowest band.
- A result containing it is **automatically downgraded** from `evidenceKind: "provenance"` to
  `"probabilistic"`. The downgrade is computed from the findings, so a future probabilistic rule
  cannot be added without the label following it.

Why it is allowed at all when nothing else probabilistic is: it measures a *relationship between
two streams*, not the appearance of one of them. There is no model looking at a face and forming
an opinion. And the rebuttal says plainly what else produces it — variable frame rate, a rounded
timescale, a dubbed track, a broadcast capture, a slow phone.

## Abstention

| Outcome | Code |
|---|---|
| `inconclusive` | `artifact_re_encoded` — a transcoder named itself, or the container is a bare generic profile with no capture atoms |
| `inconclusive` | `no_declared_provenance` — nothing declared, in either direction |
| `not_assessed` | `cannot_fetch` — a URL we will not retrieve |

Video abstains **more** than image does, and that is expected: almost nothing arrives as
recorded. The rate is computed and printed by `npm test` and `npm run backtest` against the
corpus in `src/fixtures/corpus.ts`.

## The corpus

Structural, like the image one: constructed ISO base media files whose label states what each
declares. **It is not footage, and no rate computed over it is a false-positive rate.** A real
video negative corpus has the same licensing problem as the image one and is not built here.
