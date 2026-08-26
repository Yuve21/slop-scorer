/**
 * @slop/db
 *
 * Persistence for the two surfaces that need it, and for nothing else.
 *
 * WHAT IS IN HERE: the gauntlet's labels (the calibration corpus this product publishes accuracy
 * against) and the notary's attestations (hashes, timestamp tokens, credentials). Plus a
 * substantiation table, which is where a published figure is allowed to come from.
 *
 * WHAT IS DELIBERATELY NOT IN HERE: anything from the detector or the reproduction path.
 * `packages/reproduce` is ephemeral by design, with a fifteen-minute TTL and a takedown edge, and
 * the reasoning is in its `retention.ts`: a stored recreation is discoverable in somebody else's
 * litigation. Adding a `scans` table would quietly undo that, so there is no table to add a row to.
 *
 * Three implementations of one port: `InMemoryDatabase` (the reference, used by every test),
 * `SupabaseDatabase` (PostgREST over an injected `fetch`), and no third one. The suite runs with
 * zero network and zero keys.
 */

export type {
  ArtifactLabel,
  DiscriminationRow,
  Disclosure,
  EventKind,
  GauntletArtifactRow,
  GauntletGuessRow,
  GauntletParticipantRow,
  GauntletRoundRow,
  NotaryChainRow,
  NotaryCredentialRow,
  NotaryEventRow,
  NotaryRecordingRow,
  NotaryTimestampRow,
  RecordingTool,
  SubstantiationKind,
  SubstantiationRunRow,
  TimestampStatus,
} from "./rows.js";

export type { GauntletStore, NotaryStore, SlopDatabase, SubstantiationStore } from "./port.js";
export { SequenceConflictError } from "./port.js";

export type { InMemoryOptions } from "./memory.js";
export { InMemoryDatabase } from "./memory.js";

export type { FetchLike, PostgrestOptions } from "./postgrest.js";
export { PostgrestError, SupabaseDatabase, columnCase } from "./postgrest.js";

export type { EnvResult, SupabaseEnv } from "./env.js";
export { ENV_DOCUMENTATION, SUPABASE_ENV_VARS, readSupabaseEnv } from "./env.js";

/**
 * THE MIGRATION LINT IS NOT RE-EXPORTED HERE, and that is load-bearing rather than tidy.
 *
 * `./migrations.js` reads `<repo>/supabase/migrations` off the filesystem. Turbopack resolves
 * `new URL("../../../supabase/migrations/", import.meta.url)` as a static asset reference no
 * matter what scope it sits in - module body or function body, it is the same syntactic form -
 * and a directory is not an asset, so the reference fails the build of anything that reaches
 * this module. `apps/web` reaches it: the gauntlet and notary routes import `InMemoryDatabase`
 * from this barrel, and a barrel drags every re-export along with the one symbol asked for.
 *
 * The migration set is a development and test concern. It has its own entrypoint,
 * `@slop/db/migrations`, and `test/migrations.test.ts` is its only consumer. Nothing in an app
 * process has any business resolving a SQL directory, so nothing in an app process can now
 * reach the code that does.
 */
