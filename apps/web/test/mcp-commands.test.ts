import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import EXAMPLE from "@/lib/mcp-example.json";
import {
  CLIENTS,
  COLD_START_SECONDS,
  COMMANDS,
  CONFIG_BLOCKS,
  GITHUB_INSTALL,
  GITHUB_SPEC,
  LOCAL_INSTALL,
  NPX_INSTALL,
  PUBLISHED_ON_NPM,
  REPO_IS_PUBLIC,
  REPO_URL,
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
/** The landing section lives in its own component so two agents can edit the page at once. It
 *  is checked alongside the page it renders into, or moving the section would move it out of
 *  reach of the hardcoded-command check below. */
const LANDING_SECTION = readFileSync(
  path.resolve(HERE, "../components/mcp/mcp-section.tsx"),
  "utf8",
);

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
  it("labels the two paths that were actually run as working today, and only those", () => {
    // Both of these were executed before they were printed. The GitHub one was run from an empty
    // directory with an empty npm cache and answered tools/list with all five tools; the local
    // one is the build-from-a-checkout path. Nothing else may claim this label.
    const today = COMMANDS.filter((c) => c.availability === "works-today");
    expect(today.map((c) => c.command)).toEqual([GITHUB_INSTALL, LOCAL_INSTALL]);
  });

  it("offers the working one-liner first, because that is the only ordering a reader obeys", () => {
    expect(COMMANDS[0].command).toBe(GITHUB_INSTALL);
    expect(GITHUB_INSTALL).toContain(GITHUB_SPEC);
    // A git spec, not the bare package name. The bare name is the one that 404s.
    expect(GITHUB_INSTALL).not.toMatch(/npx -y slop-scorer-mcp\b/);
  });

  it("warns about the cold start everywhere the GitHub command is printed", () => {
    // The measured first launch is longer than the 30s an MCP client waits, so the honest
    // install has a failure mode indistinguishable from a broken one. An agent or a person told
    // nothing will read that timeout as "this does not work" and walk away from a working
    // server. The number is measured; the warning travels with the command.
    expect(COLD_START_SECONDS).toBeGreaterThan(30);
    const warned = COMMANDS.find((c) => c.command === GITHUB_INSTALL)?.note ?? "";
    expect(warned).toContain(String(COLD_START_SECONDS));
    expect(warned.toLowerCase()).toContain("timeout");
    expect(README).toContain(String(COLD_START_SECONDS));
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
      // The repository going public is what made the one-liner possible, so the README has to
      // name where it is. "No longer private" is not an address.
      expect(README).not.toContain("while the repository is private");
      expect(README).toContain(REPO_URL);
    } else {
      expect(README).toContain("while the repository is private");
    }
  });

  it("has no install command typed into a page instead of imported", () => {
    // A hardcoded install string in JSX is a copy that no flag can relabel, which is exactly how
    // a page starts telling a reader to run something that cannot work.
    for (const [name, source] of [
      ["/mcp", MCP_PAGE],
      ["/", LANDING],
      ["the landing MCP section", LANDING_SECTION],
    ] as const) {
      expect(source, `${name} hardcodes an npx install`).not.toContain("npx -y slop-scorer-mcp");
      expect(source, `${name} hardcodes a github npx install`).not.toContain(`npx -y ${GITHUB_SPEC}`);
      expect(source, `${name} hardcodes claude mcp add`).not.toContain("claude mcp add");
    }
  });

  it("puts the evidence before the install in the landing section", () => {
    // The section used to describe the plugin and then offer a command, which sells nothing: it
    // asks a reader to wire a stranger's binary into their agent on the strength of an
    // adjective. The captured finding has to come first in the source order, and it has to be
    // read out of the capture rather than retyped.
    expect(LANDING_SECTION).toContain("mcp-example.json");
    const evidenceAt = LANDING_SECTION.indexOf("EXAMPLE.score");
    const installAt = LANDING_SECTION.indexOf("<CommandBlock");
    expect(evidenceAt).toBeGreaterThan(-1);
    expect(installAt).toBeGreaterThan(-1);
    expect(evidenceAt).toBeLessThan(installAt);
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

  it("carries a finding cited to a LINE, which is what the landing section prints", () => {
    // The landing page has room for one finding and the shape is the whole argument: a path, a
    // colon, a line number, and the string that was read at it. A file-level citation reads like
    // a lint summary. This is asserted rather than trusted because the capture script picks the
    // proposal by rule id, and a rule can stop citing lines without anyone noticing.
    const cited = EXAMPLE.lineCited;
    expect(cited.ruleId).toBe("scaffold.placeholder-markers");
    const evidence = cited.evidence[0];
    expect(evidence.locator).toMatch(/^[\w./-]+:\d+$/);
    expect(evidence.observed.length).toBeGreaterThan(0);
    expect(evidence.expected.length).toBeGreaterThan(0);
    expect(cited.remediation.rebuttal.length).toBeGreaterThan(40);
    // It cites US. A demo that only ever shows other people failing is an advert.
    expect(evidence.locator.startsWith("packages/")).toBe(true);
  });

  it("carries the headline numbers read off the receipt, not typed beside it", () => {
    expect(EXAMPLE.score).toBeGreaterThan(0);
    expect(EXAMPLE.ceiling).toBe(99);
    expect(EXAMPLE.band.length).toBeGreaterThan(3);
    // The score printed on the landing block and the score inside the receipt are the same read.
    expect(EXAMPLE.scanText).toContain(`${EXAMPLE.score} / ${EXAMPLE.ceiling}`);
    expect(EXAMPLE.scanText).toContain(EXAMPLE.band);
  });

  it("is a reading of our own repository, including findings against us", () => {
    // The example scans this checkout on purpose. If it ever stops finding anything about us it
    // has stopped being a receipt and become an advert, and this is where that gets noticed.
    expect(EXAMPLE.proposalSummary.findings).toBeGreaterThan(0);
    expect(EXAMPLE.proposal.remediation.locator).toContain("packages/");
  });
});
