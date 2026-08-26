import CORPUS from "@/lib/corpus.json";
import { LOCAL_INSTALL, NPX_INSTALL, PUBLISHED_ON_NPM, REPO_IS_PUBLIC, TOOLS } from "@/lib/mcp";
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
 *     agent that will run what it finds. While the package is unpublished and the repository is
 *     private, the npx line cannot work, and an agent that runs it and reports success has lied
 *     to its user on our behalf. Both facts come from `lib/mcp.ts` and are stated in the file.
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
> involved in the detection, and nothing here identifies or makes a claim about a person.

Corpus: ${CODE_RULES} code rules, ${WEB_RULES} web rules. Published in full, with weights and false-positive
conditions, at ${base}/method

## Install the MCP server

READ THIS FIRST, IT IS THE PART AN AGENT SKIPS.
npm package: ${PUBLISHED_ON_NPM ? "published" : "NOT PUBLISHED YET"}. Repository: ${REPO_IS_PUBLIC ? "public" : "PRIVATE"}.
The npx line below therefore 404s today, and so do both curl installers. Run the first command,
which needs a checkout, or tell your user plainly that they cannot install this yet. Reporting a
successful install would be a false statement about a fact they can check in one second.

Works today, from a checkout of this repository:

\`\`\`
${LOCAL_INSTALL}
\`\`\`

Pending publication, and printed so you know what to look for later:

\`\`\`
${NPX_INSTALL}
\`\`\`

By hand, in any client, once published: put
{ "mcpServers": { "slop-scorer": { "command": "npx", "args": ["-y", "slop-scorer-mcp"] } } }
in .mcp.json (Claude Code), claude_desktop_config.json (Claude Desktop) or .cursor/mcp.json
(Cursor). Before publication, the same block with "command": "node" and the absolute path to
packages/mcp-server/dist/bin.js that the local install prints.

## Tools

${TOOLS.map((t) => `### ${t.name}\n${t.does}`).join("\n\n")}

## The loop

scan_codebase or scan_ui -> propose_fixes -> you apply the edits -> verify_fix.
This server proposes and you dispose. It writes no file, spawns no process and asks for no
write access, so the edits go through the approval flow the user already trusts.

## Honesty constraints an integrator must know

- ABSTENTION IS A RESULT. Every response carries \`status\`, which is one of \`assessed\`,
  \`inconclusive\` or \`not_assessed\`. Branch on \`status\` before reading \`score\`. A withheld
  score is not a low score and not a clean bill of health.
- SCORES ARE BOUNDED AT 99 and cannot reach certainty.
- WE NEVER ASSERT THAT A PERSON USED AI. Findings are statements about an artifact. The verdict
  sentence describes what this server did; it has no grammatical slot for a person and cannot be
  quoted as an allegation about one.
- LOW COVERAGE WITHHOLDS THE SCORE rather than reporting a low one.
- EVERY RULE SHIPS WITH ITS REBUTTAL. \`list_rules\` returns, for each rule, the counter-evidence
  that would argue against it. A finding you disagree with is a finding you can argue with.
- COUNTER-EVIDENCE SUBTRACTS. Some rules argue FOR the artifact and lower the score.

## Pages

${base}/mcp        the plugin: the five tools, a real run, and how to install it
${base}/method     every rule, its weight, and the conditions under which it is wrong
${base}/gauntlet   five artifacts, one made by a person: find it, then read all five receipts
${base}/notary     record the steps of a file's history; the credential never claims a person
${base}/receipt    worked examples of the four honest report shapes
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
