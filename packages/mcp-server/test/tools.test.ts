import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, listRules, resolveTarget, scanCodebase, scanUi } from "slop-scorer-mcp";
import { CODE_RULES } from "@slop/detectors-code";
import { WEB_RULES } from "@slop/detectors-web";
import { FORBIDDEN_VERDICT_PHRASES, MAX_SCORE } from "@slop/core";

let root: string;

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), "slop-mcp-"));
  const write = async (rel: string, body: string): Promise<void> => {
    await mkdir(path.dirname(path.join(root, rel)), { recursive: true });
    await writeFile(path.join(root, rel), body, "utf8");
  };
  await write("CLAUDE.md", "# CLAUDE.md\n\nGuidance for the agent working in this repository.\n");
  await write("README.md", "# app\n\nThis is a Next.js project bootstrapped with create-next-app.\n\n## Deploy on Vercel\n");
  await write("package.json", JSON.stringify({ name: "app", dependencies: { axios: "^1", lodash: "^4", moment: "^2", uuid: "^9" } }));
  await write(".prettierrc", "{}\n");
  await write(".eslintrc.json", '{"extends":"next/core-web-vitals"}\n');
  for (let i = 0; i < 18; i += 1) {
    await write(
      `src/mod${i}.ts`,
      ["// Set the api key", 'const apiKey = "your-api-key-here";', "// Get the user by id", "const user = getUserById(id);", "export default user;"].join(
        "\n",
      ),
    );
  }
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("scan_codebase", () => {
  it("returns cited findings with a file and a line", async () => {
    const payload = await scanCodebase({ path: root, readHistory: false });
    expect(payload.status).toBe("assessed");
    expect(payload.findings.length).toBeGreaterThan(0);

    const agent = payload.findings.find((f) => f.ruleId === "agent.instruction-file-committed");
    expect(agent, "a committed CLAUDE.md must be reported").toBeTruthy();
    expect(agent?.evidence[0]?.locator).toBe("CLAUDE.md");
    expect(agent?.whyItReadsAsGenerated.length).toBeGreaterThan(40);
    expect(agent?.counterEvidenceThatWouldRebutIt.length).toBeGreaterThan(30);
    expect(agent?.prevention).toBeTruthy();

    for (const f of payload.findings) {
      expect(f.evidence.length, `${f.ruleId} shipped with no evidence`).toBeGreaterThan(0);
      for (const e of f.evidence) {
        expect(e.locator, `${f.ruleId}`).toBeTruthy();
        expect(e.observed, `${f.ruleId}`).toBeTruthy();
      }
    }
  });

  it("advertises which findings can be acted on, and points at the tool that does it", async () => {
    // The scan is where an agent decides whether to offer to fix anything, so the count has to
    // be on the scan rather than only inside propose_fixes. "Nothing here is applicable" is
    // half the answer and it is the half that saves an agent a wasted round trip.
    const payload = await scanCodebase({ path: root, readHistory: false });
    expect(payload.remediation.findings).toBe(payload.findings.length);
    expect(payload.remediation.remediable).toBeGreaterThan(0);
    expect(payload.remediation.readyToApply + payload.remediation.needsConfirmation).toBeGreaterThan(0);
    expect(payload.remediation.nextStep).toContain("propose_fixes");
    expect(payload.remediation.nextStep).toContain("verify_fix");

    const agent = payload.findings.find((f) => f.ruleId === "agent.instruction-file-committed");
    expect(agent?.remediable).toBe(true);
    expect(agent?.remediationKinds).toContain("delete_file");
    expect(agent?.destructiveFixProposed).toBe(true);

    const shape = payload.findings.find((f) => f.ruleId === "uniform.file-length");
    if (shape) {
      expect(shape.remediable, "a distribution measurement must not advertise an applicable patch").toBe(false);
      expect(shape.destructiveFixProposed).toBe(false);
    }
  });

  it("the payload carries the arithmetic, not just the number", async () => {
    const payload = await scanCodebase({ path: root, readHistory: false });
    expect(payload.familyCaps.length).toBeGreaterThan(0);
    expect(payload.receipt).toContain("TOTAL");
    expect(payload.receipt).toContain("FAMILY CAPS");
    expect(payload.scoreCeiling).toBe(MAX_SCORE);
    expect(payload.coverage.ratio).toBeGreaterThan(0);
    expect(payload.disclaimer).toContain("not a judgement of the person");
  });

  it("the verdict never describes a person", async () => {
    const payload = await scanCodebase({ path: root, readHistory: false });
    const lower = payload.verdict.toLowerCase();
    for (const phrase of FORBIDDEN_VERDICT_PHRASES) expect(lower).not.toContain(phrase);
  });

  it("a glob that matches nothing abstains with a coded reason, never a clean score", async () => {
    // The vacuous-pass shape as a user hits it. `assertWellFormedResult` throws on this,
    // which is right for a detector author, but the TOOL must not throw at an agent for a
    // mistyped glob. It abstains instead, with `probe_failed` naming the probe that scanned
    // nothing and the rules that were skipped listed by name in the warnings. Both are loud;
    // neither is a low score.
    const payload = await scanCodebase({ path: root, include: ["never/**/*.zzz"], readHistory: false });
    expect(payload.status).toBe("inconclusive");
    expect(payload.score).toBeNull();
    expect(payload.abstention.map((a) => a.code)).toContain("probe_failed");
    expect(payload.abstention.find((a) => a.code === "probe_failed")?.detail).toContain("source");
    expect(payload.warnings.join(" ")).toContain("not evaluated because the probe");
  });

  it("the abstention lists the skipped rules by name, so silence is never anonymous", async () => {
    const payload = await scanCodebase({ path: root, include: ["never/**/*.zzz"], readHistory: false });
    expect(payload.warnings.join(" ")).toContain("uniform.duplicate-blocks");
  });
});

describe("scan_ui", () => {
  it("accepts a port and a bare host as well as a URL", () => {
    expect(resolveTarget({ port: 3000 })).toBe("http://localhost:3000/");
    expect(resolveTarget({ url: "example.com/pricing" })).toBe("https://example.com/pricing");
    expect(resolveTarget({ url: "http://localhost:5173" })).toBe("http://localhost:5173");
    expect(() => resolveTarget({})).toThrow(/needs either a url or a localhost port/);
  });

  it("returns not_assessed rather than a low score when the page could not be rendered", async () => {
    // Nothing is listening on this port, so the browser cannot produce a document. The
    // result must be a status, not a zero: "we could not look" and "we looked and it was
    // clean" produce the same empty finding list and opposite meanings.
    const payload = await scanUi({ port: 1 }).catch(() => null);
    if (payload === null) return; // playwright installed but chromium missing: covered below
    expect(payload.score).toBeNull();
    expect(["not_assessed", "inconclusive"]).toContain(payload.status);
  }, 60_000);
});

describe("list_rules", () => {
  // The full listing. It is opt-in now, because it measures about 18k tokens and this tool's
  // own instructions ask an agent to call it BEFORE generating anything; see
  // `list-rules-compact.test.ts` for the price of each shape and for what the default returns.
  const listing = listRules({ verbose: true });

  it("returns every rule in both corpora with its weight and rationale", () => {
    expect(listing.fullEntries.length).toBe(WEB_RULES.length + CODE_RULES.length);
    expect(listing.index.length).toBe(listing.fullEntries.length);
    for (const r of listing.fullEntries) {
      expect(r.baseWeight).toBeTypeOf("number");
      expect(r.whyItReadsAsGenerated.length).toBeGreaterThan(40);
      expect(r.counterEvidenceThatWouldRebutIt.length).toBeGreaterThan(30);
      expect(r.family).toBeTruthy();
      expect(r.since).toBeTruthy();
    }
  });

  it("explains the scoring contract, including the ceiling and the caps", () => {
    expect(listing.scoring.ceiling).toBe(MAX_SCORE);
    expect(listing.scoring.note).toMatch(/capped/);
    expect(listing.scoring.note).toMatch(/counter-evidence/);
    expect(listing.scoring.families.length).toBeGreaterThan(6);
    for (const f of listing.scoring.families) expect((f.caveat ?? "").length).toBeGreaterThan(40);
  });

  it("filters by modality and by family", () => {
    expect(listRules({ modality: "code", verbose: true }).fullEntries.every((r) => r.modality === "code")).toBe(true);
    expect(listRules({ modality: "web", verbose: true }).fullEntries.every((r) => r.modality === "web")).toBe(true);
    const family = listRules({ family: "agent-artifact", verbose: true });
    expect(family.fullEntries.length).toBeGreaterThan(0);
    expect(family.fullEntries.every((r) => r.family === "agent-artifact")).toBe(true);
  });

  it("most rules carry a prevention hint, which is the payload an agent can act on", () => {
    const withPrevention = listing.fullEntries.filter((r) => r.prevention);
    expect(withPrevention.length / listing.fullEntries.length).toBeGreaterThan(0.6);
  });
});

describe("the server itself", () => {
  it("constructs and registers exactly the five specified tools", async () => {
    const server = createServer();
    // Round-trip through an in-memory transport pair so tool registration is verified the way
    // a client sees it, not by reading the registry we just wrote.
    const { InMemoryTransport } = await import("@modelcontextprotocol/sdk/inMemory.js");
    const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "test", version: "0" });
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

    const tools = await client.listTools();
    expect(tools.tools.map((t) => t.name).sort()).toEqual([
      "list_rules",
      "propose_fixes",
      "scan_codebase",
      "scan_ui",
      "verify_fix",
    ]);
    for (const tool of tools.tools) {
      expect(tool.description?.length ?? 0, `${tool.name} has a thin description`).toBeGreaterThan(120);
    }

    // Over the wire, in the shape an agent actually receives: the index is the complete
    // membership list and the full entries are opt-in.
    const rules = await client.callTool({ name: "list_rules", arguments: { modality: "code" } });
    const structured = rules.structuredContent as { index: unknown[]; fullEntries: unknown[] } | undefined;
    expect(structured?.index.length).toBe(CODE_RULES.length);
    expect(structured?.fullEntries.length).toBe(0);

    const verbose = await client.callTool({
      name: "list_rules",
      arguments: { modality: "code", verbose: true },
    });
    const full = verbose.structuredContent as { fullEntries: unknown[] } | undefined;
    expect(full?.fullEntries.length).toBe(CODE_RULES.length);

    await client.close();
    await server.close();
  });
});
