# @slop/detectors-image

Provenance-first image detection. It reads what a file declares about itself and nothing else.

## What it can honestly claim

- **A validated Content Credential declares a trained-algorithmic source.** The producer's own
  signed record. The strongest thing this product can cite.
- **A metadata field declares an IPTC digital source type.** Unsigned, so weaker, still a
  declaration.
- **A text chunk, XMP property or IPTC field names a tool with no manual path.** A Stable
  Diffusion web UI `parameters` chunk, a ComfyUI node graph, an anchored product name in a
  creator-tool field.
- **The container's own writer field names one of those tools.**
- **A named external detector reported a watermark.** This build ships no such detector, so this
  only fires when a caller supplies a result.
- **Counter-evidence:** a signed capture assertion, a full camera metadata set including a
  MakerNote, a multi-step hand-edit history, a pristine container with an intact credential.

Every one of those cites a **byte offset** you can open the file at.

## What it cannot claim, and will not be extended to

Anything about the pixels. There is no classifier, no frequency analysis, no noise residual, no
upsampling detector, and no model narrating why an image "looks" generated. `evidenceKind` is
`"provenance"`, never `"deterministic"` — that word is reserved for a fact a reader re-reads in
a browser or an editor, and a metadata field is a declaration somebody made.

The reason is measurement, not taste. From `image-detection-reality.md`: off-the-shelf open
detectors sit at coin-flip on in-the-wild content; independent testing found a shipping tool
calling six of twenty award-winning photojournalism images machine-made; a real photograph took
third place in the AI category of a contest judged by people from the NYT, Getty and Christie's.
And the human cost is documented: an illustrator was permanently banned from a community over a
hundred-hour commission, offered his PSD and process files, and was told "I don't believe you."

A test in this package stringifies every rule's `detect` body and fails if it mentions a
content-analysis concept. That is the guard against somebody helpfully adding "just a small
frequency check" later.

## The two abstentions, and how often they happen

| Outcome | Code | When |
|---|---|---|
| `inconclusive` | `artifact_re_encoded` | The file arrived re-encoded, resampled or screenshotted. No rule runs and no score is produced. |
| `inconclusive` | `no_declared_provenance` | The gate was open, every rule ran, and the file declared nothing in either direction. |

**This detector abstains far more often than it speaks, on purpose.** The abstention rate is
computed by `npm test` and by `npm run backtest` against the corpus each run actually used, and
printed. It is the headline metric for this package.

At the time of writing, on the structural corpus in `src/fixtures/corpus.ts`, roughly a third of
members produce no score: about a fifth for re-encoding and about a tenth for silence. Do not
quote that from this file — run the suite, which prints the number for the corpus and the rules
you actually have.

## The corpus, and what it is not

`src/fixtures/corpus.ts` is **structural, not photographic**. Nobody's camera produced those
bytes and **no number computed over it is a false-positive rate.** Its members are real files
built to the container specifications, labelled by what each one *declares* — which is exactly
what this detector reads, so it is a faithful test of the detector even though it is not a
sample of the world.

**A real negative corpus does not exist yet, and building one is a licensing job rather than a
coding job.** It needs licensed originals from named photographers, *unmodified*, because the
whole subject here is what survives a re-save, and every large freely available image set has
been through a pipeline that stripped the fields under test. Inventing plausible-looking
fixtures and calling them photographs would be the same category of dishonesty this product is
built against. So it was not done, and **the detector ships abstaining by default** as the
correct posture for a detector with no real corpus behind it.

## Inputs

`file` and `artifact` (a stored scan, replayed). Not `media-url`: this detector reads bytes it
is handed and has no retrieval path. See `@slop/provenance/fetch-policy.ts`.

## Usage

```ts
import { imageDetector, ingestImage, analyzeImageArtifact, IMAGE_CONFIG } from "@slop/detectors-image";
import { buildReport } from "@slop/core";

const artifact = ingestImage(bytes, { locator: "upload.jpg", mediaType: "image/jpeg" });
const report = buildReport([analyzeImageArtifact(artifact, { kind: "file", path: "upload.jpg", mediaType: "image/jpeg" })], {
  config: IMAGE_CONFIG,
});

if (report.status !== "assessed") {
  // Branch on the CODE, not on the absence of a score. `inconclusive` is not a low score and
  // `not_assessed` is not a clean bill of health.
  console.log(report.abstention.map((a) => `${a.code}: ${a.detail}`));
}
```
