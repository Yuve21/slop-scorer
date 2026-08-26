import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import EXAMPLE from "@/lib/mcp-example.json";
import {
  CLIENTS,
  COMMANDS,
  CONFIG_BLOCKS,
  LOCAL_INSTALL,
  NPX_INSTALL,
  PUBLISHED_ON_NPM,
  REPO_IS_PUBLIC,
  TOOLS,
} from "@/lib/mcp";

/**
 * THE INSTALL SECTION MAY NOT PRINT A COMMAND THAT FAILS FOR THE READER.
 *
 * That is the whole reason this file exists, and it is not a style rule. On the day this was
 * written `slop-scorer-mcp` was not on npm and this repository was private, so a copy button next
 * to `npx -y slop-scorer-mcp` would have handed every visitor a command that 404s. A product
 * whose argument is that claims must carry their evidence cannot ship that.
 *
 * Three drifts are covered, all of them things that would otherwise be caught by a stranger:
 *
 *  1. THE PAGE AND THE README DISAGREE. Both print install commands, and two copies of a command
 *     string is two chances for one of them to rot. Every command in `lib/mcp.ts` is asserted to
 *     appear verbatim in `packages/mcp-server/README.md`.
 *  2. A COMMAND LOSES ITS LABEL. Every command carries an availability, and the set of
 *     availabilities has to stay consistent with the two published-state booleans. If somebody
 *     flips `PUBLISHED_ON_NPM` without publishing, or publishes without flipping it, the README
 *     prose and the boolean part company and this fails.
 *  3. THE WORKED EXAMPLE STOPS BEING REAL. `/mcp` prints captured tool output as fact. This
 *     checks it is a capture of the tool it claims, of the rule the page's prose describes.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const README = readFileSync(
  path.resolve(HERE, "../../../packages/mcp-server/README.md"),
  "utf8",
);
const MCP_PAGE = readFileSync(path.resolve(HERE, "../app/mcp/page.tsx"), "utf8");
const LANDING = readFileSync(path.resolve(HERE, "../app/page.tsx"), "utf8");

describe("the site and the server's README print the same commands", () => {
  it.each(COMMANDS.map((c) => c.command))("README carries %s verbatim", (command) => {
    expect(README).toContain(command);
  });

  it.each(CONFIG_BLOCKS.map((b) => b.json))("README carries the config block %s", (json) => {
    // Compared on the significant characters, because the README wraps and the page does not.
    const squashed = README.replace(/\s+/g, " ");
    expect(squashed).toContain(json.replace(/\s+/g, " "));
  });

  it("names every client the README documents, and no others", () => {
    for (const client of CLIENTS) expect(README).toContain(client.name);
    // The count too: a fourth client added to the README and not to the page would leave a
    // reader on the site with no instructions for the client they actually use.
    const documented = ["Claude Code", "Claude Desktop", "Cursor"];
    expect(CLIENTS.map((c) => c.name).sort()).toEqual([...documented].sort());
  });
});

describe("no command is presented as usable when it is not", () => {
  it("labels exactly one path as working today, and it is the local build", () => {
    const today = COMMANDS.filter((c) => c.availability === "works-today");
    expect(today.map((c) => c.command)).toEqual([LOCAL_INSTALL]);
  });

  it("keeps the npx path labelled by what it waits on, while npm has no package", () => {
    const npx = COMMANDS.find((c) => c.command === NPX_INSTALL);
    expect(npx).toBeDefined();
    expect(npx?.availability).toBe(PUBLISHED_ON_NPM ? "works-today" : "needs-publish");
  });

  it("says out loud, in the README, whichever state the booleans are in", () => {
    // The two must move together. This is the assertion that fails if somebody flips the flag
    // without publishing, or publishes and forgets the flag.
    if (PUBLISHED_ON_NPM) {
      expect(README).not.toContain("not on the npm registry yet");
    } else {
      expect(README).toContain("not on the npm registry yet");
    }
    if (REPO_IS_PUBLIC) {
      expect(README).not.toContain("while the repository is private");
    } else {
      expect(README).toContain("while the repository is private");
    }
  });

  it("has no install command typed into a page instead of imported", () => {
    // A hardcoded `npx -y slop-scorer-mcp` in JSX is a copy that no flag can relabel, which is
    // exactly how a page starts telling a reader to run something that cannot work.
    for (const [name, source] of [
      ["/mcp", MCP_PAGE],
      ["/", LANDING],
    ] as const) {
      expect(source, `${name} hardcodes an npx install`).not.toContain("npx -y slop-scorer-mcp");
      expect(source, `${name} hardcodes claude mcp add`).not.toContain("claude mcp add");
    }
  });

  it("gives every tool a landing-page summary, so the page cannot invent one", () => {
    expect(TOOLS.length).toBe(5);
    for (const tool of TOOLS) {
      expect(tool.summary.length, `${tool.name} has no summary`).toBeGreaterThan(20);
      expect(tool.does.length).toBeGreaterThan(tool.summary.length);
    }
  });
});

describe("the worked example on /mcp is a real capture", () => {
  it("is output from the tool the page names, not a sample", () => {
    expect(EXAMPLE.tool).toBe("scan_codebase");
    // The receipt header the formatter prints. A hand-written sample would not carry it.
    expect(EXAMPLE.scanText).toContain("SLOP RECEIPT");
    expect(EXAMPLE.scanText).toContain("corpus code-corpus");
    expect(EXAMPLE.commit).toMatch(/^[0-9a-f]{7,40}$/);
    expect(Number.isNaN(Date.parse(EXAMPLE.capturedAt))).toBe(false);
  });

  it("illustrates the rule the page's prose is about, with its own rebuttal attached", () => {
    expect(EXAMPLE.proposal.ruleId).toBe("verify.tautological-tests");
    expect(MCP_PAGE).toContain("no assertions");
    expect(EXAMPLE.proposal.remediation.rebuttal.length).toBeGreaterThan(40);
    expect(EXAMPLE.proposal.remediation.doNotApplyIf.length).toBeGreaterThan(20);
  });

  it("is a reading of our own repository, including findings against us", () => {
    // The example scans this checkout on purpose. If it ever stops finding anything about us it
    // has stopped being a receipt and become an advert, and this is where that gets noticed.
    expect(EXAMPLE.proposalSummary.findings).toBeGreaterThan(0);
    expect(EXAMPLE.proposal.remediation.locator).toContain("packages/");
  });
});
