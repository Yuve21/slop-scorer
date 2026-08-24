import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    // Tests run against TypeScript SOURCE, not dist, so `npm test` never depends on a
    // stale build. `npm run build` is what proves the published entrypoints resolve.
    alias: {
      "@slop/core": r("./packages/core/src/index.ts"),
      "@slop/detectors-web": r("./packages/detectors-web/src/index.ts"),
      "@slop/detectors-code": r("./packages/detectors-code/src/index.ts"),
      "@slop/reproduce": r("./packages/reproduce/src/index.ts"),
      "@slop/provenance": r("./packages/provenance/src/index.ts"),
      "@slop/detectors-image": r("./packages/detectors-image/src/index.ts"),
      "@slop/detectors-video": r("./packages/detectors-video/src/index.ts"),
      "@slop/detectors-audio": r("./packages/detectors-audio/src/index.ts"),
      "@slop/db": r("./packages/db/src/index.ts"),
      "@slop/gauntlet": r("./packages/gauntlet/src/index.ts"),
      "@slop/notary": r("./packages/notary/src/index.ts"),
      "slop-scorer-mcp": r("./packages/mcp-server/src/index.ts"),
      // The web app's own alias, so a test can import the SHIPPED route handler rather than a
      // copy of its logic. The export endpoint is the legally load-bearing one and it is tested
      // through this door: see apps/web/test/export-route.test.ts.
      "@": r("./apps/web"),
      // `server-only` is a marker package: under the `react-server` export condition it
      // resolves to an empty module, and under every other condition it resolves to a module
      // that THROWS on import. Vitest's node environment does not apply the react-server
      // condition, so without this line no test can import a Server Component at all, and the
      // receipt page - the most legally load-bearing surface in the product - would stay
      // untestable. Mapping it to the package's own `empty.js` is what the RSC compiler does.
      "server-only": r("./node_modules/server-only/empty.js"),
    },
  },
  test: {
    include: ["packages/*/test/**/*.test.ts", "apps/web/test/**/*.test.ts"],
    environment: "node",
  },
});
