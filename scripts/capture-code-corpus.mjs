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
 * HOW A REPOSITORY QUALIFIES AS A GENERATED POSITIVE. Two conditions, both re-checked against
 * the pinned checkout by `assertGenerated` rather than asserted in prose, and both about what
 * SOMEBODY ELSE recorded rather than what the code looks like to us. Inferring the label from
 * the code's shape would be circular: the shape is the thing under test.
 *
 *   1. THE GENERATOR NAMED ITSELF IN A FILE. Lovable writes "# Welcome to your Lovable
 *      project" into every export; v0 writes "Automatically synced with your v0.app
 *      deployments" into the repository it pushes to. `declaration` records the exact file
 *      and the exact words, and the capture aborts if they are not there at that SHA.
 *   2. EVERY COMMIT IS THE GENERATOR'S OWN BOT. This is the condition that does the real work
 *      and it is why two earlier candidates were thrown out. A repository can carry a Lovable
 *      or Bolt README and then be developed by a person for six months, and calling that
 *      "generated" would be a false label on a published rate. `botAuthors` requires 100% of
 *      the captured history to be authored by the vendor's bot account, so what is stored is
 *      a build the tool wrote and nobody rewrote. A single human commit disqualifies it.
 *
 * That second bar is deliberately harsher than it needs to be for the detector, and it is
 * because of `packages/gauntlet`: the game publishes a human-discrimination rate against these
 * labels. A rate measured against a mislabelled artifact is not a weaker claim, it is a false
 * one, and it is the exact shape of claim the FTC pleaded in Workado.
 *
 * Usage:  node scripts/capture-code-corpus.mjs [--only <id>[,<id>...]] [--no-clone]
 */

import { execFile } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
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

/**
 * Repositories a GENERATOR wrote, and that say so themselves.
 *
 * These are real, public, pinned checkouts, not fixtures. Three different vendors on purpose:
 * a corpus of one tool's output measures that tool's habits, and the first thing a reader
 * should be unable to say about this set is "they all came from the same product".
 *
 * They are also deliberately spread across the quality range rather than picked for being
 * bad. `quillon` is a maintained project with a contributing guide and a licence that happens
 * to have been built in Bolt; if the detector can only find the careless ones, the published
 * rate is a rate about carelessness.
 */
/**
 * The commit-author addresses each vendor's bot signs with.
 *
 * Anchored and literal rather than a substring test, because this predicate is the load-
 * bearing half of a "generated" label: a loose pattern that happened to match a person's
 * address would put a human's work in a corpus that publishes accuracy claims about machines.
 * Lovable still signs as gpt-engineer-app, the account it shipped under before the rename.
 */
const LOVABLE_BOTS = /^(?:\d+\+)?(?:gpt-engineer-app|lovable-dev)\[bot\]@users\.noreply\.github\.com$|^noreply@lovable\.dev$/i;
const V0_BOTS = /^(?:\d+\+)?v0\[bot\]@users\.noreply\.github\.com$/i;

export const GENERATED_MANIFEST = [
  {
    id: "master-quiz-nexus",
    label: "generated",
    origin: "real",
    url: "https://github.com/Sathyamoorthy17/master-quiz-nexus.git",
    sha: "eb2bc4732e43e0203d039343adb0fd898ca26dd6",
    include: ["src/**/*.ts", "src/**/*.tsx"],
    source: "github.com/Sathyamoorthy17/master-quiz-nexus @ eb2bc473",
    declaration: {
      file: "README.md",
      contains: "# Welcome to your Lovable project",
      says: "the heading Lovable writes into every repository it exports, with the lovable.dev project URL under it",
    },
    botAuthors: LOVABLE_BOTS,
    provenance:
      "Lovable output, and nothing else has ever touched it. The README opens with the line Lovable writes into every export, \"# Welcome to your Lovable project\", followed by the lovable.dev project URL for this specific build (project 48908dc5-be31-4bd0-a960-e9a81784f4a0). All four commits in the history are authored by lovable-dev[bot]; there is no human commit in the repository. Both facts are re-read out of the pinned checkout by the capture script rather than taken from this sentence.",
  },
  {
    id: "unifiedteam",
    label: "generated",
    origin: "real",
    url: "https://github.com/dharsshne/unifiedteam.git",
    sha: "1e8c9f1daac343c65a756b3420fb5d2c58ddde6e",
    include: ["src/**/*.ts", "src/**/*.tsx"],
    source: "github.com/dharsshne/unifiedteam @ 1e8c9f1d",
    declaration: {
      file: "README.md",
      contains: "# Welcome to your Lovable project",
      says: "Lovable's export heading, here with the project id placeholder never substituted",
    },
    botAuthors: LOVABLE_BOTS,
    provenance:
      "Lovable output, a second member from the same vendor so no single build is carrying a whole tool. The README opens with Lovable's export heading and the project URL beneath it still reads \"REPLACE_WITH_PROJECT_ID\": the template was published without the substitution ever running. All three commits are the vendor's own (lovable-dev[bot], and a template commit authored \"Lovable <noreply@lovable.dev>\"), with no human commit at any point.",
  },
  {
    id: "buildrs-social-network",
    label: "generated",
    origin: "real",
    url: "https://github.com/optimusv1/buildrs-social-network.git",
    sha: "c983e367d9a81e9ce5589304dbfdc24ac215e0ab",
    include: ["app/**/*.ts", "app/**/*.tsx", "components/**/*.tsx", "lib/**/*.ts"],
    source: "github.com/optimusv1/buildrs-social-network @ c983e367",
    declaration: {
      file: "README.md",
      contains: "Automatically synced with your [v0.app](https://v0.app) deployments",
      says: "the line v0 writes and maintains in the repository it pushes builds to",
    },
    botAuthors: V0_BOTS,
    provenance:
      "Vercel v0 output. The README, which v0 writes, states \"Automatically synced with your [v0.app](https://v0.app) deployments\" and \"Any changes you make to your deployed app will be automatically pushed to this repository from v0.app\". Every one of the six commits is authored by the v0 bot account; the repository is the tool's push target and has never received a human commit. A second vendor is in the set on purpose, so \"generated\" is not a fact about one company's habits.",
  },
  {
    id: "nano-banana-hackathon",
    label: "generated",
    origin: "real",
    url: "https://github.com/comfy-deploy/Nano-Banana-Hackathon.git",
    sha: "8833183fd4b2254b50370b839261c0ed215312a7",
    include: ["app/**/*.ts", "app/**/*.tsx", "components/**/*.tsx", "lib/**/*.ts"],
    source: "github.com/comfy-deploy/Nano-Banana-Hackathon @ 8833183f",
    declaration: {
      file: "README.md",
      contains: "Automatically synced with your [v0.app](https://v0.app) deployments",
      says: "the same v0 sync line, in a repository owned by a company rather than an individual",
    },
    botAuthors: V0_BOTS,
    provenance:
      "Vercel v0 output, published under a company account (comfy-deploy) rather than a personal one, which is why it is here: it is the case where a generated build ships with an organisation's name on it and nothing about the owner suggests a throwaway. The README carries v0's sync declaration and all three commits are authored by the v0 bot, with no human commit in the history.",
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

/**
 * Re-check both halves of a "generated" label against the pinned checkout and the scan.
 *
 * The manifest's provenance sentence is never the only copy of the claim. If the declaring
 * file is gone, or the words moved, or one human commit is in the history, the capture stops
 * here rather than writing an artifact whose label nobody can check any more. Two candidates
 * were dropped by exactly this: both carried a builder's README and both turned out to have
 * been developed by a person for months afterwards.
 */
async function assertGenerated(dir, entry, artifact) {
  const { file, contains } = entry.declaration;
  const full = path.join(dir, file);
  if (!existsSync(full)) {
    throw new Error(
      `${entry.id}: ${file} does not exist at ${entry.sha}, but the "generated" label rests on it. ` +
        `Refusing to store an artifact whose stated provenance cannot be re-read.`,
    );
  }
  const body = await readFile(full, "utf8");
  if (!body.includes(contains)) {
    throw new Error(
      `${entry.id}: ${file} at ${entry.sha} does not contain ${JSON.stringify(contains)}. The generator's ` +
        `own declaration is the entire basis for this member's label, and it is not there.`,
    );
  }

  const commits = artifact.history.commits;
  if (!artifact.history.available || commits.length === 0) {
    throw new Error(
      `${entry.id}: no commit history was read (${artifact.history.reason ?? "no reason given"}), so the ` +
        `"every commit is the generator's bot" condition passed having checked nothing. That is the ` +
        `vacuous-pass shape this repository fails builds over.`,
    );
  }
  const human = [...new Set(commits.map((c) => c.authorEmail).filter((e) => !entry.botAuthors.test(e)))];
  if (human.length > 0) {
    throw new Error(
      `${entry.id}: ${human.length} non-bot author address(es) in ${commits.length} commits: ${human.join(", ")}. ` +
        `A repository a person worked on is not a generated artifact, whatever its README says.`,
    );
  }
  return `${file} + ${commits.length}/${commits.length} commits by ${
    [...new Set(commits.map((c) => c.authorEmail))].join(", ")
  }`;
}

const args = process.argv.slice(2);
const only = args.includes("--only") ? (args[args.indexOf("--only") + 1] ?? "").split(",").filter(Boolean) : null;
const clone = !args.includes("--no-clone");
const capturedAt = new Date().toISOString().slice(0, 10);

await mkdir(CACHE, { recursive: true });
await mkdir(OUT, { recursive: true });

const captured = [];
for (const entry of MANIFEST) {
  if (only && !only.includes(entry.id)) continue;
  process.stdout.write(`${entry.id}: `);
  const dir = await ensureClone(entry, { clone });
  const artifact = await scanRepo(dir, { include: entry.include, historyLimit: HISTORY_DEPTH });
  captured.push({ entry, artifact: normalize(artifact, entry.id, capturedAt) });
  console.log(
    `${artifact.files.length} files, ${artifact.comments.length} comments, ${artifact.history.commits.length} commits`,
  );
}

for (const entry of GENERATED_MANIFEST) {
  if (only && !only.includes(entry.id)) continue;
  process.stdout.write(`${entry.id}: `);
  const dir = await ensureClone(entry, { clone });
  const artifact = await scanRepo(dir, { include: entry.include, historyLimit: HISTORY_DEPTH });
  const declared = await assertGenerated(dir, entry, artifact);
  captured.push({ entry, artifact: normalize(artifact, entry.id, capturedAt) });
  console.log(`${artifact.files.length} files, declared by ${declared}`);
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
    entry: {
      id: spec.id,
      source: spec.source,
      provenance: spec.provenance,
      label: "generated",
      // Stated in the index, not just in prose: this one we wrote. Every rate the gauntlet
      // publishes is split on this field, because a rate measured against our own fixtures is
      // a different claim from one measured against a stranger's real build.
      origin: "synthetic",
    },
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

/**
 * Merge, rather than overwrite.
 *
 * `--only` exists so one member can be re-captured without touching the other fifteen, and an
 * index rebuilt from just that one member would silently delete the rest. The order is taken
 * from the manifests, so the file's shape is a property of the source and not of the argument
 * somebody happened to pass.
 */
const indexPath = path.join(OUT, "code-corpus.index.json");
const previous = existsSync(indexPath) ? JSON.parse(await readFile(indexPath, "utf8")) : [];
const byId = new Map(
  // Backfill `origin` on members captured before the field existed, from the only two things
  // it can be: a pinned public repository is real, and anything generated with no SHA is ours.
  previous.map((e) => [e.id, { ...e, origin: e.origin ?? (e.sha ? "real" : "synthetic") }]),
);
for (const { entry } of captured) {
  byId.set(entry.id, {
    id: entry.id,
    label: entry.label ?? "human",
    // "real" = a public artifact somebody else made and published. "synthetic" = we wrote it.
    origin: entry.origin ?? (entry.label === "generated" ? "synthetic" : "real"),
    source: entry.source,
    ...(entry.declaration ? { declaration: `${entry.declaration.file}: ${entry.declaration.contains}` } : {}),
    provenance: entry.provenance,
    sha: entry.sha ?? null,
    include: entry.include ?? [],
    capturedAt: entry.capturedAt ?? capturedAt,
  });
}
const order = [...MANIFEST, ...GENERATED_MANIFEST, ...SYNTHETIC].map((m) => m.id);
const index = [...byId.values()].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
await writeFile(indexPath, `${JSON.stringify(index, null, 2)}\n`, "utf8");
console.log(`\n${captured.length} artifact(s) captured at ${capturedAt}; ${index.length} in the index.`);
