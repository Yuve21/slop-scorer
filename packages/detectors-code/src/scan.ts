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

/** Comment openers per language family. Block comments are handled by the `/* ... *\/` case. */
const LINE_COMMENT: Readonly<Record<string, string>> = {
  ".py": "#", ".rb": "#", ".sh": "#", ".sql": "--",
};

const ASSERTION_RE = /\b(?:expect|assert|should|t\.(?:is|deepEqual|truthy|throws)|chai\.assert)\s*\(/g;
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
}

/** Translate a small glob subset to a RegExp. Deliberately limited and documented as such. */
function globToRegExp(glob: string): RegExp {
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  const body = escaped.replace(/\*\*\//g, "\u0000").replace(/\*\*/g, "\u0001").replace(/\*/g, "[^/]*").replace(/\?/g, "[^/]");
  return new RegExp(`^${body.replace(/\u0000/g, "(?:.*/)?").replace(/\u0001/g, ".*")}$`);
}

async function walk(root: string, maxFiles: number): Promise<{ files: string[]; truncated: boolean }> {
  const out: string[] = [];
  const queue: string[] = [""];
  let truncated = false;
  while (queue.length > 0 && out.length < maxFiles) {
    const rel = queue.shift() as string;
    let entries;
    try {
      entries = await readdir(path.join(root, rel), { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const childRel = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (DEFAULT_IGNORES.has(entry.name)) continue;
        queue.push(childRel);
      } else if (entry.isFile()) {
        if (out.length >= maxFiles) {
          truncated = true;
          break;
        }
        out.push(childRel);
      }
    }
  }
  return { files: out, truncated: truncated || queue.length > 0 };
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
        placeholders.push({ file: relPath, line: lineNo, marker: p.marker, text: line.slice(0, 200) });
        break;
      }
    }

    const startsBlock = !inBlock && (line.startsWith("/*") || line.startsWith('"""') || line.startsWith("'''"));
    if (inBlock || startsBlock) {
      commentLines += 1;
      if (startsBlock) inBlock = !(line.includes("*/") || (line.length > 3 && (line.endsWith('"""') || line.endsWith("'''"))));
      else if (line.includes("*/") || line.endsWith('"""') || line.endsWith("'''")) inBlock = false;
      return;
    }
    if (line.startsWith(lineComment) || (ext === ".sql" && line.startsWith("--"))) {
      commentLines += 1;
      const body = line.slice(lineComment.length).trim();
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
  // Three normalisations, each one load-bearing. Whitespace collapses and string contents are
  // erased, so a copy with different literals still matches. COMMENT LINES ARE DROPPED: the
  // first version kept them, so three route files carrying an identical twelve-line body
  // hashed differently because each had its own one-line header comment above it, and the
  // rule reported no duplication at all. And the stride is 3, not 12: a window that only
  // starts every twelve lines misses any copy that is not twelve-line-aligned, which is most
  // of them.
  const codeOnly = lines
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("//") && !l.startsWith("#") && !l.startsWith("*") && !l.startsWith("/*"))
    .map((l) => l.replace(/\s+/g, " ").replace(/(["'`])(?:\\.|(?!\1).)*\1/g, '""'));
  const blockHashes: { hash: string; startLine: number; excerpt: string }[] = [];
  const BLOCK = 12;
  const STRIDE = 3;
  for (let i = 0; i + BLOCK <= codeOnly.length && blockHashes.length < 400; i += STRIDE) {
    const window = codeOnly.slice(i, i + BLOCK);
    blockHashes.push({
      hash: createHash("sha1").update(window.join("\n")).digest("hex").slice(0, 12),
      startLine: i + 1,
      excerpt: window.slice(0, 2).join(" "),
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
      ["-C", root, "log", `-n${limit}`, "--no-color", "--pretty=format:%H%x1f%ae%x1f%aI%x1f%s%x1f%P%x1f%b%x1e"],
      { maxBuffer: 8 * 1024 * 1024, windowsHide: true },
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
  const include = options.include ?? [];
  const includeRes = include.map(globToRegExp);

  const { files: allPaths, truncated } = await walk(root, maxFiles);
  const matches = (p: string): boolean => includeRes.length === 0 || includeRes.some((re) => re.test(p));

  const skipped: string[] = [];
  const fileRecords: SourceFileRecord[] = [];
  const functions: FunctionRecord[] = [];
  const comments: CommentRecord[] = [];
  const placeholders: PlaceholderRecord[] = [];
  const tests: TestFileRecord[] = [];
  const blockIndex = new Map<string, { file: string; startLine: number; excerpt: string }[]>();

  const isTest = (p: string): boolean => /(?:^|\/)(?:tests?|__tests__|spec)\//.test(p) || /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(p) || /(?:^|\/)test_[^/]+\.py$/.test(p);

  for (const rel of allPaths) {
    const ext = path.extname(rel);
    if (!SOURCE_EXTENSIONS.has(ext) || !matches(rel)) continue;
    let text: string;
    try {
      const info = await stat(path.join(root, rel));
      if (info.size > maxFileBytes) {
        skipped.push(`${rel} (${info.size} bytes, over the ${maxFileBytes} byte limit)`);
        continue;
      }
      text = await readFile(path.join(root, rel), "utf8");
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
      tests.push({
        path: rel,
        lines: lines.length,
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
    functions.push(...parsed.functions);
    comments.push(...parsed.comments);
    placeholders.push(...parsed.placeholders);
    for (const b of parsed.blockHashes) {
      const bucket = blockIndex.get(b.hash) ?? [];
      bucket.push({ file: rel, startLine: b.startLine, excerpt: b.excerpt });
      blockIndex.set(b.hash, bucket);
    }
  }

  const duplicates: DuplicateBlock[] = [...blockIndex.entries()]
    .map(([hash, occ]) => ({ hash, occ, files: new Set(occ.map((o) => o.file)) }))
    .filter((d) => d.files.size >= 3)
    .slice(0, 20)
    .map((d) => ({
      hash: d.hash,
      lineCount: 12,
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
      excerpt = (await readFile(path.join(root, hit), "utf8")).slice(0, 200);
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
      excerpt: text.slice(0, 200).replace(/\s+/g, " ").trim(),
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
        return idx === -1 ? [] : [{ line: idx + 1, marker, text: (lines[idx] ?? "").slice(0, 200) }];
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

  if (truncated) skipped.push(`(walk stopped at ${maxFiles} files; the tree is larger than the scan limit)`);

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
