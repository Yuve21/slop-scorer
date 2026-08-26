import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { CODE_RULE_DESCRIPTORS } from "@slop/detectors-code";
import { RULE_DESCRIPTORS } from "@slop/detectors-web";
import { GET, TOOLS } from "@/app/llms.txt/route";

/**
 * `/llms.txt` HAS TO BE SERVED, AND IT HAS TO BE TRUE.
 *
 * The distribution thesis of this product is other people's coding agents, and the one file
 * those agents fetch by convention answered 404 until this route existed. Two failure modes are
 * covered here rather than left to a manual check:
 *
 *  1. THE REDIRECT TRAP. On the founder's other project a proxy matcher that did not exempt the
 *     well-known paths 307'd `robots.txt` to a sign-in page, and every gate stayed green. So
 *     this asserts the route answers 200 with a body, and that no `proxy` or `middleware` file
 *     exists in this app to intercept it. If one is ever added it must exempt this path, and
 *     this test is where that conversation starts.
 *  2. DRIFT. The tool list here is the one an agent will act on. It is diffed against the MCP
 *     server's own source, so a tool renamed, added or removed fails here instead of being
 *     discovered by somebody's agent calling a name that does not exist.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SERVER_SRC = readFileSync(
  path.resolve(HERE, "../../../packages/mcp-server/src/server.ts"),
  "utf8",
);

const body = async (): Promise<string> => {
  const response = await GET();
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("text/plain; charset=utf-8");
  return response.text();
};

describe("/llms.txt is served", () => {
  it("answers 200 text/plain with a body, not a redirect", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.status).not.toBe(307);
    expect(response.status).not.toBe(308);
    expect(response.headers.get("location")).toBeNull();
    expect((await response.text()).length).toBeGreaterThan(800);
  });

  it("has nothing in front of it that could redirect it", () => {
    // The exact trap that took out robots.txt elsewhere: an auth matcher with no exemption for
    // the well-known paths. There is no proxy in this app; if one is added, it must exempt
    // /llms.txt, /robots.txt, /sitemap.xml and the opengraph images.
    const app = path.resolve(HERE, "..");
    for (const name of ["proxy.ts", "middleware.ts", "src/proxy.ts", "src/middleware.ts"]) {
      expect(existsSync(path.join(app, name)), `${name} exists and may intercept /llms.txt`).toBe(false);
    }
  });
});

describe("/llms.txt says what an agent needs", () => {
  it("carries the install command, the loop and every tool with what it does", async () => {
    const text = await body();
    expect(text).toContain("claude mcp add slop-scorer -- npx -y slop-scorer-mcp");
    for (const tool of TOOLS) {
      expect(text, `${tool.name} is not documented`).toContain(`### ${tool.name}`);
      expect(text).toContain(tool.does);
    }
    expect(text).toContain("scan_codebase or scan_ui -> propose_fixes -> you apply the edits -> verify_fix");
  });

  it("states the honesty constraints, in the terms the tools actually use", async () => {
    const text = await body();
    expect(text).toContain("ABSTENTION IS A RESULT");
    // The three-valued enum, named, because an integrator who branches on `score` without
    // branching on `status` reads a withheld score as a clean bill of health.
    for (const value of ["assessed", "inconclusive", "not_assessed"]) {
      expect(text).toContain(value);
    }
    expect(text).toContain("WE NEVER ASSERT THAT A PERSON USED AI");
    expect(text).toContain("SCORES ARE BOUNDED AT 99");
    expect(text).toContain("COUNTER-EVIDENCE SUBTRACTS");
  });

  it("states rule counts read from the corpora rather than typed in", async () => {
    const text = await body();
    expect(text).toContain(`${CODE_RULE_DESCRIPTORS.length} code rules`);
    expect(text).toContain(`${RULE_DESCRIPTORS.length} web rules`);
    // The denominator: a corpus that failed to load would make both assertions above vacuous.
    expect(CODE_RULE_DESCRIPTORS.length).toBeGreaterThan(5);
    expect(RULE_DESCRIPTORS.length).toBeGreaterThan(20);
  });

  it("documents exactly the tools the MCP server registers", () => {
    const registered = [...SERVER_SRC.matchAll(/registerTool\(\s*"([a-z_]+)"/g)].map((m) => m[1]);
    // Both directions, and the count, so a tool added without a line here fails too.
    expect(registered.length).toBeGreaterThan(0);
    expect([...registered].sort()).toEqual([...TOOLS.map((t) => t.name)].sort());
  });

  it("is short enough that an agent will actually read it", async () => {
    const text = await body();
    // A rough token estimate at four characters per token, the same arithmetic used to measure
    // list_rules. This file exists to be cheap; a manifesto here defeats its purpose.
    expect(Math.round(text.length / 4)).toBeLessThan(1_200);
  });
});
