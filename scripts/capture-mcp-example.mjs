/**
 * Capture what the MCP server actually returns, so the website can print it verbatim.
 *
 *   node scripts/capture-mcp-example.mjs
 *
 * The `/mcp` page shows a worked example of `scan_codebase` and `propose_fixes`. A sample typed
 * into a JSX file would be a fabrication on a site whose entire argument is that claims carry
 * their evidence, so the example is captured instead: this script builds the server, speaks real
 * MCP over stdio to the real binary, and writes the response bytes to
 * `apps/web/lib/mcp-example.json`.
 *
 * THE TARGET IS THIS REPOSITORY. Scanning our own checkout is the only target we can publish a
 * reading of without naming somebody else's work, it is the same posture as the self-scan in the
 * fold, and it means the example includes findings that are about us. It currently reports
 * placeholder markers and two assertion-free test files in our own source. Those stay in the
 * example. A demo that only ever shows other people failing is an advert, not a receipt.
 *
 * The captured file records the commit and the time, and the page prints both, because a score
 * is a reading of a checkout at a moment and this repository changes daily.
 */

import { execFileSync, spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BIN = path.join(ROOT, "packages", "mcp-server", "dist", "bin.js");
const OUT = path.join(ROOT, "apps", "web", "lib", "mcp-example.json");

/** Build first: capturing the output of a stale bundle would report a corpus we do not ship. */
execFileSync("npm", ["run", "build", "--workspace=packages/mcp-server"], {
  cwd: ROOT,
  stdio: "inherit",
  shell: process.platform === "win32",
});

/** A minimal MCP stdio client. No SDK, because the point is to exercise the wire format. */
const connect = () => {
  const child = spawn(process.execPath, [BIN], { stdio: ["pipe", "pipe", "inherit"] });
  const pending = new Map();
  let buffer = "";
  child.stdout.on("data", (chunk) => {
    buffer += chunk.toString();
    let cut;
    while ((cut = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, cut).trim();
      buffer = buffer.slice(cut + 1);
      if (!line) continue;
      const message = JSON.parse(line);
      const resolve = pending.get(message.id);
      if (resolve) {
        pending.delete(message.id);
        resolve(message);
      }
    }
  });
  let id = 0;
  const request = (method, params) =>
    new Promise((resolve) => {
      const mine = ++id;
      pending.set(mine, resolve);
      child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: mine, method, params })}\n`);
    });
  const notify = (method) => child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method })}\n`);
  return { child, request, notify };
};

const { child, request, notify } = connect();

await request("initialize", {
  protocolVersion: "2024-11-05",
  capabilities: {},
  clientInfo: { name: "capture-mcp-example", version: "1" },
});
notify("notifications/initialized");

const call = async (name, args) => {
  const response = await request("tools/call", { name, arguments: args });
  if (response.error) throw new Error(`${name} failed: ${JSON.stringify(response.error)}`);
  const text = (response.result?.content ?? [])
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n");
  if (!text) throw new Error(`${name} returned no text content`);
  return text;
};

const scan = await call("scan_codebase", { path: ROOT });
const proposals = JSON.parse(await call("propose_fixes", { path: ROOT }));

child.kill();

/**
 * One proposal, chosen by rule rather than by index, so the page cannot silently start
 * illustrating a different rule than its own prose describes.
 */
const ILLUSTRATED_RULE = "verify.tautological-tests";
const proposal = proposals.groups
  .flatMap((group) => group.fixes)
  .find((fix) => fix.ruleId === ILLUSTRATED_RULE);
if (!proposal) {
  throw new Error(
    `No ${ILLUSTRATED_RULE} proposal in this capture. The page's prose is about that rule; ` +
      `either the rule stopped firing on this repository (good news, and the page needs new ` +
      `copy) or the corpus changed.`,
  );
}

/**
 * A second proposal, chosen because its evidence carries a LINE and not just a file.
 *
 * The landing page has room for one finding and it has to be the convincing shape: a path, a
 * colon, a number, and the string that was read at it. "This file has no assertions" is true
 * and checkable but it reads like a lint summary; a source line quoted back at you is the thing
 * a reader can go and open. Picked here rather than in JSX so the page cannot quietly become a
 * hand-typed excerpt of a real capture, which is a fabrication wearing a receipt's clothes.
 *
 * This comment deliberately does not spell out the marker strings the rule looks for. An
 * earlier draft did, and the very next capture cited THIS FILE, at the line of the comment
 * explaining the citation. The scan is honest; the page would have been circular.
 */
const LINE_CITED_RULE = "scaffold.placeholder-markers";
const lineCited = proposals.groups
  .flatMap((group) => group.fixes)
  .find(
    (fix) =>
      fix.ruleId === LINE_CITED_RULE && fix.evidence?.some((e) => /:\d+$/.test(e.locator ?? "")),
  );
if (!lineCited) {
  throw new Error(
    `No ${LINE_CITED_RULE} proposal with a line-numbered locator in this capture. The landing ` +
      `section prints one to show what a citation looks like; it cannot fall back to prose.`,
  );
}

/**
 * The headline numbers, read back off the receipt this capture just produced rather than typed.
 * Asserted to parse, because a silent null here would render as an empty score on the fold.
 */
const header = scan.match(/SLOP RECEIPT\s+(\d+)\s*\/\s*(\d+)\s+band:\s*(.+)/);
if (!header) throw new Error("Could not read the score off the receipt header of this capture.");
const [, score, ceiling, band] = header;

const commit = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();

writeFileSync(
  OUT,
  `${JSON.stringify(
    {
      capturedAt: new Date().toISOString(),
      commit,
      tool: "scan_codebase",
      score: Number(score),
      ceiling: Number(ceiling),
      band: band.trim(),
      scanText: scan,
      proposal,
      lineCited,
      proposalSummary: proposals.summary,
    },
    null,
    2,
  )}\n`,
  "utf8",
);

console.log(`wrote ${path.relative(ROOT, OUT)} at ${commit}`);
