/**
 * The scanner: turn a checkout on disk into a `RepoArtifact`.
 *
 * Everything measured here is a fact with a path and a line number attached. There is no
 * step where a model looks at the code, and there is no field the rules can cite vaguely.
 *
 * Three deliberate constraints:
 *
 *  - EVERY COLLECTION REPORTS A DENOMINATOR. `scanRepo` never returns a silently empty
 *    collection: a glob that matches nothing, an extension list that has gone stale or a
 *    permission error produces a probe with `denominator: 0`, which the core validator turns
 *    into a thrown `VacuousProbeError` rather than a clean-looking low score. This is the bug
 *    the source corpus shipped for months in three separate places.
 *  - SKIPPED FILES ARE NAMED. A file too large or too binary to read is listed in
 *    `artifact.skipped`, so coverage is never overstated by silence.
 *  - GIT IS OPTIONAL AND ITS ABSENCE IS NOT A FINDING. `git log` is read through
 *    `execFile` and any failure marks `history.available = false` with a reason, which
 *    skips the history family entirely.
 */

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type { ProbeStatus } from "@slop/core";
import { isSecretFile, redactSecrets } from "@slop/core";
import { PROBE_WEIGHTS, REPO_ARTIFACT_SCHEMA_VERSION } from "./artifact.js";
import type {
  AgentFileRecord,
  CommentRecord,
  CommitRecord,
  ConfigRecord,
  DependencyRecord,
  DuplicateBlock,
  FunctionRecord,
  PlaceholderRecord,
  ProbeId,
  ReadmeRecord,
  RepoArtifact,
  SourceFileRecord,
  TestFileRecord,
} from "./artifact.js";

const execFileAsync = promisify(execFile);

const DEFAULT_IGNORES = new Set([
  "node_modules", ".git", "dist", "build", "out", ".next", ".nuxt", ".svelte-kit", "coverage",
  "vendor", "target", "__pycache__", ".venv", "venv", ".turbo", ".cache", ".output", "tmp",
]);

/**
 * Dot-directories are tooling state, not source, and are skipped UNLESS an agent-artifact
 * path lives in one.
 *
 * Found the hard way: this repository keeps its calibration clones in a gitignored
 * `.corpus-cache/`, and the scanner walked all ten of them. The scan did not fail, it took
 * minutes and reported another project's code as this one's. The allowlist is derived from
 * `AGENT_FILES` below rather than restated, so adding `.somenewtool/rules` to that list
 * cannot leave this set behind.
 */
const walkableDotDirs = (): Set<string> => {
  const out = new Set([".github"]);
  for (const f of AGENT_FILES) {
    const head = f.path.split("/")[0] ?? "";
    if (head.startsWith(".") && f.path.includes("/")) out.add(head);
  }
  return out;
};

const SOURCE_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts",
  ".py", ".go", ".rb", ".rs", ".java", ".kt", ".cs", ".php", ".swift", ".scala",
  ".c", ".h", ".cc", ".cpp", ".hpp", ".sh", ".sql",
]);

/**
 * Agent working files. The `tool` label is what makes the finding legible: naming the tool
 * is a statement about a file that exists, not a guess about who wrote what.
 */
const AGENT_FILES: readonly { readonly path: string; readonly tool: string }[] = [
  { path: "CLAUDE.md", tool: "Claude Code" },
  { path: "CLAUDE.local.md", tool: "Claude Code" },
  { path: ".claude/settings.local.json", tool: "Claude Code" },
  { path: "AGENTS.md", tool: "OpenAI Codex / agents.md convention" },
  { path: ".cursorrules", tool: "Cursor" },
  { path: ".cursor/rules", tool: "Cursor" },
  { path: ".windsurfrules", tool: "Windsurf" },
  { path: ".clinerules", tool: "Cline" },
  { path: "GEMINI.md", tool: "Gemini CLI" },
  { path: ".github/copilot-instructions.md", tool: "GitHub Copilot" },
  { path: ".aider.conf.yml", tool: "aider" },
  { path: ".aider.chat.history.md", tool: "aider (session transcript)" },
  { path: ".aider.input.history", tool: "aider (session transcript)" },
  { path: ".specstory", tool: "SpecStory (session transcript)" },
];

/** README sentences that only a generator writes. Matched verbatim, case-insensitively. */
const README_TEMPLATE_MARKERS: readonly string[] = [
  "bootstrapped with [`create-next-app`]",
  "bootstrapped with create-next-app",
  "Getting Started with Create React App",
  "## Deploy on Vercel",
  "The easiest way to deploy your Next.js app",
  "This project was generated using",
  "Best-README-Template",
  "<!-- PROJECT LOGO -->",
  "TODO: Add a description",
  "Describe your project here",
  "npm run dev\n\n# or",
  "You can start editing the page by modifying",
];

/**
 * Config files that are the scaffold's own stub verbatim.
 *
 * The list is short and literal on purpose. A heuristic for "this config was never
 * customised" would be a guess; matching the exact bytes a generator emits is a fact.
 */
const SCAFFOLD_CONFIG_STUBS: readonly { readonly file: string; readonly normalized: string; readonly label: string }[] = [
  { file: ".eslintrc.json", normalized: '{"extends":"next/core-web-vitals"}', label: "create-next-app .eslintrc.json" },
  { file: ".eslintrc.json", normalized: '{"extends":["next/core-web-vitals"]}', label: "create-next-app .eslintrc.json" },
  { file: ".prettierrc", normalized: "{}", label: "empty prettier config" },
  { file: ".prettierrc.json", normalized: "{}", label: "empty prettier config" },
  { file: "vercel.json", normalized: "{}", label: "empty vercel config" },
];

const DOT_DIRS = walkableDotDirs();

const CONFIG_CANDIDATES: readonly string[] = [
  ".eslintrc.json", ".eslintrc.js", "eslint.config.js", "eslint.config.mjs",
  ".prettierrc", ".prettierrc.json", "prettier.config.js",
  "tsconfig.json", "vite.config.ts", "vitest.config.ts", "tailwind.config.js", "tailwind.config.ts",
  "vercel.json", "jest.config.js", ".editorconfig",
];

const PLACEHOLDER_PATTERNS: readonly { readonly re: RegExp; readonly marker: string }[] = [
  { re: /your[-_ ]api[-_ ]key[-_ ]here/i, marker: "your-api-key-here" },
  { re: /\bTODO:\s*(implement|add|fill|replace|write)\b/i, marker: "TODO: implement" },
  { re: /\bFIXME\b/, marker: "FIXME" },
  { re: /\blorem ipsum\b/i, marker: "lorem ipsum" },
  { re: /\breplace[- ]this\b/i, marker: "replace-this" },
  { re: /\b(?:xxx|placeholder)[-_ ]?(?:value|here|text)\b/i, marker: "placeholder value" },
  { re: /["'](?:https?:\/\/)?(?:www\.)?example\.com["']/i, marker: "example.com literal" },
  { re: /\bChangeMe\b/i, marker: "ChangeMe" },
  { re: /\bcoming soon\b/i, marker: "coming soon" },
];

/**
 * A placeholder that names an owner or a ticket. `FIXME(bnoordhuis)`, `TODO(#412)`,
 * `TODO: implement - see issue 44`, `XXX: tracked in JIRA-1201`.
 */
const ATTRIBUTED_RE =
  /\b(?:TODO|FIXME|XXX|HACK|NOTE)\s*[([]\s*[@#]?[A-Za-z0-9_.\/-]{2,}\s*[)\]]|\b(?:see|tracked in|issue|bug|ticket)\b[^.]{0,40}?(?:#\d+|[A-Z][A-Z0-9]+-\d+|https?:\/\/)/i;

/** A benchmark: it measures, it does not assert. Recognised by name and by content. */
const BENCHMARK_PATH_RE = /bench/i;
const BENCHMARK_BODY_RE = /func\s+Benchmark[A-Z]|b\.(?:ResetTimer|RunParallel|N)|describe\.bench|bench\s*\(|@pytest\.mark\.benchmark/;

/** A support file: fixtures, helpers, factories, configuration for the tests around it. */
const SUPPORT_PATH_RE =
  /(?:^|\/)(?:conftest\.py|__init__\.py|setup\.py|helpers?|support|factories|test[-_]?helper[s]?|spec_helper|test_helper)\.[a-z]+$|(?:^|\/)(?:helpers?|support|factories|fixtures?)\//i;

/**
 * Paths whose contents are INPUTS TO A TEST rather than shipped source.
 *
 * A `lorem ipsum` in a fixture is the fixture doing its job, and a rule's own positive
 * fixture is, by construction, a worked example of the thing the rule looks for. Recording
 * the role here lets the phase-2 suppressor withdraw that evidence with a stated reason
 * instead of the corpus quietly scoring every detector in the world as generated.
 */
const FIXTURE_PATH_RE =
  /(?:^|\/)(?:fixtures?|__fixtures__|testdata|test[-_]data|__mocks__|mocks|snapshots?|__snapshots__)(?:\/|$)|\.(?:fixture|mock|snap)\.[cm]?[jt]sx?$/i;

/**
 * Regular-expression literals on a line, extracted by a LINEAR SCAN.
 *
 * The first version of this was itself a regular expression, with a `(?:\\.|[...])+` body,
 * and it hung the scanner on the first long line it met: nested quantifiers over an
 * alternation backtrack exponentially when the closing delimiter never arrives. A detector
 * whose own pattern can lock up on an ordinary source file is not a detector. Character
 * scan, one pass, no backtracking.
 */
function regexLiteralsOn(line: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < line.length; i += 1) {
    if (line[i] !== "/" || line[i + 1] === "*" || line[i + 1] === "/") continue;
    let inClass = false;
    let body = "";
    let j = i + 1;
    for (; j < line.length; j += 1) {
      const ch = line[j] as string;
      if (ch === "\\") {
        body += ch + (line[j + 1] ?? "");
        j += 1;
        continue;
      }
      if (ch === "[") inClass = true;
      else if (ch === "]") inClass = false;
      else if (ch === "/" && !inClass) break;
      body += ch;
    }
    if (j < line.length && body.length > 0 && body.length <= 200) out.push(body);
    i = j;
  }
  return out;
}

/** A data-table entry that names a marker as its own value: `marker: "FIXME"`. */
const MARKER_TABLE_RE = /\b(?:marker|pattern|re|regex|matcher|token|needle|label)\s*:\s*(["'`])([^"'`\n]{2,60})\1/g;

/**
 * Is this line the definition of the pattern that just matched it?
 *
 * Two forms, both deterministic and both checkable by eye: a regular-expression literal on
 * the line whose own source matches the marker, or a marker-table entry whose value is the
 * marker. Everything else is a use, and a use is evidence.
 */
function definesItsOwnPattern(raw: string, marker: string): boolean {
  for (const source of regexLiteralsOn(raw)) {
    try {
      if (new RegExp(source, "i").test(marker)) return true;
    } catch {
      /* not a valid expression: it was a division or a path, not a pattern definition */
    }
  }
  const needle = marker.toLowerCase();
  for (const m of raw.matchAll(MARKER_TABLE_RE)) {
    const value = (m[2] ?? "").toLowerCase();
    if (value && (value === needle || value.includes(needle) || needle.includes(value))) return true;
  }
  return false;
}

/**
 * Does this normalised line carry executable content?
 *
 * String contents are already erased before a block is hashed, which is what lets a copy
 * with different literals still match. The cost is that a run of declarations collapses to
 * its punctuation: `id: "", family: "", title: "",` is the shape of EVERY rule object in
 * every rule corpus, so three unrelated rule files hashed identically and this scanner
 * reported "the same twelve lines in three files" about code that shares only a schema.
 * A window has to contain some verbs before a repeat of it means anything.
 */
const SUBSTANTIVE_RE =
  /\b(?:if|for|while|switch|case|try|catch|throw|return|await|new|typeof|delete|yield|else)\b|[A-Za-z_$][\w$]*\s*\(|===|!==|<=|>=|&&|\|\||\+\+|--|[-+*/%]=/;

/** Comment openers per language family. Block comments are handled by the `/* ... *\/` case. */
const LINE_COMMENT: Readonly<Record<string, string>> = {
  ".py": "#", ".rb": "#", ".sh": "#", ".sql": "--",
};

/**
 * Comment text is stored up to this length.
 *
 * The longest excerpt any rule prints is 240 characters, so anything beyond it is storage
 * that no receipt can ever cite. On the ten-repository calibration corpus, capping here cut
 * the stored artifacts by roughly a third with no change to a single finding.
 */
const COMMENT_TEXT_CAP = 240;

/**
 * Test files, across the languages this scanner claims to read.
 *
 * The first version knew two conventions, `**\/test/**` and `*.test.ts`, and it was written
 * in a TypeScript repository so nothing looked wrong. The calibration corpus made it visible
 * in one run: gin is roughly half tests, every one of them named `*_test.go`, and the scan
 * reported "40 source files, 0 test files" while counting the `http://example.com` in those
 * tests as placeholder residue in shipped source. Two findings, both false, both caused by a
 * pattern that could not express Go.
 *
 * A convention this list cannot express does not fail: it silently moves a repository's
 * tests into its source and then reports it as untested. Every language in
 * `SOURCE_EXTENSIONS` needs a line here.
 */
const TEST_PATH_RES: readonly RegExp[] = [
  /(?:^|\/)(?:tests?|__tests__|spec|specs|testing)\//i, // directory conventions, most languages
  /\.(?:test|spec)\.[cm]?[jt]sx?$/, //                     JavaScript, TypeScript
  /(?:^|\/)test_[^/]+\.py$|_test\.py$/, //                 Python (pytest, unittest)
  /_test\.go$/, //                                         Go
  /_(?:test|spec)\.rb$/, //                                Ruby (minitest, rspec)
  /_(?:test|spec)\.exs?$/, //                              Elixir
  /(?:Test|Tests|Spec|IT)\.(?:java|kt|scala|cs)$/, //      JVM and .NET
  /_test\.(?:c|cc|cpp)$|(?:^|\/)test-[^/]+\.(?:c|cc|cpp)$/, // C and C++
  /_test\.rs$|(?:^|\/)tests\//, //                         Rust integration tests
  /\.test\.php$|Test\.php$/, //                            PHP
];

/**
 * Assertion call sites, across the same languages.
 *
 * Same failure shape as above: a test file whose assertion style this pattern cannot express
 * reports zero assertions, which `verify.tautological-tests` treats as a test that cannot
 * fail. A false accusation produced entirely by a missing alternation.
 */
const ASSERTION_RE =
  /\b(?:expect|assert|should|require|t\.(?:is|deepEqual|truthy|throws|Error|Errorf|Fatal|Fatalf|Log)|chai\.assert|assert_[a-z_]+|self\.assert[A-Za-z]*|ASSERT(?:_[A-Z]+)?|EXPECT_[A-Z]+|assert_that)\s*\(|\b(?:assert|require)\.[A-Za-z]+\s*\(|\.\s*(?:should|must)\s*[.(]/g;
const TAUTOLOGY_RE =
  /expect\(\s*(true|1|"[^"]*")\s*\)\s*\.\s*(?:toBe|toEqual|toStrictEqual)\s*\(\s*\1\s*\)|assert\s*\(\s*true\s*\)|assert\s*\(\s*(\d+)\s*===\s*\2\s*\)/;

/**
 * Replace the contents of every string literal with an empty one, keeping the quotes.
 * Used wherever a pattern must match CODE rather than data that happens to look like code.
 */
const eraseStrings = (line: string): string => line.replace(/(["'`])(?:\\.|(?!\1).)*\1/g, "$1$1");

/** Words that mark a comment as carrying a REASON rather than a restatement. */
const RATIONALE_RE =
  /\b(because|otherwise|so that|the reason|we tried|used to|previously|workaround|caveat|gotcha|beware|do not|don't|deliberately|on purpose|intentionally|see issue|see #\d|regression|bug|breaks|broke|spec says|required by|rate.?limit|race)\b/i;

export interface ScanOptions {
  /** Glob-ish include patterns. `**\/*.ts` style; only `*` and `**` are honoured. */
  readonly include?: readonly string[];
  readonly maxFiles?: number;
  readonly maxFileBytes?: number;
  readonly readHistory?: boolean;
  readonly historyLimit?: number;
  /** Total bytes of source this scan will read. Default 256 MB. */
  readonly maxTotalBytes?: number;
  /** How deep the walk descends. Default 40. */
  readonly maxDepth?: number;
}

/**
 * A limit a caller asked for that this scanner will not honour.
 *
 * Distinct from the SOFT limits, which truncate and say so in `artifact.skipped`. This is for
 * the case where the argument itself is the problem: `maxFiles: 10_000_000` is not a request
 * for a thorough scan, it is a request for the process to die somewhere in the middle of one,
 * and the honest answer is a refusal a caller can catch rather than an out-of-memory two
 * minutes later with no artifact and no explanation.
 */
export class ScanLimitError extends Error {
  constructor(
    readonly option: string,
    readonly requested: number,
    readonly ceiling: number,
  ) {
    super(
      `scanRepo was asked for ${option}=${requested}, above the hard ceiling of ${ceiling}. This scanner runs on the caller's machine against a tree it does not control, so its limits are refusals rather than suggestions.`,
    );
    this.name = "ScanLimitError";
  }
}

/**
 * Ceilings, and the hostile tree each one exists for.
 *
 * The whole of this section is about a repository that was ASSEMBLED to be scanned rather
 * than one that happened to be large. `walk` already caps the file count, which is what a
 * large monorepo needs; none of the following is reachable by an honest checkout:
 *
 *  - `HARD_MAX_FILES` / `HARD_MAX_FILE_BYTES`: an argument, not a tree. See `ScanLimitError`.
 *  - `MAX_TOTAL_BYTES`: five thousand files of 512 KB each is 2.5 GB read and largely retained
 *    as comment, function and placeholder records. The file cap and the per-file cap are both
 *    satisfied the whole way; only their product is the problem, so only their product catches
 *    it.
 *  - `MAX_DEPTH`: the file cap counts FILES, and a tree of a hundred thousand empty
 *    directories contains none. The walk would enumerate every one of them having collected
 *    nothing to stop for.
 *  - `MAX_DIRECTORIES`: the same shape, one level up, for a tree that is wide instead of deep.
 *  - `MAX_RECORDS`: one generated 500 KB file can hold fifty thousand `// TODO: implement`
 *    lines, all of them under every byte limit, all of them retained.
 *
 * A symlink loop needs no ceiling at all, and the reason is worth stating because it is easy
 * to break: `walk` reads directory entries with `withFileTypes`, whose types come from `lstat`,
 * and it descends only on `isDirectory()` and collects only on `isFile()`. A symlink is
 * NEITHER, so it is skipped without being followed, and a cycle cannot form. Anything that
 * changes those two predicates re-opens both the loop and the path-escape it implies.
 */
const HARD_MAX_FILES = 200_000;
const HARD_MAX_FILE_BYTES = 16 * 1024 * 1024;
const MAX_TOTAL_BYTES = 256 * 1024 * 1024;
const MAX_DEPTH = 40;
const MAX_DIRECTORIES = 50_000;
const MAX_RECORDS = 20_000;

/** Milliseconds `git log` gets before this scanner decides git is not answering. */
const GIT_TIMEOUT_MS = 15_000;

/** Translate a small glob subset to a RegExp. Deliberately limited and documented as such. */
function globToRegExp(glob: string): RegExp {
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  const body = escaped.replace(/\*\*\//g, "\u0000").replace(/\*\*/g, "\u0001").replace(/\*/g, "[^/]*").replace(/\?/g, "[^/]");
  return new RegExp(`^${body.replace(/\u0000/g, "(?:.*/)?").replace(/\u0001/g, ".*")}$`);
}

/**
 * Enumerate the tree, breadth first, bounded on four axes.
 *
 * `isDirectory()` and `isFile()` here come from `lstat` (that is what `withFileTypes` gives
 * you), and a symlink satisfies NEITHER predicate. That single property is why this walk
 * cannot loop on `a -> b -> a`, cannot be led out of the root by `docs -> /etc`, and never
 * reads a file the root does not contain. It reads as an omission and it is a guarantee;
 * `scan.test.ts` holds it in place with a fixture that is nothing but symlinks.
 *
 * `reason` is reported rather than inferred, so a truncated walk says WHICH limit stopped it.
 * Coverage that is silently partial is the failure this whole file is written against.
 */
async function walk(
  root: string,
  maxFiles: number,
  maxDepth: number,
): Promise<{ files: string[]; truncated: boolean; reason: string | null }> {
  const out: string[] = [];
  const queue: { rel: string; depth: number }[] = [{ rel: "", depth: 0 }];
  let truncated = false;
  let reason: string | null = null;
  let directories = 0;
  let symlinksSkipped = 0;

  const stop = (why: string): void => {
    truncated = true;
    reason ??= why;
  };

  while (queue.length > 0 && out.length < maxFiles) {
    const next = queue.shift() as { rel: string; depth: number };
    if (directories >= MAX_DIRECTORIES) {
      stop(`the walk reached the ${MAX_DIRECTORIES} directory limit`);
      break;
    }
    directories += 1;
    let entries;
    try {
      entries = await readdir(path.join(root, next.rel), { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const childRel = next.rel ? `${next.rel}/${entry.name}` : entry.name;
      // Neither branch below matches a symlink, and that is the containment guarantee. Counted
      // rather than ignored so the artifact can say a tree was full of them.
      if (entry.isSymbolicLink()) {
        symlinksSkipped += 1;
        continue;
      }
      if (entry.isDirectory()) {
        if (DEFAULT_IGNORES.has(entry.name)) continue;
        if (entry.name.startsWith(".") && !DOT_DIRS.has(entry.name)) continue;
        if (next.depth + 1 > maxDepth) {
          stop(`the walk reached the ${maxDepth} level depth limit`);
          continue;
        }
        queue.push({ rel: childRel, depth: next.depth + 1 });
      } else if (entry.isFile()) {
        // A credential file is not evidence of anything this corpus measures, and the cheapest
        // way to guarantee its contents never reach a report is to never put it on the list.
        if (isSecretFile(childRel)) continue;
        if (out.length >= maxFiles) {
          stop(`the walk stopped at ${maxFiles} files; the tree is larger than the scan limit`);
          break;
        }
        out.push(childRel);
      }
    }
  }
  if (queue.length > 0) stop(`the walk stopped at ${maxFiles} files; the tree is larger than the scan limit`);
  if (symlinksSkipped > 0 && reason === null) {
    reason = `${symlinksSkipped} symbolic link(s) were not followed, which is how this walk stays inside the target`;
  }
  return { files: out, truncated, reason };
}

interface ParsedFile {
  readonly record: SourceFileRecord;
  readonly functions: FunctionRecord[];
  readonly comments: CommentRecord[];
  readonly placeholders: PlaceholderRecord[];
  readonly blockHashes: { hash: string; startLine: number; excerpt: string }[];
}

const FUNCTION_RE =
  /^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function\s+([A-Za-z0-9_$]+)|(?:const|let|var)\s+([A-Za-z0-9_$]+)\s*(?::[^=]+)?=\s*(?:async\s*)?\(|def\s+([A-Za-z0-9_]+)\s*\(|func\s+([A-Za-z0-9_]+)\s*\()/;

function parseSource(relPath: string, text: string): ParsedFile {
  const ext = path.extname(relPath);
  const lines = text.split(/\r?\n/);
  const lineComment = LINE_COMMENT[ext] ?? "//";
  const comments: CommentRecord[] = [];
  const placeholders: PlaceholderRecord[] = [];
  const functionStarts: { name: string; line: number }[] = [];
  let commentLines = 0;
  let blankLines = 0;
  let inBlock = false;
  let blockStart = 0;
  let blockText: string[] = [];

  lines.forEach((raw, i) => {
    const line = raw.trim();
    const lineNo = i + 1;

    if (line === "") {
      blankLines += 1;
      return;
    }
    // Placeholders are scanned on EVERY line, before the comment branches return.
    // The first version of this scanned only code lines, which skipped `// TODO: implement`
    // and `// FIXME` entirely: the two most common placeholders there are, both of which live
    // in comments by definition. It found three of seven in the integration fixture and
    // reported the other four as absent, which reads as a cleaner repository than it is.
    for (const p of PLACEHOLDER_PATTERNS) {
      if (p.re.test(raw)) {
        placeholders.push({
          file: relPath,
          line: lineNo,
          marker: p.marker,
          // A placeholder line is quoted verbatim into a report and from there into an LLM's
          // context. `PLACEHOLDER_PATTERNS` includes `your-api-key-here`, so the lines this rule
          // finds are, by construction, the lines around which people keep real keys.
          text: redactSecrets(line.slice(0, 200)),
          definesItsOwnPattern: definesItsOwnPattern(raw, p.marker),
          attributed: ATTRIBUTED_RE.test(raw),
        });
        break;
      }
    }

    // Block comments become COMMENT RECORDS, not just a line count.
    //
    // The first version counted them toward `commentLines` and threw the text away. The
    // consequence only became visible when the calibration corpus was captured: libuv, a
    // fourteen-year-old C codebase full of explanatory `/* ... */`, came back with ZERO
    // comments, so both comment rules and the strongest counter rule in the corpus were dead
    // on it, and on every Java, C, C++, CSS and JSDoc-commented codebase for the same reason.
    // Nothing failed. The repository simply scored as though nobody had ever explained
    // anything in it. A block comment is one record: the body joined, cited at its first line.
    const startsBlock = !inBlock && (line.startsWith("/*") || line.startsWith('"""') || line.startsWith("'''"));
    if (inBlock || startsBlock) {
      commentLines += 1;
      if (startsBlock) {
        blockStart = lineNo;
        blockText = [];
      }
      blockText.push(line.replace(/^\/\*+|^\*+\/?|\*\/$|^"""|"""$|^'''|'''$/g, "").trim());
      const ends = startsBlock
        ? line.includes("*/") || (line.length > 3 && (line.endsWith('"""') || line.endsWith("'''")))
        : line.includes("*/") || line.endsWith('"""') || line.endsWith("'''");
      inBlock = !ends;
      if (ends) {
        const body = blockText.filter(Boolean).join(" ").slice(0, COMMENT_TEXT_CAP);
        // The next CODE line, not the next physical line: a block comment is followed by the
        // thing it describes, sometimes across a blank line.
        const next = (lines.slice(i + 1).find((l) => l.trim() !== "") ?? "").trim();
        if (body.length >= 3) {
          comments.push({
            file: relPath,
            line: blockStart,
            text: body,
            restatesNextLine: restates(body, next),
            givesRationale: RATIONALE_RE.test(body),
          });
        }
      }
      return;
    }
    if (line.startsWith(lineComment) || (ext === ".sql" && line.startsWith("--"))) {
      commentLines += 1;
      const body = line.slice(lineComment.length).trim().slice(0, COMMENT_TEXT_CAP);
      const next = (lines[i + 1] ?? "").trim();
      comments.push({
        file: relPath,
        line: lineNo,
        text: body,
        restatesNextLine: restates(body, next),
        givesRationale: RATIONALE_RE.test(body),
      });
      return;
    }

    const fn = FUNCTION_RE.exec(raw);
    if (fn) {
      const name = fn[1] ?? fn[2] ?? fn[3] ?? fn[4];
      if (name) functionStarts.push({ name, line: lineNo });
    }
  });

  const functions: FunctionRecord[] = functionStarts.map((f, i) => ({
    file: relPath,
    name: f.name,
    startLine: f.line,
    lineCount: (functionStarts[i + 1]?.line ?? lines.length + 1) - f.line,
  }));

  // Normalised 12-line windows, for cross-file duplicate detection.
  //
  // Five normalisations, each one load-bearing. Whitespace collapses and string contents are
  // erased, so a copy with different literals still matches. COMMENT LINES ARE DROPPED: the
  // first version kept them, so three route files carrying an identical twelve-line body
  // hashed differently because each had its own one-line header comment above it, and the
  // rule reported no duplication at all. And the stride is 3, not 12: a window that only
  // starts every twelve lines misses any copy that is not twelve-line-aligned, which is most
  // of them.
  //
  // The last two came out of this repository's own first self-scan, and both were producing
  // wrong output rather than no output:
  //
  //  - A WINDOW MUST CONTAIN VERBS. See `MIN_SUBSTANTIVE` below. Closing braces and a run of
  //    `key: "",` declarations are the same in every codebase on earth.
  //  - THE ORIGINAL LINE NUMBER IS CARRIED. The first version used the index into the
  //    FILTERED list as the citation, so every duplicate finding cited a line that was not
  //    the line it had read. A citation nobody can follow to the right place is worse than
  //    no citation: it is a confident, checkable, wrong statement.
  const codeOnly = lines
    .map((l, i) => ({ n: i + 1, t: l.trim() }))
    .filter((x) => x.t && !x.t.startsWith("//") && !x.t.startsWith("#") && !x.t.startsWith("*") && !x.t.startsWith("/*"))
    .map((x) => ({ n: x.n, t: x.t.replace(/\s+/g, " ").replace(/(["'`])(?:\\.|(?!\1).)*\1/g, '""') }));
  const blockHashes: { hash: string; startLine: number; excerpt: string }[] = [];
  const BLOCK = 12;
  const STRIDE = 3;
  // At least half the window has to contain a verb: a call, a branch, an operator. Without
  // this, a run of declarations with their strings erased (`id: "", family: "", title: "",`)
  // is the shape of every rule object in every rule corpus, and three unrelated files get
  // reported as copies of each other on the strength of sharing a schema.
  const MIN_SUBSTANTIVE = 6;
  for (let i = 0; i + BLOCK <= codeOnly.length && blockHashes.length < 400; i += STRIDE) {
    const window = codeOnly.slice(i, i + BLOCK);
    if (window.filter((x) => SUBSTANTIVE_RE.test(x.t)).length < MIN_SUBSTANTIVE) continue;
    blockHashes.push({
      hash: createHash("sha1").update(window.map((x) => x.t).join("\n")).digest("hex").slice(0, 12),
      startLine: window[0]?.n ?? 1,
      excerpt: window.slice(0, 2).map((x) => x.t).join(" "),
    });
  }

  return {
    record: {
      path: relPath,
      ext,
      bytes: Buffer.byteLength(text),
      lines: lines.length,
      codeLines: lines.length - commentLines - blankLines,
      commentLines,
      blankLines,
      imports: [...text.matchAll(/(?:from\s+|require\(\s*|import\s+)["']([^"']+)["']/g)].map((m) => m[1] as string),
      role: FIXTURE_PATH_RE.test(relPath) ? "fixture-data" : "ordinary",
    },
    functions,
    comments,
    placeholders,
    blockHashes,
  };
}

/**
 * Does the comment restate the next code line?
 *
 * Token overlap in both directions: the comment's content words must be mostly present in
 * the next line's identifiers, and the comment must add almost nothing of its own. Coarse
 * and it says so in the rule's `falsePositiveNote`, but it is deterministic and a reader can
 * check it in two lines.
 */
function restates(comment: string, nextLine: string): boolean {
  if (!nextLine || comment.length < 6 || comment.length > 90) return false;
  if (RATIONALE_RE.test(comment)) return false;
  // Stopwords are removed before the ratio is taken. Without this the measurement is
  // dominated by "the", "and" and "for", which never appear in an identifier, so a perfect
  // restatement like "// Set the api key" above `const apiKey = ...` scored 2 of 4 and was
  // classified as informative. Every genuine restatement in the integration fixture was
  // missed for that reason alone.
  const words = (comment.toLowerCase().match(/[a-z]{3,}/g) ?? []).filter((w) => !STOPWORDS.has(w));
  if (words.length < 2 || words.length > 8) return false;
  const codeTokens = new Set(
    (nextLine.match(/[A-Za-z]{3,}/g) ?? []).flatMap((t) => [t.toLowerCase(), ...t.split(/(?=[A-Z])|_/).map((s) => s.toLowerCase())]),
  );
  const hits = words.filter((w) => [...codeTokens].some((t) => t.length >= 3 && (t.includes(w) || w.includes(t))));
  return hits.length / words.length >= 0.6;
}

/** Words that carry no information about what a line of code does. */
const STOPWORDS = new Set([
  "the", "and", "for", "this", "that", "with", "from", "into", "all", "not", "are", "its", "out",
  "but", "has", "have", "was", "were", "will", "can", "when", "then", "our", "any", "each", "here",
  "them", "they", "which", "you", "your", "over", "onto", "back", "just", "also", "only", "one",
]);

async function readGitHistory(
  root: string,
  limit: number,
): Promise<{ available: boolean; reason?: string; commits: CommitRecord[] }> {
  try {
    const { stdout } = await execFileAsync(
      "git",
      [
        "-C",
        root,
        // A CHECKOUT CARRIES CONFIGURATION, AND CONFIGURATION IS CODE.
        //
        // `.git/config` in a repository somebody handed you can set `core.pager`,
        // `core.fsmonitor`, `core.hooksPath` and a list of aliases, several of which are
        // commands git will run on its own initiative. This scanner reads trees it did not
        // create, so it names the ones that matter and turns them off rather than assuming
        // that `log` happens not to reach any of them today.
        "-c",
        "core.fsmonitor=false",
        "-c",
        "core.hooksPath=/dev/null",
        "-c",
        "core.pager=cat",
        "-c",
        "protocol.ext.allow=never",
        "--no-pager",
        "log",
        `-n${limit}`,
        "--no-color",
        "--pretty=format:%H%x1f%ae%x1f%aI%x1f%s%x1f%P%x1f%b%x1e",
      ],
      {
        maxBuffer: 8 * 1024 * 1024,
        windowsHide: true,
        // Without this, a repository large enough (or a filesystem slow enough) hangs the
        // whole scan on a subprocess with nobody watching it. Git being slow is not a
        // finding, and `available: false` with a reason is what the history family already
        // knows how to read.
        timeout: GIT_TIMEOUT_MS,
        env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_ASKPASS: "", GIT_CONFIG_NOSYSTEM: "1" },
      },
    );
    const commits: CommitRecord[] = stdout
      .split("\u001e")
      .map((chunk) => chunk.trim())
      .filter(Boolean)
      .map((chunk) => {
        const [sha = "", authorEmail = "", at = "", subject = "", parents = "", body = ""] = chunk.split("\u001f");
        return {
          sha: sha.slice(0, 10),
          authorEmail,
          at,
          subject,
          bodyLines: body.split("\n").filter((l) => l.trim()).length,
          isMerge: parents.trim().split(/\s+/).filter(Boolean).length > 1,
        };
      });
    if (commits.length === 0) return { available: false, reason: "git log returned no commits", commits: [] };
    return { available: true, commits };
  } catch (error) {
    return {
      available: false,
      reason: error instanceof Error ? error.message.split("\n")[0] : "git is not available",
      commits: [],
    };
  }
}

const probe = (id: ProbeId, ran: boolean, denominator: number, extra: Partial<ProbeStatus> = {}): ProbeStatus => ({
  id,
  ran,
  denominator,
  weight: PROBE_WEIGHTS[id],
  ...extra,
});

/** Scan a checkout. The only function in this package that touches the filesystem. */
export async function scanRepo(root: string, options: ScanOptions = {}): Promise<RepoArtifact> {
  const maxFiles = options.maxFiles ?? 5_000;
  const maxFileBytes = options.maxFileBytes ?? 512 * 1024;
  const maxTotalBytes = options.maxTotalBytes ?? MAX_TOTAL_BYTES;
  const maxDepth = options.maxDepth ?? MAX_DEPTH;
  // Refused rather than clamped. Silently scanning 200,000 files for a caller who asked for
  // ten million is the same class of lie as silently scanning none: the caller ends up
  // believing something about the read that is not true.
  if (maxFiles > HARD_MAX_FILES) throw new ScanLimitError("maxFiles", maxFiles, HARD_MAX_FILES);
  if (maxFileBytes > HARD_MAX_FILE_BYTES) throw new ScanLimitError("maxFileBytes", maxFileBytes, HARD_MAX_FILE_BYTES);
  if (maxTotalBytes > MAX_TOTAL_BYTES) throw new ScanLimitError("maxTotalBytes", maxTotalBytes, MAX_TOTAL_BYTES);
  if (maxDepth > MAX_DEPTH) throw new ScanLimitError("maxDepth", maxDepth, MAX_DEPTH);

  const include = options.include ?? [];
  const includeRes = include.map(globToRegExp);
  let bytesRead = 0;

  const { files: allPaths, reason: walkReason } = await walk(root, maxFiles, maxDepth);
  const matches = (p: string): boolean => includeRes.length === 0 || includeRes.some((re) => re.test(p));

  const skipped: string[] = [];
  const fileRecords: SourceFileRecord[] = [];
  const functions: FunctionRecord[] = [];
  const comments: CommentRecord[] = [];
  const placeholders: PlaceholderRecord[] = [];
  const tests: TestFileRecord[] = [];
  const blockIndex = new Map<string, { file: string; startLine: number; excerpt: string }[]>();

  const isTest = (p: string): boolean => TEST_PATH_RES.some((re) => re.test(p));

  for (const rel of allPaths) {
    const ext = path.extname(rel);
    if (!SOURCE_EXTENSIONS.has(ext) || !matches(rel)) continue;
    // The per-file cap and the total cap catch different trees. One 10 GB file is stopped by
    // `maxFileBytes`; five thousand 512 KB files are each under it and are stopped only here.
    if (bytesRead >= maxTotalBytes) {
      skipped.push(`${rel} (and every file after it: the scan reached its ${maxTotalBytes} byte total read budget)`);
      break;
    }
    let text: string;
    try {
      const info = await stat(path.join(root, rel));
      if (info.size > maxFileBytes) {
        skipped.push(`${rel} (${info.size} bytes, over the ${maxFileBytes} byte limit)`);
        continue;
      }
      // Only regular files are read. `stat` follows links, so a `main.ts` symlinked at
      // `/dev/zero` or at a FIFO reads as a size of zero and then blocks forever on a read
      // nothing cancels. `walk` already refuses to list a symlink; this refuses the rest.
      if (!info.isFile()) {
        skipped.push(`${rel} (not a regular file)`);
        continue;
      }
      text = await readFile(path.join(root, rel), "utf8");
      bytesRead += info.size;
    } catch (error) {
      skipped.push(`${rel} (${error instanceof Error ? error.message.split("\n")[0] : "unreadable"})`);
      continue;
    }
    if (text.includes("\u0000")) {
      skipped.push(`${rel} (binary)`);
      continue;
    }

    if (isTest(rel)) {
      const lines = text.split(/\r?\n/);
      const kind =
        BENCHMARK_PATH_RE.test(path.basename(rel)) || BENCHMARK_BODY_RE.test(text)
          ? "benchmark"
          : SUPPORT_PATH_RE.test(rel)
            ? "support"
            : "test";
      tests.push({
        path: rel,
        lines: lines.length,
        kind,
        assertions: (text.match(ASSERTION_RE) ?? []).length,
        // Tautologies are matched against the line with STRING CONTENTS ERASED. A test file
        // that writes another test file as a fixture contains the text `expect(true).toBe(true)`
        // inside a string literal, and matching it there reports a test that cannot fail in a
        // file whose tests are fine. Erasure is safe for the real thing: a genuine tautology
        // compares literals, not string contents, so it survives the transform.
        tautologies: lines
          .map((l, i) => ({ line: i + 1, text: l.trim(), scannable: eraseStrings(l) }))
          .filter((l) => TAUTOLOGY_RE.test(l.scannable))
          .map(({ line, text }) => ({ line, text }))
          .slice(0, 10),
      });
      continue;
    }

    const parsed = parseSource(rel, text);
    fileRecords.push(parsed.record);
    // Record caps. One generated 500 KB file can hold fifty thousand `// TODO: implement`
    // lines, every one of them inside every byte limit and every one of them retained. The
    // rules downstream cite at most a handful; the rest is memory with no reader.
    if (functions.length < MAX_RECORDS) functions.push(...parsed.functions);
    if (comments.length < MAX_RECORDS) comments.push(...parsed.comments);
    if (placeholders.length < MAX_RECORDS) placeholders.push(...parsed.placeholders);
    for (const b of parsed.blockHashes) {
      const bucket = blockIndex.get(b.hash) ?? [];
      bucket.push({ file: rel, startLine: b.startLine, excerpt: b.excerpt });
      blockIndex.set(b.hash, bucket);
    }
  }

  // Overlapping windows of ONE duplicated region are merged into one block.
  //
  // The window stride is 3, so a thirty-line region copied into three files produces six
  // hashes with six sets of near-identical occurrences. Reported raw, that is one fact
  // printed six times, and the rule's multiplicity decay then treats it as six independent
  // observations, which is exactly the arithmetic that turns a cross-platform port into a
  // verdict. libuv's event loop, written once per platform, made this visible: four
  // "duplicate blocks" that were four overlapping views of the same twenty lines.
  const groups = [...blockIndex.entries()]
    .map(([hash, occ]) => ({ hash, occ: [...occ].sort((a, b) => a.file.localeCompare(b.file) || a.startLine - b.startLine) }))
    .filter((d) => new Set(d.occ.map((o) => o.file)).size >= 3)
    .sort((a, b) => (a.occ[0]?.file ?? "").localeCompare(b.occ[0]?.file ?? "") || (a.occ[0]?.startLine ?? 0) - (b.occ[0]?.startLine ?? 0));

  const merged: { hash: string; occ: { file: string; startLine: number; endLine: number; excerpt: string }[] }[] = [];
  const fileSetKey = (occ: readonly { file: string }[]): string => [...new Set(occ.map((o) => o.file))].sort().join("|");
  for (const g of groups) {
    const key = fileSetKey(g.occ);
    const into = merged.find(
      (m) =>
        fileSetKey(m.occ) === key &&
        g.occ.every((o) => m.occ.some((x) => x.file === o.file && o.startLine <= x.endLine + 1 && o.startLine >= x.startLine - 12)),
    );
    if (into) {
      for (const o of g.occ) {
        const target = into.occ.find((x) => x.file === o.file);
        if (target) target.endLine = Math.max(target.endLine, o.startLine + 11);
      }
      continue;
    }
    merged.push({ hash: g.hash, occ: g.occ.map((o) => ({ ...o, endLine: o.startLine + 11 })) });
  }

  const duplicates: DuplicateBlock[] = merged.slice(0, 20).map((d) => ({
    hash: d.hash,
    lineCount: Math.max(...d.occ.map((o) => o.endLine - o.startLine + 1)),
    occurrences: d.occ.map((o) => ({ file: o.file, startLine: o.startLine })),
    excerpt: d.occ[0]?.excerpt ?? "",
  }));

  const present = new Set(allPaths);
  const gitignore = await readFile(path.join(root, ".gitignore"), "utf8").catch(() => "");
  const ignoredLines = new Set(
    gitignore.split(/\r?\n/).map((l) => l.trim().replace(/^\/+|\/+$/g, "")).filter((l) => l && !l.startsWith("#")),
  );

  const agentFiles: AgentFileRecord[] = [];
  for (const candidate of AGENT_FILES) {
    const hit = [...present].find((p) => p === candidate.path || p.startsWith(`${candidate.path}/`));
    if (!hit) continue;
    let excerpt = "";
    let bytes = 0;
    try {
      const info = await stat(path.join(root, hit));
      bytes = info.size;
      excerpt = redactSecrets((await readFile(path.join(root, hit), "utf8")).slice(0, 200));
    } catch {
      /* a directory-shaped candidate such as .cursor/rules: the path itself is the evidence */
    }
    agentFiles.push({
      path: hit,
      bytes,
      tool: candidate.tool,
      gitIgnored: ignoredLines.has(candidate.path) || ignoredLines.has(candidate.path.split("/")[0] ?? ""),
      excerpt: excerpt.replace(/\s+/g, " ").trim(),
    });
  }

  const importerOf = (dep: string): string[] =>
    fileRecords.filter((f) => f.imports.some((i) => i === dep || i.startsWith(`${dep}/`))).map((f) => f.path);
  const manifestRaw = await readFile(path.join(root, "package.json"), "utf8").catch(() => null);
  const dependencies: DependencyRecord[] = [];
  if (manifestRaw) {
    try {
      const manifest = JSON.parse(manifestRaw) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      for (const kind of ["dependencies", "devDependencies"] as const) {
        for (const name of Object.keys(manifest[kind] ?? {})) {
          dependencies.push({ name, kind, importedBy: importerOf(name) });
        }
      }
    } catch {
      skipped.push("package.json (not valid JSON)");
    }
  }

  const configs: ConfigRecord[] = [];
  for (const candidate of CONFIG_CANDIDATES) {
    if (!present.has(candidate)) continue;
    const text = await readFile(path.join(root, candidate), "utf8").catch(() => null);
    if (text === null) continue;
    const normalized = text.replace(/\s+/g, "");
    const stub = SCAFFOLD_CONFIG_STUBS.find((s) => s.file === candidate && s.normalized === normalized);
    configs.push({
      path: candidate,
      bytes: Buffer.byteLength(text),
      matchesScaffoldDefault: stub?.label ?? null,
      excerpt: redactSecrets(text.slice(0, 200).replace(/\s+/g, " ").trim()),
    });
  }

  let readme: ReadmeRecord | null = null;
  const readmePath = [...present].find((p) => /^readme(\.md|\.txt)?$/i.test(p));
  if (readmePath) {
    const text = (await readFile(path.join(root, readmePath), "utf8").catch(() => "")) || "";
    const lines = text.split(/\r?\n/);
    readme = {
      path: readmePath,
      bytes: Buffer.byteLength(text),
      lines: lines.length,
      templateMarkers: README_TEMPLATE_MARKERS.flatMap((marker) => {
        const idx = lines.findIndex((l) => l.toLowerCase().includes(marker.toLowerCase().split("\n")[0] ?? marker));
        return idx === -1 ? [] : [{ line: idx + 1, marker, text: redactSecrets((lines[idx] ?? "").slice(0, 200)) }];
      }),
    };
  }

  const history = options.readHistory === false
    ? { available: false, reason: "history reading was disabled by the caller", commits: [] as CommitRecord[] }
    : await readGitHistory(root, options.historyLimit ?? 200);

  const changelogText = await readFile(path.join(root, "CHANGELOG.md"), "utf8").catch(() => "");
  const workflowDir = [...present].filter((p) => /^\.github\/workflows\/.+\.ya?ml$/.test(p));
  const ciWorkflows: { path: string; steps: number }[] = [];
  for (const w of workflowDir) {
    const text = await readFile(path.join(root, w), "utf8").catch(() => "");
    ciWorkflows.push({ path: w, steps: (text.match(/^\s*-\s+(?:name|uses|run):/gm) ?? []).length });
  }

  const probes: ProbeStatus[] = [
    probe("tree", true, allPaths.length, { expectsNonEmpty: true, note: "files in the tree. Zero means the walk found nothing and every conclusion below was reached without looking." }),
    probe("source", true, fileRecords.length, {
      expectsNonEmpty: true,
      note: "source files parsed. Zero means the extension list or the include glob matched nothing, and every rule about the code passed having read nothing.",
    }),
    probe("comments", fileRecords.length > 0, comments.length, {
      note: "comments extracted. Legitimately zero in an uncommented repository, so this probe does not demand a non-empty result; the comment rules simply do not fire.",
    }),
    probe("manifest", manifestRaw !== null, dependencies.length, { note: "declared dependencies" }),
    probe("config", true, configs.length, { note: "tooling config files found" }),
    probe("readme", readme !== null, readme ? 1 : 0),
    probe("tests", true, tests.length, { note: "test files found" }),
    probe("history", history.available, history.commits.length, { ...(history.reason ? { note: history.reason } : {}) }),
    probe("agent-files", true, AGENT_FILES.length, {
      expectsNonEmpty: true,
      note: "agent-artifact paths probed. Zero means the candidate list is empty, so every 'no agent files here' conclusion was reached without looking at anything.",
    }),
  ];

  // The walk names the limit that stopped it rather than restating one this scope guessed at.
  if (walkReason) skipped.push(`(${walkReason})`);

  return {
    schemaVersion: REPO_ARTIFACT_SCHEMA_VERSION,
    root,
    scannedAt: new Date().toISOString(),
    include,
    skipped,
    files: fileRecords,
    functions,
    comments,
    placeholders,
    duplicates,
    agentFiles,
    dependencies,
    configs,
    tests,
    readme,
    history,
    collaboration: {
      codeowners: present.has("CODEOWNERS") || present.has(".github/CODEOWNERS") || present.has("docs/CODEOWNERS"),
      pullRequestTemplate:
        present.has(".github/pull_request_template.md") || present.has(".github/PULL_REQUEST_TEMPLATE.md"),
      changelogEntries: (changelogText.match(/^##\s+/gm) ?? []).length,
      ciWorkflows,
    },
    probes,
  };
}
