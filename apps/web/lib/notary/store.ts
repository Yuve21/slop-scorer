import "server-only";

import { randomUUID } from "node:crypto";
import { InMemoryDatabase } from "@slop/db";
import type { SlopDatabase } from "@slop/db";
import { DEFAULT_AUTHORITIES, NotaryService, httpTransport } from "@slop/notary";

/**
 * The notary's storage and its transport, for a build with no database and no outbound calls.
 *
 * TWO DECISIONS HERE ARE ABOUT WHAT THE CREDENTIAL WILL SAY, not about plumbing.
 *
 * 1. NO STAMP UNLESS ONE IS REALLY CONFIGURED. `MockTsaTransport` emits real DER and is the
 *    right tool for a test, and it would be the wrong one here: a credential issued over mock
 *    tokens would read "timestamped by four independent authorities in three jurisdictions",
 *    which is a false sentence on a legally load-bearing artifact. So this build does not stamp
 *    at all, and `buildStatement`'s own empty case then says the true thing instead — "no
 *    timestamp authority has stamped this chain, so nothing here establishes that the record
 *    existed before now". Set `NOTARY_TSA_LIVE=1` and the same code fans out to the four real
 *    free authorities over HTTP, with no key, and the sentence changes because the facts did.
 *
 * 2. NOTHING IS SAVED. Same as the gauntlet: `InMemoryDatabase`, a module singleton, gone on
 *    restart. `PERSISTENCE` is printed on the page. A notary whose record quietly evaporates
 *    while the page implies otherwise would be the single worst thing in this repository.
 */

export const LIVE_STAMPING = process.env.NOTARY_TSA_LIVE === "1";

export const PERSISTENCE =
  "Nothing here is saved. There is no database behind this build: the chain, the credential and " +
  "the verification all live in the memory of this server process and are gone when it restarts. " +
  "Copy the verification bundle if you want to keep anything, and treat what you get back as a " +
  "demonstration of the record format rather than a record.";

export const STAMPING_NOTE = LIVE_STAMPING
  ? "This build submits the chain root to four free timestamp authorities over the public internet. " +
    "No key is involved: RFC 3161 forbids a timestamp authority from identifying the requester, " +
    "which is the whole reason this design uses one."
  : "This build does not contact a timestamp authority, so your credential will say that nothing " +
    "establishes the record existed before now. That sentence is the truth about this deployment, " +
    "and we would rather print it than stamp the root with a mock and claim four authorities.";

const KEY = Symbol.for("slop.notary.db");
type Global = typeof globalThis & { [KEY]?: SlopDatabase };

function database(): SlopDatabase {
  const g = globalThis as Global;
  const existing = g[KEY];
  if (existing !== undefined) return existing;
  const db = new InMemoryDatabase();
  g[KEY] = db;
  return db;
}

const runtime = {
  now: () => Date.now(),
  iso: () => new Date().toISOString(),
  id: (prefix: string) => `${prefix}_${randomUUID()}`,
};

export function notary(): NotaryService {
  return new NotaryService({
    db: database(),
    runtime,
    // Never invoked unless `LIVE_STAMPING`: the action does not call `stamp()` otherwise.
    transport: httpTransport(globalThis.fetch),
    authorities: DEFAULT_AUTHORITIES,
    timeoutMs: 8_000,
  });
}

export function notaryDb(): SlopDatabase {
  return database();
}
