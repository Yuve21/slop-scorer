import "server-only";

import { randomUUID } from "node:crypto";
import type { Report } from "@slop/core";
import { InMemoryDatabase } from "@slop/db";
import type { ArtifactLabel, GauntletArtifactRow, SlopDatabase } from "@slop/db";
import { GauntletService } from "@slop/gauntlet";
import POOL from "./pool.json";

/**
 * The gauntlet's storage, for a build with no database.
 *
 * `packages/db` ships three implementations of one port and this app uses the reference one:
 * `InMemoryDatabase`, held in a module singleton. There is no Supabase project behind this
 * product yet (the port exists precisely so the packages could be finished before there was
 * one), so the honest choice is the store that needs no keys — and then to SAY SO on the page
 * rather than render a streak that looks durable and is not. `PERSISTENCE` below is that
 * sentence, and it is exported so the route cannot render without one.
 *
 * SWAPPING IN THE REAL ONE IS TWO LINES. `SupabaseDatabase` implements the same
 * `GauntletStore`, so `database()` returns it instead once `readSupabaseEnv()` resolves, and
 * nothing else in this file or the route changes. The interface is the seam; this module is
 * just the choice of implementation.
 *
 * THE ANSWER KEY LIVES IN THIS MODULE AND MUST NOT LEAVE IT. `pool.json` carries every
 * artifact's label, source and provenance. `import "server-only"` is the compile-time guard
 * (a client component that imports this fails the build), and the round view the browser
 * receives is assembled by `GauntletService.toRoundView`, which names the fields that travel
 * rather than deleting the ones that must not.
 */

/** Printed on the page, verbatim. A score that is not saved must say it is not saved. */
export const PERSISTENCE =
  "Nothing here is saved. There is no database behind this build: the round, your guess and your " +
  "streak live in the memory of this server process and are gone when it restarts. The counts this " +
  "game exists to collect are not being collected yet, and we would rather say that than show you " +
  "a streak that looks durable.";

/**
 * Why no timing figure is published, when no ticket secret is configured.
 *
 * `GauntletService` measures time-to-answer from a signed serve ticket, and with no secret it
 * records every row `timingDisputed` and excludes it from every published figure rather than
 * quietly storing a duration the browser chose. That is the package's own discipline; this
 * constant is it, said out loud.
 */
export const TIMING_NOTE =
  "We are not timing you on our own clock in this build, so no duration from this round will ever " +
  "appear in a published figure.";

export interface PoolEntry {
  readonly artifactId: string;
  readonly corpus: string;
  readonly label: ArtifactLabel;
  readonly source: string;
  readonly provenance: string;
  readonly captureDate: string;
  readonly report: Report;
  readonly elapsedMs: number;
}

interface Snapshot {
  readonly builtWith: Record<string, string>;
  readonly addedAt: string;
  readonly artifacts: readonly (PoolEntry & {
    readonly addedAt: string;
    readonly retiredAt: string | null;
    readonly presentation: unknown;
  })[];
}

const snapshot = POOL as unknown as Snapshot;

const rows: readonly GauntletArtifactRow[] = snapshot.artifacts.map((a) => ({
  artifactId: a.artifactId,
  corpus: a.corpus,
  label: a.label,
  source: a.source,
  provenance: a.provenance,
  presentation: a.presentation as GauntletArtifactRow["presentation"],
  captureDate: a.captureDate,
  retiredAt: a.retiredAt,
  addedAt: a.addedAt,
}));

const byId = new Map<string, PoolEntry>(snapshot.artifacts.map((a) => [a.artifactId, a]));

/** The answer key for one artifact. Server-side callers only; there is no client path to this. */
export const poolEntry = (artifactId: string): PoolEntry | null => byId.get(artifactId) ?? null;

export const poolEntries = (): readonly PoolEntry[] => [...byId.values()];

export const corpusVersions = (): Record<string, string> => snapshot.builtWith;

/**
 * The singleton, seeded once.
 *
 * A module-level global is the right shape here and a wrong one under a real database: it is
 * doing the job a connection pool would do, for a store that is a Map. Hung off `globalThis`
 * so a dev-server hot reload does not silently start a second, empty game.
 */
const KEY = Symbol.for("slop.gauntlet.db");
type Global = typeof globalThis & { [KEY]?: { db: SlopDatabase; seeded: Promise<number> } };

function handle(): { db: SlopDatabase; seeded: Promise<number> } {
  const g = globalThis as Global;
  const existing = g[KEY];
  if (existing !== undefined) return existing;
  const db = new InMemoryDatabase();
  const made = { db, seeded: db.upsertArtifacts(rows) };
  g[KEY] = made;
  return made;
}

const runtime = {
  now: () => Date.now(),
  iso: () => new Date().toISOString(),
  id: (prefix: string) => `${prefix}_${randomUUID()}`,
};

/**
 * The service.
 *
 * `ticketSecret` reads the environment and is null when unset, which is the configured-off
 * path the package documents: no ticket is issued, no ticket is checked, and every guess row
 * is stored `timingDisputed`. Faking a secret per process would look better and would make the
 * app fail across two instances, so it is left null and `TIMING_NOTE` explains the consequence.
 */
export async function gauntlet(): Promise<GauntletService> {
  const { db, seeded } = handle();
  await seeded;
  const secret = process.env.GAUNTLET_TICKET_SECRET?.trim();
  return new GauntletService({
    db,
    runtime,
    roundSize: 5,
    ticketSecret: secret ? secret : null,
  });
}

/** The store itself, for the one thing the service does not expose: the round's artifact ids. */
export async function gauntletDb(): Promise<SlopDatabase> {
  const { db, seeded } = handle();
  await seeded;
  return db;
}

/** A participant id shape we will accept. Anything else is replaced rather than trusted. */
const PARTICIPANT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const isParticipantId = (value: string | undefined): value is string =>
  value !== undefined && PARTICIPANT.test(value);

export const newParticipantId = (): string => randomUUID();
