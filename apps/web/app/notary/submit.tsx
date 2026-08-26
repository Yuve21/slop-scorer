"use client";

import { useActionState, useRef, useState } from "react";
import Link from "next/link";
import { issueCredential } from "./actions";
import type { NotaryState } from "./types";

/**
 * The submit surface: a file, or a chain of steps.
 *
 * THE FILE NEVER LEAVES THE MACHINE IT IS ON. The digest is computed here with
 * `crypto.subtle.digest`, and what is submitted is a 64-character hex string, a byte count and
 * a declared time. That is not a size optimisation: this product attests the MAKING and refuses
 * to hold the thing made, and a server that received the file would be a server that could be
 * subpoenaed for it. The consequence is stated on the page — the digest is the visitor's claim,
 * not our measurement — because a reader who thinks we hashed their file believes something
 * stronger than what happened.
 *
 * Nothing here animates. A hash appearing in a list is not a fact that needs a beat to report.
 */

const CHUNK_NOTE = "sha-256, computed in this browser";

const hex = (buffer: ArrayBuffer): string =>
  [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");

interface Row {
  readonly kind: string;
  readonly contentSha256: string;
  readonly byteLength: number;
  readonly declaredAt: string;
  readonly name: string;
}

export function Submit() {
  const [state, formAction, pending] = useActionState<NotaryState, FormData>(issueCredential, {
    status: "idle",
  });
  const [rows, setRows] = useState<readonly Row[]>([]);
  const [hashing, setHashing] = useState(false);
  const [unsupported, setUnsupported] = useState<string | null>(null);
  const stepsRef = useRef<HTMLTextAreaElement>(null);

  const stepsJson = JSON.stringify(
    rows.map(({ kind, contentSha256, byteLength, declaredAt }) => ({ kind, contentSha256, byteLength, declaredAt })),
    null,
    2,
  );

  async function onFiles(files: FileList | null) {
    if (files === null || files.length === 0) return;
    if (typeof globalThis.crypto?.subtle?.digest !== "function") {
      // Stated rather than silently falling back to an upload. `crypto.subtle` is absent on
      // insecure origins, and shipping the file to the server instead would quietly break the
      // promise two paragraphs up.
      setUnsupported(
        "This browser will not hash locally (crypto.subtle is unavailable outside a secure context). " +
          "Paste the digests into the chain field instead; this page will not upload your file.",
      );
      return;
    }
    setHashing(true);
    try {
      const next: Row[] = [];
      for (const file of Array.from(files)) {
        const digest = await globalThis.crypto.subtle.digest("SHA-256", await file.arrayBuffer());
        next.push({
          kind: "save",
          contentSha256: hex(digest),
          byteLength: file.size,
          declaredAt: new Date(file.lastModified).toISOString(),
          name: file.name,
        });
      }
      // Oldest first: a chain is a history, and the order is the thing being attested.
      next.sort((a, b) => a.declaredAt.localeCompare(b.declaredAt));
      setRows((current) => [...current, ...next]);
      if (stepsRef.current) stepsRef.current.value = "";
    } finally {
      setHashing(false);
    }
  }

  if (state.status === "issued") {
    const c = state.credential;
    return (
      <div className="flex flex-col gap-11">
        <section aria-labelledby="credential" className="flex flex-col gap-5">
          <h2 id="credential" className="text-h3 font-medium text-ink">
            The credential
          </h2>
          {/* VERBATIM. This is the text `@slop/notary` composed and stored, printed as one
              block. It is not reworded, shortened or split for layout anywhere in this app. */}
          <p
            data-doc
            className="max-w-[72ch] border border-border-control bg-surface-raised px-5 py-5 text-body text-ink"
          >
            {c.statement}
          </p>
          <dl className="grid gap-x-8 gap-y-2 font-mono text-mono-sm text-ink-muted sm:grid-cols-2">
            <div className="flex gap-2">
              <dt>credential</dt>
              <dd className="break-all text-ink">{c.credentialId}</dd>
            </div>
            <div className="flex gap-2">
              <dt>root</dt>
              <dd className="break-all text-ink">{c.rootSha256}</dd>
            </div>
            <div className="flex gap-2">
              <dt>steps</dt>
              <dd className="text-ink">{c.eventCount}</dd>
            </div>
            <div className="flex gap-2">
              <dt>authorities</dt>
              <dd className="text-ink">
                {c.authorityCount} in {c.jurisdictionCount} jurisdiction(s)
              </dd>
            </div>
            <div className="flex gap-2">
              <dt>issued</dt>
              <dd className="text-ink">{c.issuedAt}</dd>
            </div>
            <div className="flex gap-2">
              <dt>wording</dt>
              <dd className="text-ink">v{c.statementVersion}</dd>
            </div>
          </dl>
        </section>

        <section aria-labelledby="steps-recorded" className="flex flex-col gap-4">
          <h2 id="steps-recorded" className="text-h3 font-medium text-ink">
            What was recorded
          </h2>
          <ul className="flex list-none flex-col gap-px bg-hairline">
            {c.events.map((e) => (
              <li key={e.leafSha256} className="flex flex-col gap-1 bg-surface-raised px-4 py-3">
                <p className="font-mono text-mono-sm text-ink">
                  {e.sequence}. {e.kind} · {e.byteLength} bytes · declared {e.declaredAt}
                </p>
                <p className="font-mono text-mono-sm break-all text-ink-muted">
                  content {e.contentSha256}
                </p>
                <p className="font-mono text-mono-sm break-all text-ink-muted">
                  leaf {e.leafSha256} · recorded by us {e.recordedAt}
                </p>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="bundle" className="flex flex-col gap-4">
          <h2 id="bundle" className="text-h3 font-medium text-ink">
            Check it without us
          </h2>
          <p className="max-w-[72ch] text-body text-ink">
            Everything a verifier needs is below. Paste it into{" "}
            <Link href="/notary/verify" className="text-ink-accent underline underline-offset-4">
              the verify page
            </Link>{" "}
            — or into a different build of it — and the root is recomputed from the steps, every
            stored token is re-parsed against that root, and the statement is rebuilt from the same
            facts and compared with the text above. None of that touches a network.
          </p>
          <textarea
            readOnly
            aria-label="verification bundle"
            value={c.bundle}
            rows={10}
            className="w-full rounded-control border border-border-control bg-surface-overlay px-4 py-3 font-mono text-mono-sm text-ink"
          />
        </section>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <label htmlFor="files" className="text-body font-medium text-ink">
          A file, or several versions of one
        </label>
        <p className="max-w-[72ch] text-sm text-ink-muted">
          Each file becomes one step, ordered by the timestamp your filesystem carries. The file
          itself is not uploaded: it is hashed here, in this tab, and only the digest is submitted.
          That makes the digest your claim rather than our measurement, and the credential is
          written accordingly.
        </p>
        <input
          id="files"
          name="files"
          type="file"
          multiple
          onChange={(e) => void onFiles(e.target.files)}
          className="w-fit rounded-control border border-border-control bg-surface-raised px-4 py-3 text-sm text-ink"
        />
        {hashing && (
          <p role="status" className="font-mono text-mono-sm text-ink-muted">
            Hashing…
          </p>
        )}
        {unsupported !== null && (
          <p role="status" className="max-w-[72ch] font-mono text-mono-sm text-ink">
            {unsupported}
          </p>
        )}
      </div>

      {rows.length > 0 && (
        <ul className="flex list-none flex-col gap-px bg-hairline">
          {rows.map((r) => (
            <li key={r.contentSha256 + r.declaredAt} className="flex flex-col gap-1 bg-surface-raised px-4 py-3">
              <p className="font-mono text-mono-sm text-ink">
                {r.name} · {r.byteLength} bytes · {r.declaredAt}
              </p>
              <p className="font-mono text-mono-sm break-all text-ink-muted">
                {r.contentSha256} · {CHUNK_NOTE}
              </p>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-col gap-3">
        <label htmlFor="steps" className="text-body font-medium text-ink">
          Or a process chain, as JSON
        </label>
        <p className="max-w-[72ch] text-sm text-ink-muted">
          An array of steps. Each one needs a <code className="font-mono">kind</code> (draft, save,
          edit, commit, agent-receipt, recording-frame, export), a 64-character hex{" "}
          <code className="font-mono">contentSha256</code>, an integer{" "}
          <code className="font-mono">byteLength</code> and an ISO 8601{" "}
          <code className="font-mono">declaredAt</code>. Anything malformed is refused rather than
          repaired: a chain built out of corrected inputs attests the correction.
        </p>
        <textarea
          ref={stepsRef}
          id="steps"
          name="steps"
          rows={8}
          defaultValue={rows.length > 0 ? stepsJson : ""}
          key={stepsJson}
          placeholder='[{"kind":"save","contentSha256":"…64 hex…","byteLength":10240,"declaredAt":"2026-08-01T09:12:00.000Z"}]'
          className="w-full rounded-control border border-border-control bg-surface-raised px-4 py-3 font-mono text-mono-sm text-ink"
        />
      </div>

      {state.status === "refused" && (
        <p role="status" data-doc className="border border-border-control bg-surface-raised px-5 py-4 font-mono text-mono-md text-ink">
          {state.reason}
        </p>
      )}

      <button
        type="submit"
        disabled={pending || hashing}
        className="w-fit rounded-control border border-border-control bg-ink-accent px-[22px] py-[14px] text-body font-medium text-ink-accent-fg disabled:opacity-60"
      >
        {pending ? "Recording…" : "Record this chain"}
      </button>
    </form>
  );
}
