#!/usr/bin/env node
/**
 * stdio entrypoint. `npx slop-scorer-mcp`.
 *
 * stdout belongs to the JSON-RPC transport and nothing else may write to it: a stray
 * console.log corrupts the protocol frame and the client reports an opaque parse error. All
 * diagnostics go to stderr, which is what MCP clients surface in their logs.
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer, SERVER_NAME, SERVER_VERSION } from "./server.js";

async function main(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write(`${SERVER_NAME} ${SERVER_VERSION} listening on stdio\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${SERVER_NAME} failed to start: ${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
