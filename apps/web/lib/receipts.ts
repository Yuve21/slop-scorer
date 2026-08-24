import "server-only";

import { buildReport, makeFinding, notAssessed } from "@slop/core";
import type { Coverage, DetectorResult, Evidence, Finding, ProbeStatus } from "@slop/core";
import { PROBE_WEIGHTS, RULE_DESCRIPTORS, ruleById, WEB_DETECTOR_ID } from "@slop/detectors-web";
import { toScanView } from "./view";
import type { ScanView } from "./view";

/**
 * The sample receipts.
 *
 * These exist to show the report's four honest shapes: assessed with a reproduction,
 * inconclusive, not assessed, and assessed-but-quiet with counter-evidence. Two constraints
 * govern them and both are non-obvious:
 *
 *  1. THE ARITHMETIC IS REAL. Every one is built by handing findings to the same
 *     `buildReport` the live scan uses, so the receipt on screen reconciles because the
 *     engine reconciled it, not because a designer typed numbers that add up. If a weight
 *     changes in the corpus, these pages change with it.
 *
 *  2. THE ARTIFACTS ARE OURS. Each one describes something we made for this page. We never
 *     publish a recreation of someone else's work in our own marketing, and a sample is
 *     marketing. Each receipt says so, on the receipt, in the masthead.
 */

const ev = (
  kind: Evidence["kind"],
  locator: string,
  observed: string,
  rest: Partial<Omit<Evidence, "kind" | "locator" | "observed">> = {},
): Evidence => ({ kind, locator, observed, ...rest });

const find = (ruleId: string, evidence: readonly Evidence[]): Finding => {
  const rule = ruleById(ruleId);
  if (!rule) throw new Error(`Sample receipt cites rule "${ruleId}", which is not in the corpus.`);
  return makeFinding(rule, evidence);
};

/** Probe statuses for a fully rendered read, so coverage clears the floor honestly. */
const fullProbes = (): ProbeStatus[] => [
  { id: "http", ran: true, denominator: 1, weight: PROBE_WEIGHTS.http },
  { id: "render", ran: true, denominator: 1, weight: PROBE_WEIGHTS.render },
  { id: "computed-style", ran: true, denominator: 812, expectsNonEmpty: true, weight: PROBE_WEIGHTS["computed-style"] },
  { id: "font-faces", ran: true, denominator: 2, weight: PROBE_WEIGHTS["font-faces"] },
  { id: "dom-survey", ran: true, denominator: 1174, expectsNonEmpty: true, weight: PROBE_WEIGHTS["dom-survey"] },
  { id: "assets", ran: true, denominator: 14, expectsNonEmpty: true, weight: PROBE_WEIGHTS.assets },
  { id: "well-known", ran: true, denominator: 8, expectsNonEmpty: true, weight: PROBE_WEIGHTS["well-known"] },
  { id: "not-found", ran: true, denominator: 1, weight: PROBE_WEIGHTS["not-found"] },
  { id: "text", ran: true, denominator: 431, expectsNonEmpty: true, weight: PROBE_WEIGHTS.text },
  { id: "provenance", ran: true, denominator: 1, weight: PROBE_WEIGHTS.provenance },
];

const coverageOf = (probes: readonly ProbeStatus[], examined: string): Coverage => {
  const total = Object.values(PROBE_WEIGHTS).reduce((a, b) => a + b, 0);
  const got = probes
    .filter((p) => p.ran && (!p.expectsNonEmpty || (p.denominator ?? 0) > 0))
    .reduce((a, p) => a + (p.weight ?? 1), 0);
  return { ratio: got / total, probes, examined };
};

const result = (
  findings: readonly Finding[],
  coverage: Coverage,
  when: string,
  warnings: readonly string[] = [],
): DetectorResult => ({
  detectorId: WEB_DETECTOR_ID,
  modality: "web",
  evidenceKind: "deterministic",
  corpusVersion: "corpus-2026.09",
  input: { kind: "url", url: "https://example.invalid/sample" },
  startedAt: when,
  finishedAt: when,
  findings,
  coverage,
  rulesEvaluated: RULE_DESCRIPTORS.map((r) => r.id),
  warnings,
});

export interface SampleReceipt {
  readonly id: string;
  /** One line, in the masthead. Says what the artifact is and that it is ours. */
  readonly artifact: string;
  readonly headline: string;
  /** The sentence under the headline. Describes what WE did. Never what anyone is. */
  readonly claim: string;
  readonly view: ScanView;
}

const at = (iso: string) => () => new Date(iso);

function templateShapedPage(): SampleReceipt {
  const when = "2026-08-23T21:44:00.000Z";
  const findings = [
    find("builder.ai-generator-meta", [
      ev("selector", 'meta[name="generator"]', "Lovable 2.4", {
        expected: "no generator tag, or one naming a framework rather than a page generator",
      }),
    ]),
    find("css.violet-blue-gradient", [
      ev(
        "css",
        "background-image on section.hero",
        "linear-gradient(135deg, rgb(99, 102, 241) 0%, rgb(59, 130, 246) 100%)",
        { expected: "a palette taken from something real rather than two adjacent stops of the default ramp" },
      ),
    ]),
    find("css.crushed-tracking", [
      ev("css", "letter-spacing on h1.hero-title", "-0.04em at weight 800", {
        expected: "-0.02em or looser at weight 700+",
      }),
    ]),
    find("dom.uniform-cards", [
      ev("selector", "section.features > div.card", "3 cards, identical 16px radius, 1px border, identical two-layer shadow"),
      ev("css", "box-shadow on section.features > div.card", "0 1px 2px rgba(0,0,0,.05), 0 6px 16px rgba(0,0,0,.08)"),
    ]),
    find("craft.no-og-image", [
      ev("selector", 'meta[property="og:image"]', "absent", { expected: "one link-preview image per route" }),
    ]),
    find("craft.no-canonical", [
      ev("selector", 'link[rel="canonical"]', "absent", { expected: "a canonical URL on every indexable route" }),
    ]),
  ];
  const report = buildReport([result(findings, coverageOf(fullProbes(), "rendered read: render, 812 styled elements, 14 chunks, 8 well-known paths"), when)], {
    now: at(when),
  });
  return {
    id: "4F2A-9C",
    artifact: "a marketing page we generated ourselves, as a fixture for this sample",
    headline: "8.4 seconds",
    claim:
      "That is how long our pipeline took to produce the right-hand panel from the measurements below. A person doing the same work by hand: roughly a day.",
    view: toScanView(report, {
      target: "https://example.invalid/sample",
      ranAt: when,
      elapsedMs: 8400,
      evaluated: RULE_DESCRIPTORS.map((r) => r.id),
      corpusSize: RULE_DESCRIPTORS.length,
    }),
  };
}

function reencodedScreenshot(): SampleReceipt {
  const when = "2026-08-23T19:02:00.000Z";
  // A static, fetch-only read: the render-dependent probes never ran, so most of the corpus
  // could not be evaluated. This is the shape that MUST abstain rather than score low.
  const probes: ProbeStatus[] = [
    { id: "http", ran: true, denominator: 1, weight: PROBE_WEIGHTS.http },
    { id: "render", ran: false, denominator: 0, weight: PROBE_WEIGHTS.render },
    { id: "computed-style", ran: false, denominator: 0, expectsNonEmpty: true, weight: PROBE_WEIGHTS["computed-style"] },
    { id: "font-faces", ran: false, denominator: 0, weight: PROBE_WEIGHTS["font-faces"] },
    { id: "dom-survey", ran: false, denominator: 0, expectsNonEmpty: true, weight: PROBE_WEIGHTS["dom-survey"] },
    { id: "assets", ran: false, denominator: 0, expectsNonEmpty: true, weight: PROBE_WEIGHTS.assets },
    { id: "well-known", ran: true, denominator: 8, expectsNonEmpty: true, weight: PROBE_WEIGHTS["well-known"] },
    { id: "not-found", ran: true, denominator: 1, weight: PROBE_WEIGHTS["not-found"] },
    { id: "text", ran: false, denominator: 0, expectsNonEmpty: true, weight: PROBE_WEIGHTS.text },
    { id: "provenance", ran: false, denominator: 0, weight: PROBE_WEIGHTS.provenance },
  ];
  const findings = [
    find("craft.crawler-files", [
      ev("url", "/sitemap.xml", "HTTP 404", { expected: "HTTP 200 xml" }),
    ]),
  ];
  const report = buildReport(
    [
      result(
        findings,
        coverageOf(probes, "static read: http, 8 well-known paths. The page was never rendered."),
        when,
        ["the upload is a re-encoded screenshot: resampling removed the signals the visual rules read"],
      ),
    ],
    { now: at(when) },
  );
  return {
    id: "8B10-2D",
    artifact: "a screenshot of one of our own pages, re-saved twice to force the abstention path",
    headline: "We could not do this one.",
    claim:
      "The upload is a re-encoded screenshot. Re-encoding destroyed the measurements our rules cite, so we are abstaining rather than guessing. Nothing went wrong; this is the result.",
    view: toScanView(report, {
      target: "upload: screenshot-2026-08-23.png",
      ranAt: when,
      elapsedMs: 21300,
      evaluated: [],
      corpusSize: RULE_DESCRIPTORS.length,
    }),
  };
}

function portraitOutOfScope(): SampleReceipt {
  const when = "2026-08-22T16:20:00.000Z";
  const report = notAssessed(
    "out_of_scope_modality",
    "This build scores rendered web pages and repositories. It has no image detector, so nothing about this photograph was examined. Absence of a finding here is not a finding.",
    { now: at(when) },
  );
  return {
    id: "C7E3-51",
    artifact: "a portrait photograph, taken by us, submitted to exercise the refusal path",
    headline: "We did not examine this.",
    claim:
      "No image detector ships in this build, and our reproduction pipeline refuses artifacts containing an identifiable person. Both of those are decisions, and both are printed below rather than presented as an error.",
    view: toScanView(report, {
      target: "upload: portrait.jpg",
      ranAt: when,
      elapsedMs: 120,
      evaluated: [],
      corpusSize: RULE_DESCRIPTORS.length,
    }),
  };
}

function quietPageWithCounters(): SampleReceipt {
  const when = "2026-08-21T11:07:00.000Z";
  const findings = [
    find("craft.no-meta-description", [
      ev("selector", 'meta[name="description"]', "absent", { expected: "a description over 40 characters" }),
    ]),
    find("counter.licensed-foundry-face", [
      ev("css", '@font-face src for "GT Sectra"', "/fonts/GT-Sectra-Regular.woff2, self-hosted, no third-party request", {
        expected: "a licensed face is evidence a person spent money on this",
      }),
    ]),
    find("counter.real-photography", [
      ev("selector", "figure > img.plate", 'photograph with written alt text: "the workshop bench, Tuesday, half-finished"'),
    ]),
  ];
  const report = buildReport([result(findings, coverageOf(fullProbes(), "rendered read: render, 640 styled elements, 9 chunks, 8 well-known paths"), when)], {
    now: at(when),
  });
  return {
    id: "A05E-13",
    artifact: "a page one of us built by hand, submitted to check the corpus clears it",
    headline: "Two counter-signals, one small omission.",
    claim:
      "What the run found is mostly evidence in the artifact's favour. Counter-evidence subtracts from the number and is printed as a receipt line like anything else, because a detector that can only find guilt will find it everywhere.",
    view: toScanView(report, {
      target: "https://example.invalid/handmade",
      ranAt: when,
      elapsedMs: 6100,
      evaluated: RULE_DESCRIPTORS.map((r) => r.id),
      corpusSize: RULE_DESCRIPTORS.length,
    }),
  };
}

const BUILDERS: Readonly<Record<string, () => SampleReceipt>> = {
  "4F2A-9C": templateShapedPage,
  "8B10-2D": reencodedScreenshot,
  "C7E3-51": portraitOutOfScope,
  "A05E-13": quietPageWithCounters,
};

export const SAMPLE_IDS = Object.keys(BUILDERS);

export function sampleReceipt(id: string): SampleReceipt | null {
  const build = BUILDERS[id];
  return build ? build() : null;
}
