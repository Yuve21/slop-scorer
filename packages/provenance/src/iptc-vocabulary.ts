/**
 * The IPTC Digital Source Type vocabulary, vendored, as DATA.
 *
 * WHY THIS FILE EXISTS SEPARATELY FROM `c2pa.ts`.
 *
 * `DIGITAL_SOURCE_TYPES` in `c2pa.ts` is OUR list: the terms this package can name, each
 * classified by what it argues about an artifact. This file is THEIR list: the terms the
 * standards body published, copied verbatim with its scheme date. Two independent statements
 * about the same vocabulary, in two files, so that a test can compare them and report the
 * delta in BOTH directions. If our list were derived from this one, the comparison would be
 * `arr.map(f).length === arr.length`, a denominator drawn from its own subject, and it would
 * stay green while the vocabulary went stale underneath it.
 *
 * WHAT IT COST TO NOT HAVE THIS. The hand-written enumeration expressed 5 of the 17 published
 * active terms, and the gaps failed in OPPOSITE directions (LEARNINGS L-17):
 *
 *   - `screenCapture` decoded to `unknown`, so a file DECLARING that it is a screen capture
 *     never reached the laundering gate through this path. A lost abstention.
 *   - `computationalCapture` decoded to `unknown`, so `prov.c2pa-declares-capture`, at -2.2
 *     the strongest counter-evidence in the product, could not fire on it. A DEAD COUNTER
 *     RAISES THE SCORE. An honest computational-photography pipeline, declaring itself in the
 *     standard field, would have LOST its exoneration and looked more like slop for having
 *     told the truth. That is a false-accusation vector aimed precisely at the users this
 *     product must never accuse, and it is the same defect class as the two repairs beside
 *     it: a guarantee that reports success without doing its job. An enumeration that cannot
 *     express its input does not crash. It silently answers "unknown" and the report reads
 *     like a clean result.
 *
 * SOURCE, and the honest limits of it.
 *
 *   Standard: IPTC NewsCodes, "Digital Source Type" concept scheme.
 *   URI:      http://cv.iptc.org/newscodes/digitalsourcetype/
 *   Scheme last modified: 2024-10-23T12:00:00+00:00 (as published by the scheme itself)
 *   Retrieved: 2026-08-26, from the scheme's HTML and JSON views, which agreed.
 *
 * This is a SNAPSHOT and nothing in this repository can tell you whether it is current: no
 * package here makes a network request, by design, and that is not going to change for a
 * vocabulary file. Refreshing it is a manual step, done by opening the URI above and
 * re-recording the two lists and the scheme date in the same commit. The check that guards
 * this file proves our list and this snapshot agree. It cannot prove this snapshot agrees
 * with the world, and saying so here is cheaper than somebody assuming otherwise.
 *
 * C2PA 2.x additionally defines its own `http://c2pa.org/digitalsourcetype/` namespace
 * alongside the IPTC one. `digitalSourceTypeOf` splits a URI on "/" and takes the tail, so
 * terms from either namespace resolve through the same list; terms unique to the C2PA
 * namespace and absent from this one still resolve to `unknown`, deliberately, because
 * guessing at an unlisted term is how a detector invents provenance.
 */

export interface IptcConcept {
  /** The term identifier, which is the last path segment of the concept URI. */
  readonly term: string;
  /**
   * Retired concepts stay in the vocabulary and stay in files that were written while they
   * were current, so a parser that dropped them would go blind on older artifacts for the
   * sake of tidiness. They are marked, not deleted.
   */
  readonly retired: boolean;
}

/** The published concept list, verbatim. Order follows the scheme's own listing. */
export const IPTC_DIGITAL_SOURCE_TYPE_CONCEPTS: readonly IptcConcept[] = [
  { term: "digitalCapture", retired: false },
  { term: "computationalCapture", retired: false },
  { term: "negativeFilm", retired: false },
  { term: "positiveFilm", retired: false },
  { term: "print", retired: false },
  { term: "minorHumanEdits", retired: true },
  { term: "humanEdits", retired: false },
  { term: "algorithmicallyEnhanced", retired: false },
  { term: "softwareImage", retired: true },
  { term: "digitalArt", retired: true },
  { term: "digitalCreation", retired: false },
  { term: "dataDrivenMedia", retired: false },
  { term: "trainedAlgorithmicMedia", retired: false },
  { term: "algorithmicMedia", retired: false },
  { term: "screenCapture", retired: false },
  { term: "virtualRecording", retired: false },
  { term: "composite", retired: false },
  { term: "compositeCapture", retired: false },
  { term: "compositeSynthetic", retired: false },
  { term: "compositeWithTrainedAlgorithmicMedia", retired: false },
];

export const IPTC_SCHEME_URI = "http://cv.iptc.org/newscodes/digitalsourcetype/";
export const IPTC_SCHEME_MODIFIED = "2024-10-23T12:00:00+00:00";
export const IPTC_SNAPSHOT_RETRIEVED = "2026-08-26";
