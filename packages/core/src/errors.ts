/**
 * Loud failures.
 *
 * Every error in this file exists because the quiet version of the same problem is worse
 * than a crash: a rule that stopped matching, a probe that scanned nothing, or a receipt
 * that does not add up all produce a plausible-looking score that is simply wrong. A wrong
 * score with citations attached is the exact product this thing exists to catch.
 */

export class SlopError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/**
 * A probe ran and collected nothing when it was declared to collect something.
 *
 * This is the failure that has to be loud. The shape is always the same and it is invisible
 * by construction: a collection is built by scanning; rules then assert things ABOUT that
 * collection; nothing ever asserts the collection is non-empty. When the selector, the
 * pattern or the path goes stale the collection is empty, every rule quietly does not fire,
 * and the artifact scores LOW while the report still prints confident citations for the
 * rules that did fire.
 *
 * Silently lowering everyone's score is the worst available outcome, so a zero denominator
 * on a probe that expects one throws here instead.
 */
export class VacuousProbeError extends SlopError {
  constructor(
    readonly detectorId: string,
    readonly probeId: string,
    readonly note?: string,
  ) {
    super(
      `[${detectorId}] probe "${probeId}" ran but collected 0 items, and it declares expectsNonEmpty. ` +
        `Every rule depending on it just failed to fire for a reason that has nothing to do with the artifact, ` +
        `which would have shown up as a LOW score rather than an error.` +
        (note ? ` ${note}` : ""),
    );
  }
}

/**
 * The receipt does not reconcile to the score.
 *
 * Non-negotiable output invariant: prior points + the sum of every printed contribution
 * equals the printed score, in integers, exactly. If it does not, the report is a bug and
 * not a rounding difference, because a report that nearly adds up is a black box wearing a
 * receipt.
 */
export class ReceiptMismatchError extends SlopError {
  constructor(readonly expected: number, readonly actual: number, readonly detail: string) {
    super(
      `Receipt does not reconcile: prior + contributions = ${actual}, printed score = ${expected}. ${detail}`,
    );
  }
}

/** A detector returned something the contract forbids. */
export class MalformedResultError extends SlopError {
  constructor(readonly detectorId: string, detail: string) {
    super(`[${detectorId}] malformed DetectorResult: ${detail}`);
  }
}

/** No registered detector accepts the input. */
export class NoDetectorError extends SlopError {
  constructor(readonly inputKind: string, readonly registered: readonly string[]) {
    super(
      `No detector accepts input of kind "${inputKind}". Registered: ${registered.join(", ") || "(none)"}.`,
    );
  }
}
