/**
 * Watermarks: detect-if-present, NEVER infer-if-absent.
 *
 * Every watermark scheme worth naming here (SynthID, C2PA durable soft bindings, IPTC-linked
 * invisible marks) shares two properties that decide the shape of this module:
 *
 *  1. Detection requires the SCHEME OWNER'S detector. SynthID's is not public; a C2PA soft
 *     binding needs the matching binding algorithm. We can be told a result; we cannot
 *     compute one. So a probe here is TRI-STATE, and `not_checked` is the default.
 *  2. Absence proves nothing, and unusually strongly. Saberi et al. (ICLR 2024) prove an
 *     evasion/spoofing tradeoff that is fundamental rather than an engineering gap:
 *     diffusion purification drops watermark AUROC below chance-adjacent levels, and
 *     UnMarker (IEEE S&P 2025) is a universal attack needing no detector feedback. A
 *     screenshot removes most schemes for free. `not_detected` therefore never produces a
 *     finding, and the type below makes that structural rather than a matter of care.
 *
 * The inverse risk is real too: the same literature shows real images can be perturbed to
 * carry a mark. So a positive detection is evidence about the FILE carrying a mark, phrased
 * that way, and it is not proof about who made what.
 */

export type WatermarkScheme =
  | "synthid"
  | "c2pa-soft-binding"
  | "iptc-invisible"
  | "provider-specific"
  /**
   * AudioSeal (Meta, MIT-licensed detector and published weights), and the reason it is
   * named separately from `provider-specific`: it is the only scheme in this list whose
   * DETECTOR we could actually run, because both the model and the code are open. So a
   * `not_checked` here means "we have not wired it in", not "we cannot".
   *
   * It still detects only its own mark, which is applied by AudioSeal-based pipelines and by
   * essentially nobody else, so a negative from it is worth exactly as little as any other.
   */
  | "audioseal"
  /**
   * SynthID for audio, which is a DIFFERENT thing from SynthID for images and is listed
   * separately because conflating them would let an image-side result read as an audio one.
   * Google applies it to its own speech and music output; the detector is not public.
   */
  | "synthid-audio";

export type WatermarkOutcome =
  /** The scheme's detector ran and reported a mark. */
  | "present"
  /**
   * The scheme's detector ran and reported nothing. This produces NO finding. Not "probably
   * not generated", not counter-evidence, not a clean bill. Nothing.
   */
  | "not_detected"
  /** No detector for this scheme was available in this run. The default. */
  | "not_checked";

export interface WatermarkProbe {
  readonly scheme: WatermarkScheme;
  readonly outcome: WatermarkOutcome;
  /** Who ran the detector. Required for `present`: an unsourced positive is a rumour. */
  readonly detector: string | null;
  /** Where in the artifact, for a detector that reports a location. */
  readonly locator: string | null;
  /** The detector's own message, verbatim. */
  readonly note: string;
}

export const notChecked = (scheme: WatermarkScheme, why: string): WatermarkProbe => ({
  scheme,
  outcome: "not_checked",
  detector: null,
  locator: null,
  note: why,
});

/**
 * The default probe set for any artifact this build sees.
 *
 * All three are `not_checked` and each one says why in a sentence a user can read. That is
 * the honest state of the world for a build with no vendor detector wired in, and printing
 * it is better than the alternative, which is a report that silently looks like it checked.
 */
export const DEFAULT_WATERMARK_PROBES: readonly WatermarkProbe[] = [
  notChecked(
    "synthid",
    "SynthID detection is only available through Google's own tooling; this build has no detector for it, so no " +
      "conclusion was drawn either way.",
  ),
  notChecked(
    "c2pa-soft-binding",
    "A C2PA durable soft binding needs the matching binding algorithm and a manifest store lookup. Neither was " +
      "performed here.",
  ),
  notChecked(
    "provider-specific",
    "Several image and audio services apply their own invisible marks with private detectors. None was queried.",
  ),
];

/**
 * The audio schemes, appended for an audio artifact rather than carried by every one.
 *
 * Kept separate from the default set on purpose. A JPEG's report should not list two audio
 * watermark schemes as unchecked: a probe row for something that could not apply to the
 * artifact in front of us is noise that trains a reader to skip the section, and this section
 * is the one place the product says out loud what it did not do.
 */
export const AUDIO_WATERMARK_PROBES: readonly WatermarkProbe[] = [
  notChecked(
    "audioseal",
    "AudioSeal is the one scheme here whose detector is openly published, so this build could run it and has not: " +
      "no detector is wired in. It would only ever find AudioSeal's own mark, which is applied by AudioSeal-based " +
      "pipelines and by almost nothing else.",
  ),
  notChecked(
    "synthid-audio",
    "SynthID for audio is applied by Google to its own speech and music output and its detector is not public, so " +
      "this build cannot check for it. This is the audio scheme and is not the same mark as SynthID for images.",
  ),
];

/** Only a `present` probe from a named detector may produce a finding. Enforced, not asked. */
export function citableWatermarks(probes: readonly WatermarkProbe[]): readonly WatermarkProbe[] {
  return probes.filter((p) => p.outcome === "present" && !!p.detector && !!p.locator);
}

/**
 * The rebuttal that rides with any watermark statement, including silence.
 */
export const WATERMARK_ABSENCE_NOTE =
  "A watermark that is not detected is not a finding. Published attacks remove these marks without access to the " +
  "detector, an ordinary screenshot removes most of them by accident, and no mainstream scheme is applied by more " +
  "than a handful of producers in the first place. In audio the point is sharper still: a re-encode to a lower " +
  "bitrate, a time stretch, or playing a file through a speaker into a microphone are all documented ways of " +
  "losing an audio mark, and every one of them is something an ordinary person does by accident.";
