/**
 * One source for everything the site says about the MCP server.
 *
 * `/mcp`, the landing section and `/llms.txt` all print install commands, and three copies of a
 * command string is three chances to ship one that 404s. They read from here instead, and
 * `test/mcp-commands.test.ts` diffs every command in this file against
 * `packages/mcp-server/README.md`, so the docs and the page cannot drift apart either.
 *
 * THE AVAILABILITY FLAGS BELOW ARE THE WHOLE POINT OF THIS FILE.
 *
 * When this file was written a stranger genuinely could not install this server: the package was
 * unpublished and the repository was private, so every command on the site 404'd for its reader.
 * That is fixed on one axis and not the other. The server now lives in its own PUBLIC repository
 * at github.com/Yuve21/slop-scorer-mcp, so the GitHub install below works for anybody. npm still
 * has no `slop-scorer-mcp` on it, so the registry one-liner still does not. Each command
 * therefore carries an `availability`, the page labels it, and the ones that work are first.
 *
 * NOTHING HERE IS ASSERTED THAT WAS NOT RUN. `GITHUB_INSTALL` was executed from a clean npm
 * cache in an empty directory, against the public repository as a stranger would fetch it: it
 * cloned, installed, built, spoke MCP on stdio and returned all five tools, and `claude mcp
 * list` then reported it connected. `COLD_START_SECONDS` is the measured wall clock of that cold
 * run, and it is on the page because it is bad news rather than despite it.
 *
 * WHEN THE PACKAGE IS PUBLISHED: set `PUBLISHED_ON_NPM` to true. Nothing else on the site needs
 * editing. It is asserted by a person rather than probed, because a build that phoned the npm
 * registry to decide what to render would fail closed on a bad network and quietly relabel a
 * working command as unavailable. The publish checklist in the server's README carries the line.
 */

/** `npm view slop-scorer-mcp` -> 404 as of 2026-08-26. */
export const PUBLISHED_ON_NPM = false;

/**
 * github.com/Yuve21/slop-scorer-mcp is public as of 2026-08-26: an extraction of the four
 * packages the server actually needs, regenerated from this repository by
 * `scripts/sync-public-mcp.mjs` and leak-audited before anything is written.
 */
export const REPO_IS_PUBLIC = true;

export type Availability = "works-today" | "needs-publish";

export interface InstallCommand {
  /** What a reader is trying to do, in their words rather than ours. */
  readonly label: string;
  readonly command: string;
  readonly availability: Availability;
  /** Printed under the block. States the precondition, never implies there is not one. */
  readonly note: string;
}

/**
 * The absolute path form. `install:local` computes this from the checkout, so the page shows the
 * shape rather than a path off this machine, which would be a path that exists for nobody.
 */
export const LOCAL_BIN_PLACEHOLDER =
  "/absolute/path/to/slop-scorer-mcp/packages/mcp-server/dist/bin.js";

export const NPM_PACKAGE = "slop-scorer-mcp";
export const SERVER_KEY = "slop-scorer";
export const REPO_URL = "https://github.com/Yuve21/slop-scorer-mcp";

/** The npm-style spec for the public repository. npx resolves this with no registry involved. */
export const GITHUB_SPEC = "github:Yuve21/slop-scorer-mcp";

/** The one line that works today, for anybody, with nothing installed but Node 20 and npx. */
export const GITHUB_INSTALL = `claude mcp add ${SERVER_KEY} -- npx -y ${GITHUB_SPEC}`;

/** From a checkout of the public repository. Builds, then registers the built binary by path. */
export const LOCAL_INSTALL = "npm run install:local --workspace=packages/mcp-server";

/** The one line that will work once `npm publish` has been run once. */
export const NPX_INSTALL = `claude mcp add ${SERVER_KEY} -- npx -y ${NPM_PACKAGE}`;

/**
 * Measured, not estimated: a cold `npx -y github:...` in an empty directory with an empty npm
 * cache, timed end to end. It is here because most MCP clients give a server 30 seconds to
 * answer and this takes longer than that the FIRST time, which reads as a broken install unless
 * somebody says so first. Every surface that prints the GitHub command prints this beside it.
 */
export const COLD_START_SECONDS = 69;

export const COMMANDS: readonly InstallCommand[] = [
  {
    label: "One line, works today",
    command: GITHUB_INSTALL,
    availability: "works-today",
    note: `npx fetches the public repository, installs it, builds it and runs the server on stdio. Node 20 or newer and the claude CLI, and nothing else. The FIRST launch clones and compiles: that took ${COLD_START_SECONDS} seconds here from an empty npm cache, which is longer than the 30 seconds most clients allow a server to start, so it can report a timeout once. Run the npx line by itself in a terminal first, or simply reconnect. Every launch after that comes off the cache.`,
  },
  {
    label: "From a checkout",
    command: LOCAL_INSTALL,
    availability: "works-today",
    note: "Inside a clone of the public repository. Builds the server and registers the built binary by absolute path in one command, which is what you want if you intend to change a rule and watch it fire. If the claude CLI is missing it prints the JSON block to paste instead of failing silently.",
  },
  {
    label: "Once the package is on npm",
    command: NPX_INSTALL,
    availability: "needs-publish",
    note: `The same thing without the build step, because a registry tarball ships compiled. ${NPM_PACKAGE} has not been published yet, so the registry answers 404 to this today. It is printed so you know what to switch to, not so you can run it now.`,
  },
];

/** The JSON a client wants. The first two work today; the third is what it becomes. */
export const CONFIG_BLOCKS: readonly {
  readonly label: string;
  readonly availability: Availability;
  readonly json: string;
}[] = [
  {
    label: "From the public repository",
    availability: "works-today",
    json: `{ "mcpServers": { "${SERVER_KEY}": { "command": "npx", "args": ["-y", "${GITHUB_SPEC}"] } } }`,
  },
  {
    label: "Pointing at your own build",
    availability: "works-today",
    json: `{ "mcpServers": { "${SERVER_KEY}": { "command": "node", "args": ["${LOCAL_BIN_PLACEHOLDER}"] } } }`,
  },
  {
    label: "Pointing at the published package",
    availability: "needs-publish",
    json: `{ "mcpServers": { "${SERVER_KEY}": { "command": "npx", "args": ["-y", "${NPM_PACKAGE}"] } } }`,
  },
];

/** Where that block goes, per client. The block is identical; only the file differs. */
export const CLIENTS: readonly {
  readonly name: string;
  readonly where: string;
  readonly then: string;
}[] = [
  {
    name: "Claude Code",
    where: ".mcp.json in the project root, or ~/.claude.json for every project. The claude mcp add command above writes this for you.",
    then: "Start a new session, then ask it to call list_rules. On the very first launch it may say the connection timed out while npx is still building. Run claude mcp list again once that settles.",
  },
  {
    name: "Claude Desktop",
    where: "claude_desktop_config.json. On macOS that is ~/Library/Application Support/Claude/claude_desktop_config.json, on Windows %APPDATA%\\Claude\\claude_desktop_config.json.",
    then: "Quit and reopen the app. The server appears in the tools menu. Run the npx line in a terminal once beforehand so the first launch is not a cold build.",
  },
  {
    name: "Cursor",
    where: "~/.cursor/mcp.json for every project, or .cursor/mcp.json inside one.",
    then: "Reload the window, then check the MCP panel in settings. Same warming note: the first fetch is slow and the rest are not.",
  },
];

/**
 * The tools, as `/llms.txt` and `/mcp` both print them. Diffed against the server's source by
 * `test/llms-txt.test.ts`, so a tool renamed or added fails a test rather than being discovered
 * by somebody's agent calling a name that does not exist.
 *
 * `does` is written for an agent reading `/llms.txt`, which wants the caveats. `summary` is the
 * half-line the landing page can fit. Both are here so the two surfaces cannot describe the same
 * tool differently.
 */
export const TOOLS: readonly {
  readonly name: string;
  readonly summary: string;
  readonly does: string;
}[] = [
  {
    name: "scan_codebase",
    summary: "reads a checkout and cites a file and a line for every finding.",
    does: "Static, deterministic analysis of a checkout. Cites a file and a line for every finding: committed agent instruction files and transcripts, tests with no assertions, unfilled placeholders, blocks duplicated across files, a history written in one sitting. No model is involved.",
  },
  {
    name: "scan_ui",
    summary: "renders a URL in a real browser and measures what a person actually sees.",
    does: "Renders a URL or a localhost port in a real browser and measures the RENDERED document, never the server HTML. Returns builder fingerprints, default visual language, craft-floor defects, motion signature and copy tells, each with a CSS selector or a computed style value you can re-read in DevTools.",
  },
  {
    name: "list_rules",
    summary: "the whole corpus, compact, to read BEFORE generating anything.",
    does: "The rule corpus. Compact by default: id, family, weight and a one-line rationale, about 2k tokens. Pass verbose:true for the full entry including the counter-evidence that would rebut each rule and how to avoid producing it, or ruleIds:[...] for the full entry on named rules only. Call this BEFORE generating code or UI.",
  },
  {
    name: "propose_fixes",
    summary: "the same findings as precise edits, each with the argument against itself.",
    does: "The same findings as precise, caveated edits: exact locator, the text observed there, the replacement, the blast radius, the rule's own rebuttal, and the condition under which the change should NOT be applied. This server never writes a file. You apply the edits with your own tools under the user's approval.",
  },
  {
    name: "verify_fix",
    summary: "re-scans and names what is gone, what persists, and what is newly broken.",
    does: "Re-scans the same target and shows the before and after finding sets side by side: gone, persisting, and NEWLY present. A new finding sets regression:true and is stated first. It does not report success; a finding disappearing is the evidence.",
  },
];

export const LOOP = "scan_codebase or scan_ui -> propose_fixes -> you apply the edits -> verify_fix";
