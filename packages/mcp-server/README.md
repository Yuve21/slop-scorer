# slop-scorer MCP

Five tools for a coding agent. Deterministic, evidence-cited detection of template and
machine-generated tells in **code** and in **rendered web pages**, plus the full rule corpus so
an agent can read what not to produce before it produces it.

No model is involved anywhere in this server. Every finding cites a file and a line, or a CSS
selector and a computed style value, that you can go and check yourself, and every finding that
can be acted on comes with the exact edit for your agent to apply.

---

## Install

**Read this before you copy anything.** `slop-scorer-mcp` is **not on the npm registry yet** and
this repository is **private**. `npm view slop-scorer-mcp` returns 404, github.com/Yuve21/slop-scorer
returns 404 to anybody not on the repository, and both `curl | sh` installers therefore 404 too.
Exactly one path works today, and it is the first one below. The rest are printed with what they
are waiting on, because a command that fails for the reader is the species of confident, unearned
claim this package exists to detect.

### Works today, from a checkout

```sh
npm run install:local --workspace=packages/mcp-server
```

Builds the package and registers the built binary with `claude mcp add` by absolute path, in one
command. Node 20+ and the `claude` CLI on PATH. If the CLI is missing it prints the JSON block to
paste by hand rather than failing silently. Cross-platform: it shells out with `execFileSync` and
computes the path from its own location, so the caller's cwd and shell do not matter.

Then, in any client, point at the printed path:

```json
{ "mcpServers": { "slop-scorer": { "command": "node", "args": ["/absolute/path/to/slop-scorer/packages/mcp-server/dist/bin.js"] } } }
```

### One line, once the package is published

```sh
claude mcp add slop-scorer -- npx -y slop-scorer-mcp
```

That becomes the whole install: Node 20+ and nothing else, no build step and no update step,
because npx always runs the version on the registry. It 404s until `npm publish` has been run
once. See "Publishing this package" at the bottom of this file.

### Client configuration, by hand

Every client takes the identical block; only the file it goes in differs. Use the `node` form
above today and the `npx` form below once the package is published. Restart the client after
editing its config, then ask it to call `list_rules`.

| Client | File |
| --- | --- |
| Claude Code | `.mcp.json` in the project root, or `~/.claude.json` for every project. `claude mcp add` writes this for you. |
| Claude Desktop | macOS `~/Library/Application Support/Claude/claude_desktop_config.json`, Windows `%APPDATA%\Claude\claude_desktop_config.json`. Quit and reopen the app. |
| Cursor | `~/.cursor/mcp.json` globally, or `.cursor/mcp.json` per project. Reload the window. |

```json
{ "mcpServers": { "slop-scorer": { "command": "npx", "args": ["-y", "slop-scorer-mcp"] } } }
```

### Just tell your agent to install it

Once published, paste this into any coding agent with shell access, in any client:

```
Install the slop-scorer MCP server for yourself. Run:
  claude mcp add slop-scorer -- npx -y slop-scorer-mcp
If that CLI isn't available, add {"command":"npx","args":["-y","slop-scorer-mcp"]} under
mcpServers in whatever MCP config file you use, then restart. Verify by calling list_rules.
```

### Or run the installer script, once the repository is public

Finds every MCP client on the machine, registers the server, backs up any file it edits, and is
idempotent. Both URLs 404 while the repository is private.

macOS and Linux:

```sh
curl -fsSL https://raw.githubusercontent.com/Yuve21/slop-scorer/main/packages/mcp-server/install.sh | sh
```

Windows:

```powershell
powershell -c "irm https://raw.githubusercontent.com/Yuve21/slop-scorer/main/packages/mcp-server/install.ps1 | iex"
```

Both scripts check, before touching any config, that `slop-scorer-mcp` actually exists on the
npm registry, and refuse with a clear message instead of silently registering a command that
would 404 the first time a client tried to launch it. That check is why they are safe to publish
before the package is: they fail loudly and change nothing.

### Rendering pages needs a browser

`scan_ui` renders in real Chromium. Once:

```sh
npx playwright install chromium
```

Without it, `scan_ui` returns `status: "not_assessed"` and says so. It will not fall back to
reading the server HTML: a fetch-only read produces confident findings about a document nobody
sees, which is how a heading check in the source corpus reported "this route has 0 H1s" for a
route whose heading does not exist until hydration.

---

## The loop

**scan -> propose_fixes -> apply -> verify_fix.** The report was never the point; the change
was.

```
1. scan_codebase / scan_ui   what is there, with a locator on every claim
2. propose_fixes             the same findings as precise, caveated edits
3. YOUR agent applies them   with its own edit tools, under the user's normal approval
4. verify_fix                re-scan, and show which findings are no longer present
```

**This server never writes a file.** There is no fs write, no exec and no request for write
access anywhere in the package. A remediation is data: a path and a 1-based line range (or a CSS
selector and a property), the text that was actually observed there, the text proposed instead,
and the condition under which the change should not be made. The agent that called the tool
applies it, because that agent already has edit tools, an approval prompt and a user who trusts
them. A second, worse copy of that machinery inside an MCP server would be more code, more risk
and less control.

Three things follow from that, and they are the design rather than the caveats:

- **Only a deterministic read proposes a patch.** The code and web corpora cite facts you can
  re-read, so they can propose edits. A probabilistic or provenance read gets `manual` guidance
  and nothing else: where the detector abstains from certainty, the fix cannot assert it.
- **Every fix carries the rule's own rebuttal and an explicit `doNotApplyIf`.** A fix is a claim
  that something is wrong, so it ships with the argument against itself, injected from the
  rule's `falsePositiveNote` so the two can never drift apart.
- **Counter-evidence is never remediable.** A counter finding argues FOR the artifact. There is
  nothing in it to fix, and the corpus throws at load if anyone attaches a fix to one.

---

## The tools

### `list_rules` — read this before you write anything

Returns every rule in both corpora. **Compact by default**, because this tool asks to be called
BEFORE you generate anything and the full listing measured ~15,800 tokens, which is a fifth of a
small context window spent speculatively. Nobody pays that, so the tool that is the point of the
plugin was the one tool nobody would call.

- `index` — every rule, one line each: `id | family | polarity/severity | weight | rationale`.
  Always present, whatever the other arguments. Roughly **2,800 tokens** for both corpora.
- `fullEntries` — the rest of what the corpus holds about a rule: why it reads as
  machine-generated, the counter-evidence that would rebut it, and how to avoid producing it.
  Empty by default; `ruleIds` fills it for the rules you name, `verbose` for all of them.
- `retrieval` — a sentence on every response saying how to get what was left out. Nothing is
  lost in the compact form; it is retrievable rather than resident.

The usual pattern after a scan is `ruleIds: [...the ids that fired]`, which costs a few hundred
tokens and returns exactly the rebuttal and prevention note you need to act on them.

This is the point of the plugin, not a debugging aid. Detection is a race that eventually gets
lost: generators improve and tells decay. Prevention does not decay, because an agent that reads
the corpus first produces work the corpus does not fire on. It is the only loop here that gets
stronger the more it is used.

```
modality: "web" | "code" | "all"   (optional)
family:   e.g. "agent-artifact"    (optional)
ruleIds:  ["craft.no-og-image", ...] full entries for these only   (optional)
verbose:  true -> full entries for every rule, ~18,000 tokens      (optional)
```

Measured with `node scripts/measure-list-rules.mjs`, which prints every shape and its estimated
token cost at four characters per token. The estimate is labelled as one everywhere it appears.

### `scan_codebase` — point it at a repo

```
path:        absolute path to the repository root
include:     optional glob-ish patterns, e.g. ["src/**/*.ts"]
readHistory: read git history for the commit-shape rules (default true)
maxFiles:    cap on files walked (default 5000)
```

Finds: committed agent instruction files and chat transcripts; comments that restate the line
beneath them; unused declared dependencies; tooling configs identical to the generator's stub;
README template markers; unfilled placeholders; machine-even function and file lengths;
duplicated blocks across three or more files; absent or tautological tests; a whole history
written in one sitting.

Counter-evidence it also looks for: comments that record a REASON, a history with reverts and
merges and explanations in it, tests dense enough to actually fail, and the apparatus of people
working together (CODEOWNERS, PR templates, a changelog, real CI).

A real finding, from the integration fixture:

```
  +27  agent.instruction-file-committed  [agent-artifact / high]  -> 42
       An agent instruction file is committed to the repository
       evidence: file CLAUDE.md = "4200 bytes, Claude Code instruction file"
                 (expected "not tracked, or documented as a deliberate team practice")
       caveat: This says how the repository was worked on, not who wrote any given line.
               Committing an instruction file is increasingly a deliberate team practice,
               and a repository can hold one while every line in it was written and
               reviewed by a person.
```

### `scan_ui` — point it at a URL or a dev server

```
url:            https://example.com/pricing
port:           3000                       (instead of url, for a local dev server)
viewportWidth:  default 390
viewportHeight: default 844
```

Renders the page in Chromium and measures the **rendered document**. Finds builder
fingerprints, default visual language, craft-floor defects, structural uniformity and copy
tells, each with a selector or a computed value.

A real finding:

```
   +7  css.crushed-tracking  [visual-default / medium]  -> 34
       Headline letter-spacing is crushed at a heavy weight
       evidence: css letter-spacing on h1 = "-0.04em at weight 800"
                 (expected "-0.02em or looser at weight 700+")
       caveat: Some faces genuinely want negative tracking at display size, and a
               type-literate designer may choose exactly this. It is a taste signal,
               not a provenance signal.
```

### `propose_fixes` — turn the findings into edits

```
path / include / readHistory   a repository, as scan_codebase takes it
url / port                     a page, as scan_ui takes it
```

Re-scans the target and returns every finding as a proposal, grouped by family and split four
ways so it can be presented as "apply these N, skip these M":

| bucket | meaning |
| --- | --- |
| `readyToApply` | `replace_range`, `insert`, `replace_file`. Locator and replacement both determined. |
| `needsConfirmation` | `delete_file`. The only destructive kind, and its own kind so it can be gated. |
| `needsSourceLocation` | `ui_change`. The selector, property and values are exact; the file that declares them is not knowable from a rendered read. |
| `decideYourself` | `manual`. A person decides. The locator and what a good answer looks like, and no invented value. |

A proposal, as returned:

```json
{
  "id": "agent.instruction-file-committed#1",
  "ruleId": "agent.instruction-file-committed",
  "applicability": "confirm",
  "destructive": true,
  "blastRadius": "file",
  "remediation": {
    "kind": "delete_file",
    "path": "CLAUDE.md",
    "bytes": 4200,
    "destructive": true,
    "summary": "Remove CLAUDE.md from the repository and from the index.",
    "rebuttal": "This says how the repository was worked on, not who wrote any given line...",
    "doNotApplyIf": "this file is a deliberate part of how the team works. In that case keep it and say so in the README, which answers the finding without deleting anything.",
    "addresses": ["CLAUDE.md"]
  },
  "evidence": [{ "locator": "CLAUDE.md", "observed": "4200 bytes, Claude Code instruction file" }]
}
```

Most rules propose `manual` on purpose. A page title, a meta description, an alt attribute and a
brand palette are all things a machine can produce instantly and all things whose machine
production is the defect this corpus measures, so those rules name the gap and stop. Generated
alt text is the clearest case: it satisfies the checker and tells a screen reader user,
confidently, about an image nobody looked at.

### `verify_fix` — re-scan, and prove it

```
path / include / readHistory   the same repository the scan used
url / port                     the same page
```

Runs the scan again and puts the two finding sets side by side:

```
Before: 9 finding(s). After: 6. 3 no longer present, 6 still present, 0 newly present.
Score moved by -14 point(s).
```

It does not report success. `noLongerPresent` is a list of rules this corpus no longer matches
at those locators, which is a fact about a re-scan and not a claim that a problem was solved.
`stillPresent` carries what each surviving finding cites NOW. And `newlyPresent` is stated
first and sets `regression: true`, because a change that resolves two findings and introduces
one has broken something, and a verifier that reported the net would call that an improvement.

If no earlier reading of the target is held in this session it says so rather than comparing
against nothing: a first run is never an all-clear.

---

## What the output is, and what it is not

Modelled on Stripe Radar's contract, because Radar is the only shipped, at-scale, legally
survivable version of "score a stranger's artifact and say something about it".

- **`status` is the field you branch on**, and it is one of `assessed`, `inconclusive`,
  `not_assessed`. Both abstentions carry `score: null` and a coded reason. They are not low
  scores and not clean bills of health.
- **The score is bounded at 99.** There is no arrangement of evidence that reaches certainty.
- **The verdict describes what the server did**, never what anyone is. "We checked this artifact
  against 30 deterministic rules and 7 matched, on 87% coverage." Not "this is AI."
- **Low coverage withholds the score.** A thin read of an artifact looks exactly like a clean
  artifact, and printing a confident number over a 20% read would be the most dishonest thing
  this server could do.
- **Rules are grouped into capped families**, so no single group of correlated tells can carry a
  verdict alone, and **counter-evidence subtracts**. A cream background is explicitly not a tell:
  three of four funded, design-literate human comparables use one.
- **The receipt reconciles.** Base rate plus every printed contribution equals the printed score,
  in integers, exactly. You can recompute the number by hand.

This server publishes no accuracy figure. A test in `@slop/core` scans this file and all shipped
source for one and fails the build if it finds it. The reason is *In re Workado*: an accuracy
claim about an inference is substantiation-bearing under FTC Act s5, so the only defensible way
to hold one is to compute it from a named corpus at test time.

---

## Publishing this package

The package is self-contained: `npm run build` (which `prepack` and `prepublishOnly` both run
automatically) bundles the three internal workspace packages this server depends on
(`@slop/core`, `@slop/detectors-code`, `@slop/detectors-web`, all `"private": true` and never
published on their own) into `dist/bin.js` and `dist/index.js` with esbuild, and vendors their
type declarations into `dist/vendor/` with the `@slop/*` specifiers rewritten to relative paths.
Nothing in the published tarball points back at an unpublished package. `@modelcontextprotocol/sdk`
and `zod` stay real, external, registry dependencies; `playwright` stays an optional peer.

Chosen name: **`slop-scorer-mcp`** (matches the existing `bin` name and the server's own
`SERVER_NAME`). Confirmed unclaimed on the npm registry (`npm view slop-scorer-mcp` returns
404). Fallbacks, also confirmed unclaimed, if the founder's npm account already holds the first
one or prefers a different shape: `mcp-slop-scorer`, `slop-scorer-server`.

To publish, from a checkout, as the account that owns the name:

```sh
cd packages/mcp-server
npm login                        # once, if not already
npm publish --access public      # runs the build automatically via prepublishOnly
```

This has deliberately not been run: the founder owns the npm account and the decision of when a
public package first appears under it. Everything up to that command is done; that command is
the one thing left.

### The moment it is published, edit these two lines and nothing else

The website labels every install command with whether it can actually work, and both labels come
from two booleans in `apps/web/lib/mcp.ts`:

```ts
export const PUBLISHED_ON_NPM = false;   // -> true after `npm publish` succeeds
export const REPO_IS_PUBLIC = false;     // -> true when the GitHub repository goes public
```

Flipping the first relabels the npx command and its config block on `/mcp`, rewrites the
availability paragraph on the landing page and on `/mcp`, and changes the warning at the top of
`/llms.txt`. Flipping the second un-warns the two `curl | sh` installers. Then update the two
sentences at the top of this file's Install section, which `apps/web/test/mcp-commands.test.ts`
checks are still in agreement with those booleans.

They are asserted by a person rather than probed at build time on purpose: a build that phoned
the npm registry to decide what to render would fail closed on a bad network and quietly relabel
a working command as unavailable.

To prove the artifact works before publishing, without touching the registry:

```sh
cd packages/mcp-server
npm run build
npm pack                                        # writes slop-scorer-mcp-0.1.0.tgz
mkdir /tmp/slop-scorer-smoke-test && cd $_
npm init -y
npm install /path/to/slop-scorer-mcp-0.1.0.tgz  # installs from the tarball, nothing else
node node_modules/slop-scorer-mcp/dist/bin.js   # speaks MCP on stdio; Ctrl-C to stop
```

A clean `npm install` of that tarball pulls in only `@modelcontextprotocol/sdk` and `zod`; there
is no `node_modules/@slop` and nothing 404s. This is exactly what happened in the verification
for this change: the tarball installed and the binary answered `initialize` and `tools/list`
correctly (all three tools present) from a directory with no relationship to this monorepo.
