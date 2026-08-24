/**
 * The audio artifact: the shared five probes plus one.
 *
 * The sixth is `stream`, and it is the only place in this product where a measurement of
 * CONTENT enters an artifact. It carries what a local decoder measured — a noise floor, the
 * lengths of the pauses, the energy left above a set of probe frequencies, the declared
 * duration against the decoded one — each with the command that produced it.
 *
 * Three things about it are structural rather than a matter of care:
 *
 *  - IT IS EMPTY BY DEFAULT. `ingestAudio` never listens. A reading only exists if a caller
 *    asked for one and a decoder was on the host, so the ordinary artifact carries
 *    `NOT_ATTEMPTED` and every rule that reads it stays silent.
 *  - IT HOLDS NUMBERS, NOT SAMPLES. The waveform is never retained, for the same reason the
 *    pixels never are: a few floats are re-scorable against a later corpus with none of the
 *    storage, copyright or privacy exposure of keeping somebody's voice.
 *  - IT SAYS NOTHING ABOUT A PERSON. There is no embedding, no speaker statistic and no
 *    similarity score in the type, so there is nothing here from which such a claim could be
 *    assembled. See `scope.ts` for the line and why it is drawn exactly there.
 */

import {
  assessLaundering,
  ingestMedia,
  MEDIA_PROBE_WEIGHTS,
  mediaProbes,
  synthWav,
  verifiedManifest,
} from "@slop/provenance";
import type { FixtureChange, MediaArtifact, MediaProbeId, WatermarkProbe } from "@slop/provenance";
import { AUDIO_WATERMARK_PROBES, DEFAULT_WATERMARK_PROBES } from "@slop/provenance";
import { NOT_ATTEMPTED } from "./listen/reading.js";
import type { StreamReading } from "./listen/reading.js";
import { streamProbeRow } from "./stream.js";

export interface AudioArtifact extends MediaArtifact {
  readonly modality: "audio";
  /** What a local decoder measured, or the stated reason there is no measurement. */
  readonly stream: StreamReading;
}

export type AudioProbeId = MediaProbeId | "stream";

export const AUDIO_PROBE_WEIGHTS: Readonly<Record<AudioProbeId, number>> = {
  ...MEDIA_PROBE_WEIGHTS,
  /**
   * Weight 2, below `container`, `metadata` and `laundering`.
   *
   * Coverage is a statement about how much of what we PLANNED to read came back, so this
   * weight decides how much a scan without a reading is allowed to look complete. Set at 2
   * of 14: a listen-less scan reads 12/14 of the plan and stays above `minCoverage` 0.7, so
   * the ordinary no-decoder run still produces a report. Set much higher and every caller
   * who has not installed ffmpeg would be abstained on for a reason about our configuration
   * rather than about their file.
   */
  stream: 2,
};

export interface IngestAudioOptions {
  readonly locator: string;
  readonly mediaType?: string | null;
  readonly capturedAt?: string;
  readonly watermarks?: readonly WatermarkProbe[];
  /**
   * A reading a caller already took, from `listenToAudio`.
   *
   * Passed in rather than taken here, because `ingestMedia` is pure and synchronous and it
   * is going to stay that way: a listen shells out to a decoder, and an ingest that could
   * silently spawn a subprocess is an ingest nobody can reason about.
   */
  readonly stream?: StreamReading;
}

/**
 * The watermark probe list for audio: the shared three plus the two audio-only schemes.
 *
 * Printed as `not_checked` with a reason each, which is the honest state of a build with no
 * vendor detector wired in. AudioSeal is the interesting one and the note says so: its
 * detector is openly published, so its absence here is a thing we have not done rather than
 * a thing we cannot do.
 */
export const AUDIO_DEFAULT_WATERMARKS: readonly WatermarkProbe[] = [
  ...DEFAULT_WATERMARK_PROBES,
  ...AUDIO_WATERMARK_PROBES,
];

export function ingestAudio(bytes: Uint8Array, options: IngestAudioOptions): AudioArtifact {
  const base = ingestMedia(bytes, {
    ...options,
    modality: "audio",
    watermarks: options.watermarks ?? AUDIO_DEFAULT_WATERMARKS,
  }) as MediaArtifact;
  const stream = options.stream ?? NOT_ATTEMPTED;
  return { ...base, modality: "audio", stream, probes: [...base.probes, streamProbeRow(stream)] };
}

/**
 * The neutral audio artifact: an uncompressed PCM recording with no tags at all.
 *
 * A bare WAVE is the honest neutral for this modality. It is what a recorder writes, it
 * declares nothing about itself, and this detector therefore has nothing to say about it —
 * which is the correct outcome and the most common one.
 */
export function neutralAudio(overrides: Partial<AudioArtifact> = {}): AudioArtifact {
  const bytes = synthWav({ sampleRate: 48_000, channels: 1, bitDepth: 24, seconds: 3 });
  const base = ingestAudio(bytes, {
    locator: "fixture://neutral.wav",
    mediaType: "audio/wav",
    capturedAt: "2026-08-23T00:00:00.000Z",
  });
  return { ...base, ...overrides };
}

/** An XMP packet in a real `_PMX` chunk, which is where XMP lives in a RIFF file. */
const xmpPacket = (body: string): string =>
  `<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?><x:xmpmeta xmlns:x="adobe:ns:meta/">` +
  `<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:xmp="http://ns.adobe.com/xap/1.0/" ` +
  `xmlns:xmpMM="http://ns.adobe.com/xap/1.0/mm/" xmlns:stEvt="http://ns.adobe.com/xap/1.0/sType/ResourceEvent#" ` +
  `xmlns:Iptc4xmpExt="http://iptc.org/std/Iptc4xmpExt/2008-02-29/"><rdf:Description>${body}` +
  `</rdf:Description></rdf:RDF></x:xmpmeta><?xpacket end="w"?>`;

const step = (agent: string): string => `<stEvt:softwareAgent>${agent}</stEvt:softwareAgent>`;

interface WavRecipe {
  readonly info?: Readonly<Record<string, string>>;
  readonly xmp?: string;
  readonly c2paChunk?: boolean;
}

/** Realise a semantic fixture change as a real WAVE file. */
export function audioVariant(base: AudioArtifact, change: FixtureChange): AudioArtifact {
  const rebuild = (recipe: WavRecipe): AudioArtifact => {
    const bytes = synthWav({
      sampleRate: 48_000,
      channels: 1,
      bitDepth: 24,
      seconds: 3,
      ...(recipe.info ? { info: recipe.info } : {}),
      ...(recipe.xmp ? { xmp: recipe.xmp } : {}),
      ...(recipe.c2paChunk ? { c2paChunk: true } : {}),
    });
    // `stream` is carried across, so a provenance fixture that rebuilds the bytes does not
    // silently discard a reading a caller took. The two halves of this artifact are
    // independent: changing a tag must not change what was measured, and vice versa.
    return {
      ...base,
      ...ingestAudio(bytes, { locator: base.source.locator, mediaType: "audio/wav", stream: base.stream }),
    };
  };

  switch (change.kind) {
    case "declare-generative-tool":
      return rebuild({ xmp: xmpPacket("<xmp:CreatorTool>ElevenLabs Turbo v2.5</xmp:CreatorTool>") });

    case "mention-tool-in-prose":
      return rebuild({
        xmp: xmpPacket("<xmp:CreatorTool>a read in the register people associate with ElevenLabs</xmp:CreatorTool>"),
      });

    case "declare-mixed-tool":
      return rebuild({ xmp: xmpPacket(step("Adobe Photoshop 26.0 (Generative Fill)")) });

    case "declare-plain-editor":
      return rebuild({ xmp: xmpPacket(step("Adobe Audition 25.0")) });

    case "declare-source-type":
      return rebuild({
        xmp: xmpPacket(
          `<Iptc4xmpExt:DigitalSourceType>http://cv.iptc.org/newscodes/digitalsourcetype/${change.value}</Iptc4xmpExt:DigitalSourceType>`,
        ),
      });

    case "hand-edit-history":
      return rebuild({
        xmp: xmpPacket(
          ["Pro Tools 2025.6", "Adobe Audition 25.0", "iZotope RX 11", "Logic Pro 11.1"]
            .slice(0, change.steps)
            .map(step)
            .join(""),
        ),
      });

    case "maker-note":
      // No EXIF exists in a RIFF file, which is why the capture-metadata counter is declared
      // inapplicable to audio rather than carried and left permanently silent.
      return rebuild({});

    case "strip-capture-metadata":
      return rebuild({});

    case "encoder":
      return rebuild({ info: { ISFT: change.value } });

    case "content-credential": {
      if (change.state === "none") return rebuild({});
      const withBox = rebuild({ c2paChunk: true });
      if (change.state === "unverified") return withBox;
      const record = verifiedManifest(withBox.c2pa.locator ?? "riff-wave:c2pa", withBox.c2pa.byteLength, {
        claimGenerator: change.claimGenerator,
        actions: [{ action: "c2pa.created", digitalSourceType: change.digitalSourceType }],
        assertionLabels: ["c2pa.actions"],
        hasIngredients: false,
      });
      return recompute({ ...withBox, c2pa: record });
    }

    case "watermark": {
      const watermarks: readonly WatermarkProbe[] =
        change.detector === null
          ? AUDIO_DEFAULT_WATERMARKS
          : [
              {
                scheme: "provider-specific",
                outcome: "present",
                detector: change.detector,
                locator: "whole file",
                note: "reported by an external detector supplied by the caller",
              },
              ...AUDIO_DEFAULT_WATERMARKS.filter((p) => p.scheme !== "provider-specific"),
            ];
      return recompute({ ...base, watermarks });
    }
  }
}

function recompute(artifact: AudioArtifact): AudioArtifact {
  const laundering = assessLaundering(artifact.container, artifact.metadata, artifact.c2pa);
  const probes = mediaProbes(artifact.container, artifact.metadata, artifact.c2pa, artifact.watermarks, laundering);
  // The stream row is appended rather than recomputed from the container: it describes what a
  // decoder measured, which no change to a tag can affect. Forgetting it here would drop the
  // probe silently and every stream rule would vanish from `rulesEvaluated` without a word,
  // which is precisely the failure the meta suite exists to catch.
  return { ...artifact, laundering, probes: [...probes, streamProbeRow(artifact.stream)] };
}
