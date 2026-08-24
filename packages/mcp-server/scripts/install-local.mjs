#!/usr/bin/env node
/**
 * The local-dev fallback for before this package is published: build it, then register the
 * built binary with the Claude Code CLI by absolute path.
 *
 *   npm run install:local
 *
 * Cross-platform on purpose: it shells out with execFileSync (no shell string to misquote on
 * Windows vs POSIX) and computes the absolute path from this script's own location, so it works
 * regardless of the caller's cwd.
 */

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const bin = path.join(packageDir, "dist", "bin.js");
const NAME = "slop-scorer";

if (!existsSync(bin)) {
  console.error(`\n  ${bin} does not exist. "npm run build" must have failed; scroll up.\n`);
  process.exitCode = 1;
  process.exit();
}

try {
  execFileSync("claude", ["--version"], { stdio: "ignore" });
} catch {
  console.error(
    "\n  The claude CLI is not on PATH. Install Claude Code, or register the server by hand:\n" +
      `\n    { "mcpServers": { "${NAME}": { "command": "node", "args": ["${bin.replace(/\\/g, "\\\\")}"] } } }\n`,
  );
  process.exitCode = 1;
  process.exit();
}

try {
  const existing = execFileSync("claude", ["mcp", "list"], { encoding: "utf8" });
  if (new RegExp(`^${NAME}\\b`, "m").test(existing)) {
    execFileSync("claude", ["mcp", "remove", NAME], { stdio: "ignore" });
  }
} catch {
  // No existing registration to remove, or `claude mcp list` failed; add proceeds either way
  // and reports its own error if something is actually wrong.
}

execFileSync("claude", ["mcp", "add", NAME, "--", "node", bin], { stdio: "inherit" });
console.log(`\n  registered "${NAME}" -> node ${bin}\n`);
