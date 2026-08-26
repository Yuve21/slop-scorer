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
 * On the day this was written a stranger genuinely could not install this server: `npm view
 * slop-scorer-mcp` returns 404, the GitHub repository is private and answers 404 to anybody
 * else, and both `curl | sh` installers therefore 404 too. A site whose product is the
 * detection of confident, unearned claims does not get to print a command that fails for its
 * reader. So every command here carries an `availability`, the page labels it, and the one path
 * that works today is the one presented first.
 *
 * WHEN THE PACKAGE IS PUBLISHED: set `PUBLISHED_ON_NPM` to true. When the repository goes
 * public: set `REPO_IS_PUBLIC` to true. Nothing else on the site needs editing. Both are
 * asserted by a person rather than probed, because a build that phoned the npm registry to
 * decide what to render would fail closed on a bad network and quietly relabel a working
 * command as unavailable. The publish checklist in the server's README carries both lines.
 */

/** `npm view slop-scorer-mcp` -> 404 as of 2026-08-26. */
export const PUBLISHED_ON_NPM = false;

/** github.com/Yuve21/slop-scorer -> 404 to anyone not on the repository as of 2026-08-26. */
export const REPO_IS_PUBLIC = false;

export type Availability = "works-today" | "needs-publish" | "needs-public-repo";

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
export const LOCAL_BIN_PLACEHOLDER = "/absolute/path/to/slop-scorer/packages/mcp-server/dist/bin.js";

export const NPM_PACKAGE = "slop-scorer-mcp";
export const SERVER_KEY = "slop-scorer";

/** The one line that works today, from a checkout, on macOS, Linux and Windows alike. */
export const LOCAL_INSTALL = "npm run install:local --workspace=packages/mcp-server";

/** The one line that will work once `npm publish` has been run once. */
export const NPX_INSTALL = `claude mcp add ${SERVER_KEY} -- npx -y ${NPM_PACKAGE}`;

export const COMMANDS: readonly InstallCommand[] = [
  {
    label: "From a checkout, today",
    command: LOCAL_INSTALL,
    availability: "works-today",
    note: "Builds the server and registers the built binary with the Claude Code CLI by absolute path, in one command. It needs Node 20 or newer and the claude CLI on PATH; if the CLI is missing it prints the JSON block to paste instead of failing silently. This is the path that works right now.",
  },
  {
    label: "One line, once the package is published",
    command: NPX_INSTALL,
    availability: "needs-publish",
    note: `This fetches ${NPM_PACKAGE} from the npm registry, and the registry answers 404 today because the package has not been published yet. It is printed so you can see what the install becomes, not so you can run it now.`,
  },
];

/** The JSON a client wants, in both forms, because the difference is the whole honesty problem. */
export const CONFIG_BLOCKS: readonly {
  readonly label: string;
  readonly availability: Availability;
  readonly json: string;
}[] = [
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
    then: "Start a new session, then ask it to call list_rules.",
  },
  {
    name: "Claude Desktop",
    where: "claude_desktop_config.json. On macOS that is ~/Library/Application Support/Claude/claude_desktop_config.json, on Windows %APPDATA%\\Claude\\claude_desktop_config.json.",
    then: "Quit and reopen the app. The server appears in the tools menu.",
  },
  {
    name: "Cursor",
    where: "~/.cursor/mcp.json for every project, or .cursor/mcp.json inside one.",
    then: "Reload the window, then check the MCP panel in settings.",
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
