/**
 * The synthetic scaffold: fixture DATA for the discrimination half of the corpus.
 *
 * It lives under `scripts/fixtures/` on purpose. This file is a worked example of every tell
 * the code corpus looks for, so a scanner pointed at this repository reads it as a repository
 * full of placeholders unless it knows what it is. That is precisely the case
 * `suppress.fixture-data` exists for, and putting fixture data where the convention says it
 * goes is the honest way to earn the suppression rather than widening a pattern to excuse it.
 */
/**
 * The discrimination counterpart.
 *
 * A negative corpus alone can be satisfied by a corpus of dead rules: flag nothing, pass
 * everything. So the capture also writes a repository with the full set of tells, scanned by
 * the SAME scanner off a real filesystem, and the suite requires it to score high. Written
 * here rather than hand-authored as an object so it goes through every parsing path the
 * human repositories go through.
 */
export const SCAFFOLD_FILES = {
  "CLAUDE.md": "# CLAUDE.md\n\nThis file provides guidance to Claude Code when working with code in this repository.\n\n## Commands\n\n- `npm run dev`\n",
  ".cursorrules": "You are an expert full-stack developer. Always write production-ready code.\n",
  "README.md":
    "# my-app\n\nThis is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app).\n\n## Getting Started\n\nFirst, run the development server:\n\n```bash\nnpm run dev\n\n# or\nyarn dev\n```\n\nYou can start editing the page by modifying `app/page.tsx`.\n\n## Deploy on Vercel\n\nThe easiest way to deploy your Next.js app is to use the Vercel Platform.\n",
  ".eslintrc.json": '{ "extends": "next/core-web-vitals" }\n',
  ".prettierrc": "{}\n",
  "vercel.json": "{}\n",
  // A committed session transcript, and three files carrying one identical block. Both are
  // here because the corpus sweep found `agent.transcript-committed` and
  // `uniform.duplicate-blocks` firing on NOTHING in the whole calibration set, and a rule no
  // artifact exercises is indistinguishable from a rule that has stopped working.
  ".aider.chat.history.md":
    "#### add a handler for orders\n\n> I'll create src/handlers/orders.ts with the same shape as the others.\n\n#### now make the tests pass\n\n> Updated. All eighteen handlers now return a Response.\n",
  ...Object.fromEntries(
    ["alpha", "beta", "gamma"].map((name) => [
      `src/lib/${name}-client.ts`,
      [
        `// Client for the ${name} service`,
        "export async function request(url: string, init: RequestInit): Promise<unknown> {",
        "  const controller = new AbortController();",
        "  const timer = setTimeout(() => controller.abort(), 5000);",
        "  try {",
        "    const response = await fetch(url, { ...init, signal: controller.signal });",
        "    if (!response.ok) {",
        "      throw new Error(`request failed with ${response.status}`);",
        "    }",
        "    return await response.json();",
        "  } catch (error) {",
        "    console.error(error);",
        "    throw error;",
        "  } finally {",
        "    clearTimeout(timer);",
        "  }",
        "}",
        "",
      ].join("\n"),
    ]),
  ),
  "package.json": JSON.stringify(
    {
      name: "my-app",
      version: "0.1.0",
      dependencies: { axios: "^1.6.0", lodash: "^4.17.21", moment: "^2.29.4", uuid: "^9.0.0", clsx: "^2.0.0", next: "14.0.0" },
    },
    null,
    2,
  ),
  "src/config.ts": [
    "// Configuration",
    "",
    "// Set the api key",
    'export const apiKey = "your-api-key-here";',
    "",
    "// TODO: implement the refresh flow",
    "export const refreshToken = null;",
    "",
    "// FIXME",
    'export const baseUrl = "https://example.com";',
    "",
    "// Replace this with the real value",
    'export const tenant = "ChangeMe";',
    "",
    "// Coming soon",
    "export const beta = true;",
    "",
    "// Lorem ipsum",
    'export const tagline = "Lorem ipsum dolor sit amet";',
    "",
    "// Set the timeout",
    "export const timeout = 5000;",
  ].join("\n"),
};

/** Eighteen handler files of near-identical size, each with the same twelve-line body. */
/**
 * A second generated specimen: the agent pass with NO agent files left behind.
 *
 * The first specimen is caught by its `CLAUDE.md` before anything else is read, which means
 * it cannot prove that the rest of the corpus works. This one has no agent artifact at all,
 * so it can only be recognised by shape: uniform files, uniform functions, and the ceremony
 * of a test suite without the substance of one. It is also the case the whole product has to
 * survive, because deleting `CLAUDE.md` is one `git rm` away for everybody.
 *
 * It exists because the corpus sweep found `uniform.function-length` and
 * `verify.tautological-tests` firing on no artifact anywhere.
 */
export function agentPassFiles() {
  const files = {
    "README.md": "# reporting-service\n\nA service for reports.\n\n## Setup\n\n```bash\nnpm install\nnpm start\n```\n",
    "package.json": JSON.stringify({ name: "reporting-service", version: "1.0.0", dependencies: { express: "^4.18.2" } }, null, 2),
  };
  const domains = [
    "invoice", "receipt", "ledger", "journal", "posting", "account", "balance",
    "period", "accrual", "expense", "revenue", "payment", "refund", "credit",
  ];
  domains.forEach((name, i) => {
    // Fourteen files of near-identical length, each with two functions of near-identical
    // length. No comment tells, no placeholders: shape alone.
    files[`src/${name}/service.ts`] = [
      `import { store } from "../store";`,
      "",
      `export async function load${name}(id: string): Promise<Record<string, unknown> | null> {`,
      `  const row = await store.${name}.findUnique({ where: { id } });`,
      "  if (!row) {",
      "    return null;",
      "  }",
      `  return { ...row, kind: "${name}" };`,
      "}",
      "",
      `export async function save${name}(input: Record<string, unknown>): Promise<string> {`,
      `  const created = await store.${name}.create({ data: input });`,
      "  if (!created) {",
      `    throw new Error("could not create ${name}");`,
      "  }",
      "  return created.id;",
      "}",
      "",
      `export const ${name}Kind = "${name}" as const;`,
      `export const ${name}Version = ${i + 1};`,
      "",
    ].join("\n");
  });
  // The ceremony of a test suite: one file whose assertion cannot fail, one with none at all.
  files["test/smoke.test.ts"] = [
    `import { describe, expect, it } from "vitest";`,
    "",
    `describe("smoke", () => {`,
    `  it("works", () => {`,
    "    expect(true).toBe(true);",
    "  });",
    "});",
    "",
  ].join("\n");
  files["test/service.test.ts"] = [
    `import { describe, it } from "vitest";`,
    "",
    `describe("service", () => {`,
    `  it("loads", () => {`,
    "    // TODO: write this test",
    "  });",
    "});",
    "",
  ].join("\n");
  return files;
}

export function scaffoldHandlers() {
  const files = {};
  const names = [
    "users", "orders", "items", "carts", "payments", "invoices", "shipments", "returns", "reviews",
    "coupons", "sessions", "tokens", "webhooks", "reports", "exports", "imports", "settings", "profiles",
  ];
  names.forEach((name, i) => {
    files[`src/handlers/${name}.ts`] = [
      "/**",
      ` * Handler for the ${name} resource.`,
      " *",
      " * This module exposes the route handlers for the resource.",
      " * It parses the request, calls the database, and returns the response.",
      " */",
      "",
      `// Validate the ${name} body`,
      `export function validate${name}(body: unknown): boolean {`,
      "  // Check if the body is null",
      "  if (!body) {",
      "    return false;",
      "  }",
      "  // Return true",
      "  return true;",
      "}",
      "",
      `// Get the ${name}`,
      `export async function get${name}(req: Request): Promise<Response> {`,
      "  // Parse the body",
      "  const body = await req.json();",
      "  // Validate the body",
      `  if (!validate${name}(body)) {`,
      '    return new Response("bad request", { status: 400 });',
      "  }",
      `  // Get the ${name} from the database`,
      `  const result = await db.${name}.findMany();`,
      "  // Check if the result is null",
      "  if (!result) {",
      '    return new Response("not found", { status: 404 });',
      "  }",
      "  // Return the response",
      "  return new Response(JSON.stringify(result), { status: 200 });",
      "}",
      "",
      "// Export the runtime",
      'export const runtime = "nodejs";',
      "// Export the dynamic setting",
      'export const dynamic = "force-dynamic";',
      `// Export the revalidate setting for slot ${i}`,
      "export const revalidate = 0;",
      "",
    ].join("\n");
  });
  return files;
}

