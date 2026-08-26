/**
 * `node scripts/measure-list-rules.mjs` — what `list_rules` costs an agent, in tokens.
 *
 * The server's own instructions ask an agent to call this tool BEFORE generating code, which
 * makes its size a usability property rather than a formatting one: a call nobody can afford is
 * a call nobody makes. So the number is measured rather than estimated in a comment, and it is
 * measured over the exact JSON the tool serialises.
 *
 * THE ESTIMATOR IS CHARACTERS / 4, and it is stated as an estimate every time it is printed.
 * A real BPE count would need a tokeniser this repository does not ship and would not change
 * the decision: the compact form is an order of magnitude smaller either way. The same
 * arithmetic produced the 15,778 figure in the product critique, so the before and after are
 * comparable, which is the only thing that matters here.
 *
 * Runs against `dist/`, deliberately, for the same reason the backtest does: this is a
 * statement about what would ship. Run `npm run measure:list-rules`, which compiles first.
 */

// Imported from the package's own `tsc -b` output rather than from the "slop-scorer-mcp"
// specifier. That specifier resolves to `dist/index.js`, which is the esbuild PUBLISH BUNDLE
// written by the package's own `npm run build`, and the root `tsc -b` does not refresh it - so
// measuring through it silently reports whatever was last published-shaped rather than what is
// in the tree. This path is the compiled source.
import { listRules } from "../packages/mcp-server/dist/server.js";

const measure = (label, args) => {
  const listing = listRules(args);
  const chars = JSON.stringify(listing, null, 2).length;
  return {
    label,
    chars,
    tokens: Math.round(chars / 4),
    rules: `${listing.index.length} indexed, ${listing.fullEntries.length} full`,
  };
};

const rows = [
  measure("verbose:true (what this returned unconditionally, plus the index)", { verbose: true }),
  measure("default, compact", {}),
  measure("default, compact, web only", { modality: "web" }),
  measure("default, compact, code only", { modality: "code" }),
  measure("compact + full entries for 5 named rules", {
    ruleIds: [
      "craft.no-og-image",
      "css.violet-blue-gradient",
      "motion.framework-default-timing",
      "verify.tautological-tests",
      "agent.instruction-file-committed",
    ],
  }),
];

const pad = (s, n) => String(s).padEnd(n);
console.log(`${pad("shape", 56)}${pad("rules", 26)}${pad("chars", 9)}tokens (est, chars/4)`);
for (const r of rows) {
  console.log(`${pad(r.label, 56)}${pad(r.rules, 26)}${pad(r.chars.toLocaleString("en-US"), 9)}${r.tokens.toLocaleString("en-US")}`);
}

const before = rows[0];
const after = rows[1];
console.log(
  `\nDefault call is ${(before.tokens / after.tokens).toFixed(1)}x cheaper than it was ` +
    `(${before.tokens.toLocaleString("en-US")} -> ${after.tokens.toLocaleString("en-US")} tokens). ` +
    `Nothing was removed: every rule is in \`index\` on every response, verbose:true returns every ` +
    `full entry, and ruleIds returns the full entries for named rules only.`,
);
