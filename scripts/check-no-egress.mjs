#!/usr/bin/env node
// Privacy is a product claim here, so it is a code invariant and this is its ratchet.
//
//   node scripts/check-no-egress.mjs           fail on any egress site not in the allowlist
//   node scripts/check-no-egress.mjs --write   re-record docs/agents/egress-allowlist.json
//
// THE INVARIANT: no package in this repository may make an outbound network request except the
// browser probe navigating to the URL the user explicitly asked to scan. No telemetry, no usage
// beacons, no "anonymous" statistics, no model calls, no update checks, no crash reporting. The
// corpus observation sink writes to the local filesystem, is off by default, and never leaves the
// machine.
//
// Every site found is compared against an allowlist keyed by (file, construct) with a COUNT and a
// REASON per entry. A new construct in an unlisted file fails; an extra occurrence in a listed file
// fails. Both fail CLOSED.
//
// ------------------------------------------------------------------------------------------------
// WHY THE PATTERN LIST BELOW IS LONGER THAN IT LOOKS LIKE IT SHOULD BE
//
// A regex is a hypothesis about your input, and a regex that cannot express part of its input fails
// SILENTLY: the site is not matched, nothing is reported, and the gate prints a confident OK over a
// hole. That is the exact defect this product sells the detection of, and writing this file
// reproduced it twice in five minutes, measured:
//
//   `\bfetch\(`                                    found  7 sites
//   + identifiers containing "fetch"               found 16 sites  (caught nothing new at first:
//                                                  the pattern required a character BEFORE "fetch",
//                                                  so `fetchImpl(` in notary/tsa.ts and
//                                                  notary/opentimestamps.ts was invisible)
//   + identifiers STARTING with "fetch"            found 18 sites
//   + playwright's `page.request.get(`             found 21 sites  (three more in probe.ts, an API
//                                                  that contains neither "fetch" nor "goto")
//
// So the first two versions of this gate would have passed while three to fourteen real egress
// sites went unexamined. Do not narrow this list. When you add to it, re-run and report the DELTA
// in site count, because that number is the only evidence the addition did anything.
// ------------------------------------------------------------------------------------------------

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const REPO = path.resolve(import.meta.dirname, "..");
const ALLOW = path.join(REPO, "docs", "agents", "egress-allowlist.json");
const write = process.argv.includes("--write");
const rel = (f) => path.relative(REPO, f).split(path.sep).join("/");

// Every construct that can put a byte on the wire, plus every identifier shaped like one so a
// wrapper cannot hide behind a name. Over-matching is deliberate: a policy predicate called
// `isFetchable` is not egress, and it still has to earn a line in the allowlist saying so, because
// the alternative is a human deciding case by case which names are "obviously fine".
const PATTERNS = [
  { id: "fetch-like", re: /\b[A-Za-z0-9_$]*[Ff]etch[A-Za-z0-9_$]*\s*\(/g },
  { id: "browser-navigate", re: /\.goto\s*\(/g },
  { id: "browser-request", re: /\.request\.(?:get|post|put|patch|delete|head|fetch)\s*\(/g },
  { id: "node-http", re: /\b(?:https?|http2)\.request\s*\(/g },
  { id: "node-socket", re: /\bnet\.(?:connect|createConnection)\s*\(/g },
  { id: "websocket", re: /\bnew\s+WebSocket\b/g },
  { id: "beacon", re: /\bsendBeacon\s*\(/g },
  { id: "xhr", re: /\bXMLHttpRequest\b/g },
  { id: "eventsource", re: /\bnew\s+EventSource\b/g },
];

// Scanned roots. Tests are excluded on purpose: a test that stands up a local HTTP server to prove
// an SSRF refusal is doing its job, and forcing every such fixture through the allowlist would
// bury the shipping sites in noise until nobody read the file. Shipping code is what ships.
const ROOTS = [
  { dir: path.join(REPO, "packages"), only: (p) => /[\\/]src[\\/]/.test(p) },
  { dir: path.join(REPO, "apps", "web", "lib"), only: () => true },
  { dir: path.join(REPO, "apps", "web", "app"), only: () => true },
  { dir: path.join(REPO, "apps", "web", "components"), only: () => true },
  { dir: path.join(REPO, "scripts"), only: () => true },
];
const EXT = /\.(?:ts|tsx|mjs|js|jsx)$/;
const SKIP_DIR = /^(?:node_modules|dist|\.next|\.vercel|test|__tests__)$/;

const files = [];
const walk = (dir, only) => {
  if (!existsSync(dir)) return;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!SKIP_DIR.test(e.name)) walk(p, only); continue; }
    if (!EXT.test(e.name)) continue;
    if (/\.test\.(?:ts|tsx|mjs|js)$/.test(e.name)) continue;
    if (only(p)) files.push(p);
  }
};
for (const r of ROOTS) walk(r.dir, r.only);

// A scan that examined zero files must never print OK. This repository has shipped that exact
// defect more than once (LEARNINGS L-06), and a privacy gate is the worst possible place for it.
if (files.length === 0) {
  console.error("FAIL: scanned ZERO files. A run with no denominator is a failure, not a pass.");
  process.exit(1);
}

/** @type {Map<string, {file:string, construct:string, count:number, lines:number[]}>} */
const found = new Map();
let linesScanned = 0;

for (const f of files.sort()) {
  const src = readFileSync(f, "utf8").replace(/\r\n/g, "\n").split("\n");
  linesScanned += src.length;
  src.forEach((line, i) => {
    // Skip whole-line comments. A construct named inside a sentence explaining why it is absent
    // would otherwise have to be allowlisted, and a guard that fires on honest prose gets edited
    // around rather than obeyed. An INLINE trailing comment is not skipped, because code and
    // comment share that line.
    const t = line.trim();
    if (t.startsWith("//") || t.startsWith("*") || t.startsWith("/*")) return;
    for (const p of PATTERNS) {
      p.re.lastIndex = 0;
      for (const m of line.matchAll(p.re)) {
        const construct = m[0].trim();
        const key = `${rel(f)}::${construct}`;
        const prev = found.get(key) ?? { file: rel(f), construct, count: 0, lines: [] };
        prev.count++;
        prev.lines.push(i + 1);
        found.set(key, prev);
      }
    }
  });
}

const sites = [...found.values()].sort((a, b) => a.file.localeCompare(b.file) || a.construct.localeCompare(b.construct));

if (write) {
  const existing = existsSync(ALLOW) ? JSON.parse(readFileSync(ALLOW, "utf8")) : { sites: [] };
  const reasons = new Map((existing.sites ?? []).map((s) => [`${s.file}::${s.construct}`, s.reason]));
  const body =
    JSON.stringify(
      {
        _generated: "node scripts/check-no-egress.mjs --write. Every entry needs a REASON written by a person; --write preserves existing reasons and leaves new ones as TODO.",
        _invariant:
          "No package may make an outbound network request except the browser probe navigating to the URL the user explicitly asked to scan. The observation sink is local-only and off by default.",
        siteCount: sites.length,
        filesScanned: files.length,
        sites: sites.map((s) => ({
          file: s.file,
          construct: s.construct,
          count: s.count,
          lines: s.lines,
          reason: reasons.get(`${s.file}::${s.construct}`) ?? "TODO: a person must state why this exists and why it is not telemetry.",
        })),
      },
      null,
      2,
    ) + "\n";
  writeFileSync(ALLOW, body);
  console.log(`wrote ${rel(ALLOW)}: ${sites.length} sites across ${files.length} files (${linesScanned} lines scanned)`);
  const todo = sites.filter((s) => !reasons.get(`${s.file}::${s.construct}`));
  if (todo.length) {
    console.error(`\n${todo.length} site(s) have no reason yet. Write one for each before committing.`);
    process.exit(1);
  }
  process.exit(0);
}

if (!existsSync(ALLOW)) {
  console.error(`FAIL: ${rel(ALLOW)} does not exist. Run: node scripts/check-no-egress.mjs --write`);
  process.exit(1);
}

const allow = JSON.parse(readFileSync(ALLOW, "utf8"));
const allowed = new Map((allow.sites ?? []).map((s) => [`${s.file}::${s.construct}`, s]));
const problems = [];

for (const s of sites) {
  const key = `${s.file}::${s.construct}`;
  const a = allowed.get(key);
  if (!a) {
    problems.push(`NEW EGRESS SITE: ${s.file} line(s) ${s.lines.join(", ")} uses ${s.construct}, which is not in the allowlist. Privacy is a product claim: state why this exists, or remove it.`);
    continue;
  }
  if (a.count !== s.count) {
    problems.push(`${s.file}: ${s.construct} occurs ${s.count} time(s), the allowlist records ${a.count}. Line(s) now ${s.lines.join(", ")}. A move in either direction is a finding.`);
  }
  if (!a.reason || /^TODO/.test(a.reason)) {
    problems.push(`${s.file}: ${s.construct} is allowlisted with no reason. An unexplained egress site is not an allowed one.`);
  }
}
for (const key of allowed.keys()) {
  if (!found.has(key)) problems.push(`${rel(ALLOW)} records ${key}, which no longer exists. Remove it, so the allowlist cannot accumulate permissions nobody uses.`);
}

console.log(`scanned ${files.length} files, ${linesScanned} lines, ${PATTERNS.length} egress patterns: ${sites.length} sites found`);

if (problems.length) {
  console.error(`\nFAIL: ${problems.length} problem(s):`);
  for (const p of problems) console.error("  - " + p);
  process.exit(1);
}
console.log(`OK: 0 unapproved egress sites. Every one of the ${sites.length} carries a written reason.`);
