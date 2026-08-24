/**
 * Cost and time ceilings, enforced rather than documented.
 *
 * Two failure modes are being designed against, and they are different problems:
 *
 *  - COST. A remake is not free, which is the structural reason the incumbents never built this
 *    (`market-check-reproduction.md` (e)): a score is free at volume and a regeneration is not.
 *    So a request carries a hard dollar ceiling, the ceiling is checked BEFORE a call rather than
 *    after it, and a provider whose estimate does not fit is never invoked.
 *
 *  - LATENCY TAIL. Medians are comfortable and the p95 is not. The rule here is abort, never
 *    hang: every call gets a deadline that is the smaller of the provider's own hard timeout and
 *    whatever time is left in the request, and a provider that runs past it is recorded as a
 *    `timeout` attempt rather than allowed to finish late.
 */

import type { ReproductionModality } from "./types.js";
import type { Clock } from "./runtime.js";

export interface Budget {
  /** Hard ceiling for the whole request, across every attempt. */
  readonly maxCostUsd: number;
  /** Hard ceiling for wall-clock across the whole request. */
  readonly maxElapsedMs: number;
  /** Ceiling on provider calls, so a cheap provider cannot be retried into a large bill. */
  readonly maxAttempts: number;
}

/**
 * Defaults per modality.
 *
 * These are ceilings, not predictions, and they are deliberately not derived from any published
 * vendor number: a ceiling that tracks a price list becomes a claim about that price list. The
 * shape follows the research - text is nearly free and near-instant, image is cheap and fast,
 * a site from a screenshot is the slow and expensive one of the three.
 */
export const DEFAULT_BUDGETS: Readonly<Record<ReproductionModality, Budget>> = {
  text: { maxCostUsd: 0.02, maxElapsedMs: 20_000, maxAttempts: 2 },
  image: { maxCostUsd: 0.25, maxElapsedMs: 45_000, maxAttempts: 3 },
  "website-from-screenshot": { maxCostUsd: 1.5, maxElapsedMs: 180_000, maxAttempts: 2 },
};

export class BudgetExceededError extends Error {
  constructor(readonly kind: "cost" | "time" | "attempts", detail: string) {
    super(`budget exceeded (${kind}): ${detail}`);
    this.name = "BudgetExceededError";
  }
}

export class AttemptTimeoutError extends Error {
  constructor(readonly deadlineMs: number, readonly atMs: number) {
    super(`attempt passed its deadline (${atMs - deadlineMs} ms over) and was aborted`);
    this.name = "AttemptTimeoutError";
  }
}

/**
 * What a provider is handed for one call.
 *
 * A provider cannot see the request-level ledger and cannot spend more than it was told. It gets
 * a deadline, an abort signal, a clock, and a `checkpoint()` it is expected to call around any
 * long step. `checkpoint()` is what makes the deadline enforceable against a fake clock as well
 * as a real one, which is why the whole suite can exercise the timeout path with no timers.
 */
export interface AttemptBudget {
  readonly attemptId: string;
  readonly maxCostUsd: number;
  readonly deadlineAtMs: number;
  readonly signal: AbortSignal;
  readonly clock: Clock;
  sleep(ms: number): Promise<void>;
  /** Throws `AttemptTimeoutError` if the deadline has passed. */
  checkpoint(): void;
}

/** Request-level accounting. One ledger per `reproduce()` call. */
export class BudgetLedger {
  private spentUsd = 0;
  private attempts = 0;
  readonly startedAtMs: number;

  constructor(
    readonly budget: Budget,
    private readonly clock: Clock,
  ) {
    this.startedAtMs = clock.now();
  }

  get costSpentUsd(): number {
    return this.spentUsd;
  }

  get attemptsMade(): number {
    return this.attempts;
  }

  get elapsedMs(): number {
    return this.clock.now() - this.startedAtMs;
  }

  get remainingCostUsd(): number {
    return Math.max(0, this.budget.maxCostUsd - this.spentUsd);
  }

  get remainingMs(): number {
    return Math.max(0, this.budget.maxElapsedMs - this.elapsedMs);
  }

  /**
   * May another call be made, and at what estimated price?
   *
   * Returns a reason rather than throwing, because "we stopped because the next call would have
   * crossed the ceiling" is a fact the failure receipt has to be able to print.
   */
  admits(estimateUsd: number): { readonly ok: true } | { readonly ok: false; readonly reason: string } {
    if (this.attempts >= this.budget.maxAttempts) {
      return { ok: false, reason: `attempt ceiling reached (${this.budget.maxAttempts})` };
    }
    if (estimateUsd > this.remainingCostUsd) {
      return {
        ok: false,
        reason: `the next call was estimated at ${fmtUsd(estimateUsd)} and only ${fmtUsd(this.remainingCostUsd)} of the ceiling was left`,
      };
    }
    if (this.remainingMs <= 0) {
      return { ok: false, reason: `the time ceiling of ${this.budget.maxElapsedMs} ms was reached` };
    }
    return { ok: true };
  }

  record(costUsd: number): void {
    this.spentUsd += costUsd;
    this.attempts += 1;
  }
}

/** Dollars, at a fixed four decimals. Never rounded to zero, because zero would be a claim. */
export function fmtUsd(usd: number): string {
  return `$${usd.toFixed(4)}`;
}

/** Seconds, one decimal. The headline figure's only formatter. */
export function fmtSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)} s`;
}
