import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The FTC guard.
 *
 * *In re Workado* (FTC consent order, 2026) is a false-and-unsubstantiated-performance-claim
 * count under FTC Act s5 over "98% accuracy" for an AI-content detector. The pleaded facts
 * read as a checklist: the respondent did not build the model, did not test it against the
 * use cases it advertised, and could not produce substantiation. Any accuracy figure this
 * product states is a substantiation-bearing claim, and the only defensible way to hold one
 * is to COMPUTE IT, from a named corpus, at test time, on the version being shipped.
 *
 * So: no accuracy number is written down anywhere in this repository's source, tool output or
 * documentation. This test walks the shipped surfaces and fails if one appears. It is
 * deliberately blunt: an author who genuinely needs to state a measured figure must make the
 * harness print it, which is exactly the behaviour the order is trying to produce.
 *
 * The research documents at the repository root are EXCLUDED. They quote other vendors'
 * marketing claims and the measured refutations of them, which is the evidence base for this
 * rule existing, not a claim by us.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");

/** Only what ships: package source, package READMEs, and the root README. */
const SHIPPED_DIRS = ["packages"];
const SHIPPED_ROOT_FILES = ["README.md"];
/**
 * Tests are excluded, and that exclusion is load-bearing rather than convenient: this file
 * and the calibration suite both have to WRITE the strings they hunt for, so scanning them
 * would make the guard permanently red. The tradeoff is that a claim smuggled into a test
 * would not be caught, which is acceptable because a test is not a shipped surface.
 */
const SKIP_DIRS = new Set(["node_modules", "dist", ".git", "coverage", "test", "__tests__"]);

const CLAIM_PATTERNS: readonly { readonly re: RegExp; readonly what: string }[] = [
  { re: /\b\d{1,3}(?:\.\d+)?\s*%\s*(?:accura(?:te|cy)|precision|recall|correct|reliable)/i, what: "a percentage accuracy claim" },
  { re: /\b(?:accuracy|precision|recall|f1)\s*(?:of|:|=)\s*\d/i, what: "a stated accuracy/precision/recall figure" },
  { re: /\bfalse[- ]positive rate\s*(?:of|:|=)\s*\d/i, what: "a stated false-positive rate" },
  { re: /\b\d{1,3}(?:\.\d+)?\s*%\s*of\s+(?:generated|ai|synthetic)\b/i, what: "a detection-rate claim" },
  { re: /\bindustry[- ]leading\b|\bmost accurate\b|\bstate[- ]of[- ]the[- ]art accuracy\b/i, what: "an unqualified superiority claim" },
];

async function shippedFiles(): Promise<string[]> {
  const out: string[] = [];
  for (const f of SHIPPED_ROOT_FILES) {
    const full = path.join(repoRoot, f);
    if (await stat(full).then(() => true, () => false)) out.push(full);
  }
  const queue = SHIPPED_DIRS.map((d) => path.join(repoRoot, d));
  while (queue.length > 0) {
    const dir = queue.pop() as string;
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) queue.push(full);
      } else if (/\.(ts|tsx|js|mjs|md|json)$/.test(entry.name)) {
        out.push(full);
      }
    }
  }
  return out;
}

describe("no published accuracy claim exists outside the calibration harness", () => {
  it("scans a non-empty set of shipped files", async () => {
    // The denominator assertion. Without it a broken path makes every check below vacuously
    // true, which is the failure this whole project is built around.
    const files = await shippedFiles();
    expect(files.length, "the shipped-file walk found nothing, so this test proves nothing").toBeGreaterThan(20);
    expect(files.some((f) => f.endsWith("README.md")), "no README was scanned").toBe(true);
    expect(files.some((f) => f.includes("detectors-code")), "the code detector package was not scanned").toBe(true);
    expect(files.some((f) => f.includes("mcp-server")), "the MCP server package was not scanned").toBe(true);
  });

  it("finds no accuracy figure in any shipped source, README or tool string", async () => {
    const files = await shippedFiles();
    const violations: string[] = [];
    for (const file of files) {
      const text = await readFile(file, "utf8").catch(() => "");
      text.split(/\r?\n/).forEach((line, i) => {
        for (const p of CLAIM_PATTERNS) {
          if (p.re.test(line)) {
            violations.push(`${path.relative(repoRoot, file)}:${i + 1} contains ${p.what}: ${line.trim().slice(0, 140)}`);
          }
        }
      });
    }
    expect(violations, violations.join("\n")).toEqual([]);
  });

  it("the patterns themselves are not dead: each one matches a known-bad string", async () => {
    // Mutation-testing the guard. A pattern that can no longer express the thing it is
    // hunting fails silently and this whole file becomes decoration; the source corpus
    // shipped exactly that bug in the detector it wrote to catch that bug.
    const knownBad = [
      "Our detector is 98% accurate on real-world content.",
      "accuracy: 0.94 on the holdout set",
      "false-positive rate of 0.3% across the corpus",
      "catches 92% of AI generated pages",
      "the industry-leading AI detector",
    ];
    for (let i = 0; i < CLAIM_PATTERNS.length; i += 1) {
      const p = CLAIM_PATTERNS[i]!;
      expect(
        knownBad.some((s) => p.re.test(s)),
        `claim pattern ${i} ("${p.what}") matches none of the known-bad strings, so it is not guarding anything.`,
      ).toBe(true);
    }
  });
});
