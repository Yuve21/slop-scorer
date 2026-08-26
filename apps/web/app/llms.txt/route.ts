import CORPUS from "@/lib/corpus.json";
import {
  COLD_START_SECONDS,
  GITHUB_INSTALL,
  GITHUB_SPEC,
  LOCAL_INSTALL,
  NPX_INSTALL,
  PUBLISHED_ON_NPM,
  REPO_IS_PUBLIC,
  REPO_URL,
  TOOLS,
} from "@/lib/mcp";
import { siteUrl } from "@/lib/site";

/**
 * `/llms.txt` — the file an agent looks for, served as a real route.
 *
 * The distribution thesis of this product is other people's coding agents, and until this
 * existed the one file those agents fetch by convention answered 404. It is a route handler
 * rather than a file in `public/` for one reason: the counts in it are read from the corpora
 * at request time, so it cannot claim thirty-nine rules on the day the corpus gains a fortieth.
 *
 * TWO THINGS IT MUST KEEP DOING, both checked by `test/llms-txt.test.ts`:
 *
 *  1. ANSWER 200 AT `/llms.txt`, NOT A REDIRECT. A 307 to a signed-in shell is exactly how
 *     `robots.txt` was lost on the founder's other project: an auth matcher that did not exempt
 *     the well-known paths. There is no proxy or middleware in this app, and the test asserts
 *     there is not, because adding one is how this file quietly stops being served.
 *  2. STATE THE ABSTENTION RULE. An agent reading this is being told what our tools return, and
 *     `inconclusive` and `not_assessed` are results rather than failures. An integrator who
 *     branches on `score` without branching on `status` first will read a withheld score as a
 *     clean bill of health, which is the single most likely misuse of this product.
 *  3. NEVER PRINT AN INSTALL COMMAND THAT WOULD FAIL FOR THE READER. The audience here is an
 *     agent that will run what it finds, so this is the one surface where a wrong command turns
 *     straight into a false statement made to somebody else's user. The GitHub install is here
 *     because it was run cold and watched to work; the registry install is here labelled as
 *     unpublished. Both facts come from `lib/mcp.ts`.
 *  4. WARN ABOUT THE COLD START, IN THE SAME BREATH. The first launch builds from source and
 *     takes longer than a client's connect timeout, so the honest install has a failure mode
 *     that looks exactly like a broken one. An agent told nothing will report the timeout as an
 *     install failure and walk its user away from a server that was about to work.
 */

export const dynamic = "force-dynamic";

/**
 * Rule counts from the generated manifest, not from the detector packages.
 *
 * `@slop/detectors-code` carries the repository scanner, whose runtime `readFile(path.join(root,
 * ...))` makes the bundler trace the entire project into this route's serverless output. Two
 * numbers do not justify that. `test/corpus-manifest.test.ts` re-derives the manifest from the
 * packages, so these counts still cannot go stale.
 */
const CORPORA = CORPUS as unknown as Record<string, { readonly corpusVersion: string; readonly ruleIds: readonly string[] }>;
const CODE_RULES = CORPORA.code?.ruleIds.length ?? 0;
const WEB_RULES = CORPORA.web?.ruleIds.length ?? 0;

/**
 * The tools, and every command in this file, come from `lib/mcp.ts`, which `/mcp` also reads.
 * Re-exported because `test/llms-txt.test.ts` imports `TOOLS` from here and diffs it against
 * `packages/mcp-server/src/server.ts`.
 */
export { TOOLS };

export async function GET(): Promise<Response> {
  const base = siteUrl();
  const body = `# Slop Scorer

> Deterministic, evidence-cited detection of template and machine-generated tells in code and
> rendered web pages. Every finding cites a file and a line or a CSS selector. No model is
> involved anywhere, and nothing here identifies or makes a claim about a person.

Corpus: ${CODE_RULES} code rules, ${WEB_RULES} web rules, published in full with weights and false-positive
conditions at ${base}/method

## Install the MCP server

Source: ${REPO_URL} (MIT, ${REPO_IS_PUBLIC ? "public" : "PRIVATE"}). npm package:
${PUBLISHED_ON_NPM ? "published" : "NOT PUBLISHED YET, so any npx line naming the bare package 404s"}.

Works today, for anyone, with Node 20 and npx:

\`\`\`
${GITHUB_INSTALL}
\`\`\`

READ THIS BEFORE YOU REPORT THE RESULT. The first launch clones and compiles from source: ${COLD_START_SECONDS}
seconds measured on an empty npm cache, against the 30 second startup timeout most MCP clients
use. One timeout on the FIRST connect is expected and is not a failed install. Run
\`npx -y ${GITHUB_SPEC}\` once to warm the cache, then reconnect. Do not report success
until a tools/list has actually come back, and do not report failure on one timeout.

By hand, put this in .mcp.json (Claude Code), claude_desktop_config.json (Claude Desktop) or
.cursor/mcp.json (Cursor):
{ "mcpServers": { "slop-scorer": { "command": "npx", "args": ["-y", "${GITHUB_SPEC}"] } } }

From a checkout instead: \`${LOCAL_INSTALL}\`.
Once published to npm, and not before: \`${NPX_INSTALL}\`.
\`scan_ui\` needs \`npx playwright install chromium\`; without it that one tool returns
not_assessed with a reason. The other four need no browser.

## Tools

${TOOLS.map((t) => `### ${t.name}\n${t.does}`).join("\n\n")}

## The loop

scan_codebase or scan_ui -> propose_fixes -> you apply the edits -> verify_fix.
This server writes no file and asks for no write access, so edits go through the approval flow
the user already trusts.

## Honesty constraints an integrator must know

- ABSTENTION IS A RESULT. Every response carries \`status\`, which is one of \`assessed\`,
  \`inconclusive\` or \`not_assessed\`. Branch on \`status\` before reading \`score\`. A withheld
  score is not a low score and not a clean bill of health.
- SCORES ARE BOUNDED AT 99 and cannot reach certainty.
- WE NEVER ASSERT THAT A PERSON USED AI. Findings are statements about an artifact. The verdict
  sentence describes what this server did; it has no grammatical slot for a person and cannot be
  quoted as an allegation about one.
- LOW COVERAGE WITHHOLDS THE SCORE rather than reporting a low one.
- EVERY RULE SHIPS WITH ITS REBUTTAL. \`list_rules\` returns the counter-evidence that argues
  against each rule. A finding you disagree with is a finding you can argue with.
- COUNTER-EVIDENCE SUBTRACTS. Some rules argue FOR the artifact and lower the score.

## Pages

${base}/mcp        the five tools, a real run, and how to install it
${base}/method     every rule, its weight, and when it is wrong
${base}/gauntlet   five artifacts, one made by a person: find it
${base}/notary     record a file's history; it never claims a person
${base}/receipt    the four honest report shapes, worked
`;

  return new Response(body, {
    status: 200,
    headers: {
      // text/plain, because the audience is a fetcher rather than a browser, and a charset
      // because an agent reading bytes should not have to guess.
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=0, must-revalidate",
    },
  });
}
