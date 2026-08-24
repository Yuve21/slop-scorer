/**
 * Clock, sleep and identifiers - injected, never imported from the global.
 *
 * The product's headline output is a measured duration, so the thing that measures duration is
 * part of the contract and not an implementation detail. Injecting it buys two properties that
 * matter more than the tidiness:
 *
 *  1. THE TEST SUITE IS DETERMINISTIC WITH NO NETWORK AND NO KEYS. A fake clock plus an instant
 *     sleep that advances it means a simulated 8-second remake takes microseconds and prints the
 *     same 8 seconds on every machine. Elapsed is still MEASURED - the provider never returns a
 *     number it made up - it is measured against a clock the test owns.
 *  2. THE BUDGET IS ENFORCEABLE. Deadlines are computed from the same clock the elapsed figure
 *     comes from, so there is no path where a call is billed against one time source and timed
 *     out against another.
 */

import { randomUUID } from "node:crypto";

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted !== true) return;
  throw signal.reason instanceof Error ? signal.reason : new Error("aborted");
}

export interface Clock {
  /** Monotonic-enough milliseconds. Used for elapsed and for deadlines. */
  now(): number;
  /** ISO-8601 for the substantiation record. */
  iso(): string;
}

export interface Runtime {
  readonly clock: Clock;
  /** Resolves after `ms`, or rejects with the abort reason if the signal fires first. */
  sleep(ms: number, signal?: AbortSignal): Promise<void>;
  /** Stable-shaped identifiers. Deterministic under `deterministicRuntime`. */
  id(prefix: string): string;
}

export function systemRuntime(): Runtime {
  return {
    clock: {
      now: () => Date.now(),
      iso: () => new Date().toISOString(),
    },
    sleep: (ms, signal) =>
      new Promise((resolve, reject) => {
        if (signal?.aborted === true) {
          reject(signal.reason instanceof Error ? signal.reason : new Error("aborted"));
          return;
        }
        const t = setTimeout(resolve, ms);
        signal?.addEventListener(
          "abort",
          () => {
            clearTimeout(t);
            reject(signal.reason instanceof Error ? signal.reason : new Error("aborted"));
          },
          { once: true },
        );
      }),
    id: (prefix) => `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
  };
}

export interface DeterministicRuntime extends Runtime {
  /** Move the fake clock forward by hand, for tests that need a timeout to fire. */
  advance(ms: number): void;
}

/** Epoch used by the deterministic runtime, so ISO timestamps in fixtures are stable. */
export const FIXED_EPOCH_MS = Date.UTC(2026, 7, 23, 21, 44, 0);

export function deterministicRuntime(startMs: number = FIXED_EPOCH_MS): DeterministicRuntime {
  let t = startMs;
  let counter = 0;
  return {
    clock: {
      now: () => t,
      iso: () => new Date(t).toISOString(),
    },
    // An instant sleep that moves the clock. Simulated latency is therefore real elapsed time as
    // far as every measurement in this package is concerned, and the suite still runs in
    // milliseconds.
    sleep: async (ms, signal) => {
      throwIfAborted(signal);
      t += ms;
      await Promise.resolve();
      // Checked again on the far side of the await: the signal can fire while the microtask is
      // queued. Routed through a function so the compiler cannot narrow the second read away with
      // the result of the first, which is how this check silently became dead code once already.
      throwIfAborted(signal);
    },
    id: (prefix) => {
      counter += 1;
      return `${prefix}_${String(counter).padStart(6, "0")}`;
    },
    advance: (ms) => {
      t += ms;
    },
  };
}
