# slop-scorer MCP

Three tools for a coding agent. Deterministic, evidence-cited detection of template and
machine-generated tells in **code** and in **rendered web pages**, plus the full rule corpus so
an agent can read what not to produce before it produces it.

No model is involved anywhere in this server. Every finding cites a file and a line, or a CSS
selector and a computed style value, that you can go and check yourself.

---

## Install

### macOS and Linux

```sh
curl -fsSL https://raw.githubusercontent.com/OWNER/slop-scorer/main/packages/mcp-server/install.sh | sh
```

### Windows

```powershell
powershell -c "irm https://raw.githubusercontent.com/OWNER/slop-scorer/main/packages/mcp-server/install.ps1 | iex"
```

Both scripts find every MCP client on the machine, register the server, back up any file they
edit, and are idempotent. Node 20+ is the only requirement; the server itself is fetched by
`npx` at launch, so there is nothing to keep updated.

> The `OWNER` placeholder is deliberate: substitute it when the repository is published. Until
> then, run the script from a checkout (`sh packages/mcp-server/install.sh`) or use the config
> snippets below, which work today.

### One command, no script

```sh
claude mcp add slop-scorer -- npx -y slop-scorer-mcp
```

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

## Client configuration, by hand

**Claude Code** (`.mcp.json` in the project root, or `~/.claude.json` for every project):

```json
{
  "mcpServers": {
    "slop-scorer": { "command": "npx", "args": ["-y", "slop-scorer-mcp"] }
  }
}
```

**Claude Desktop**
(macOS `~/Library/Application Support/Claude/claude_desktop_config.json`,
Windows `%APPDATA%\Claude\claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "slop-scorer": { "command": "npx", "args": ["-y", "slop-scorer-mcp"] }
  }
}
```

**Cursor** (`~/.cursor/mcp.json` globally, or `.cursor/mcp.json` per project):

```json
{
  "mcpServers": {
    "slop-scorer": { "command": "npx", "args": ["-y", "slop-scorer-mcp"] }
  }
}
```

Restart the client afterwards, then ask it to call `list_rules`.

---

## The tools

### `list_rules` — read this before you write anything

Returns every rule in both corpora: id, family, weight, severity, why it reads as
machine-generated, the counter-evidence that would rebut it, and how to avoid producing it.

This is the point of the plugin, not a debugging aid. Detection is a race that eventually gets
lost: generators improve and tells decay. Prevention does not decay, because an agent that reads
the corpus first produces work the corpus does not fire on. It is the only loop here that gets
stronger the more it is used.

```
modality: "web" | "code" | "all"   (optional)
family:   e.g. "agent-artifact"    (optional)
```

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
