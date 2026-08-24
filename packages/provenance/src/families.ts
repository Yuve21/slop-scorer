import { DEFAULT_CONFIG } from "@slop/core";
import type { FamilySpec, ScoringConfig } from "@slop/core";

/**
 * Rule families for the media corpora.
 *
 * These families are shaped differently from the web and code ones, and the difference is
 * the whole thesis of these three packages. A web family groups CORRELATED SOFT SIGNALS —
 * eight shadcn tells are one observation seen eight ways. A media family groups DECLARATIONS:
 * a signed manifest, a metadata field a producer filled in, a text chunk a tool wrote. There
 * is no family here for "how it looks", because there is no rule here that looks.
 *
 *  - `declared-provenance` is the strongest, and it is also the most fragile. A verified
 *    manifest asserting a trained-algorithmic source is close to dispositive about what the
 *    producer said, and one screenshot deletes it. Capped at 45% so the corpus survives its
 *    routine disappearance.
 *  - `declared-tooling` is a tool naming itself. Strong when the tool has no manual path,
 *    weak when it has one, so the weight lives on the rule and the cap keeps the family from
 *    carrying a verdict.
 *  - `watermark` can only ever fire on a POSITIVE detection from a named external detector.
 *    Nothing in this build produces one, so today it is a family that exists to be wired in.
 *  - `stream-consistency` is the only probabilistic family in the product. It is capped
 *    below every other positive family on purpose and every rule in it must announce itself
 *    as probabilistic in its own title.
 *  - `provenance-counter` and `counter-evidence` are counter-only and generously capped. In
 *    a category whose documented failures are all false accusations, the exonerating half
 *    deserves more room than any accusing family.
 */
export const MEDIA_FAMILIES: readonly FamilySpec[] = [
  {
    id: "declared-provenance",
    title: "Declared provenance",
    capShare: 0.45,
    order: 1,
    caveat:
      "This family reads what the file says about itself in a signed manifest or a standard metadata field. It is a record of a declaration, not a measurement of the content, and a single re-save deletes all of it.",
  },
  {
    id: "declared-tooling",
    title: "Declared tooling",
    capShare: 0.25,
    order: 2,
    caveat:
      "A tool wrote its own name into a defined field. Several of the tools in the table have manual paths as well as generative ones, so a declaration names a tool and never a method.",
  },
  {
    id: "watermark",
    title: "Watermark detections",
    capShare: 0.3,
    order: 3,
    caveat:
      "Only a positive result from a named external detector appears here. A scheme that was not checked, or was checked and found nothing, produces no line at all: published attacks remove these marks without detector access and an ordinary screenshot removes most of them by accident.",
  },
  {
    id: "stream-consistency",
    title: "Stream consistency (probabilistic)",
    capShare: 0.12,
    order: 4,
    caveat:
      "The only probabilistic family in this product. Every line here is a statistic over a stream rather than a fact you can re-read, it is capped below every other positive family, and it can never on its own move an artifact out of the lowest band.",
  },
  {
    id: "provenance-counter",
    title: "Provenance counter-evidence",
    capShare: 0.4,
    order: 5,
    counterOnly: true,
    caveat: "Declarations that argue the artifact came from a capture device or a hand-driven tool. Scored DOWN.",
  },
  {
    id: "counter-evidence",
    title: "Counter-evidence",
    capShare: 0.35,
    order: 6,
    counterOnly: true,
    caveat:
      "Signals that argue with the whole verdict rather than with one family, so they bypass family caps and carry a cap of their own.",
  },
];

/**
 * The media scoring config, and the two places it departs from the default.
 *
 * `minFamiliesFired: 1`, which looks like a weakening and is not. The two-family rule exists
 * because a web family is a bundle of correlated soft signals and one bundle is not
 * corroboration. A media family is a class of DECLARATION, and a single verified manifest
 * asserting a trained-algorithmic source is not "one observation seen eight ways" — it is
 * the producer's own record, cited at a byte offset. Requiring a second family there would
 * force us to withhold the one kind of evidence in this whole product that is actually
 * strong, while the re-encoding gate above it already withholds everything else.
 *
 * `minCoverage: 0.7`, higher than either text modality. A partial media read is easy to get
 * (a truncated upload, a format we do not parse) and very easy to mistake for a clean file,
 * because "we found no declarations" and "we could not look for declarations" produce the
 * same empty list.
 */
export const MEDIA_CONFIG: ScoringConfig = {
  ...DEFAULT_CONFIG,
  corpusVersion: "media-corpus-2026.09",
  families: MEDIA_FAMILIES,
  minCoverage: 0.7,
  minFamiliesFired: 1,
  topBandFloor: 88,
  topBandRequires: { families: 1, anyOfFamilies: ["declared-provenance"] },
};
