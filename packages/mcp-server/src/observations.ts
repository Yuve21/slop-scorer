/**
 * The local, off-by-default half of the corpus training loop.
 *
 * `@slop/core` owns the record, the projection and the guards; it imports no node builtin and no
 * network API on purpose. This file is where the record meets a filesystem, and it lives in the
 * MCP server because that is the only place that has one.
 *
 * WHAT THIS DOES: appends one JSON object per line to a file in a directory the USER named.
 *
 * WHAT THIS CANNOT DO: reach a network. `appendFileSync` takes a path. There is no URL anywhere in
 * this module, no client, and no transport to inject one into. `scripts/check-no-egress.mjs` fails
 * the build if that ever stops being true, and it scans this file.
 *
 * OFF BY DEFAULT, and the switch is the user's own environment:
 *
 *   SLOP_OBSERVATIONS_DIR=/some/path/you/chose
 *
 * Unset, `observationSinkFromEnv` returns `null` and nothing is written. There is no remote
 * default to fall back to and no opt-out to forget, because there is nothing switched on to opt out
 * of. A scan that cannot write its observation is still a completely successful scan, so
 * `recordBestEffort` tolerates an IO failure. It does NOT tolerate a leak, and the two are
 * separated by construction rather than by a comment; see the note on `fileObservationSink`.
 */

import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { ObservationLeakError, observationSink, type CorpusObservation, type ObservationSink } from "@slop/core";

/** The environment variable a user sets to turn this on. Named once, here. */
export const OBSERVATIONS_DIR_ENV = "SLOP_OBSERVATIONS_DIR";

/**
 * One file per month, so a user can delete a period without losing everything, and so the file
 * a reviewer opens is a readable size. The name carries no identifier.
 */
export const observationFileFor = (day: string): string => `observations-${day.slice(0, 7)}.jsonl`;

/**
 * The raw sink. It THROWS, on a leak and on an IO failure alike, and that is deliberate.
 *
 * The first version of this file put a `catch {}` here so a full disk could not fail a user's
 * scan. It also swallowed `ObservationLeakError`, which is the guard that stops a path reaching
 * disk. A guard whose throw is caught and discarded is a guard that reports success without doing
 * its job: the disqualifying defect class in HOUSE-KNOWLEDGE, written into the privacy mechanism
 * by the person writing the privacy mechanism. The test suite caught it on the first run.
 *
 * So the two failure modes are separated by construction. This function is honest and loud;
 * `recordBestEffort` below is where an IO failure, and ONLY an IO failure, is tolerated.
 */
export function fileObservationSink(dir: string, knownRuleIds: ReadonlySet<string>): ObservationSink {
  return observationSink(
    {
      append(line: string) {
        // The day is inside the line, and the line has already passed the leak guard, so reading
        // it back here cannot introduce anything the guard did not see.
        const day = (JSON.parse(line) as CorpusObservation).day;
        mkdirSync(dir, { recursive: true });
        appendFileSync(path.join(dir, observationFileFor(day)), line, "utf8");
      },
    },
    knownRuleIds,
  );
}

/**
 * Record without letting a disk problem fail the user's scan, while letting a LEAK through loudly.
 *
 * A full disk, a read-only directory or a path the user mistyped must never turn a successful scan
 * into a failed one: the observation is a side benefit to us, and the scan is what the user asked
 * for. A leak is the opposite. `ObservationLeakError` means our own projection tried to write
 * something it must not, the write did not happen, and nobody would ever find out if this
 * swallowed it. It rethrows.
 *
 * The IO swallow is deliberately silent rather than a warning on stderr, because an MCP server's
 * stderr is the host agent's context window and a recurring warning there costs the user tokens on
 * every call.
 */
export async function recordBestEffort(sink: ObservationSink, o: CorpusObservation): Promise<void> {
  try {
    await sink.record(o);
  } catch (error) {
    if (error instanceof ObservationLeakError) throw error;
  }
}

/**
 * Returns a sink only if the user asked for one. `null` means observation is OFF, which is the
 * default and which every caller must handle.
 */
export function observationSinkFromEnv(env: NodeJS.ProcessEnv, knownRuleIds: ReadonlySet<string>): ObservationSink | null {
  const dir = env[OBSERVATIONS_DIR_ENV]?.trim();
  if (!dir) return null;
  // A relative path here would resolve against whatever directory the host agent happened to
  // launch the server from, which is not a place the user chose. Refuse rather than guess.
  if (!path.isAbsolute(dir)) return null;
  return fileObservationSink(dir, knownRuleIds);
}
