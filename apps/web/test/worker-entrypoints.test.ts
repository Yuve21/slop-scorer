import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * THE ENTRY POINTS NEXT EVALUATES OUTSIDE THE PAGE RENDER, and why they get their own file.
 *
 * `generateStaticParams` and `sitemap` are not rendered. Next runs them in a worker process,
 * and that process does not apply the `react-server` export condition the way the RSC compiler
 * does. `server-only` is a marker package whose whole purpose is to THROW when it is loaded
 * anywhere else, so a single `server-only` module anywhere in the graph reachable from one of
 * those functions kills the worker on import.
 *
 * What that looks like from outside is the thing that makes it expensive: the worker dies,
 * Next retries twice, and the only message it prints is
 *
 *   Error: Jest worker encountered 2 child process exceptions, exceeding retry limit
 *
 * with no module, no line and no cause. Every route with a `generateStaticParams` answers 500
 * and every route without one is fine, which reads like a bug in whatever those routes have in
 * common on screen rather than a bug in a list of four strings.
 *
 * `apps/web/test/receipt-page.test.ts` renders the page and cannot see this, because Vitest
 * maps `server-only` to the same empty module the RSC condition does. So the guarantee is
 * asserted here instead, in a real child process, and against the file that has to keep it.
 */

const web = (p: string) => fileURLToPath(new URL(`../${p}`, import.meta.url));
const source = (p: string) => readFileSync(web(p), "utf8");

/** Import a module in a plain Node process: no bundler, no `react-server` condition. */
const importInWorkerLikeProcess = (relativePath: string): string =>
  execFileSync(
    process.execPath,
    [
      "--experimental-strip-types",
      "--no-warnings",
      "-e",
      `import(${JSON.stringify(relativePath)}).then((m) => console.log(JSON.stringify(m.SAMPLE_IDS)))`,
    ],
    { cwd: web("."), encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );

describe("the modules Next loads in a worker", () => {
  it("lib/sample-ids.ts imports nothing at all", () => {
    // The invariant, stated as the file states it. An import here is how the regression
    // returns: `server-only` does not have to be imported directly to be fatal, it only has
    // to be reachable, and `lib/receipts.ts` is one hop away and pulls in the whole corpus.
    const text = source("lib/sample-ids.ts").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(text).not.toMatch(/^\s*import\s/m);
    expect(text).not.toMatch(/\bfrom\s+["']/);
  });

  it("loads in a plain Node process, with no react-server condition", () => {
    const out = importInWorkerLikeProcess("./lib/sample-ids.ts");
    expect(JSON.parse(out.trim())).toEqual(["4F2A-9C", "8B10-2D", "C7E3-51", "A05E-13"]);
  });

  it("server-only really is fatal there, so the guarantee above is not vacuous", () => {
    expect(() =>
      execFileSync(
        process.execPath,
        ["--no-warnings", "-e", "require('server-only')"],
        { cwd: web("."), encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
      ),
    ).toThrow(/only be used from a Server Component/);
  });

  it("generateStaticParams and the sitemap read the list from the light module", () => {
    for (const file of ["app/receipt/[id]/page.tsx", "app/sitemap.ts"]) {
      const text = source(file);
      expect(text).toContain('import { SAMPLE_IDS } from "@/lib/sample-ids"');
      expect(text).not.toMatch(/import\s*\{[^}]*SAMPLE_IDS[^}]*\}\s*from\s*"@\/lib\/receipts"/);
    }
  });

  it("lib/receipts.ts stays server-only, and stays reconciled with the list", () => {
    // The heavy module is not being loosened to make the light one possible. It still declares
    // itself server-only, and it still refuses to load if the two lists disagree.
    const text = source("lib/receipts.ts");
    expect(text).toContain('import "server-only"');
    expect(text).toContain("have drifted");
  });
});
