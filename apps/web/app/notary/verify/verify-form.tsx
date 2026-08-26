"use client";

import { useActionState } from "react";
import { checkCredential } from "../actions";
import type { VerifyState } from "../types";

/**
 * The other side of the credential.
 *
 * WHAT IT PRINTS IS `formatVerification`'s OUTPUT, VERBATIM: counts and named problems, no
 * adjectives, in a monospaced block. There is no summary sentence of our own next to it, and in
 * particular no badge: the report's own bottom line is deliberately narrow — the chain
 * re-derives, the root matches, and at least one token independently stamps it — and any
 * friendlier restatement of that would be a claim nobody checked.
 *
 * A bundle that cannot be read is a REFUSAL, not a negative verdict. Answering "not verified" to
 * a question you did not manage to ask is the failure mode this whole product argues against.
 */

export function VerifyForm() {
  const [state, formAction, pending] = useActionState<VerifyState, FormData>(checkCredential, {
    status: "idle",
  });

  return (
    <div className="flex flex-col gap-8">
      <form action={formAction} className="flex flex-col gap-4">
        <label htmlFor="bundle" className="text-body font-medium text-ink">
          A verification bundle, or a credential id from this session
        </label>
        <textarea
          id="bundle"
          name="bundle"
          rows={10}
          placeholder='{"credential":{…},"chain":{…},"events":[…],"timestamps":[…]}'
          className="w-full rounded-control border border-border-control bg-surface-raised px-4 py-3 font-mono text-mono-sm text-ink"
        />
        <button
          type="submit"
          disabled={pending}
          className="w-fit rounded-control border border-border-control bg-ink-accent px-[22px] py-[14px] text-body font-medium text-ink-accent-fg disabled:opacity-60"
        >
          {pending ? "Re-checking…" : "Re-check this credential"}
        </button>
      </form>

      {state.status === "refused" && (
        <p
          role="status"
          data-doc
          className="max-w-[72ch] border border-border-control bg-surface-raised px-5 py-4 font-mono text-mono-md text-ink"
        >
          {state.reason}
        </p>
      )}

      {state.status === "checked" && (
        <div className="flex flex-col gap-5">
          <section aria-labelledby="report" className="flex flex-col gap-3">
            <h2 id="report" className="text-h3 font-medium text-ink">
              The check, as it was computed
            </h2>
            <pre
              data-doc
              className="overflow-x-auto border border-border-control bg-surface-raised px-5 py-5 font-mono text-mono-sm text-ink"
            >
              {state.report}
            </pre>
          </section>

          <section aria-labelledby="restated" className="flex flex-col gap-3">
            <h2 id="restated" className="text-h3 font-medium text-ink">
              The credential this was about
            </h2>
            {/* Verbatim, again. The point of showing it here is that the line above says
                whether this exact text still falls out of the facts. */}
            <p
              data-doc
              className="max-w-[72ch] border border-border-control bg-surface-raised px-5 py-5 text-body text-ink"
            >
              {state.statement}
            </p>
            <p className="max-w-[72ch] font-mono text-mono-sm text-ink-muted">
              {state.statementReproduced === null
                ? "The statement was not re-derived: this credential was issued under an older wording, which is information rather than a failure."
                : state.statementReproduced
                  ? "This text is what those facts produce, so it has not been edited since it was issued."
                  : "This text is NOT what those facts produce, so it was changed after it was issued."}
            </p>
          </section>
        </div>
      )}
    </div>
  );
}
