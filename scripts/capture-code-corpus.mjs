/**
 * Capture the code corpus: a replayable scan of ten repositories a person wrote, plus one
 * synthetic scaffold that must score high.
 *
 * WHY A CAPTURE SCRIPT AND NOT A VENDORED CHECKOUT
 *
 * The detector is `replayable: true`, so the thing worth storing is the ARTIFACT, not the
 * source. A stored `RepoArtifact` is a few tens of kilobytes, carries no third party's code
 * beyond single-line excerpts, and re-scores against a newer corpus without a network. The
 * clone is a cache, gitignored, and pinned to a SHA so a re-capture is comparable.
 *
 * HOW A REPOSITORY QUALIFIES AS A HUMAN NEGATIVE. Three conditions, all stated per entry in
 * the manifest below and all checkable by a stranger:
 *
 *   1. NAMED AUTHORSHIP. A person or a foundation is on the record as the author/maintainer.
 *   2. SUBSTANTIAL PRE-2022 HISTORY. The bulk of the code predates generally available
 *      generative coding tools, so the label does not depend on trusting anyone.
 *   3. AN INSTITUTION BEHIND IT. A foundation, a funded company, or a long-lived OSS project
 *      with a review culture, so "a person wrote this" is not our own assertion.
 *
 * These are NOT clean-room artifacts. Several of them trip rules, and that is the point: the
 * tripwire asserts that tripping something is not enough to be called machine-made.
 *
 * Usage:  node scripts/capture-code-corpus.mjs [--only <id>] [--no-clone]
 */

import { execFile } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { scanRepo } from "@slop/detectors-code";
import { agentPassFiles, SCAFFOLD_FILES, scaffoldHandlers } from "./fixtures/synthetic-scaffold.mjs";

const exec = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = path.join(ROOT, ".corpus-cache");
const OUT = path.join(ROOT, "packages", "detectors-code", "test", "corpus");

/** Commits fetched per repository. Enough for the history family to have something to read. */
const HISTORY_DEPTH = 120;

export const MANIFEST = [
  {
    id: "express",
    url: "https://github.com/expressjs/express.git",
    sha: "023767fe9872e029271df1418f73401bff20ff40",
    include: ["lib/**/*.js", "index.js", "test/*.js"],
    source: "github.com/expressjs/express @ 023767fe",
    provenance:
      "Created by TJ Holowaychuk in 2009 and maintained since 2016 by the OpenJS Foundation under a published governance document with a named technical committee. Over fifteen years and more than five thousand commits predate any generally available generative coding tool.",
  },
  {
    id: "lodash",
    url: "https://github.com/lodash/lodash.git",
    sha: "a666ba591064c8011988275790ad7d625279f09c",
    include: ["lib/**/*.js", "*.js"],
    source: "github.com/lodash/lodash @ a666ba59",
    provenance:
      "Written by John-David Dalton from 2012 as a fork of Underscore, with a documented release history and a named author on every release since. The library is a dependency of a large share of the npm registry and predates generative coding by a decade.",
  },
  {
    id: "chalk",
    url: "https://github.com/chalk/chalk.git",
    sha: "661317e6f91fe7c90306c2c48ea9354562ee9146",
    include: ["source/**/*.js", "*.js"],
    source: "github.com/chalk/chalk @ 661317e6",
    provenance:
      "Sindre Sorhus, author of record since 2013, with a public sponsorship page, a personal release history and a review culture visible in the pull request archive. Small enough that a reader can check every line of the scanned set by hand.",
  },
  {
    id: "requests",
    url: "https://github.com/psf/requests.git",
    sha: "8f8b212de8c2129d7954c6cd373762880375620a",
    include: ["src/requests/**/*.py"],
    source: "github.com/psf/requests @ 8f8b212d",
    provenance:
      "Written by Kenneth Reitz from 2011 and donated to the Python Software Foundation in 2019, which now holds the copyright and names the maintainers. The 2.x line was complete years before generative coding tools existed.",
  },
  {
    id: "flask",
    url: "https://github.com/pallets/flask.git",
    sha: "d318b683471101618febed18996405ad26462110",
    include: ["src/flask/**/*.py"],
    source: "github.com/pallets/flask @ d318b683",
    provenance:
      "Armin Ronacher, 2010, now maintained by the Pallets organisation with a named team, a funded maintenance programme and a public governance document. The framework's core shape has been stable since well before 2022.",
  },
  {
    id: "sinatra",
    url: "https://github.com/sinatra/sinatra.git",
    sha: "cb22afd7902b566b6eaba6c4ea89739494a65d12",
    include: ["lib/**/*.rb"],
    source: "github.com/sinatra/sinatra @ cb22afd7",
    provenance:
      "Blake Mizerany, 2007, with a named maintainer team and a CHANGELOG that credits contributors by name across seventeen years. Included specifically because Ruby is outside the JavaScript and Python centre of gravity of most generated code.",
  },
  {
    id: "jekyll",
    url: "https://github.com/jekyll/jekyll.git",
    sha: "74d751339d3e534aa51d5d7b0640e9bd743509e4",
    include: ["lib/jekyll/*.rb"],
    source: "github.com/jekyll/jekyll @ 74d75133",
    provenance:
      "Tom Preston-Werner, 2008, later maintained by a named core team and used by GitHub Pages itself. Sixteen years of history with a documented release process and a signed contributor code of conduct.",
  },
  {
    id: "gin",
    url: "https://github.com/gin-gonic/gin.git",
    sha: "dcaa4296d111981ffb31ac3eba90bb63e1eb5ab9",
    include: ["*.go"],
    source: "github.com/gin-gonic/gin @ dcaa4296",
    provenance:
      "Manu Martinez-Almeida, 2014, with a named maintainer list in the repository and eight years of history before 2022. Go was chosen for the corpus because its formatter enforces exactly the structural uniformity this detector's weakest family measures.",
  },
  {
    id: "ripgrep",
    url: "https://github.com/BurntSushi/ripgrep.git",
    sha: "3fce3b5bb0236da2df6d99672afb8a719642eca7",
    include: ["crates/core/**/*.rs"],
    source: "github.com/BurntSushi/ripgrep @ 3fce3b5b",
    provenance:
      "Andrew Gallant, 2016, single named author for the great majority of the code, with long design write-ups published under his own name explaining the decisions behind it. The knowledge in the comments is traceable to those essays.",
  },
  {
    id: "libuv",
    url: "https://github.com/libuv/libuv.git",
    sha: "f87c8e4f70f234b952d9c47b15fb567f78e5f399",
    include: ["src/*.c", "src/unix/*.c", "include/*.h"],
    source: "github.com/libuv/libuv @ f87c8e4f",
    provenance:
      "Started in 2011 for Node.js and governed by the OpenJS Foundation, with a MAINTAINERS file, a formal collaborator process and a fourteen-year commit archive. C is in the corpus so the comment and uniformity families are exercised outside the languages generators are best at.",
  },
];

async function run(cwd, args) {
  return exec("git", ["-C", cwd, ...args], { maxBuffer: 64 * 1024 * 1024, windowsHide: true });
}

async function ensureClone(entry, { clone }) {
  const dir = path.join(CACHE, entry.id);
  if (existsSync(path.join(dir, ".git"))) {
    const { stdout } = await run(dir, ["rev-parse", "HEAD"]);
    if (stdout.trim() === entry.sha) return dir;
  }
  if (!clone) throw new Error(`${entry.id}: no cached checkout at the pinned SHA and --no-clone was passed.`);
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  await run(dir, ["init", "-q"]);
  await run(dir, ["remote", "add", "origin", entry.url]);
  await run(dir, ["fetch", "-q", `--depth=${HISTORY_DEPTH}`, "origin", entry.sha]);
  await run(dir, ["checkout", "-q", entry.sha]);
  return dir;
}

async function writeSynthetic(id, files, subjects, spacingMinutes) {
  const dir = path.join(CACHE, id);
  await rm(dir, { recursive: true, force: true });
  for (const [rel, body] of Object.entries(files)) {
    const full = path.join(dir, rel);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, body, "utf8");
  }
  // A history written in one sitting by one author, every message the same shape.
  await run(dir, ["init", "-q", "-b", "main"]).catch(async () => {
    await mkdir(dir, { recursive: true });
    await run(dir, ["init", "-q"]);
  });
  await run(dir, ["config", "user.email", "builder@example.invalid"]);
  await run(dir, ["config", "user.name", "builder"]);
  const base = Date.parse("2026-08-20T14:00:00Z");
  await run(dir, ["add", "-A"]);
  for (let i = 0; i < subjects.length; i += 1) {
    const at = new Date(base + i * spacingMinutes * 60_000).toISOString();
    await exec("git", ["-C", dir, "commit", "-q", "--allow-empty", "-m", subjects[i]], {
      env: { ...process.env, GIT_AUTHOR_DATE: at, GIT_COMMITTER_DATE: at },
      windowsHide: true,
    });
  }
  return dir;
}

/** Strip machine-local facts so a re-capture on another machine produces the same bytes. */
function normalize(artifact, id, capturedAt) {
  return {
    ...artifact,
    root: `<${id}>`,
    scannedAt: capturedAt,
    skipped: artifact.skipped.map((s) => s.replace(/\\/g, "/")),
  };
}

const args = process.argv.slice(2);
const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : null;
const clone = !args.includes("--no-clone");
const capturedAt = new Date().toISOString().slice(0, 10);

await mkdir(CACHE, { recursive: true });
await mkdir(OUT, { recursive: true });

const captured = [];
for (const entry of MANIFEST) {
  if (only && only !== entry.id) continue;
  process.stdout.write(`${entry.id}: `);
  const dir = await ensureClone(entry, { clone });
  const artifact = await scanRepo(dir, { include: entry.include, historyLimit: HISTORY_DEPTH });
  captured.push({ entry, artifact: normalize(artifact, entry.id, capturedAt) });
  console.log(
    `${artifact.files.length} files, ${artifact.comments.length} comments, ${artifact.history.commits.length} commits`,
  );
}

const SYNTHETIC = [
  {
    id: "synthetic-scaffold",
    files: { ...SCAFFOLD_FILES, ...scaffoldHandlers() },
    spacingMinutes: 6,
    subjects: [
      "feat: scaffold the project", "feat: add the users handler", "feat: add the orders handler",
      "feat: add the items handler", "feat: add the carts handler", "feat: add the payments handler",
      "chore: add config", "feat: add the invoices handler", "feat: add the shipments handler",
      "feat: add the returns handler", "chore: update deps", "feat: add the reviews handler",
      "feat: add the coupons handler", "docs: update readme",
    ],
    source: "written by scripts/fixtures/synthetic-scaffold.mjs, scanned off disk",
    provenance:
      "Generated by this repository's own capture script to the shape a scaffold plus an agent pass produces: a create-next-app README, an agent instruction file, a committed session transcript, eighteen handlers of restating comments, unfilled placeholders, three files carrying one identical block, four unused dependencies, no tests, and fourteen conventional commits inside ninety minutes. Its label is 'generated' because we generated it, which is the only label in this corpus that needs no trust at all.",
  },
  {
    id: "synthetic-agent-pass",
    files: agentPassFiles(),
    spacingMinutes: 9,
    subjects: [
      "feat: add invoice service", "feat: add receipt service", "feat: add ledger service",
      "feat: add journal service", "feat: add posting service", "feat: add account service",
      "feat: add balance service", "feat: add period service", "feat: add accrual service",
      "feat: add expense service", "feat: add revenue service", "test: add smoke test",
    ],
    source: "written by scripts/fixtures/synthetic-scaffold.mjs, scanned off disk",
    provenance:
      "Generated by this repository's own capture script as the case the product must survive after everyone learns to delete CLAUDE.md: no agent artifact of any kind, no scaffold README, no placeholders. Fourteen files of near-identical length, two near-identical functions each, and a test suite whose one assertion cannot fail. It can only be recognised by shape, so it is what keeps the shape families honest.",
  },
];

for (const spec of SYNTHETIC) {
  if (only && only !== spec.id) continue;
  process.stdout.write(`${spec.id}: `);
  const dir = await writeSynthetic(spec.id, spec.files, spec.subjects, spec.spacingMinutes);
  const artifact = await scanRepo(dir, { historyLimit: 50 });
  captured.push({
    entry: { id: spec.id, source: spec.source, provenance: spec.provenance, label: "generated" },
    artifact: normalize(artifact, spec.id, capturedAt),
  });
  console.log(`${artifact.files.length} files, ${artifact.placeholders.length} placeholders, ${artifact.tests.length} tests`);
}

for (const { entry, artifact } of captured) {
  const file = path.join(OUT, `${entry.id}.artifact.json`);
  await writeFile(file, `${JSON.stringify(artifact)}\n`, "utf8");
  const kb = Math.round(Buffer.byteLength(JSON.stringify(artifact)) / 1024);
  console.log(`  wrote ${path.relative(ROOT, file)} (${kb} KB)`);
}

const index = captured.map(({ entry }) => ({
  id: entry.id,
  label: entry.label ?? "human",
  source: entry.source,
  provenance: entry.provenance,
  sha: entry.sha ?? null,
  include: entry.include ?? [],
  capturedAt,
}));
await writeFile(path.join(OUT, "code-corpus.index.json"), `${JSON.stringify(index, null, 2)}\n`, "utf8");
console.log(`\n${captured.length} artifact(s) captured at ${capturedAt}.`);
