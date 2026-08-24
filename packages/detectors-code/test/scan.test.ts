import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { analyzeRepoArtifact, CODE_CONFIG, scanRepo } from "@slop/detectors-code";
import type { RepoArtifact } from "@slop/detectors-code";
import { assertWellFormedResult, buildReport } from "@slop/core";

/**
 * The scanner against a real filesystem.
 *
 * The unit suite runs against stored artifacts, which is what keeps it fast and reproducible,
 * but it cannot catch the scanner reading the wrong thing: a path that never resolves, an
 * extension list that has gone stale, a glob that matches nothing. Those failures produce an
 * EMPTY artifact, and an empty artifact reads exactly like a clean repository. So this file
 * writes a small repository to a temp directory and asserts the scanner actually found what
 * is in it, with the denominators to prove it.
 */

let root: string;
let artifact: RepoArtifact;

const write = async (rel: string, body: string): Promise<void> => {
  const full = path.join(root, rel);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, body, "utf8");
};

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), "slop-scan-"));

  await write("CLAUDE.md", "# CLAUDE.md\n\nThis file provides guidance to Claude Code when working in this repo.\n");
  await write(".aider.chat.history.md", "#### make the tests pass\n\n> I will update the reader.\n");
  await write(
    "README.md",
    "# my-app\n\nThis is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org).\n\n## Deploy on Vercel\n\nThe easiest way to deploy your Next.js app is to use the Vercel Platform.\n",
  );
  await write(
    "package.json",
    JSON.stringify({ name: "my-app", dependencies: { axios: "^1", lodash: "^4", moment: "^2", uuid: "^9", used: "^1" } }, null, 2),
  );
  await write(".eslintrc.json", '{ "extends": "next/core-web-vitals" }\n');
  await write(".prettierrc", "{}\n");

  await write(
    "src/config.ts",
    [
      "import { thing } from 'used';",
      "",
      "// Set the api key",
      'export const apiKey = "your-api-key-here";',
      "// TODO: implement the refresh flow",
      "export const refresh = null;",
      "// FIXME",
      'export const site = "https://example.com";',
      "// Replace this value",
      'export const label = "ChangeMe";',
      "// Coming soon",
      "export const soon = true;",
      "// Lorem ipsum",
      "export const filler = thing;",
    ].join("\n"),
  );

  // Three route files carrying the same twelve-line block, verbatim.
  const duplicated = [
    "export async function handler(req) {",
    "  const body = await req.json();",
    "  if (!body) {",
    "    return new Response('bad request', { status: 400 });",
    "  }",
    "  const result = await process(body);",
    "  if (!result) {",
    "    return new Response('not found', { status: 404 });",
    "  }",
    "  return new Response(JSON.stringify(result), { status: 200 });",
    "}",
    "export const runtime = 'nodejs';",
    "export const dynamic = 'force-dynamic';",
  ].join("\n");
  for (const name of ["users", "orders", "items"]) {
    await write(`src/routes/${name}.ts`, `// Handle the ${name} route\n${duplicated}\n`);
  }

  await write(
    "src/pricing.ts",
    [
      "// VAT applies before the discount because HMRC treats the discount as a price adjustment.",
      "export function priceFor(net: number): number {",
      "  // Get the user by id",
      "  const user = getUserById(id);",
      "  // Return the total price",
      "  return totalPrice;",
      "}",
    ].join("\n"),
  );

  await write("test/pricing.test.ts", "import { expect, it } from 'vitest';\nit('is vacuous', () => { expect(true).toBe(true); });\n");
  await write("node_modules/ignored/index.js", "module.exports = 1;\n");

  artifact = await scanRepo(root, { readHistory: false });
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("the scanner reads what is actually on disk", () => {
  it("every probe reports a denominator, and the ones that must be non-empty are", () => {
    for (const p of artifact.probes) {
      expect(p.denominator, `probe ${p.id} reported no denominator`).toBeTypeOf("number");
      if (p.expectsNonEmpty && p.ran) {
        expect(p.denominator, `probe ${p.id} ran and collected nothing`).toBeGreaterThan(0);
      }
    }
  });

  it("skips node_modules", () => {
    expect(artifact.files.map((f) => f.path).some((p) => p.includes("node_modules"))).toBe(false);
  });

  it("finds the committed agent files and labels the tool", () => {
    const paths = artifact.agentFiles.map((f) => f.path);
    expect(paths).toContain("CLAUDE.md");
    expect(paths).toContain(".aider.chat.history.md");
    expect(artifact.agentFiles.find((f) => f.path === "CLAUDE.md")?.tool).toBe("Claude Code");
  });

  it("finds the README template markers with line numbers", () => {
    expect(artifact.readme?.templateMarkers.length ?? 0).toBeGreaterThanOrEqual(2);
    for (const m of artifact.readme?.templateMarkers ?? []) expect(m.line).toBeGreaterThan(0);
  });

  it("finds the placeholders, each with a file and a line", () => {
    expect(artifact.placeholders.length).toBeGreaterThanOrEqual(6);
    for (const p of artifact.placeholders) {
      expect(p.file).toBeTruthy();
      expect(p.line).toBeGreaterThan(0);
    }
  });

  it("resolves which dependencies nothing imports", () => {
    const dead = artifact.dependencies.filter((d) => d.importedBy.length === 0).map((d) => d.name);
    expect(dead).toEqual(expect.arrayContaining(["axios", "lodash", "moment", "uuid"]));
    expect(artifact.dependencies.find((d) => d.name === "used")?.importedBy).toContain("src/config.ts");
  });

  it("recognises the untouched scaffold config stubs by exact content", () => {
    const stubs = artifact.configs.filter((c) => c.matchesScaffoldDefault !== null).map((c) => c.path);
    expect(stubs).toEqual(expect.arrayContaining([".eslintrc.json", ".prettierrc"]));
  });

  it("finds the duplicated block in three separate files", () => {
    const dup = artifact.duplicates.find((d) => new Set(d.occurrences.map((o) => o.file)).size >= 3);
    expect(dup, "the twelve-line block written into three route files was not detected").toBeTruthy();
    expect(dup?.occurrences.map((o) => o.file).sort()).toEqual([
      "src/routes/items.ts",
      "src/routes/orders.ts",
      "src/routes/users.ts",
    ]);
  });

  it("tells a restating comment from a rationale comment", () => {
    const restating = artifact.comments.filter((c) => c.restatesNextLine);
    const rationale = artifact.comments.filter((c) => c.givesRationale);
    expect(restating.length, "no comment was recognised as restating its next line").toBeGreaterThan(0);
    expect(rationale.map((c) => c.text).join(" ")).toContain("HMRC");
  });

  it("finds the tautological test", () => {
    const t = artifact.tests.find((x) => x.path.endsWith("pricing.test.ts"));
    expect(t?.tautologies.length ?? 0).toBeGreaterThan(0);
  });

  it("does not mistake a tautology quoted inside a string for a real one", async () => {
    // A test file that writes another test file as a fixture. The literal
    // `expect(true).toBe(true)` appears in it, inside a string, and must not be reported.
    // This repository's own scan found exactly this false positive on the first live run.
    await write(
      "test/meta-writer.test.ts",
      [
        "import { expect, it } from 'vitest';",
        'const fixture = "it(\'x\', () => { expect(true).toBe(true); });";',
        "it('writes a fixture', () => { expect(fixture.length).toBeGreaterThan(10); });",
      ].join("\n"),
    );
    const rescanned = await scanRepo(root, { readHistory: false });
    const t = rescanned.tests.find((x) => x.path.endsWith("meta-writer.test.ts"));
    expect(t, "the fixture-writing test file was not scanned at all").toBeTruthy();
    expect(t?.tautologies, "a tautology quoted inside a string is data, not a test").toEqual([]);
    expect(t?.assertions ?? 0, "its real assertions must still be counted").toBeGreaterThan(0);
  });

  it("cites the line the duplicate actually starts on, in the real file", async () => {
    // The first version used the index into the FILTERED line list as the citation, so every
    // duplicate finding named a line that was not the line it had read. Checked against the
    // file on disk rather than against the scanner's own arithmetic.
    const dup = artifact.duplicates.find((d) => new Set(d.occurrences.map((o) => o.file)).size >= 3);
    for (const occ of dup?.occurrences ?? []) {
      const body = (await readFile(path.join(root, occ.file), "utf8")).split(/\r?\n/);
      const line = body[occ.startLine - 1] ?? "";
      expect(line.trim(), `${occ.file}:${occ.startLine} is not the start of the duplicated block`).toContain(
        "export async function handler",
      );
    }
  });

  it("does not report a run of declarations as a duplicated block", async () => {
    // Three files that share only a SCHEMA. With string contents erased, `id: "", family: "",`
    // is the shape of every rule object in every rule corpus on GitHub, and this scanner
    // reported three unrelated files in this very repository as copies of each other on the
    // strength of it.
    const dir = await mkdtemp(path.join(tmpdir(), "slop-decl-"));
    for (const name of ["alpha", "beta", "gamma"]) {
      await mkdir(path.join(dir, "src"), { recursive: true });
      await writeFile(
        path.join(dir, "src", `${name}.ts`),
        [
          "export const rule = {",
          `  id: "${name}",`,
          '  family: "shapes",',
          `  title: "The ${name} rule",`,
          '  polarity: "signal",',
          '  severity: "medium",',
          "  baseWeight: 0.6,",
          "  maxHits: 3,",
          '  requiresProbe: "source",',
          "  phase: 1,",
          '  since: "corpus-2026.09",',
          `  explanation: "${name}",`,
          `  falsePositiveNote: "${name}",`,
          "};",
          "",
        ].join("\n"),
        "utf8",
      );
    }
    const declared = await scanRepo(dir, { readHistory: false });
    expect(declared.duplicates, "three files sharing a schema are not three copies of a block").toEqual([]);
    await rm(dir, { recursive: true, force: true });
  });

  it("records block comments, not just line comments", async () => {
    // A fourteen-year-old C codebase full of `/* ... */` came back with ZERO comments, so both
    // comment rules and the strongest counter rule in the corpus were dead on it, and on every
    // Java, C++, CSS and JSDoc-commented codebase for the same reason.
    const dir = await mkdtemp(path.join(tmpdir(), "slop-block-"));
    await writeFile(
      path.join(dir, "loop.c"),
      [
        "/* Poll with a zero timeout, because a blocking poll here deadlocks",
        " * against the signal handler on AIX. See the 2019 regression. */",
        "static void uv__io_poll(uv_loop_t* loop) {",
        "  return;",
        "}",
        "",
      ].join("\n"),
      "utf8",
    );
    const c = await scanRepo(dir, { readHistory: false });
    expect(c.comments.length, "no block comment was recorded at all").toBeGreaterThan(0);
    expect(c.comments[0]?.line, "the block comment must cite its first line").toBe(1);
    expect(c.comments[0]?.givesRationale, "a comment naming a deadlock and a regression is a reason").toBe(true);
    await rm(dir, { recursive: true, force: true });
  });

  it("knows a Go test file when it sees one, and does not read it as shipped source", async () => {
    // gin is roughly half tests, every one of them `*_test.go`. The scanner reported it as
    // having no tests and counted the `http://example.com` inside those tests as placeholder
    // residue in production code. Two false findings from one JavaScript-shaped pattern.
    const dir = await mkdtemp(path.join(tmpdir(), "slop-go-"));
    await writeFile(path.join(dir, "context.go"), "package gin\n\nfunc New() int {\n  return 1\n}\n", "utf8");
    await writeFile(
      path.join(dir, "context_test.go"),
      [
        "package gin",
        "",
        "func TestNew(t *testing.T) {",
        '  req, _ := http.NewRequest(http.MethodGet, "http://example.com", nil)',
        "  assert.Equal(t, 1, New())",
        "  require.NotNil(t, req)",
        "}",
        "",
      ].join("\n"),
      "utf8",
    );
    await writeFile(
      path.join(dir, "benchmarks_test.go"),
      "package gin\n\nfunc BenchmarkNew(b *testing.B) {\n  for i := 0; i < b.N; i++ {\n    New()\n  }\n}\n",
      "utf8",
    );
    const go = await scanRepo(dir, { readHistory: false });
    expect(go.tests.map((t) => t.path).sort()).toEqual(["benchmarks_test.go", "context_test.go"]);
    expect(go.files.map((f) => f.path)).toEqual(["context.go"]);
    expect(go.placeholders, "an example.com inside a test is not residue in shipped source").toEqual([]);
    expect(go.tests.find((t) => t.path === "context_test.go")?.assertions ?? 0).toBeGreaterThan(0);
    expect(
      go.tests.find((t) => t.path === "benchmarks_test.go")?.kind,
      "a benchmark measures; it is not a test that cannot fail",
    ).toBe("benchmark");
    await rm(dir, { recursive: true, force: true });
  });

  it("marks a placeholder that is the definition of its own pattern", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "slop-self-"));
    await mkdir(path.join(dir, "src"), { recursive: true });
    await writeFile(
      path.join(dir, "src", "patterns.ts"),
      [
        "export const PATTERNS = [",
        '  { re: /\\bFIXME\\b/, marker: "FIXME" },',
        '  { re: /\\blorem ipsum\\b/i, marker: "lorem ipsum" },',
        '  { re: /\\bChangeMe\\b/i, marker: "ChangeMe" },',
        "];",
        '// FIXME: this one is a real unfinished job in a file that also defines the pattern',
        "",
      ].join("\n"),
      "utf8",
    );
    await writeFile(path.join(dir, "src", "app.ts"), '// FIXME: finish the retry path\nexport const x = 1;\n', "utf8");
    const self = await scanRepo(dir, { readHistory: false });
    const table = self.placeholders.filter((p) => p.file.endsWith("patterns.ts") && p.definesItsOwnPattern);
    expect(table.length, "a marker table entry must be recognised as defining its own pattern").toBeGreaterThanOrEqual(3);
    const elsewhere = self.placeholders.find((p) => p.file.endsWith("app.ts"));
    expect(elsewhere?.definesItsOwnPattern, "an ordinary FIXME is a use, not a definition").toBe(false);
  });

  it("does not walk gitignored dot-directories, and still finds agent files inside allowed ones", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "slop-dot-"));
    await mkdir(path.join(dir, ".corpus-cache", "someone-elses-repo", "src"), { recursive: true });
    await writeFile(path.join(dir, ".corpus-cache", "someone-elses-repo", "src", "x.ts"), "export const x = 1;\n", "utf8");
    await mkdir(path.join(dir, ".cursor"), { recursive: true });
    await writeFile(path.join(dir, ".cursor", "rules"), "always write tests\n", "utf8");
    await writeFile(path.join(dir, "index.ts"), "export const y = 2;\n", "utf8");
    const walked = await scanRepo(dir, { readHistory: false });
    expect(walked.files.map((f) => f.path)).toEqual(["index.ts"]);
    expect(walked.agentFiles.map((f) => f.path), "an agent file inside .cursor/ must still be found").toContain(
      ".cursor/rules",
    );
    await rm(dir, { recursive: true, force: true });
  });

  it("reports history as unavailable when the caller disabled it, and that is not a finding", () => {
    expect(artifact.history.available).toBe(false);
    const result = analyzeRepoArtifact(artifact, { kind: "repo", path: root });
    expect(result.findings.some((f) => f.family === "history")).toBe(false);
  });
});

describe("the scanned repository scores end to end", () => {
  it("produces a well-formed, reconciling report with citable findings", () => {
    const result = analyzeRepoArtifact(artifact, { kind: "repo", path: root });
    expect(() => assertWellFormedResult(result)).not.toThrow();
    const report = buildReport([result], { config: CODE_CONFIG });
    const sum = report.receipt.lines.reduce((a, l) => a + l.points, 0);
    expect(report.receipt.priorPoints + sum).toBe(report.receipt.computedScore);
    expect(report.receipt.lines.length).toBeGreaterThan(0);
    for (const line of report.receipt.lines) {
      expect(line.evidence.length).toBeGreaterThan(0);
    }
  });

  it("an include glob that matches nothing refuses to look like a clean repository", () => {
    // The vacuous-pass shape, reproduced deliberately: a narrowed scan that finds no source
    // must fail loudly at the contract boundary rather than score low.
    return expect(
      scanRepo(root, { include: ["packages/nothing/**/*.zzz"], readHistory: false }).then((a) =>
        assertWellFormedResult(analyzeRepoArtifact(a, { kind: "repo", path: root })),
      ),
    ).rejects.toThrow(/collected 0 items/);
  });
});
