/**
 * The MCP server: three tools, no model, no network call we did not make ourselves.
 *
 *   scan_codebase  - point it at a repo, get cited findings with file and line
 *   scan_ui        - point it at a URL or a localhost port, get cited findings with selectors
 *   list_rules     - the whole corpus, with weights and rationale
 *
 * `list_rules` is the reason the plugin exists, not a debugging aid. The detection half of
 * this product is a race it will eventually lose: generators improve, tells decay, and a
 * detector is only ever as current as its corpus. The PREVENTION half does not decay, because
 * an agent that reads the rules before it writes produces work the rules do not fire on. That
 * is a better outcome than catching it afterwards, and it is the only loop here that gets
 * stronger as it is used.
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
import { buildReport, DEFAULT_CONFIG, notAssessed } from "@slop/core";
import type { Report } from "@slop/core";
import { CODE_CONFIG, CODE_DETECTOR_ID, CODE_RULE_DESCRIPTORS, codeDetector } from "@slop/detectors-code";
import { PlaywrightUnavailableError, RULE_DESCRIPTORS, WEB_DETECTOR_ID, webDetector } from "@slop/detectors-web";
import { toToolPayload } from "./format.js";
import type { ToolPayload } from "./format.js";

export const SERVER_NAME = "slop-scorer";
export const SERVER_VERSION = "0.1.0";

const result = (payload: ToolPayload) => ({
  content: [{ type: "text" as const, text: payload.receipt }],
  structuredContent: payload as unknown as Record<string, unknown>,
});

/**
 * Turn a port or a URL into a URL.
 *
 * A bare port is accepted because that is what an agent has during a dev loop, and forcing it
 * to build the URL is friction at exactly the moment the tool is most useful.
 */
export function resolveTarget(input: { url?: string; port?: number }): string {
  if (input.url) {
    return /^https?:\/\//i.test(input.url) ? input.url : `https://${input.url}`;
  }
  if (input.port) return `http://localhost:${input.port}/`;
  throw new Error("scan_ui needs either a url or a localhost port.");
}

export interface ScanCodebaseArgs {
  readonly path: string;
  readonly include?: readonly string[];
  readonly readHistory?: boolean;
  readonly maxFiles?: number;
}

/** Scan a repository. Exported separately from the tool wiring so it is directly testable. */
export async function scanCodebase(args: ScanCodebaseArgs): Promise<ToolPayload> {
  const detectorResult = await codeDetector.analyze(
    { kind: "repo", path: args.path },
    {
      options: {
        ...(args.include ? { include: args.include } : {}),
        ...(args.readHistory === undefined ? {} : { readHistory: args.readHistory }),
        ...(args.maxFiles ? { maxFiles: args.maxFiles } : {}),
      },
    },
  );
  return toToolPayload(buildReport([detectorResult], { config: CODE_CONFIG }));
}

export interface ScanUiArgs {
  readonly url?: string;
  readonly port?: number;
  readonly viewportWidth?: number;
  readonly viewportHeight?: number;
}

/** Render and scan a page. Returns `not_assessed` rather than throwing if playwright is absent. */
export async function scanUi(args: ScanUiArgs): Promise<ToolPayload> {
  const target = resolveTarget(args);
  let report: Report;
  try {
    const detectorResult = await webDetector.analyze(
      { kind: "url", url: target },
      {
        options: {
          viewport: {
            width: args.viewportWidth ?? 390,
            height: args.viewportHeight ?? 844,
          },
        },
      },
    );
    report = buildReport([detectorResult]);
  } catch (error) {
    if (error instanceof PlaywrightUnavailableError) {
      // NOT an error result and NOT a low score. "We could not render it" and "we rendered it
      // and it was clean" produce the same empty finding list and opposite meanings.
      return toToolPayload(
        notAssessed(
          "detector_unavailable",
          "playwright is not installed, so the page was never rendered. This server will not substitute a server-HTML read for a rendered one: a fetch-only read produces confident findings about a document nobody sees. Run `npx playwright install chromium`.",
        ),
      );
    }
    throw error;
  }
  return toToolPayload(report);
}

export interface ListRulesArgs {
  readonly modality?: "web" | "code" | "all";
  readonly family?: string;
}

export interface RulesListing {
  readonly corpora: readonly { readonly detectorId: string; readonly modality: string; readonly corpusVersion: string }[];
  readonly scoring: {
    readonly ceiling: number;
    readonly note: string;
    readonly families: readonly { readonly id: string; readonly title: string; readonly capShare: number; readonly caveat: string }[];
  };
  readonly rules: readonly {
    readonly id: string;
    readonly modality: string;
    readonly family: string;
    readonly title: string;
    readonly polarity: string;
    readonly severity: string;
    readonly baseWeight: number;
    readonly since: string;
    readonly whyItReadsAsGenerated: string;
    readonly counterEvidenceThatWouldRebutIt: string;
    readonly prevention?: string;
  }[];
}

/** The whole corpus, weights and rationale included. The prevention loop's payload. */
export function listRules(args: ListRulesArgs = {}): RulesListing {
  const modality = args.modality ?? "all";
  const sets = [
    { modality: "web" as const, detectorId: WEB_DETECTOR_ID, corpusVersion: webDetector.corpusVersion, rules: RULE_DESCRIPTORS },
    { modality: "code" as const, detectorId: CODE_DETECTOR_ID, corpusVersion: codeDetector.corpusVersion, rules: CODE_RULE_DESCRIPTORS },
  ].filter((s) => modality === "all" || s.modality === modality);

  return {
    corpora: sets.map((s) => ({ detectorId: s.detectorId, modality: s.modality, corpusVersion: s.corpusVersion })),
    scoring: {
      ceiling: 99,
      note:
        "Scores are bounded at 99 and cannot reach certainty. Rules are grouped into families, each family is capped at a share of the total budget so no family can carry a verdict alone, repeated evidence within a rule decays harmonically, and counter-evidence rules subtract. Low coverage withholds the score entirely rather than reporting a low one.",
      families: [...DEFAULT_CONFIG.families, ...CODE_CONFIG.families]
        .map((f) => ({ id: f.id, title: f.title, capShare: f.capShare, caveat: f.caveat }))
        .filter((f, i, all) => all.findIndex((x) => x.id === f.id && x.title === f.title) === i),
    },
    rules: sets
      .flatMap((s) => s.rules.map((r) => ({ ...r, modality: s.modality })))
      .filter((r) => !args.family || r.family === args.family)
      .map((r) => ({
        id: r.id,
        modality: r.modality,
        family: r.family,
        title: r.title,
        polarity: r.polarity,
        severity: r.severity,
        baseWeight: r.baseWeight,
        since: r.since,
        whyItReadsAsGenerated: r.explanation,
        counterEvidenceThatWouldRebutIt: r.falsePositiveNote,
        ...(r.prevention ? { prevention: r.prevention } : {}),
      })),
  };
}

/** Build the server with all three tools registered. */
export function createServer(): McpServer {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    {
      instructions:
        "Deterministic, evidence-cited detection of template and machine-generated tells in code and rendered web pages. " +
        "Call list_rules BEFORE generating code or UI to learn what not to produce; that is the primary use. " +
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
        maxFiles: z.number().int().positive().optional().describe("Cap on files walked. Default 5000."),
      },
    },
    async (args) => result(await scanCodebase(args as ScanCodebaseArgs)),
  );

  server.registerTool(
    "scan_ui",
    {
      title: "Render a page and scan it for template tells",
      description:
        "Renders the page in a real browser (playwright) and measures the RENDERED document, never the server HTML: a static read produces confident findings about a document the visitor never sees. Returns builder fingerprints, default visual language, craft-floor defects, structural uniformity and copy tells, each with a CSS selector or a computed style value you can re-read in DevTools, plus counter-evidence that argues for the page. Accepts a URL or a localhost port.",
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
      title: "List the full rule corpus with weights and rationale",
      description:
        "Returns every rule in both corpora: id, family, weight, severity, why it reads as machine-generated, the counter-evidence that would rebut it, and how to avoid producing it. Call this BEFORE writing code or building a UI. This is the prevention half of the product and the reason the plugin exists: a corpus you can read is worth more than a score you cannot argue with.",
      inputSchema: {
        modality: z.enum(["web", "code", "all"]).optional().describe("Restrict to one corpus. Default all."),
        family: z.string().optional().describe("Restrict to one rule family, e.g. 'agent-artifact'."),
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

  return server;
}
