import { ev, patch } from "../rule.js";
import type { CodeRule } from "../rule.js";

/**
 * Family: scaffold-residue.
 *
 * The parts of the template nobody came back to. Every project starts from a scaffold, so
 * none of this is evidence that a template was used; it is evidence that the template was
 * left where it landed. Each rule cites the exact line, and each carries the obvious
 * rebuttal: a young repo has every one of these and is innocent of all of them.
 */

export const SCAFFOLD_RULES: readonly CodeRule[] = [
  {
    id: "scaffold.readme-template-markers",
    family: "scaffold-residue",
    title: "The README still contains the generator's own sentences",
    polarity: "signal",
    severity: "medium",
    baseWeight: 0.8,
    maxHits: 3,
    requiresProbe: "readme",
    phase: 1,
    since: "code-corpus-2026.09",
    explanation:
      "Verbatim scaffold prose is still in the README: the create-next-app boilerplate, the Create React App header, an unfilled template placeholder. Nobody who read the README kept these on purpose.",
    falsePositiveNote:
      "A repository three days old legitimately still has its scaffold README, and a private tool may never need one. This is evidence of unfinished setup, not of authorship.",
    prevention: "Two paragraphs: what this is, and how to run it. Delete everything the generator wrote.",
    detect: (a) =>
      (a.readme?.templateMarkers ?? []).map((m) =>
        ev("line", `${a.readme?.path ?? "README.md"}:${m.line}`, m.marker, {
          expected: "prose about this project",
          excerpt: m.text.slice(0, 200),
        }),
      ),
    fixtures: {
      positive: (base) => ({
        artifact: patch(base, {
          readme: {
            path: "README.md",
            bytes: 1_400,
            lines: 40,
            templateMarkers: [
              {
                line: 1,
                marker: "bootstrapped with create-next-app",
                text: "This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app).",
              },
              { line: 28, marker: "## Deploy on Vercel", text: "## Deploy on Vercel" },
            ],
          },
        }),
      }),
      mutated: (base) => ({
        artifact: patch(base, { readme: { path: "README.md", bytes: 1_400, lines: 40, templateMarkers: [] } }),
      }),
    },
  },
  {
    id: "scaffold.unused-dependencies",
    family: "scaffold-residue",
    title: "Declared dependencies that nothing in the tree imports",
    polarity: "signal",
    severity: "medium",
    baseWeight: 0.7,
    maxHits: 5,
    requiresProbe: "manifest",
    phase: 1,
    since: "code-corpus-2026.09",
    explanation:
      "Four or more runtime dependencies appear in the manifest and are imported by no scanned file. Packages get added speculatively when the shape of a solution is being guessed at rather than built toward.",
    falsePositiveNote:
      "Plugins loaded by config rather than by import, peer requirements, CLI-only tools, packages used by a workspace outside the scanned globs, and anything reached by dynamic import all look unused to a static scan. If you narrowed the scan with a glob, expect this rule to over-report.",
    prevention: "Run a depcheck pass before merging. If it is not imported, it is not a dependency.",
    detect: (a) => {
      const dead = a.dependencies.filter((d) => d.kind === "dependencies" && d.importedBy.length === 0);
      if (dead.length < 4) return [];
      return dead
        .slice(0, 6)
        .map((d) => ev("file", `package.json > dependencies > ${d.name}`, "declared, imported by nothing scanned", { expected: "at least one import" }));
    },
    fixtures: {
      positive: (base) => ({
        artifact: patch(base, {
          dependencies: [
            { name: "commander", kind: "dependencies", importedBy: ["src/cli.ts"] },
            { name: "axios", kind: "dependencies", importedBy: [] },
            { name: "lodash", kind: "dependencies", importedBy: [] },
            { name: "moment", kind: "dependencies", importedBy: [] },
            { name: "uuid", kind: "dependencies", importedBy: [] },
          ],
        }),
      }),
      mutated: (base) => ({
        artifact: patch(base, {
          dependencies: [
            { name: "commander", kind: "dependencies", importedBy: ["src/cli.ts"] },
            { name: "axios", kind: "dependencies", importedBy: ["src/http.ts"] },
            { name: "lodash", kind: "dependencies", importedBy: ["src/util.ts"] },
            { name: "moment", kind: "dependencies", importedBy: ["src/time.ts"] },
            { name: "uuid", kind: "dependencies", importedBy: ["src/id.ts"] },
          ],
        }),
      }),
    },
  },
  {
    id: "scaffold.default-tooling-config",
    family: "scaffold-residue",
    title: "Tooling config files are byte-identical to the generator's stub",
    polarity: "signal",
    severity: "low",
    baseWeight: 0.5,
    maxHits: 3,
    requiresProbe: "config",
    phase: 1,
    since: "code-corpus-2026.09",
    explanation:
      "Two or more tooling configs match a known scaffold stub exactly after whitespace normalisation. The tools are installed and nobody has yet had an opinion the tool needed to know about.",
    falsePositiveNote:
      "The defaults are good, and adopting them wholesale is a legitimate decision that saves everyone time. This is a maturity signal, not an authorship one.",
    prevention:
      "Configure one thing you actually care about, or delete the config and rely on the tool's built-in defaults instead of committing a file that says nothing.",
    detect: (a) => {
      const stubs = a.configs.filter((c) => c.matchesScaffoldDefault !== null);
      if (stubs.length < 2) return [];
      return stubs.map((c) =>
        ev("file", c.path, `identical to ${c.matchesScaffoldDefault}`, { expected: "at least one project-specific setting", excerpt: c.excerpt.slice(0, 160) }),
      );
    },
    fixtures: {
      positive: (base) => ({
        artifact: patch(base, {
          configs: [
            { path: ".eslintrc.json", bytes: 40, matchesScaffoldDefault: "create-next-app .eslintrc.json", excerpt: '{"extends":"next/core-web-vitals"}' },
            { path: ".prettierrc", bytes: 3, matchesScaffoldDefault: "empty prettier config", excerpt: "{}" },
          ],
        }),
      }),
      mutated: (base) => ({
        artifact: patch(base, {
          configs: [
            { path: ".eslintrc.json", bytes: 40, matchesScaffoldDefault: "create-next-app .eslintrc.json", excerpt: '{"extends":"next/core-web-vitals"}' },
            { path: ".prettierrc", bytes: 180, matchesScaffoldDefault: null, excerpt: '{"printWidth":110,"quoteProps":"consistent"}' },
          ],
        }),
      }),
    },
  },
  {
    id: "scaffold.placeholder-markers",
    family: "scaffold-residue",
    title: "Unfilled placeholders left in shipped source",
    polarity: "signal",
    severity: "medium",
    baseWeight: 0.6,
    maxHits: 5,
    requiresProbe: "source",
    phase: 1,
    since: "code-corpus-2026.09",
    explanation:
      "Six or more literal placeholders in source: `your-api-key-here`, `TODO: implement`, `lorem ipsum`, `example.com` in a config value, `Replace this`. A placeholder is an instruction to a human that no human read.",
    falsePositiveNote:
      "TODOs are a normal and healthy way to record known gaps, and a mature codebase carries plenty. The rule needs six and prefers the never-filled-in kind, but it cannot tell a tracked TODO from an abandoned one.",
    prevention: "Fail the build on the placeholder strings your scaffold ships with. They are the ones nobody notices.",
    detect: (a) => {
      if (a.placeholders.length < 6) return [];
      return a.placeholders
        .slice(0, 8)
        .map((p) => ev("line", `${p.file}:${p.line}`, p.marker, { expected: "a real value", excerpt: p.text.slice(0, 160) }));
    },
    fixtures: {
      positive: (base) => ({
        artifact: patch(base, {
          placeholders: Array.from({ length: 7 }, (_, i) => ({
            file: "src/config.ts",
            line: 10 + i * 4,
            marker: "your-api-key-here",
            text: `const key = "your-api-key-here"; // slot ${i}`,
          })),
        }),
      }),
      mutated: (base) => ({ artifact: patch(base, { placeholders: [] }) }),
    },
  },
];
