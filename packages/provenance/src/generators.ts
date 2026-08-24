/**
 * Known-generator signatures, and the bar a signature has to clear to be in here.
 *
 * THE BAR: the tool wrote the marker ITSELF, into a DEFINED FIELD, to say what it is. A
 * reader with a hex editor sees the same string we do. Nothing in this table is a heuristic,
 * a name-similarity match, or a statistic.
 *
 * What that excludes, deliberately:
 *  - Filename patterns. `DALLE_2026-01-01.png` is a string a person typed.
 *  - Aspect ratios, resolutions, "looks like a 1024x1024". Not declarations.
 *  - Model-name substrings anywhere in the file. A prompt that MENTIONS Midjourney is a
 *    prompt, and an XMP comment that says "not made with AI" contains "made with AI".
 *  - Anything about pixels.
 *
 * A signature firing means: this file declares that this tool touched it. It does not mean
 * the artifact is machine-produced. Several entries below are editors that a person drives
 * by hand all day, and they are in the table because the DECLARATION is the observation.
 * The rule layer decides what a declaration is worth, and it separates "this tool only
 * produces trained-algorithmic output" from "this tool is a paintbrush".
 */

import type { MetadataRecord } from "./metadata.js";

/** What the presence of this tool's marker actually licenses us to say. */
export type GeneratorClass =
  /**
   * The tool's ONLY output is trained-algorithmic media. A declaration from one of these is
   * the strongest deterministic evidence available in this package.
   */
  | "generative-only"
  /** A tool with both generative and manual paths. A declaration says a tool, not a method. */
  | "mixed"
  /** An ordinary editor, camera app or transcoder. Presence says nothing about origin. */
  | "editor-or-transcoder";

export interface GeneratorSignature {
  readonly id: string;
  readonly tool: string;
  readonly klass: GeneratorClass;
  /** The field the marker lives in, named so a reader can go and look. */
  readonly field: string;
  /**
   * Exact match against a normalised field value, or an anchored pattern. Never a bare
   * substring search across the whole file.
   */
  readonly match: (fieldName: string, value: string) => boolean;
  /** Public, citable statement of why this is deterministic. */
  readonly basis: string;
}

const eqName = (...names: string[]) => (fieldName: string): boolean =>
  names.some((n) => n.toLowerCase() === fieldName.toLowerCase());

export const GENERATOR_SIGNATURES: readonly GeneratorSignature[] = [
  {
    id: "gen.sd-webui-parameters",
    tool: "Stable Diffusion web UI",
    klass: "generative-only",
    field: "PNG tEXt:parameters",
    match: (fieldName, value) =>
      eqName("parameters")(fieldName) &&
      /\bSteps:\s*\d+/.test(value) &&
      /\bSampler:\s*\S/.test(value) &&
      /\bCFG scale:\s*[\d.]+/.test(value),
    basis:
      "AUTOMATIC1111 and its forks write the full generation call into a PNG tEXt chunk keyed `parameters`, in a " +
      "fixed `Steps: / Sampler: / CFG scale: / Seed:` layout. All three keys are required together: the metadata " +
      "layer flattens newlines for display, so anchoring on a line start would have matched nothing at all.",
  },
  {
    id: "gen.comfyui-workflow",
    tool: "ComfyUI",
    klass: "generative-only",
    field: "PNG tEXt:prompt / workflow",
    match: (fieldName, value) =>
      eqName("prompt", "workflow")(fieldName) && /"class_type"\s*:/.test(value) && /"inputs"\s*:/.test(value),
    basis:
      "ComfyUI serialises the executed node graph into PNG tEXt chunks keyed `prompt` and `workflow`. The JSON " +
      "carries `class_type` and `inputs` keys that are the tool's own graph format.",
  },
  {
    id: "gen.invokeai-metadata",
    tool: "InvokeAI",
    klass: "generative-only",
    field: "PNG tEXt:invokeai_metadata",
    match: (fieldName) => eqName("invokeai_metadata", "sd-metadata", "invokeai_graph")(fieldName),
    basis: "InvokeAI writes its generation record into a PNG tEXt chunk under its own namespaced key.",
  },
  {
    id: "gen.firefly-creator-tool",
    tool: "Adobe Firefly",
    klass: "generative-only",
    field: "XMP:CreatorTool / EXIF:Software",
    match: (fieldName, value) =>
      /creatortool|software|originatingprogram/i.test(fieldName) && /^adobe firefly\b/i.test(value.trim()),
    basis: "Adobe Firefly writes its product name into the creator-tool field of the XMP it emits.",
  },
  {
    id: "gen.dalle-openai-tag",
    tool: "OpenAI image API",
    klass: "generative-only",
    field: "XMP:CreatorTool / PNG tEXt:Software",
    match: (fieldName, value) =>
      /creatortool|software/i.test(fieldName) && /^(openai|dall[·∙.\- ]?e)\b/i.test(value.trim()),
    basis: "The value is an anchored product name in a creator-tool field, written by the producing service.",
  },
  {
    id: "gen.gemini-image-tag",
    tool: "Google image generation",
    klass: "generative-only",
    field: "XMP:CreatorTool",
    match: (fieldName, value) =>
      /creatortool|software/i.test(fieldName) && /^(google )?(imagen|gemini|nano banana)\b/i.test(value.trim()),
    basis: "An anchored product name in a creator-tool field. Google also applies SynthID, handled separately.",
  },
  {
    id: "gen.elevenlabs-tsse",
    tool: "ElevenLabs",
    klass: "generative-only",
    field: "ID3v2:TSSE / RIFF:ISFT / XMP:CreatorTool",
    match: (fieldName, value) =>
      /tsse|isft|software|creatortool/i.test(fieldName) && /^elevenlabs\b/i.test(value.trim()),
    basis:
      "An anchored product name in a writer field the producing service filled in. The field list spans the three " +
      "places an audio file can carry one, because a signature that only knew the ID3 spelling would match in an " +
      "MP3 and silently miss the identical declaration in a WAVE.",
  },
  {
    id: "gen.photoshop-generative",
    tool: "Adobe Photoshop (generative fill declared)",
    klass: "mixed",
    field: "XMP:HistorySoftwareAgent",
    match: (fieldName, value) =>
      /agent|history/i.test(fieldName) && /adobe photoshop/i.test(value) && /generative/i.test(value),
    basis:
      "Photoshop records each edit step in `xmpMM:History` with the software agent that performed it. A step " +
      "whose agent names the generative feature is the editor declaring which tool touched the pixels.",
  },
  {
    id: "gen.lavf-transcode",
    tool: "an ffmpeg-family transcoder",
    klass: "editor-or-transcoder",
    field: "ISO-BMFF:©too / ID3v2:TSSE",
    match: (fieldName, value) => /too|swr|tsse|isft|software/i.test(fieldName) && /^(lavf|lavc|ffmpeg)\b/i.test(value.trim()),
    basis:
      "libavformat writes `Lavf<version>` into the QuickTime encoder atom. Every ffmpeg-family transcode leaves " +
      "it, which makes it a re-encode fingerprint rather than an origin one.",
  },
  {
    id: "gen.handbrake-transcode",
    tool: "HandBrake",
    klass: "editor-or-transcoder",
    field: "ISO-BMFF:©too",
    match: (fieldName, value) => /too|swr/i.test(fieldName) && /^handbrake\b/i.test(value.trim()),
    basis: "HandBrake writes its name and version into the QuickTime encoder atom.",
  },
  {
    id: "gen.lame-encoder",
    tool: "LAME",
    klass: "editor-or-transcoder",
    field: "LAME",
    match: (fieldName, value) => fieldName === "LAME" && /^LAME/i.test(value.trim()),
    basis: "The LAME tag inside the Xing/Info frame is written by the encoder and names its build.",
  },
];

export interface GeneratorHit {
  readonly signature: GeneratorSignature;
  readonly fieldName: string;
  readonly value: string;
  readonly locator: string;
}

/** Match the table against a metadata record. Pure, ordered, and every hit carries its locator. */
export function matchGenerators(metadata: MetadataRecord): readonly GeneratorHit[] {
  const hits: GeneratorHit[] = [];
  for (const signature of GENERATOR_SIGNATURES) {
    for (const field of metadata.fields) {
      if (!signature.match(field.name, field.value)) continue;
      hits.push({ signature, fieldName: field.name, value: field.value, locator: field.locator });
      break; // one hit per signature; repeats are the same declaration seen twice
    }
  }
  return hits;
}

export const generatorById = (id: string): GeneratorSignature | undefined =>
  GENERATOR_SIGNATURES.find((s) => s.id === id);
