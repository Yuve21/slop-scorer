import { describe, expect, it } from "vitest";
import {
  analyzeRepoArtifact,
  CODE_CONFIG,
  CODE_RULE_DESCRIPTORS,
  CODE_RULES,
  codeDetector,
  neutralRepo,
  PROBE_WEIGHTS,
} from "@slop/detectors-code";
import type { CodeRule, ProbeId, RepoArtifact } from "@slop/detectors-code";
import type { DetectorResult } from "@slop/core";
import { assertWellFormedResult, buildReport } from "@slop/core";
import {
  expectDescriptorsAreComplete,
  expectNeutralSilence,
  expectProbeRegistryIsHonest,
  expectRuleIsAlive,
  expectStaleProbeFailsLoudly,
  zeroed,
} from "../../core/test/meta.js";
import type { CorpusUnderTest } from "../../core/test/meta.js";

const input = { kind: "repo", path: "/repo" } as const;

const corpus: CorpusUnderTest<RepoArtifact, ProbeId> = {
  name: "code corpus",
  rules: CODE_RULES,
  neutral: () => neutralRepo(),
  probeIds: Object.keys(PROBE_WEIGHTS) as ProbeId[],
  analyze: (artifact, rules): DetectorResult =>
    analyzeRepoArtifact(artifact, input, { ...(rules ? { rules: rules as readonly CodeRule[] } : {}) }),
  zeroProbe: (artifact, probe) => ({ ...artifact, probes: zeroed(artifact.probes, probe) }),
};

describe("the code corpus is honest about itself", () => {
  it("the neutral repository fires nothing at all", () => expectNeutralSilence(corpus));
  it("every declared probe is read by at least one rule", () => expectProbeRegistryIsHonest(corpus));
  it("every rule ships an explanation, a rebuttal and a version", () => expectDescriptorsAreComplete(corpus));

  it("the published descriptors match the live rules exactly", () => {
    expect(CODE_RULE_DESCRIPTORS.map((r) => r.id).sort()).toEqual(CODE_RULES.map((r) => r.id).sort());
    expect(codeDetector.rules.length).toBe(CODE_RULES.length);
  });

  it("every family a rule declares is registered in the scoring config", () => {
    // An unregistered family silently falls back to the minimum cap, which would quietly
    // suppress a whole group of rules with nothing in the output saying so.
    const registered = new Set(CODE_CONFIG.families.map((f) => f.id));
    for (const rule of CODE_RULES) {
      expect(registered.has(rule.family), `${rule.id} declares unregistered family "${rule.family}"`).toBe(true);
    }
  });

  it("has counter-evidence rules, and they are global in scope", () => {
    const counters = CODE_RULES.filter((r) => r.polarity === "counter");
    expect(counters.length).toBeGreaterThanOrEqual(4);
    expect(counters.every((c) => c.counterScope === "global")).toBe(true);
  });
});

describe.each(CODE_RULES.map((r) => [r.id, r] as const))("%s", (_id, rule) => {
  it("fires on its positive fixture, dies on its mutation, and cites something followable", () =>
    expectRuleIsAlive(corpus, rule));
  it("disappears loudly when the probe it depends on collects nothing", () =>
    expectStaleProbeFailsLoudly(corpus, rule));
});

describe("a repository with the full set of tells", () => {
  const generated = neutralRepo({
    agentFiles: [
      { path: "CLAUDE.md", bytes: 4_200, tool: "Claude Code", gitIgnored: false, excerpt: "# CLAUDE.md" },
      { path: ".cursorrules", bytes: 900, tool: "Cursor", gitIgnored: false, excerpt: "You are an expert" },
    ],
    comments: Array.from({ length: 12 }, (_, i) => ({
      file: "src/app.ts",
      line: 10 + i * 3,
      text: ["Increment the counter", "Return the result", "Loop the items", "Call the API"][i % 4] as string,
      restatesNextLine: true,
      givesRationale: false,
    })),
    readme: {
      path: "README.md",
      bytes: 1_200,
      lines: 34,
      templateMarkers: [
        { line: 1, marker: "bootstrapped with create-next-app", text: "This is a Next.js project bootstrapped with create-next-app." },
      ],
    },
    dependencies: [
      { name: "axios", kind: "dependencies", importedBy: [] },
      { name: "lodash", kind: "dependencies", importedBy: [] },
      { name: "moment", kind: "dependencies", importedBy: [] },
      { name: "uuid", kind: "dependencies", importedBy: [] },
    ],
    tests: [],
    files: Array.from({ length: 18 }, (_, i) => ({
      path: `src/handlers/h${i}.ts`,
      ext: ".ts",
      bytes: 3_800,
      lines: 112 + (i % 3),
      codeLines: 90,
      commentLines: 14,
      blankLines: 8,
      imports: ["./util"],
    })),
    functions: Array.from({ length: 24 }, (_, i) => ({
      file: `src/handlers/h${i % 18}.ts`,
      name: `handle${i}`,
      startLine: 8,
      lineCount: 22 + (i % 3),
    })),
    history: {
      available: true,
      commits: Array.from({ length: 16 }, (_, i) => ({
        sha: `f${i}`,
        authorEmail: "one@example.com",
        at: new Date(Date.parse("2026-08-01T10:00:00.000Z") + i * 5 * 60_000).toISOString(),
        subject: `feat: step ${i}`,
        bodyLines: 0,
        isMerge: false,
      })),
    },
  });

  const report = buildReport([analyzeRepoArtifact(generated, input)], { config: CODE_CONFIG });

  it("scores high and reconciles", () => {
    expect(report.status).toBe("assessed");
    expect(report.score ?? 0).toBeGreaterThan(50);
    const sum = report.receipt.lines.reduce((a, l) => a + l.points, 0);
    expect(report.receipt.priorPoints + sum).toBe(report.receipt.computedScore);
  });

  it("names a file and a line on every finding", () => {
    for (const line of report.receipt.lines) {
      for (const e of line.evidence) {
        expect(e.locator, `${line.ruleId}`).toBeTruthy();
        expect(e.observed, `${line.ruleId}`).toBeTruthy();
      }
    }
  });

  it("every finding carries the counter-evidence that would rebut it", () => {
    for (const line of report.receipt.lines) {
      expect(line.falsePositiveNote.length, `${line.ruleId} shipped without a rebuttal`).toBeGreaterThan(30);
    }
  });

  it("is a well-formed detector result", () => {
    expect(() => assertWellFormedResult(analyzeRepoArtifact(generated, input))).not.toThrow();
  });
});

describe("a repository with no readable git history", () => {
  const noGit = neutralRepo({
    history: { available: false, reason: "not a git repository", commits: [] },
    probes: neutralRepo().probes.map((p) => (p.id === "history" ? { ...p, ran: false, denominator: 0 } : p)),
  });

  it("skips the history family and says so, rather than treating absence as a finding", () => {
    const result = analyzeRepoArtifact(noGit, input);
    expect(result.findings.some((f) => f.family === "history")).toBe(false);
    expect(result.warnings?.join(" ")).toContain("No git history was readable");
    expect(result.rulesEvaluated).not.toContain("history.single-sitting");
  });
});
