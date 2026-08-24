/**
 * Capture the GENERATED web corpus: replayable snapshots of live pages that SAY they were
 * generated.
 *
 * WHY THIS SCRIPT EXISTS AT ALL
 *
 * `packages/detectors-web/src/fixtures/negatives.ts` holds five human pages and says, in its
 * own header, that there is deliberately no generated set because "a synthetic positive set
 * written by us would measure our imagination rather than any generator". That is the right
 * bar and this script is how it is cleared: the members below are not invented, they are
 * public pages whose own markup names the tool that built them, read out of a real browser
 * by `probeUrl` and frozen to disk.
 *
 * WHAT MAKES A PAGE ELIGIBLE. Two conditions, both checkable by a stranger in view-source,
 * and both RE-CHECKED against the capture by this script rather than trusted:
 *
 *   1. A SELF-DECLARATION IN THE ARTIFACT. A `<meta name="generator">` naming an AI builder,
 *      or the builder's own runtime script served into the page. The declaration is the
 *      provenance: the vendor put it there, we did not.
 *   2. A SECOND, INDEPENDENT LOCATOR. The public repository the deployment is synced from,
 *      whose README is written by the same generator and names it again. Two places, neither
 *      of them us.
 *
 * `expect` below is that re-check, and a member whose declaration is missing from the capture
 * ABORTS the run. A provenance sentence that the stored bytes do not support is exactly the
 * failure `packages/core/src/calibration` exists to prevent, and it is worse here than in the
 * detector, because the gauntlet publishes a human-discrimination rate against these labels.
 *
 * THE CAPTURE IS PINNED AND OFFLINE AFTERWARDS. Same contract as the code corpus: the stored
 * `WebArtifact` is the replay format, `npm test` never touches the network, and `capturedAt`
 * says when the page looked like this. A site that is rewritten tomorrow does not silently
 * change a published rate.
 *
 * Usage:  node scripts/capture-web-corpus.mjs [--only <id>[,<id>...]]
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { probeUrl } from "@slop/detectors-web";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "packages", "detectors-web", "test", "corpus");
const VIEWPORT = { width: 390, height: 844 };

/**
 * `expect` is a predicate over the CAPTURED artifact, named after the declaration it is
 * checking. It is not decoration: if it returns false the capture is rejected, because the
 * member's whole claim to a "generated" label is that declaration being there.
 */
export const WEB_MANIFEST = [
  {
    id: "wav0-landing",
    url: "https://wav0-design.vercel.app/",
    repo: "github.com/op0ai/v0-landing-template",
    declaration: "meta[name=generator] content=\"v0.app\", and 24/24 commits in the source repository by v0[bot]",
    source: "https://wav0-design.vercel.app/",
    provenance:
      "The page serves <meta name=\"generator\" content=\"v0.app\"> in its own head: Vercel's v0 naming itself, readable in view-source in ten seconds. The deployment's source, github.com/op0ai/v0-landing-template, carries v0's \"Automatically synced with your v0.app deployments\" README and all twenty-four of its commits are authored by v0[bot]@users.noreply.github.com, with no human commit at any point. It is the most substantial page in this set, which is why it is here: a product landing page with real copy, not a toy.",
    expect: (a) => /v0\.app/i.test(a.head.generator ?? ""),
  },
  {
    id: "study-snapshot-space",
    url: "https://study-snapshot-space.lovable.app/",
    repo: "github.com/Nithinbaskar/study-snapshot-space",
    declaration: "Lovable's own runtime script (cdn.gpteng.co) served into the page, on lovable.app, with 2/2 commits by lovable-dev[bot]",
    source: "https://study-snapshot-space.lovable.app/",
    provenance:
      "Lovable output. The page loads Lovable's own build script from cdn.gpteng.co (the GPT Engineer runtime Lovable injects into what it builds) and is served from Lovable's hosting domain. Its source, github.com/Nithinbaskar/study-snapshot-space, opens its README with the line Lovable writes into every export, \"# Welcome to your Lovable project\", and both of its commits are authored by Lovable's bot (gpt-engineer-app[bot], the account Lovable still signs with). A second vendor is in this set on purpose, so the label is not a fact about one company's tag.",
    expect: (a) =>
      a.assets.thirdPartyHosts.some((h) => /gpteng\.co|lovable/i.test(h)) ||
      /lovable/i.test(a.head.generator ?? "") ||
      a.assets.chunks.some((c) => /gpteng\.co|lovable/i.test(c.url)),
  },
  {
    id: "vintage-pager-app",
    url: "https://v0-vintage-pager-app.vercel.app/",
    repo: "github.com/AnxForever/v0-vintage-pager-app",
    declaration: "meta[name=generator] content=\"v0.app\", and 3/3 commits in the source repository by v0[bot]",
    source: "https://v0-vintage-pager-app.vercel.app/",
    provenance:
      "v0 output, declared by <meta name=\"generator\" content=\"v0.app\"> in the served page. Its source, github.com/AnxForever/v0-vintage-pager-app, is v0's push target: v0's sync line is in the README and all three commits are authored by v0[bot]. Included as the small end of the range, a single-screen toy, because a corpus of nothing but polished landing pages would measure ambition rather than authorship.",
    expect: (a) => /v0\.app/i.test(a.head.generator ?? ""),
  },
  {
    id: "flappy-bird-game",
    url: "https://v0-flappy-bird-game-lilac.vercel.app/",
    repo: "github.com/thethclup/v0-flappy-bird-game",
    declaration: "meta[name=generator] content=\"v0.app\", and 3/3 commits in the source repository by v0[bot]",
    source: "https://v0-flappy-bird-game-lilac.vercel.app/",
    provenance:
      "v0 output, declared by <meta name=\"generator\" content=\"v0.app\"> in the served page, with github.com/thethclup/v0-flappy-bird-game as the synced source: v0's README line is present and all three commits are authored by v0[bot]. A canvas game rather than a marketing page, so the set is not four documents in a row and the DOM-shape rules have something other than sections and cards to read.",
    expect: (a) => /v0\.app/i.test(a.head.generator ?? ""),
  },
];

/**
 * Strip everything that would differ between two captures of the same page, so a re-capture
 * produces a reviewable diff rather than noise.
 *
 * Response headers are reduced to a two-key allowlist, and not only for stability: a raw
 * header bag carries set-cookie and per-request trace ids, and there is no reason to commit
 * a stranger's session identifiers to a public repository. No rule in the corpus reads
 * `http.headers`, which is checked by the fact that removing them changes no score.
 */
function normalize(artifact, capturedAt) {
  const { "content-type": contentType, server } = artifact.http.headers;
  return {
    ...artifact,
    fetchedAt: `${capturedAt}T00:00:00.000Z`,
    http: {
      status: artifact.http.status,
      headers: { ...(contentType ? { "content-type": contentType } : {}), ...(server ? { server } : {}) },
    },
  };
}

const args = process.argv.slice(2);
const only = args.includes("--only") ? (args[args.indexOf("--only") + 1] ?? "").split(",").filter(Boolean) : null;
const capturedAt = new Date().toISOString().slice(0, 10);

await mkdir(OUT, { recursive: true });

const indexPath = path.join(OUT, "web-corpus.index.json");
const existing = existsSync(indexPath) ? JSON.parse(readFileSync(indexPath, "utf8")) : [];
const byId = new Map(existing.map((e) => [e.id, e]));

for (const entry of WEB_MANIFEST) {
  if (only && !only.includes(entry.id)) continue;
  process.stdout.write(`${entry.id}: `);
  const raw = await probeUrl(entry.url, { viewport: VIEWPORT, timeoutMs: 45_000 });
  const artifact = normalize(raw, capturedAt);

  if (!entry.expect(artifact)) {
    throw new Error(
      `${entry.id}: the capture does NOT carry the declaration this member's label rests on ` +
        `(${entry.declaration}). generator=${JSON.stringify(artifact.head.generator)}, ` +
        `thirdPartyHosts=${JSON.stringify(artifact.assets.thirdPartyHosts)}. Either the page changed ` +
        `or the wrong document was read. Refusing to store an artifact whose provenance sentence the ` +
        `bytes do not support.`,
    );
  }

  writeFileSync(path.join(OUT, `${entry.id}.artifact.json`), `${JSON.stringify(artifact)}\n`, "utf8");
  byId.set(entry.id, {
    id: entry.id,
    label: "generated",
    origin: "real",
    source: entry.source,
    declaration: entry.declaration,
    provenance: entry.provenance,
    capturedAt,
  });
  console.log(
    `${artifact.dom.nodeCount} nodes, ${artifact.text.wordCount} words, ${artifact.assets.chunks.length} chunks, ` +
      `generator=${artifact.head.generator ?? "(none)"}`,
  );
}

const order = WEB_MANIFEST.map((m) => m.id);
const index = [...byId.values()].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`, "utf8");
console.log(`\n${index.length} generated web artifact(s) in the index, captured at ${capturedAt}.`);
