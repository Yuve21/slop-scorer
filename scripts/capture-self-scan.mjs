/**
 * Capture the self-scan AT BUILD TIME.
 *
 * WHY THIS EXISTS AT ALL. The fold on the landing page says this page has been scanned by the
 * thing it sells. For a while it was not: the page asked the server to launch a real browser
 * on every visit, the serverless runtime has no browser binaries, the detector correctly
 * refused to substitute a server-HTML read for a rendered one, and the fold sat in a loading
 * state that never resolved. A promise in a headline that the page visibly fails to keep is
 * worse than no promise, and worst of all on a product whose only claim is honesty.
 *
 * WHAT RUNS WHERE, AND WHY THAT IS THE HONEST SPLIT:
 *
 *   - The BROWSER RENDER happens here, in the build container, where a browser can actually
 *     be installed. It renders the live production deployment (the one serving the domain at
 *     the moment this build runs) at its real hostname, so hostname-dependent checks such as
 *     `builder.bare-platform-domain` see what a visitor sees. Rendering a locally started
 *     copy at 127.0.0.1 would have hidden that finding, which is precisely the kind of
 *     convenient blindness this product exists to argue against.
 *   - The SCORING happens at request time, from the artifact captured here, because
 *     `webDetector` is replayable: same rules, same corpus, no network. So the fold is not a
 *     stored verdict, it is a stored OBSERVATION re-scored by the shipped corpus on every
 *     request. A corpus change moves the fold without a re-capture.
 *
 * WHAT IS THEREFORE TRUE, AND WHAT THE PAGE MUST SAY: the reading is as old as this build,
 * and it is of the deployment that was live when this build ran. The record below carries
 * `capturedAt`, the commit and the target so the page can state all three instead of implying
 * a freshness it does not have. `docs`-grade honesty here is not decoration: the alternative
 * is the page claiming "nothing is cached" over a cache.
 *
 * FAILURE IS A RESULT. Nothing in here can fail the build. If the browser cannot be
 * installed, the deployment is unreachable, or the render times out, the script writes an
 * `unavailable` record carrying the reason, and the page renders that reason as a terminal
 * abstention. It never writes a stale success and never leaves the previous capture in place
 * pretending to be this build's.
 *
 * Usage:  node scripts/capture-self-scan.mjs [--url <url>] [--out <path>]
 */

import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { probeUrl } from "@slop/detectors-web";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_OUT = path.join(ROOT, "apps", "web", "lib", "self-scan-capture.json");

/** The render is the slowest thing in the build. It is bounded so a hung page cannot hang CI. */
const RENDER_TIMEOUT_MS = 45_000;
const TOTAL_TIMEOUT_MS = 150_000;
const VIEWPORT = { width: 1440, height: 900 };

/**
 * The same marked user agent the runtime scan uses. The API route refuses to start a run for
 * a request carrying it, so a page that scans itself cannot recurse into a second scan.
 */
const SELF_SCAN_UA =
  "Mozilla/5.0 (compatible; SlopScorerSelfScan/0.1; +https://slopscorer.com/method)";

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

/**
 * Where the site actually lives, in order of decreasing certainty, and only if it parses.
 * A value that is not an http(s) URL is discarded rather than passed on: `vercel build` hands
 * a locally-pulled sensitive variable through as the literal string "[SENSITIVE]", and a
 * target nobody can fetch must not end up printed on the page as the thing we scanned.
 */
function resolveTarget() {
  const candidates = [
    arg("url"),
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL &&
      `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL.trim()}`,
  ];
  for (const candidate of candidates) {
    const value = candidate?.trim().replace(/\/+$/, "");
    if (!value) continue;
    try {
      if (/^https?:$/.test(new URL(value).protocol)) return value;
    } catch {
      console.warn(`[self-scan] ignoring an unusable target: ${value}`);
    }
  }
  return null;
}

const commit = () =>
  process.env.VERCEL_GIT_COMMIT_SHA?.trim() ||
  spawnSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).stdout?.trim() ||
  null;

/**
 * Install the browser if this environment does not have one. `npx playwright install` is a
 * no-op when the binary is already there, so this costs nothing locally. Its failure is not
 * fatal: the launch below will fail too and the reason ends up in the record.
 */
function ensureChromium() {
  const result = spawnSync("npx", ["playwright", "install", "chromium"], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: "inherit",
    shell: process.platform === "win32",
    timeout: 180_000,
  });
  return result.status === 0;
}

function write(out, record) {
  writeFileSync(out, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  return record;
}

async function main() {
  const out = arg("out") ? path.resolve(arg("out")) : DEFAULT_OUT;
  const target = resolveTarget();
  const base = {
    schema: 1,
    capturedAt: new Date().toISOString(),
    commit: commit(),
    target,
    elapsedMs: 0,
    artifact: null,
    unavailable: null,
  };

  if (!target) {
    console.warn("[self-scan] no target URL (set NEXT_PUBLIC_SITE_URL); writing an unavailable record.");
    write(out, {
      ...base,
      unavailable: {
        code: "cannot_fetch",
        detail:
          "This build did not know which URL it was going to be served from, so no page was rendered. NEXT_PUBLIC_SITE_URL was unset, or was not a URL anything could fetch.",
      },
    });
    return;
  }

  console.log(`[self-scan] capturing ${target}`);
  const installed = ensureChromium();
  if (!installed) console.warn("[self-scan] `playwright install chromium` did not succeed; trying the launch anyway.");

  const startedAt = Date.now();
  try {
    const artifact = await Promise.race([
      probeUrl(target, { viewport: VIEWPORT, userAgent: SELF_SCAN_UA, timeoutMs: RENDER_TIMEOUT_MS }),
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error(`the render did not finish within ${TOTAL_TIMEOUT_MS} ms`)),
          TOTAL_TIMEOUT_MS,
        ).unref?.(),
      ),
    ]);
    const record = write(out, { ...base, elapsedMs: Date.now() - startedAt, artifact });
    console.log(
      `[self-scan] captured ${target} in ${(record.elapsedMs / 1000).toFixed(1)} s, ` +
        `${artifact.probes.filter((p) => p.ran).length}/${artifact.probes.length} probes ran`,
    );
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.warn(`[self-scan] capture failed: ${detail}`);
    write(out, {
      ...base,
      elapsedMs: Date.now() - startedAt,
      unavailable: {
        code: "detector_unavailable",
        detail: `This build could not render ${target} in a real browser, so the fold has no reading of its own to show: ${detail}`,
      },
    });
  }
}

// The whole point of this script is that it cannot break a deploy. Any escape lands here.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.warn(`[self-scan] unexpected failure: ${error?.stack ?? error}`);
    process.exit(0);
  });
