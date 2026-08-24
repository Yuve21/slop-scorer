import { mkdir, mkdtemp, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { forgetBaselines, proposeFixes, scanCodebase, verifyFix } from "slop-scorer-mcp";
import type { ProposeFixesPayload } from "slop-scorer-mcp";
import { FORBIDDEN_VERDICT_PHRASES } from "@slop/core";
import type { Remediation } from "@slop/core";

/**
 * The loop, end to end, against a real checkout on disk.
 *
 * scan -> propose -> APPLY THE PATCHES HERE, with ordinary filesystem calls, exactly as a host
 * agent would with its own edit tools -> verify. The applier below is deliberately dumb and
 * lives in the test rather than in the package: if the proposals need anything cleverer than
 * "read the file, splice the lines, write it back" to apply, they are not precise enough, and
 * this file is where that shows up.
 *
 * The assertion that matters is at the bottom: after applying, the findings the patches
 * addressed are NO LONGER PRESENT, and nothing new appeared. A remediation that resolves its
 * own finding and introduces another is not a fix, and `verify_fix` is built to say so.
 */

let root: string;

const write = async (rel: string, body: string): Promise<void> => {
  await mkdir(path.dirname(path.join(root, rel)), { recursive: true });
  await writeFile(path.join(root, rel), body, "utf8");
};

const README = [
  "# app",
  "",
  "This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app).",
  "",
  "## Getting Started",
  "",
  "Run the dev server.",
  "",
  "## Deploy on Vercel",
  "",
  "The easiest way to deploy is to use the Vercel Platform.",
  "",
].join("\n");

async function buildFixture(): Promise<void> {
  await write("CLAUDE.md", "# CLAUDE.md\n\nThis file provides guidance to Claude Code when working in this repository.\n");
  await write("README.md", README);
  await write("package.json", JSON.stringify({ name: "app", dependencies: { axios: "^1", lodash: "^4", moment: "^2", uuid: "^9" } }));
  await write(".prettierrc", "{}\n");
  await write(".eslintrc.json", '{"extends":"next/core-web-vitals"}\n');
  for (let i = 0; i < 18; i += 1) {
    await write(
      `src/mod${i}.ts`,
      ["// Set the api key", 'const apiKey = "your-api-key-here";', "// Get the user by id", "const user = getUserById(id);", "export default user;"].join("\n"),
    );
  }
}

/** The whole applier. A host agent's edit tools do this; the package never does. */
async function apply(remediation: Remediation): Promise<void> {
  if (remediation.kind === "delete_file") {
    await unlink(path.join(root, remediation.path));
    return;
  }
  if (remediation.kind === "insert") {
    const full = path.join(root, remediation.path);
    const current = await readFile(full, "utf8").catch(() => (remediation.createIfMissing ? "" : null));
    if (current === null) throw new Error(`${remediation.path} does not exist and the patch did not say to create it`);
    const lines = current === "" ? [] : current.split("\n");
    if (remediation.atLine === 0) lines.push(remediation.text.replace(/\n$/, ""));
    else lines.splice(remediation.atLine - 1, 0, remediation.text.replace(/\n$/, ""));
    await writeFile(full, lines.join("\n"), "utf8");
    return;
  }
  if (remediation.kind === "replace_range") {
    const full = path.join(root, remediation.path);
    const lines = (await readFile(full, "utf8")).split("\n");
    const observed = lines.slice(remediation.startLine - 1, remediation.endLine).join("\n");
    // The stop condition the payload asks for. `before` is what the scanner recorded, capped,
    // so it is a containment check rather than an equality one.
    if (!observed.includes(remediation.before) && !remediation.before.includes(observed)) {
      throw new Error(`refusing to patch ${remediation.path}: the range no longer holds the text the scan recorded`);
    }
    const after = remediation.after === "" ? [] : [remediation.after];
    lines.splice(remediation.startLine - 1, remediation.endLine - remediation.startLine + 1, ...after);
    await writeFile(full, lines.join("\n"), "utf8");
    return;
  }
  throw new Error(`this applier does not handle ${remediation.kind}, and nothing should have asked it to`);
}

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), "slop-fixes-"));
  await buildFixture();
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

beforeEach(() => {
  forgetBaselines();
});

describe("propose_fixes", () => {
  let payload: ProposeFixesPayload;

  beforeAll(async () => {
    payload = await proposeFixes({ path: root, readHistory: false });
  });

  it("returns a proposal for every finding, grouped by family", () => {
    expect(payload.status).toBe("assessed");
    expect(payload.summary.findings).toBeGreaterThan(0);
    expect(payload.summary.proposals).toBeGreaterThanOrEqual(payload.summary.findings);
    expect(payload.groups.length).toBeGreaterThan(1);
    for (const group of payload.groups) {
      expect(group.caveat.length, `${group.family} has no caveat`).toBeGreaterThan(40);
      expect(group.fixes.length).toBeGreaterThan(0);
    }
    expect(payload.summary.noProposal, "a finding reached the agent with nothing attached to it").toBe(0);
  });

  it("splits into apply / confirm / locate / decide, so it can be presented as a choice", () => {
    const counted =
      payload.readyToApply.length +
      payload.needsConfirmation.length +
      payload.needsSourceLocation.length +
      payload.decideYourself.length;
    expect(counted).toBe(payload.summary.proposals);
    expect(payload.readyToApply.length, "nothing was applicable on a repository with a committed CLAUDE.md").toBeGreaterThan(0);
    expect(payload.needsConfirmation.length, "the committed instruction file should propose a deletion").toBeGreaterThan(0);
    expect(payload.decideYourself.length, "nothing was left to a person, which would be suspicious").toBeGreaterThan(0);
  });

  it("every deletion is flagged destructive and is its own kind", () => {
    const destructive = payload.groups.flatMap((g) => g.fixes).filter((f) => f.destructive);
    expect(destructive.length).toBeGreaterThan(0);
    for (const fix of destructive) {
      expect(fix.remediation.kind).toBe("delete_file");
      expect(fix.applicability).toBe("confirm");
      expect(payload.needsConfirmation).toContain(fix.id);
    }
  });

  it("every proposal carries its evidence, its rebuttal and an explicit stop condition", () => {
    const fixes = payload.groups.flatMap((g) => g.fixes);
    expect(fixes.length).toBeGreaterThan(3);
    for (const fix of fixes) {
      expect(fix.evidence.length, `${fix.id} has no evidence`).toBeGreaterThan(0);
      for (const e of fix.evidence) {
        expect(e.locator).toBeTruthy();
        expect(e.observed).toBeTruthy();
      }
      expect(fix.caveat.thisMayBeAFalsePositive.length, `${fix.id} has no rebuttal`).toBeGreaterThan(30);
      expect(fix.caveat.doNotApplyIf.length, `${fix.id} has no stop condition`).toBeGreaterThan(20);
      expect(fix.blastRadius).toBeTruthy();
    }
  });

  it("names the tool that closes the loop", () => {
    expect(payload.verifyWith.tool).toBe("verify_fix");
    expect(payload.verifyWith.arguments.path).toBe(root);
    expect(payload.howToApply).toContain("never writes a file");
  });

  it("proposes nothing that leaves the scanned root", () => {
    for (const fix of payload.groups.flatMap((g) => g.fixes)) {
      const p = (fix.remediation as { path?: string }).path;
      if (p === undefined) continue;
      expect(p.startsWith("/") || p.startsWith("\\") || /^[a-zA-Z]:/.test(p) || p.split(/[\\/]/).includes(".."), `${fix.id} escapes the target`).toBe(
        false,
      );
    }
  });
});

describe("verify_fix", () => {
  it("refuses to compare against a baseline it does not have", async () => {
    const payload = await verifyFix({ path: root, readHistory: false });
    expect(payload.compared).toBe(false);
    expect(payload.before).toBeNull();
    expect(payload.headline).toContain("nothing to compare against");
    // And it does not pretend the absence of a comparison is a clean bill.
    expect(payload.after.findings).toBeGreaterThan(0);
  });

  it("reports no change when nothing changed, rather than reporting success", async () => {
    await scanCodebase({ path: root, readHistory: false });
    const payload = await verifyFix({ path: root, readHistory: false });
    expect(payload.compared).toBe(true);
    expect(payload.noLongerPresent).toEqual([]);
    expect(payload.newlyPresent).toEqual([]);
    expect(payload.regression).toBe(false);
    expect(payload.stillPresent.length).toBe(payload.after.findings);
    expect(payload.headline).not.toMatch(/fixed/i);
  });
});

describe("the whole loop, on a real checkout", () => {
  it("scan, propose, apply, verify: the findings the patches addressed stop appearing", async () => {
    const before = await scanCodebase({ path: root, readHistory: false });
    expect(before.status).toBe("assessed");
    expect(before.remediation.remediable).toBeGreaterThan(0);
    expect(before.remediation.nextStep).toContain("propose_fixes");

    const proposal = await proposeFixes({ path: root, readHistory: false });
    const applicable = proposal.groups
      .flatMap((g) => g.fixes)
      .filter((f) => f.applicability === "auto" || f.applicability === "confirm");
    expect(applicable.length, "nothing was applicable, so the loop cannot be demonstrated").toBeGreaterThan(0);

    const targeted = new Set(applicable.map((f) => f.ruleId));
    expect(targeted, "the committed instruction file must be one of the things we can act on").toContain(
      "agent.instruction-file-committed",
    );
    expect(targeted).toContain("scaffold.readme-template-markers");

    // Applied last-line-first per file so an earlier deletion cannot move a later line number.
    const ordered = [...applicable].sort((a, b) => {
      const la = (a.remediation as { startLine?: number }).startLine ?? 0;
      const lb = (b.remediation as { startLine?: number }).startLine ?? 0;
      return lb - la;
    });
    for (const fix of ordered) await apply(fix.remediation);

    const verified = await verifyFix({ path: root, readHistory: false });

    expect(verified.compared).toBe(true);
    expect(verified.newlyPresent, "a fix that introduces a finding is not a fix").toEqual([]);
    expect(verified.regression).toBe(false);
    for (const ruleId of targeted) {
      expect(verified.noLongerPresent.map((f) => f.ruleId), `${ruleId} survived its own remediation`).toContain(ruleId);
    }
    expect(verified.after.findings).toBeLessThan(verified.before?.findings ?? 0);
    expect(verified.headline).toContain("no longer present");

    // The disappearance is the evidence, and the rest of the report is unchanged: the findings
    // nobody patched are still there, still cited, and still counted.
    expect(verified.stillPresent.length).toBeGreaterThan(0);
    for (const f of verified.stillPresent) expect(f.evidence.length).toBeGreaterThan(0);

    // And the side effects the patches described actually happened on disk.
    await expect(readFile(path.join(root, "CLAUDE.md"), "utf8")).rejects.toThrow();
    expect(await readFile(path.join(root, ".gitignore"), "utf8")).toContain("CLAUDE.md");
    expect(await readFile(path.join(root, "README.md"), "utf8")).not.toContain("create-next-app");
  });

  it("a change that introduces a new finding is reported as a regression, not as progress", async () => {
    // The honest closer, tested by breaking something on purpose. This is the case the tool
    // exists for: two findings resolved and one introduced is a change that broke something,
    // and a verifier that reported the net would call it an improvement.
    const regressionRoot = await mkdtemp(path.join(tmpdir(), "slop-regress-"));
    const put = async (rel: string, body: string): Promise<void> => {
      await mkdir(path.dirname(path.join(regressionRoot, rel)), { recursive: true });
      await writeFile(path.join(regressionRoot, rel), body, "utf8");
    };
    try {
      await put("CLAUDE.md", "# CLAUDE.md\n\nGuidance for the agent working in this repository.\n");
      for (let i = 0; i < 18; i += 1) {
        await put(`src/mod${i}.ts`, [`export const value${i} = ${i};`, `export const other${i} = ${i * 2};`].join("\n"));
      }
      const first = await scanCodebase({ path: regressionRoot, readHistory: false });
      expect(first.findings.map((f) => f.ruleId)).toContain("agent.instruction-file-committed");

      // Resolve one finding and introduce another in the same edit.
      await unlink(path.join(regressionRoot, "CLAUDE.md"));
      await put(".aider.chat.history.md", "#### make the tests pass\n\n> I'll update the reader\n");

      const verified = await verifyFix({ path: regressionRoot, readHistory: false });
      expect(verified.noLongerPresent.map((f) => f.ruleId)).toContain("agent.instruction-file-committed");
      expect(verified.newlyPresent.map((f) => f.ruleId)).toContain("agent.transcript-committed");
      expect(verified.regression).toBe(true);
      expect(verified.headline).toContain("REGRESSION");
    } finally {
      await rm(regressionRoot, { recursive: true, force: true });
    }
  });
});

describe("the sentences these two tools can emit", () => {
  it("never describe a person, in any field either tool writes", async () => {
    // The forbidden-phrase guard, extended to cover the new surface. Every string below is one
    // this package composes; the rule corpus's own prose is checked where it is declared.
    const proposal = await proposeFixes({ path: root, readHistory: false });
    await scanCodebase({ path: root, readHistory: false });
    const verified = await verifyFix({ path: root, readHistory: false });

    const sentences: string[] = [
      proposal.howToApply,
      proposal.disclaimer,
      verified.headline,
      verified.disclaimer,
      ...proposal.groups.flatMap((g) => g.fixes).flatMap((f) => [f.remediation.summary, f.remediation.doNotApplyIf, f.caveat.doNotApplyIf]),
      ...proposal.groups
        .flatMap((g) => g.fixes)
        .map((f) => (f.remediation.kind === "manual" ? f.remediation.guidance : ""))
        .filter(Boolean),
    ];
    expect(sentences.length, "no sentence was checked, so this guard proves nothing").toBeGreaterThan(10);

    for (const sentence of sentences) {
      const lower = ` ${sentence.toLowerCase()} `;
      for (const phrase of FORBIDDEN_VERDICT_PHRASES) {
        expect(lower.includes(phrase), `"${phrase}" appears in: ${sentence}`).toBe(false);
      }
    }
  });

  it("the guard is not dead: it catches a sentence that describes a person", () => {
    const bad = "The developer left this file behind and ai-generated the rest.";
    const lower = ` ${bad.toLowerCase()} `;
    expect(FORBIDDEN_VERDICT_PHRASES.some((p) => lower.includes(p))).toBe(true);
  });
});
