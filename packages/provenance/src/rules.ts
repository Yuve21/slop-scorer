/**
 * The shared media corpus: ten rules, every one of them reading a DECLARATION.
 *
 * WHAT IS NOT IN HERE, and why the absence is the design
 *
 * There is no pixel-forensic rule. No frequency analysis, no noise-residual statistic, no
 * upsampling detector, no CLIP-space nearest neighbour, and above all no model narrating why
 * something "looks" a certain way. `image-detection-reality.md` closes off all of them for
 * this product: off-the-shelf detectors sit at coin-flip on in-the-wild content, they
 * collapse further under the exact transform our users will hand us, and the Tow Center
 * documented the specific failure mode of a model asked to explain its guess — it explores
 * latent space and invents a fluent, specific, wrong reason. A fluent wrong citation is
 * worse than no citation, because it makes a false verdict feel forensically established.
 *
 * So every rule below fires on something a producer WROTE INTO THE FILE, at an offset we
 * print. The strongest is a signed manifest; the weakest is a tool name in a text chunk.
 * None of them measures content, and the corpus is honest that this makes it narrow: it will
 * miss every artifact whose producer said nothing, which is most of them. Missing them is the
 * correct trade. The alternative is the thing that got a real war photograph called synthetic
 * within hours of being published.
 *
 * The rules are a FACTORY, generic over the artifact type, so the image, video and audio
 * corpora are the same ten rules at three type arguments rather than three copies that drift.
 * Fixtures are expressed as SEMANTIC changes ("declare a generative-only tool") which each
 * modality realises in its own real container, because an MP4 has nowhere to put a PNG text
 * chunk and a fixture that pretended otherwise would be testing a shape rather than a parser.
 */

import { ev } from "@slop/core";
import type { Evidence, Rule, RuleContext } from "@slop/core";
import { assertMediaSafe } from "./claims.js";
import { ABSENCE_IS_NOT_EVIDENCE, declaredCapture, declaredTrainedAlgorithmic, mayContributeGenerationEvidence } from "./c2pa.js";
import { GENERATOR_SIGNATURES, matchGenerators } from "./generators.js";
import type { MediaArtifact, MediaProbeId } from "./artifact.js";
import { citableWatermarks, WATERMARK_ABSENCE_NOTE } from "./watermark.js";

export const MEDIA_CORPUS_VERSION = "media-corpus-2026.09";

export type MediaRule<A extends MediaArtifact, P extends string> = Rule<A, P>;

/**
 * A semantic fixture change. Each modality implements every token against its own container.
 *
 * Naming them by MEANING rather than by field is what keeps the corpus shared. A token that
 * a modality cannot express is a compile error in that modality's `variant`, not a rule that
 * silently stops being exercised there.
 */
export type FixtureChange =
  /** A sidecar field naming a tool with no manual path. */
  | { readonly kind: "declare-generative-tool" }
  /** Prose that merely mentions a tool by name. Must never fire anything. */
  | { readonly kind: "mention-tool-in-prose" }
  /** An edit-history step naming a tool that has both manual and generative paths. */
  | { readonly kind: "declare-mixed-tool" }
  /** An edit-history step naming the same tool with no generative feature named. */
  | { readonly kind: "declare-plain-editor" }
  /** IPTC DigitalSourceType. */
  | { readonly kind: "declare-source-type"; readonly value: "trainedAlgorithmicMedia" | "digitalCapture" }
  /** Three or more edit-history steps in hand-driven applications. */
  | { readonly kind: "hand-edit-history"; readonly steps: number }
  /** Add or remove the vendor MakerNote block. */
  | { readonly kind: "maker-note"; readonly present: boolean }
  /** Remove every capture field: make, model, capture time, MakerNote. */
  | { readonly kind: "strip-capture-metadata" }
  /** The container's own writer field. */
  | { readonly kind: "encoder"; readonly value: string }
  /** A Content Credential box, optionally with a verifier's result attached. */
  | { readonly kind: "content-credential"; readonly state: "none" }
  | { readonly kind: "content-credential"; readonly state: "unverified" }
  | {
      readonly kind: "content-credential";
      readonly state: "verified";
      readonly claimGenerator: string;
      readonly digitalSourceType: string;
    }
  /** A positive watermark result from a named detector, or the default not-checked set. */
  | { readonly kind: "watermark"; readonly detector: string | null };

export interface FixtureKit<A extends MediaArtifact> {
  /** Rebuild the artifact from REAL BYTES with one semantic change applied. */
  readonly variant: (base: A, change: FixtureChange) => A;
  /**
   * Rules this modality's containers CANNOT express, with a stated reason.
   *
   * There is exactly one legitimate use and `prov.camera-capture-metadata` is it: that rule
   * reads an EXIF MakerNote, and no ISO-BMFF or RIFF file has one. Carrying it into those
   * corpora would leave a rule that fires on nothing, anywhere, forever — which is
   * indistinguishable from a rule that has gone stale, and is the failure the meta suite
   * exists to catch. Excluding it explicitly, with the reason recorded, keeps the difference
   * between "cannot apply here" and "quietly broken" visible.
   *
   * A test asserts the map is small and that every id in it is a real rule.
   */
  readonly inapplicable?: Readonly<Record<string, string>>;
}

const SINCE = MEDIA_CORPUS_VERSION;

/** Every reader-facing string in the corpus goes through the claim guard at module load. */
const say = assertMediaSafe;

export function provenanceRules<A extends MediaArtifact, P extends string>(
  probes: Readonly<Record<MediaProbeId, P>>,
  fixtures: FixtureKit<A>,
): readonly MediaRule<A, P>[] {
  const v = fixtures.variant;
  const inapplicable = fixtures.inapplicable ?? {};

  const all: readonly MediaRule<A, P>[] = [
    // ------------------------------------------------------------------ content credential
    {
      id: "prov.c2pa-declares-trained-algorithmic",
      family: "declared-provenance",
      title: "A verified Content Credential asserts a trained-algorithmic source",
      polarity: "signal",
      severity: "high",
      baseWeight: 3.2,
      maxHits: 3,
      requiresProbe: probes["content-credential"],
      phase: 1,
      since: SINCE,
      explanation: say(
        "The manifest attached to this file was validated by a verifier, and one of its action assertions declares " +
          "a digital source type in the trained-algorithmic family. That is the producer's own record of how the " +
          "file came to exist, written into a signed structure, and it is the strongest declaration this product reads.",
      ),
      falsePositiveNote: say(
        "A manifest states what the producer wrote and nothing more. It can describe a step that touched only part " +
          "of the frame, it can be carried forward from an ingredient, and it can be attached by anyone holding a " +
          "signing certificate. We report the declaration, not a conclusion about the work.",
      ),
      prevention: say(
        "This is the specification working as intended: a tool that declares its own source type is doing the right " +
          "thing. Nothing here needs preventing.",
      ),
      detect: (a): readonly Evidence[] => {
        if (!mayContributeGenerationEvidence(a.c2pa.state) || !a.c2pa.manifest) return [];
        const manifest = a.c2pa.manifest;
        return declaredTrainedAlgorithmic(manifest).map((action) =>
          ev("metric", a.c2pa.locator ?? "content-credential", `${action.action}, digitalSourceType=${action.digitalSourceType}`, {
            expected: "digitalCapture, or no such assertion at all",
            excerpt: `claim_generator: ${manifest.claimGenerator}`,
          }),
        );
      },
      fixtures: {
        positive: (base) => ({
          artifact: v(base, {
            kind: "content-credential",
            state: "verified",
            claimGenerator: "Adobe Firefly 1.0",
            digitalSourceType: "http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia",
          }),
        }),
        mutated: (base) => ({
          artifact: v(base, {
            kind: "content-credential",
            state: "verified",
            claimGenerator: "Leica M11-P",
            digitalSourceType: "http://cv.iptc.org/newscodes/digitalsourcetype/digitalCapture",
          }),
        }),
        extra: [
          {
            name: "a manifest box that was located but never verified",
            shouldFire: false,
            build: (base) => ({ artifact: v(base, { kind: "content-credential", state: "unverified" }) }),
          },
        ],
      },
    },

    {
      id: "prov.c2pa-declares-capture",
      family: "provenance-counter",
      title: "A verified Content Credential asserts a camera capture",
      polarity: "counter",
      counterScope: "global",
      severity: "info",
      baseWeight: -2.2,
      maxHits: 2,
      requiresProbe: probes["content-credential"],
      phase: 1,
      since: SINCE,
      explanation: say(
        "The validated manifest declares a digitalCapture source. A signed chain of custody back to a capture " +
          "device is the strongest counter-evidence in this product, and the regime taking shape around Article 50 " +
          "of the EU AI Act treats this field as the recognised signal, so a verdict contradicting it would be " +
          "indefensible.",
      ),
      falsePositiveNote: say(
        "A signed capture assertion covers the moment of capture. It does not follow the file through every later " +
          "step, and a manifest can be attached by anyone with a certificate, so this lowers the score rather than " +
          "closing the question.",
      ),
      detect: (a): readonly Evidence[] => {
        if (!mayContributeGenerationEvidence(a.c2pa.state) || !a.c2pa.manifest) return [];
        const manifest = a.c2pa.manifest;
        return declaredCapture(manifest).map((action) =>
          ev("metric", a.c2pa.locator ?? "content-credential", `${action.action}, digitalSourceType=${action.digitalSourceType}`, {
            excerpt: `claim_generator: ${manifest.claimGenerator}`,
          }),
        );
      },
      fixtures: {
        positive: (base) => ({
          artifact: v(base, {
            kind: "content-credential",
            state: "verified",
            claimGenerator: "Leica M11-P",
            digitalSourceType: "http://cv.iptc.org/newscodes/digitalsourcetype/digitalCapture",
          }),
        }),
        mutated: (base) => ({
          artifact: v(base, {
            kind: "content-credential",
            state: "verified",
            claimGenerator: "Adobe Firefly 1.0",
            digitalSourceType: "http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia",
          }),
        }),
      },
    },

    // ------------------------------------------------------------------------- sidecar tags
    {
      id: "prov.iptc-digital-source-type",
      family: "declared-provenance",
      title: "A metadata field declares a trained-algorithmic digital source type",
      polarity: "signal",
      severity: "high",
      baseWeight: 2.4,
      maxHits: 2,
      requiresProbe: probes.metadata,
      phase: 1,
      since: SINCE,
      explanation: say(
        "The IPTC DigitalSourceType property is the standard way for a producer to state, in metadata, which " +
          "family a file came from, and this one names a trained-algorithmic term. It is unsigned, so it is weaker " +
          "than the same statement inside a validated manifest, and it is still a declaration rather than a guess.",
      ),
      falsePositiveNote: say(
        "This property is unsigned and editable by anyone with a metadata tool, in either direction. It can also be " +
          "carried forward from an ingredient into a file whose visible content came from somewhere else entirely.",
      ),
      detect: (a): readonly Evidence[] => {
        const t = a.metadata.digitalSourceType;
        if (t !== "trainedAlgorithmicMedia" && t !== "compositeWithTrainedAlgorithmicMedia") return [];
        return [
          ev("metric", a.metadata.digitalSourceLocator ?? "metadata:DigitalSourceType", t, {
            expected: "digitalCapture, digitalArt, or no value at all",
          }),
        ];
      },
      fixtures: {
        positive: (base) => ({ artifact: v(base, { kind: "declare-source-type", value: "trainedAlgorithmicMedia" }) }),
        mutated: (base) => ({ artifact: v(base, { kind: "declare-source-type", value: "digitalCapture" }) }),
      },
    },

    {
      id: "prov.sidecar-declares-generative-tool",
      family: "declared-tooling",
      title: "A sidecar field names a tool whose only output is trained-algorithmic media",
      polarity: "signal",
      severity: "high",
      baseWeight: 2.6,
      maxHits: 3,
      requiresProbe: probes.metadata,
      phase: 1,
      since: SINCE,
      explanation: say(
        "A text chunk, an XMP property or an IPTC field names a tool from the signature table, and that tool has no " +
          "manual path: everything it emits is trained-algorithmic media. The marker was written by the tool itself " +
          "into a defined field, so a reader can open the file at the offset we print and see the same string.",
      ),
      falsePositiveNote: say(
        "Metadata is editable, so a field like this can be added to any file by anyone, and it can survive into a " +
          "later file assembled from several sources. It also disappears the instant the file is re-saved, which is " +
          "why its absence says nothing at all.",
      ),
      prevention: say(
        "A tool that fills in this field is doing the right thing. Stripping it to dodge a finding is the " +
          "behaviour this product exists to discourage.",
      ),
      detect: (a): readonly Evidence[] =>
        matchGenerators(a.metadata)
          .filter((h) => h.signature.klass === "generative-only")
          .filter((h) => !isContainerEncoderDeclaration(a, h.value))
          .map((h) =>
            ev("metric", h.locator, `${h.fieldName} names ${h.signature.tool}`, {
              excerpt: h.value.slice(0, 200),
              expected: "no tool declaration, or a tool that also has a manual path",
            }),
          ),
      fixtures: {
        positive: (base) => ({ artifact: v(base, { kind: "declare-generative-tool" }) }),
        mutated: (base) => ({ artifact: v(base, { kind: "mention-tool-in-prose" }) }),
      },
    },

    {
      id: "prov.sidecar-declares-mixed-tool",
      family: "declared-tooling",
      title: "A sidecar field names a tool that has both manual and generative paths",
      polarity: "signal",
      severity: "low",
      baseWeight: 0.9,
      maxHits: 2,
      requiresProbe: probes.metadata,
      phase: 1,
      since: SINCE,
      explanation: say(
        "An edit-history step names a tool whose generative feature and whose manual features are both used by " +
          "people all day. The declaration says which tool touched the file. It does not say which of that tool's " +
          "features did the work, and it is weighted accordingly.",
      ),
      falsePositiveNote: say(
        "Naming a tool is not naming a method. Every entry in this class has a hand-driven path far more commonly " +
          "used than the automated one, and an edit history records the application rather than the feature.",
      ),
      detect: (a): readonly Evidence[] =>
        matchGenerators(a.metadata)
          .filter((h) => h.signature.klass === "mixed")
          .map((h) => ev("metric", h.locator, `${h.fieldName} names ${h.signature.tool}`, { excerpt: h.value.slice(0, 200) })),
      fixtures: {
        positive: (base) => ({ artifact: v(base, { kind: "declare-mixed-tool" }) }),
        mutated: (base) => ({ artifact: v(base, { kind: "declare-plain-editor" }) }),
      },
    },

    // ---------------------------------------------------------------------- container level
    {
      id: "prov.encoder-declares-generative-tool",
      family: "declared-tooling",
      title: "The container's own writer field names a tool with no manual path",
      polarity: "signal",
      severity: "high",
      baseWeight: 2.2,
      maxHits: 1,
      requiresProbe: probes.container,
      phase: 1,
      since: SINCE,
      explanation: say(
        "Every container this product reads has one field reserved for the software that wrote the bytes: EXIF " +
          "Software in a JPEG, the encoder atom in an MP4, the ISFT chunk in a WAVE, the TSSE frame in an MP3. This " +
          "one names a service from the signature table whose whole output is trained-algorithmic media.",
      ),
      falsePositiveNote: say(
        "The writer field records the last tool to touch the container, which is not necessarily the tool that " +
          "produced the content inside it. It is also trivially editable and is stripped by most re-saves.",
      ),
      detect: (a): readonly Evidence[] => {
        const encoder = a.container.encoder;
        if (!encoder) return [];
        // Matched against the CANONICAL field name "Software" rather than the container's own
        // spelling. Every container reserves one field for the writer and they all spell it
        // differently ("EXIF:Software", "ISO-BMFF:©too", "RIFF:LIST/INFO/ISFT",
        // "ID3v2:TSSE"); matching the spelling would mean the same declaration fired in a JPEG
        // and silently did not in an MP4. The real field name is still what gets printed.
        const hit = GENERATOR_SIGNATURES.find((s) => s.klass === "generative-only" && s.match("Software", encoder.value));
        if (!hit) return [];
        return [
          ev("metric", `${a.container.format}:${encoder.field}`, `${encoder.field} = ${encoder.value}`, {
            expected: "a capture device, an ordinary editor, or no writer field at all",
            excerpt: hit.basis,
          }),
        ];
      },
      fixtures: {
        positive: (base) => ({ artifact: v(base, { kind: "encoder", value: "Adobe Firefly 1.0" }) }),
        mutated: (base) => ({ artifact: v(base, { kind: "encoder", value: "Capture One 23" }) }),
      },
    },

    // --------------------------------------------------------------------------- watermarks
    {
      id: "prov.watermark-detected",
      family: "watermark",
      title: "A named external detector reported a watermark in this file",
      polarity: "signal",
      severity: "high",
      baseWeight: 2.2,
      maxHits: 2,
      requiresProbe: probes.watermark,
      phase: 1,
      since: SINCE,
      explanation: say(
        "A watermark scheme's own detector was run against this file and reported a mark. We print which detector " +
          "said so, because a positive result with no named source is a rumour. This build ships no such detector, " +
          "so the rule only fires when a caller supplies one.",
      ),
      falsePositiveNote: say(
        `${WATERMARK_ABSENCE_NOTE} A positive result carries an inverse risk too: published work shows a file can be ` +
          "perturbed to carry a mark it never had, which makes this an observation about the file rather than about " +
          "anyone's conduct.",
      ),
      detect: (a): readonly Evidence[] =>
        citableWatermarks(a.watermarks).map((p) =>
          ev("metric", p.locator ?? p.scheme, `${p.scheme} reported present by ${p.detector}`, { excerpt: p.note }),
        ),
      fixtures: {
        positive: (base) => ({ artifact: v(base, { kind: "watermark", detector: "scheme owner's detector, v3" }) }),
        mutated: (base) => ({ artifact: v(base, { kind: "watermark", detector: null }) }),
      },
    },

    // ------------------------------------------------------------------------ counter rules
    {
      id: "prov.camera-capture-metadata",
      family: "provenance-counter",
      title: "The file carries the full metadata set a capture device writes",
      polarity: "counter",
      counterScope: "global",
      severity: "info",
      baseWeight: -1.4,
      maxHits: 3,
      requiresProbe: probes.metadata,
      phase: 1,
      since: SINCE,
      explanation: say(
        "A make, a model, a capture timestamp and a MakerNote block are all present. The MakerNote is the " +
          "interesting one: it is a vendor-private structure that a re-save discards and that no metadata editor " +
          "reconstructs, so its presence argues these bytes are close to what a device handed over.",
      ),
      falsePositiveNote: say(
        "All four fields can be copied from one file to another with ordinary tools, and a device writes them " +
          "around whatever it was pointed at, including a screen. This lowers the score; it settles nothing.",
      ),
      detect: (a): readonly Evidence[] => {
        const m = a.metadata;
        if (!m.hasMakerNote || !m.hasCaptureTime || !m.make || !m.model) return [];
        return m.fields
          .filter((f) => ["Make", "Model", "MakerNote", "DateTimeOriginal"].includes(f.name))
          .map((f) => ev("metric", f.locator, `${f.name} = ${f.value}`));
      },
      fixtures: {
        positive: (base) => ({ artifact: v(base, { kind: "maker-note", present: true }) }),
        mutated: (base) => ({ artifact: v(base, { kind: "maker-note", present: false }) }),
        extra: [
          {
            name: "a file with no capture metadata at all",
            shouldFire: false,
            build: (base) => ({ artifact: v(base, { kind: "strip-capture-metadata" }) }),
          },
        ],
      },
    },

    {
      id: "prov.hand-edit-history",
      family: "provenance-counter",
      title: "The edit history records several steps in hand-driven tools",
      polarity: "counter",
      counterScope: "global",
      severity: "info",
      baseWeight: -1.1,
      maxHits: 4,
      requiresProbe: probes.metadata,
      phase: 1,
      since: SINCE,
      explanation: say(
        "The history block lists three or more edit steps, each naming the application that performed it, and none " +
          "of them names a tool from the signature table. A multi-step history is a record of somebody working, and " +
          "it is not what a single call to a service leaves behind.",
      ),
      falsePositiveNote: say(
        "An edit history is metadata like any other: it can be copied, trimmed or written by hand, and a batch " +
          "process can lay down several steps with nobody touching anything.",
      ),
      detect: (a): readonly Evidence[] => {
        const steps = a.metadata.fields.filter((f) => f.name === "HistorySoftwareAgent");
        if (steps.length < 3) return [];
        if (matchGenerators(a.metadata).some((h) => h.signature.klass !== "editor-or-transcoder")) return [];
        return steps.map((f) => ev("metric", f.locator, `edit step by ${f.value}`));
      },
      fixtures: {
        positive: (base) => ({ artifact: v(base, { kind: "hand-edit-history", steps: 3 }) }),
        mutated: (base) => ({ artifact: v(base, { kind: "hand-edit-history", steps: 1 }) }),
      },
    },

    {
      id: "prov.pristine-original-with-credential",
      family: "counter-evidence",
      title: "Nothing in the container suggests a rewrite, and a Content Credential survived",
      polarity: "counter",
      counterScope: "global",
      severity: "info",
      baseWeight: -1.3,
      maxHits: 3,
      requiresProbe: probes.laundering,
      phase: 2,
      since: SINCE,
      explanation: say(
        "The re-encoding assessment found capture markers and an intact Content Credential box, and no indicator " +
          "that the bytes were rewritten. A credential does not survive a re-save, so its presence alongside camera " +
          "fields argues we are looking at something close to what the device wrote.",
      ),
      falsePositiveNote: say(
        "A credential box this build located and did not validate is a box, not a proof. All of these markers can " +
          `be assembled by a determined tool, and none of them speaks to what the file depicts. ${ABSENCE_IS_NOT_EVIDENCE}`,
      ),
      detect: (a, ctx: RuleContext): readonly Evidence[] => {
        // Phase 2: never argue with a declaration. If a rule in this run already found the
        // producer's own statement of a trained-algorithmic source, a pristine container is
        // beside the point and must not be allowed to discount it.
        if (ctx.priorFindings.some((f) => f.family === "declared-provenance" && f.polarity === "signal")) return [];
        if (a.laundering.indicators.length > 0) return [];
        if (!a.laundering.pristine.some((p) => p.code === "content_credential_present")) return [];
        if (a.laundering.pristine.length < 2) return [];
        return a.laundering.pristine.map((p) => ev("metric", p.locator, `${p.title}: ${p.observed}`));
      },
      fixtures: {
        positive: (base) => ({ artifact: v(base, { kind: "content-credential", state: "unverified" }) }),
        mutated: (base) => ({ artifact: v(base, { kind: "content-credential", state: "none" }) }),
      },
    },
  ];

  const unknown = Object.keys(inapplicable).filter((id) => !all.some((r) => r.id === id));
  if (unknown.length > 0) {
    throw new Error(
      `A modality declared these rule ids inapplicable, and they are not rules in this corpus: ${unknown.join(", ")}. ` +
        `An id that no longer matches silently stops excluding anything, which is how a dead rule gets back in.`,
    );
  }
  return all.filter((r) => !(r.id in inapplicable));
}

/**
 * Is this metadata hit the same declaration the container reported as its writer?
 *
 * Compared by VALUE, not by field name. The container spells the writer field differently in
 * every format, and the metadata layer renames it again ("ISFT" becomes "software"), so a
 * name comparison matched in a JPEG and silently missed in a WAVE. Two fields carrying the
 * same string are one declaration seen twice.
 *
 * The split keeps `prov.encoder-declares-generative-tool` and
 * `prov.sidecar-declares-generative-tool` from both firing on one declaration and counting it
 * twice inside a capped family, which is a real overcount rather than a tidiness issue.
 */
function isContainerEncoderDeclaration(artifact: MediaArtifact, value: string): boolean {
  const encoder = artifact.container.encoder;
  return !!encoder && encoder.value === value;
}
