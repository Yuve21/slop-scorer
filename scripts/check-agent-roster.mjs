#!/usr/bin/env node
// Generate and check the agent roster, so the team cannot silently rot.
//
//   node scripts/check-agent-roster.mjs            write docs/agents/roster.generated.json
//   node scripts/check-agent-roster.mjs --check    fail if the generated file is stale
//
// FOUR sources have to agree, and this script is what makes them:
//   .claude/agents/*.md                    the agents that actually exist (frontmatter)
//   docs/agents/HQ.md  "The org chart"     which department each belongs to, and its beat
//   docs/agents/HQ.md  "The standing passes"  the cadence table: when each one runs
//   docs/agents/LEARNINGS.md               the index count, against the real entry headings
//
// A hand-written roster would have been stale the first time an agent was added, and a roster that
// lies about who works here is worse than no roster. --check fails on an agent missing from the org
// chart, an org-chart entry with no agent file, a cadence row naming an agent that does not exist,
// an agent with no cadence row, a brief missing either half of the learning loop, an em dash
// anywhere in the agent layer, and a LEARNINGS index whose count disagrees with its own entries.
//
// TWO THINGS THIS SCRIPT REFUSES TO DO TO ITSELF, both from LEARNINGS:
//
//   1. It never hand-enumerates a character class for something it did not write. `[a-z-]+` for an
//      agent name is a GUESS about the input, and a regex that cannot express part of its input
//      fails SILENTLY: the line does not match, the previous department keeps its value, and an
//      agent gets published under the wrong one with every gate still green. So the patterns match
//      "anything that is not the delimiter" and the COUNTS are asserted afterwards.
//
//   2. It never lets a denominator be zero. Every reconciliation below prints what it examined.
//      A check that scanned nothing and printed OK is the exact defect this product sells the
//      detection of (L-06), and this repository has shipped it more than once.

import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";

const REPO = path.resolve(import.meta.dirname, "..");
const AGENTS_DIR = path.join(REPO, ".claude", "agents");
const HQ = path.join(REPO, "docs", "agents", "HQ.md");
const HOUSE = path.join(REPO, "docs", "agents", "HOUSE-KNOWLEDGE.md");
const LEARNINGS = path.join(REPO, "docs", "agents", "LEARNINGS.md");
const OUT = path.join(REPO, "docs", "agents", "roster.generated.json");
const check = process.argv.includes("--check");

const read = (f) => readFileSync(f, "utf8").replace(/\r\n/g, "\n");
const rel = (f) => path.relative(REPO, f).split(path.sep).join("/");

const problems = [];
const fail = (m) => problems.push(m);

// --- 1. the agents that exist -------------------------------------------------------------------

if (!existsSync(AGENTS_DIR)) {
  console.error(`FAIL: ${rel(AGENTS_DIR)} does not exist.`);
  process.exit(1);
}

/** @type {Map<string, {name:string, model:string, description:string, tools:string, file:string}>} */
const agents = new Map();
const agentFiles = readdirSync(AGENTS_DIR).filter((f) => f.endsWith(".md"));

for (const f of agentFiles) {
  const raw = read(path.join(AGENTS_DIR, f));
  const fm = raw.match(/^---\n([\s\S]*?)\n---\n/);
  if (!fm) {
    fail(`${rel(path.join(AGENTS_DIR, f))} has no frontmatter block`);
    continue;
  }
  const get = (k) => (fm[1].match(new RegExp(`^${k}:\\s*(.+)$`, "m")) || [, ""])[1].trim();
  const name = get("name");
  const stem = path.basename(f, ".md");
  if (!name) fail(`${rel(path.join(AGENTS_DIR, f))} frontmatter has no name`);
  // The filename is what a seat types and the `name` is what the tool dispatches on. If they
  // disagree, one of the two is unreachable and nothing else here would notice.
  if (name && name !== stem) fail(`${rel(path.join(AGENTS_DIR, f))} declares name "${name}" but its filename says "${stem}"`);
  for (const k of ["description", "model", "tools"]) {
    if (!get(k)) fail(`agent "${name || stem}" frontmatter is missing "${k}"`);
  }

  const body = raw.slice(fm[0].length);

  // The learning loop is enforced here rather than left to good intentions. READ half: the brief
  // must open by pointing at both halves of the brain. WRITE half: it must close by requiring an
  // append. A brief that lost either one has left the loop without failing anything else.
  if (!/docs\/agents\/HOUSE-KNOWLEDGE\.md/.test(body)) fail(`agent "${name || stem}" does not tell its seat to read HOUSE-KNOWLEDGE.md (the READ half of the learning loop)`);
  if (!/docs\/agents\/LEARNINGS\.md/.test(body)) fail(`agent "${name || stem}" does not tell its seat to read LEARNINGS.md (the READ half of the learning loop)`);
  if (!/[Aa]ppend to `docs\/agents\/LEARNINGS\.md`/.test(body)) fail(`agent "${name || stem}" does not close by requiring an append to LEARNINGS.md (the WRITE half of the learning loop)`);

  agents.set(name || stem, {
    name: name || stem,
    model: get("model"),
    description: get("description"),
    tools: get("tools"),
    file: `.claude/agents/${f}`,
  });
}

if (agentFiles.length === 0) fail("no agent briefs found: a roster of zero is a failure, not a pass");

// --- 2. the org chart ---------------------------------------------------------------------------
//
// Bounded to the section between "## The org chart" and the first "###" that follows it, because
// the "Deliberately NOT on the roster" subsection under the same heading is a list of agents that
// must NOT be in the roster, and a parser that swept the whole file would enrol them.

const hq = read(HQ);
const lines = hq.split("\n");
const chartStart = lines.findIndex((l) => /^##\s+The org chart\b/.test(l));
if (chartStart < 0) fail(`${rel(HQ)} has no "## The org chart" heading`);
let chartEnd = lines.length;
for (let i = chartStart + 1; i < lines.length; i++) {
  if (/^#{2,3}\s/.test(lines[i])) { chartEnd = i; break; }
}

/** @type {Map<string, {dept:string, beat:string}>} */
const org = new Map();
const depts = [];
let dept = null;
let open = null;

for (const line of lines.slice(chartStart + 1, chartEnd)) {
  // A department heading: a bold line on its own. NOT `[A-Za-z &]+`, which is a guess about the
  // input and silently fails on any character nobody thought of.
  const d = line.match(/^\*\*([^*]+)\*\*\s*$/);
  if (d) { dept = d[1].trim(); depts.push(dept); open = null; continue; }
  // A roster bullet: `- **name** - beat`. The name is "anything that is not the bold delimiter",
  // and the count is asserted below instead of trusting the class.
  const a = line.match(/^-\s+\*\*([^*]+)\*\*\s+-\s+(.+)$/);
  if (a && dept) { open = { dept, beat: a[2].trim() }; org.set(a[1].trim(), open); continue; }
  // Bullets wrap. A bullet continues until the next bullet, the next department, or a blank line.
  // Reading only the first line cuts every beat off mid-sentence, and truncated prose still parses,
  // so nothing downstream can catch it.
  if (open && /^\s{2,}\S/.test(line)) { open.beat += " " + line.trim(); continue; }
  if (!line.trim() || /^-\s/.test(line) || /^#/.test(line)) open = null;
}

// --- 3. the cadence table -----------------------------------------------------------------------

const onCadence = new Map();
const cadStart = lines.findIndex((l) => /^##\s+The standing passes\b/.test(l));
if (cadStart < 0) fail(`${rel(HQ)} has no "## The standing passes" heading`);
for (let i = cadStart + 1; i < lines.length; i++) {
  if (/^#{2,3}\s/.test(lines[i])) break;
  const m = lines[i].match(/^\|\s*([^|]+?)\s*\|\s*`([^`]+)`\s*\|\s*([^|]+?)\s*\|\s*$/);
  if (m) {
    const [, cadence, name, trigger] = m;
    if (cadence === "Cadence") continue;
    const prior = onCadence.get(name);
    // An agent may legitimately appear twice (two triggers). Keep both rather than letting the
    // second overwrite the first, which would silently drop a trigger.
    onCadence.set(name, prior ? { ...prior, triggers: [...prior.triggers, { cadence, trigger }] } : { triggers: [{ cadence, trigger }] });
  }
}

// --- 4. reconcile, loudly -----------------------------------------------------------------------

for (const n of agents.keys()) if (!org.has(n)) fail(`agent "${n}" exists but is not in the ${rel(HQ)} org chart`);
for (const n of org.keys()) if (!agents.has(n)) fail(`the org chart lists "${n}" but .claude/agents/ has no such brief`);
for (const n of onCadence.keys()) if (!agents.has(n)) fail(`the standing-passes table names "${n}", which has no agent brief`);
for (const n of agents.keys()) if (!onCadence.has(n)) fail(`agent "${n}" has no row in the standing-passes table, so nothing says when it runs`);

// --- 5. the LEARNINGS index must agree with its own entries -------------------------------------
//
// A hand-maintained index goes stale in exactly one of its two halves, and the stale half is always
// the one somebody is reading. So: derive the count from the headings and compare.

const learnings = read(LEARNINGS);
const entryIds = [...learnings.matchAll(/^###\s+(L-\d+)\s+·/gm)].map((m) => m[1]);
const uniqueIds = new Set(entryIds);
if (entryIds.length !== uniqueIds.size) fail(`LEARNINGS has duplicate entry ids: ${entryIds.filter((v, i) => entryIds.indexOf(v) !== i).join(", ")}`);
const declared = learnings.match(/^_(\d+) entries\./m);
if (!declared) fail(`${rel(LEARNINGS)} index has no "_N entries." line, so nothing states its own denominator`);
else if (Number(declared[1]) !== entryIds.length) fail(`${rel(LEARNINGS)} index says ${declared[1]} entries but the file has ${entryIds.length} (${[...uniqueIds].join(", ")})`);
if (entryIds.length === 0) fail(`${rel(LEARNINGS)} has zero entries: an empty brain is a failure, not a pass`);

// Every id named in the index must exist as an entry, and vice versa. A one-liner pointing at an
// entry that was deleted is worse than no one-liner, because it is read before acting.
const indexEnd = learnings.indexOf("<!-- END GENERATED INDEX -->");
const indexBody = indexEnd > 0 ? learnings.slice(0, indexEnd) : "";
const indexed = new Set([...indexBody.matchAll(/\*\*(L-\d+)\*\*/g)].map((m) => m[1]));
for (const id of uniqueIds) if (!indexed.has(id)) fail(`LEARNINGS entry ${id} is not listed in the index, so no agent will find it`);
for (const id of indexed) if (!uniqueIds.has(id)) fail(`LEARNINGS index names ${id}, which has no entry`);

// --- 6. no em dashes anywhere in the agent layer -------------------------------------------------
//
// Standing house rule. Checked mechanically because "I did not use one" is not a measurement.

// The scope includes the check scripts themselves, and that is not decoration. The first version
// scanned only the agent layer, and an em dash promptly appeared in THIS file, invisible to the
// gate that exists to catch it. Same shape as LEARNINGS L-10, where the FTC no-accuracy-claim
// guard scans `packages` and therefore never reads the marketing site. A guard that cannot see
// itself is a guard with a named blind spot.
//
// The dash is built from its code point rather than written literally, because a literal here
// would make this file fail its own check. Writing the character you are banning is the one place
// a ban cannot be spelled out.
const EM_DASH = String.fromCharCode(0x2014);
const EN_DASH = String.fromCharCode(0x2013);
const proseFiles = [
  HQ,
  HOUSE,
  LEARNINGS,
  ...agentFiles.map((f) => path.join(AGENTS_DIR, f)),
  ...readdirSync(path.join(REPO, "scripts"))
    .filter((f) => f.startsWith("check-") && f.endsWith(".mjs"))
    .map((f) => path.join(REPO, "scripts", f)),
];
let emDashHits = 0;
for (const f of proseFiles) {
  const src = read(f);
  src.split("\n").forEach((line, i) => {
    if (line.includes(EM_DASH) || line.includes(EN_DASH)) { emDashHits++; fail(`em or en dash in ${rel(f)}:${i + 1}`); }
  });
}

// --- 7. emit ------------------------------------------------------------------------------------

const rows = [...agents.values()]
  .map((a) => ({
    name: a.name,
    dept: org.get(a.name)?.dept ?? null,
    beat: (org.get(a.name)?.beat ?? "").replace(/\s+/g, " ").replace(/\.$/, ""),
    model: a.model,
    tools: a.tools,
    cadence: onCadence.get(a.name)?.triggers ?? [],
    file: a.file,
  }))
  .sort((a, b) => String(a.dept).localeCompare(String(b.dept)) || a.name.localeCompare(b.name));

const body =
  JSON.stringify(
    {
      _generated: "node scripts/check-agent-roster.mjs   (--check fails if this file is stale). Do not edit by hand.",
      _sources: [".claude/agents/*.md", "docs/agents/HQ.md (org chart + standing passes)"],
      agentCount: rows.length,
      departments: [...new Set(rows.map((r) => r.dept))].sort(),
      learningsEntryCount: entryIds.length,
      agents: rows,
    },
    null,
    2,
  ) + "\n";

if (problems.length) {
  console.error(`FAIL: the agent layer does not reconcile (${problems.length} problem${problems.length === 1 ? "" : "s"}):`);
  for (const p of problems) console.error("  - " + p);
  process.exit(1);
}

// The denominators. A run that examined nothing must never print OK, which is the whole point.
const summary =
  `${rows.length} agents across ${new Set(rows.map((r) => r.dept)).size} departments ` +
  `(${depts.length} department headings parsed), ${onCadence.size} on the standing-passes table, ` +
  `${entryIds.length} LEARNINGS entries, ${proseFiles.length} prose files scanned for em dashes (${emDashHits} found)`;

if (check) {
  const current = existsSync(OUT) ? read(OUT) : null;
  if (current !== body) {
    console.error(`FAIL: ${rel(OUT)} is stale.\nRun: node scripts/check-agent-roster.mjs`);
    process.exit(1);
  }
  console.log(`OK: ${summary}`);
} else {
  writeFileSync(OUT, body);
  console.log(`wrote ${rel(OUT)}: ${summary}`);
}
