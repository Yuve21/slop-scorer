/**
 * The MCP server: five tools, no model, no network call we did not make ourselves.
 *
 *   scan_codebase  - point it at a repo, get cited findings with file and line
 *   scan_ui        - point it at a URL or a localhost port, get cited findings with selectors
 *   list_rules     - the corpus, compact by default, full entries on request
 *   propose_fixes  - the same findings as precise, caveated edits for THIS agent to apply
 *   verify_fix     - re-scan after the edits and show the two finding sets side by side
 *
 * THE LOOP IS THE PRODUCT: scan -> propose -> apply -> verify. A report was never the point;
 * the change was. What makes the loop safe to close is that this server proposes and the host
 * agent disposes. Nothing in this package writes a file, spawns a process or asks for write
 * access: a remediation is a locator, the text observed there and the text proposed instead,
 * and the agent that called the tool applies it with the editing tools and the approval flow
 * the user already trusts. A second permission model inside an MCP server would be more code,
 * more risk, and a worse experience even when it worked.
 *
 * `list_rules` is the reason the plugin exists, not a debugging aid. The detection half of
 * this product is a race it will eventually lose: generators improve, tells decay, and a
 * detector is only ever as current as its corpus. The PREVENTION half does not decay, because
 * an agent that reads the rules before it writes produces work the rules do not fire on. That
 * is a better outcome than catching it afterwards, and it is the only loop here that gets
 * stronger as it is used.
 *
 * Which is why its DEFAULT SHAPE is a usability decision rather than a formatting one. The
 * full listing measured 63,110 characters, about 15,800 tokens, and the instructions below ask
 * an agent to call it BEFORE generating anything. Nobody spends a fifth of a small context
 * window speculatively, so the tool that was the point of the product was the one tool nobody
 * would call. It is compact by default now and the full entries are one parameter away.
 *
 * Two things the tools will not do:
 *
 *  - They will not return a bare number. Every response carries `status`, `coverage`, the
 *    per-family caps, the counter-evidence, and the arithmetic. An agent that wants a number
 *    has to walk past the evidence to get it.
 *  - They will not say who made anything. The verdict sentence describes what this server
 *    did. See `assessment.ts` for why that is a type constraint rather than a style note.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { DEFAULT_CONFIG } from "@slop/core";
import { CODE_CONFIG, CODE_DETECTOR_ID, CODE_RULE_DESCRIPTORS, codeDetector } from "@slop/detectors-code";
import { RULE_DESCRIPTORS, WEB_DETECTOR_ID, webDetector } from "@slop/detectors-web";
import { toToolPayload } from "./format.js";
import type { ToolPayload } from "./format.js";
import { proposeCodeFixes, proposeUiFixes, rememberBaseline, verifyCodeFix, verifyUiFix } from "./fixes.js";
import type { ProposeFixesPayload, VerifyFixPayload } from "./fixes.js";
import { codeReport, codeTargetKey, uiReport, uiTargetKey } from "./targets.js";
import type { CodeTarget, UiTarget } from "./targets.js";

export { resolveTarget } from "./targets.js";

export const SERVER_NAME = "slop-scorer";
export const SERVER_VERSION = "0.1.0";

const result = (payload: ToolPayload) => ({
  content: [{ type: "text" as const, text: payload.receipt }],
  structuredContent: payload as unknown as Record<string, unknown>,
});

export type ScanCodebaseArgs = CodeTarget;
export type ScanUiArgs = UiTarget;

/**
 * Scan a repository. Exported separately from the tool wiring so it is directly testable.
 *
 * The reading is remembered as the baseline for this target, which is the only state this
 * server holds and the thing `verify_fix` compares against later. It lives in memory for the
 * life of the process: a baseline is only meaningful against the working tree it was read
 * from, and one persisted to disk would let a verification call last week's scan progress.
 */
export async function scanCodebase(args: ScanCodebaseArgs): Promise<ToolPayload> {
  const report = await codeReport(args);
  rememberBaseline(codeTargetKey(args), report);
  return toToolPayload(report);
}

/** Render and scan a page. Returns `not_assessed` rather than throwing if playwright is absent. */
export async function scanUi(args: ScanUiArgs): Promise<ToolPayload> {
  const report = await uiReport(args);
  rememberBaseline(uiTargetKey(args), report);
  return toToolPayload(report);
}

/** propose_fixes, over either target. One of `path` or (`url` | `port`) is required. */
export async function proposeFixes(args: ScanCodebaseArgs | ScanUiArgs): Promise<ProposeFixesPayload> {
  return "path" in args && args.path ? proposeCodeFixes(args) : proposeUiFixes(args as UiTarget);
}

/** verify_fix, over either target. Re-scans and diffs against the reading held for it. */
export async function verifyFix(args: ScanCodebaseArgs | ScanUiArgs): Promise<VerifyFixPayload> {
  return "path" in args && args.path ? verifyCodeFix(args) : verifyUiFix(args as UiTarget);
}

export interface ListRulesArgs {
  readonly modality?: "web" | "code" | "all";
  readonly family?: string;
  /** Full entries for every rule the other filters select. Expensive; see the note below. */
  readonly verbose?: boolean;
  /** Full entries for these rule ids only, and compact ones for the rest. */
  readonly ruleIds?: readonly string[];
}

/** The full entry for one rule: everything the corpus holds about it. */
export interface FullRule {
  readonly id: string;
  readonly modality: string;
  readonly family: string;
  readonly severity: string;
  readonly baseWeight: number;
  readonly polarity: string;
  /** One line. The rule's own title, which is written as a sentence about the artifact. */
  readonly rationale: string;
  readonly since: string;
  readonly whyItReadsAsGenerated: string;
  readonly counterEvidenceThatWouldRebutIt: string;
  readonly prevention?: string;
}

export interface RulesListing {
  readonly corpora: readonly { readonly detectorId: string; readonly modality: string; readonly corpusVersion: string }[];
  readonly scoring: {
    /*
     * NO ceiling. Retirement step 2: there is no published number for one to bound.
     * The families stay, because a family cap is why one kind of evidence cannot dominate a
     * report, and that is a property of the RULEBOOK rather than of a score.
     */
    readonly note: string;
    readonly families: readonly {
      readonly id: string;
      readonly title: string;
      readonly capShare: number;
      readonly caveat?: string;
    }[];
  };
  /** How to get what this response left out. Present on every response, verbose included. */
  readonly retrieval: string;
  /** How to read a line of `index`. Present whenever `index` is, so the format is never guessed. */
  readonly indexFormat: string;
  /**
   * EVERY rule the filters selected, one line each. This is the complete membership list, and
   * it is a line of text rather than an object because the per-key overhead of ninety small
   * JSON objects was two thirds of the payload.
   */
  readonly index: readonly string[];
  /** Full entries: all of them under `verbose`, the named ones under `ruleIds`, else none. */
  readonly fullEntries: readonly FullRule[];
}

/**
 * The corpus, compact by default.
 *
 * WHY THE DEFAULT CHANGED. This tool's own instructions say to call it BEFORE generating code or
 * UI, and the full listing measured **63,110 characters, about 15,800 tokens** — a fifth of a
 * small context window, spent speculatively, before any work has been done. No agent pays that,
 * so the prevention half of this product was priced out of the loop it exists for. The compact
 * form is under a tenth of it.
 *
 * NOTHING IS LOST, IT MOVED. `index` is the complete membership list on every response, so no
 * rule is ever invisible. `verbose: true` returns every full entry, and `ruleIds: [...]` returns
 * the full entries for named rules only — which is the shape an agent actually needs after a
 * scan: it has five rule ids and wants the rebuttal and the prevention note for those five.
 * Every response says so in `retrieval`, so an agent that read only the index still knows the
 * rest is one call away.
 *
 * WHY `index` IS TEXT AND NOT OBJECTS. Ninety small JSON objects spend two thirds of their bytes
 * on repeated key names and pretty-printed braces. Measured: 5,176 tokens as objects, 2,753 as
 * one line per rule. `indexFormat` ships with it so the layout is documented rather than
 * guessed, and `fullEntries` is structured, because that is the half a program parses.
 *
 * The two fields the full entry adds are the two that make a finding arguable: the counter-
 * evidence that would rebut the rule, and how to avoid producing it. They are the most valuable
 * text in the corpus and the reason the full listing is worth its size when it is asked for.
 */
export function listRules(args: ListRulesArgs = {}): RulesListing {
  const modality = args.modality ?? "all";
  const verbose = args.verbose === true;
  const named = new Set(args.ruleIds ?? []);
  const sets = [
    { modality: "web" as const, detectorId: WEB_DETECTOR_ID, corpusVersion: webDetector.corpusVersion, rules: RULE_DESCRIPTORS },
    { modality: "code" as const, detectorId: CODE_DETECTOR_ID, corpusVersion: codeDetector.corpusVersion, rules: CODE_RULE_DESCRIPTORS },
  ].filter((s) => modality === "all" || s.modality === modality);

  const families = [...DEFAULT_CONFIG.families, ...CODE_CONFIG.families].filter(
    (f, i, all) => all.findIndex((x) => x.id === f.id && x.title === f.title) === i,
  );

  const selected = sets
    .flatMap((s) => s.rules.map((r) => ({ ...r, modality: s.modality })))
    .filter((r) => !args.family || r.family === args.family);

  const full = (r: (typeof selected)[number]): FullRule => ({
    id: r.id,
    modality: r.modality,
    family: r.family,
    severity: r.severity,
    baseWeight: r.baseWeight,
    polarity: r.polarity,
    rationale: r.title,
    since: r.since,
    whyItReadsAsGenerated: r.explanation,
    counterEvidenceThatWouldRebutIt: r.falsePositiveNote,
    ...(r.prevention ? { prevention: r.prevention } : {}),
  });

  return {
    corpora: sets.map((s) => ({ detectorId: s.detectorId, modality: s.modality, corpusVersion: s.corpusVersion })),
    scoring: {
      note:
        "Rules are grouped into families, and each family is capped at a share of the total budget so no single kind of evidence can carry a report alone. Repeated evidence within a rule decays harmonically, and counter-evidence rules subtract. Low coverage withholds the result entirely rather than reporting a thin one. No aggregate number is published: every finding cites what was read and where, and that citation is the thing to act on.",
      families: families.map((f) =>
        verbose
          ? { id: f.id, title: f.title, capShare: f.capShare, caveat: f.caveat }
          : { id: f.id, title: f.title, capShare: f.capShare },
      ),
    },
    retrieval:
      "`index` is the complete rule list, one line each, and is always present. `fullEntries` " +
      "carries the rest of what the corpus holds about a rule - why it reads as machine-generated, " +
      "the counter-evidence that would rebut it, and how to avoid producing it - for the rules you " +
      "ask for: call again with ruleIds:[\"rule.id\", ...] for the ones a scan cited, or " +
      "verbose:true for all of them plus the per-family caveats. verbose:true over the whole " +
      "corpus is roughly 18k tokens; this default is roughly 2.8k.",
    indexFormat: "id | family | polarity/severity | weight | one-line rationale",
    index: selected.map(
      (r) => `${r.id} | ${r.family} | ${r.polarity}/${r.severity} | ${r.baseWeight} | ${r.title}`,
    ),
    fullEntries: verbose ? selected.map(full) : selected.filter((r) => named.has(r.id)).map(full),
  };
}

/** Build the server with all five tools registered. */
export function createServer(): McpServer {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    {
      instructions:
        "Deterministic, evidence-cited detection of template and machine-generated tells in code and rendered web pages, and the loop that closes on them: scan -> propose_fixes -> apply the edits yourself -> verify_fix. " +
        "Call list_rules BEFORE generating code or UI to learn what not to produce; that is the primary use, and its default compact form is about 2.8k tokens so it is cheap to call speculatively. After a scan, call it again with ruleIds:[...] for the rules that fired, which returns their rebuttal and how to avoid producing them. " +
        "After a scan, offer to act on it: propose_fixes returns precise, caveated edits and this server never writes anything, so apply them with your own editing tools under the user's normal approval flow, then call verify_fix to see which findings are no longer present. " +
        "Every finding carries a file and line or a CSS selector you can go and check. " +
        "Results are bounded at 99 and can be inconclusive or not_assessed; always branch on `status` before reading `score`. " +
        "Nothing here identifies or makes a claim about a person.",
    },
  );

  server.registerTool(
    "scan_codebase",
    {
      title: "Scan a repository for machine-generated tells",
      description:
        "Static, deterministic analysis of a checkout. Finds committed agent instruction files and transcripts, comments that restate the code, unused scaffolded dependencies, untouched tooling stubs, README template markers, unfilled placeholders, machine-even function and file sizes, duplicated blocks, absent or tautological tests, and a one-sitting commit history. Every finding cites a file and a line, says why it reads as machine-generated, and states the counter-evidence that would rebut it. No model is involved.",
      inputSchema: {
        path: z.string().describe("Absolute path to the repository root to scan."),
        include: z
          .array(z.string())
          .optional()
          .describe("Optional glob-ish include patterns, e.g. ['src/**/*.ts']. Narrowing the scan lowers coverage and can force an inconclusive result."),
        readHistory: z.boolean().optional().describe("Read git history for the commit-shape rules. Default true; absence of git is never itself a finding."),
        maxFiles: z
          .number()
          .int()
          .positive()
          .max(200_000)
          .optional()
          .describe(
            "Cap on files walked. Default 5000, hard ceiling 200000. The ceiling is in the schema as well as in the scanner so an out-of-range request is refused by the protocol rather than after a scan has started allocating.",
          ),
      },
    },
    async (args) => result(await scanCodebase(args as ScanCodebaseArgs)),
  );

  server.registerTool(
    "scan_ui",
    {
      title: "Render a page and scan it for template tells",
      description:
        "Renders the page in a real browser (playwright) and measures the RENDERED document, never the server HTML: a static read produces confident findings about a document the visitor never sees. Returns builder fingerprints, default visual language, craft-floor defects, structural uniformity, motion signature (computed animation durations, easings, delay ladders and infinite loops, plus a second read under an emulated prefers-reduced-motion) and copy tells, each with a CSS selector or a computed style value you can re-read in DevTools, plus counter-evidence that argues for the page. Text recovered from inside images is reported too, marked probabilistic and quoted verbatim. Accepts a URL or a localhost port.",
      inputSchema: {
        url: z.string().optional().describe("The page to render, e.g. https://example.com/pricing"),
        port: z.number().int().positive().optional().describe("A localhost port instead of a URL, for a running dev server."),
        viewportWidth: z.number().int().positive().optional().describe("Viewport width in CSS pixels. Default 390 (mobile)."),
        viewportHeight: z.number().int().positive().optional().describe("Viewport height in CSS pixels. Default 844."),
      },
    },
    async (args) => result(await scanUi(args as ScanUiArgs)),
  );

  server.registerTool(
    "list_rules",
    {
      title: "List the rule corpus: compact by default, full detail on request",
      description:
        "Returns every rule in both corpora. COMPACT BY DEFAULT: `index` lists every rule on one line each - id, family, polarity/severity, weight and a one-line rationale - which is roughly 2.8k tokens and is meant to be called speculatively BEFORE writing code or building a UI. For the rest of what the corpus holds about a rule (why it reads as machine-generated, the counter-evidence that would rebut it, how to avoid producing it) pass ruleIds:[...] for the ones you care about, which is the usual case after a scan, or verbose:true for all of them at roughly 18k tokens. Nothing is lost in the compact form: it is retrievable rather than resident, and every response says how in its `retrieval` field. This is the prevention half of the product and the reason the plugin exists: a corpus you can read is worth more than a score you cannot argue with.",
      inputSchema: {
        modality: z.enum(["web", "code", "all"]).optional().describe("Restrict to one corpus. Default all."),
        family: z.string().optional().describe("Restrict to one rule family, e.g. 'agent-artifact'."),
        verbose: z
          .boolean()
          .optional()
          .describe(
            "Full entry for every rule returned, including rebuttal and prevention. Roughly 18k tokens over the whole corpus, so prefer ruleIds unless you genuinely want all of it.",
          ),
        ruleIds: z
          .array(z.string())
          .optional()
          .describe(
            "Full entry for these rule ids only; everything else stays compact. This is the cheap way to read the rebuttal and prevention note for the handful of rules a scan actually cited.",
          ),
      },
    },
    async (args) => {
      const listing = listRules(args as ListRulesArgs);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(listing, null, 2) }],
        structuredContent: listing as unknown as Record<string, unknown>,
      };
    },
  );

  server.registerTool(
    "propose_fixes",
    {
      title: "Turn the findings into precise, caveated edits",
      description:
        "Scans the target and returns each finding as a proposed change: the exact locator (file and 1-based line range, or CSS selector and property), the text or value that was actually observed there, the replacement, an estimated blast radius, the rule's own rebuttal, and the explicit condition under which the change should NOT be applied. Grouped by family and split into ready-to-apply, needs-confirmation (deletions), needs-source-location (rendered-page changes whose declaring file is unknown to a page read) and decide-yourself, so it can be presented as 'apply these N, skip these M'. This server never writes a file: apply the edits with your own tools under the user's approval, then call verify_fix. Findings that are shape observations or judgement calls carry no patch on purpose, and counter-evidence never carries one at all.",
      inputSchema: {
        path: z.string().optional().describe("Absolute path to a repository root. Provide this OR url/port."),
        include: z.array(z.string()).optional().describe("Optional include patterns for a repository scan."),
        readHistory: z.boolean().optional().describe("Read git history for the commit-shape rules. Default true."),
        url: z.string().optional().describe("A page to render and propose UI changes for."),
        port: z.number().int().positive().optional().describe("A localhost port instead of a URL."),
      },
    },
    async (args) => {
      const payload = await proposeFixes(args as ScanCodebaseArgs | ScanUiArgs);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
        structuredContent: payload as unknown as Record<string, unknown>,
      };
    },
  );

  server.registerTool(
    "verify_fix",
    {
      title: "Re-scan after changes and show what is actually gone",
      description:
        "Re-scans the same target and reports the before and after finding sets side by side: which rules are no longer present, which persist and with what citations now, and which are NEWLY present. It does not report success. A finding disappearing from a re-scan is the evidence; whether the change was a good one is not something a detector can know. A newly present finding sets `regression: true` and is stated first, because a change that resolves two findings and introduces one has broken something. If no earlier reading of this target is held in this session it says so rather than comparing against nothing.",
      inputSchema: {
        path: z.string().optional().describe("Absolute path to the repository root that was scanned. Provide this OR url/port."),
        include: z.array(z.string()).optional().describe("The same include patterns the earlier scan used, so the comparison is like for like."),
        readHistory: z.boolean().optional().describe("The same value the earlier scan used."),
        url: z.string().optional().describe("The page that was scanned."),
        port: z.number().int().positive().optional().describe("A localhost port instead of a URL."),
      },
    },
    async (args) => {
      const payload = await verifyFix(args as ScanCodebaseArgs | ScanUiArgs);
      return {
        content: [{ type: "text" as const, text: payload.headline }],
        structuredContent: payload as unknown as Record<string, unknown>,
      };
    },
  );

  return server;
}
