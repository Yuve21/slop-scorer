import type { Metadata } from "next";
import Link from "next/link";
import { LIMITATION, TOKEN_VERIFICATION_SCOPE, VERIFICATION_CAVEAT } from "@slop/notary";
import { PERSISTENCE, STAMPING_NOTE } from "@/lib/notary/store";
import { absolute } from "@/lib/site";
import { Submit } from "./submit";

/**
 * The notary.
 *
 * ATTEST THE MAKING, NEVER THE PERSON. That is the whole design and it is a legal position
 * before it is a product one: identity verification is a service to outsource and biometrics
 * are a liability to refuse outright, so what is left is RFC 3161 — an entire deployed protocol
 * for attesting that something existed at a time without attesting who made it.
 *
 * THE WORDING ON THIS PAGE IS NOT OURS TO WRITE. The credential is composed by
 * `@slop/notary`'s `buildStatement` from counts and facts, run through `assertAttestable`, and
 * printed verbatim. `LIMITATION` and `VERIFICATION_CAVEAT` below are imported from the package
 * rather than retyped, because a caveat that exists in two places goes stale in exactly one of
 * them — and the phrase this whole package exists to never ship is "verified human".
 *
 * `force-dynamic` because the credential is issued into a process-local store: a statically
 * rendered notary would serve one visitor's chain to the next.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "The notary: attest the making, never the person",
  description:
    "Record the steps of a file's history as a hash-linked chain, get back a credential that states exactly what was recorded and what it cannot show, and re-check it independently. No account, no key, no biometrics.",
  alternates: { canonical: "/notary" },
  openGraph: {
    title: "The notary · Slop Scorer",
    description:
      "A credential that says what was recorded and what a recorded process cannot show. It never says a person made anything.",
    url: absolute("/notary"),
    type: "website",
  },
};

export default function NotaryPage() {
  return (
    <div className="mx-auto flex max-w-receipt flex-col gap-16 px-6 py-16 md:px-[72px]">
      <header className="flex flex-col gap-5">
        <p className="font-mono text-mono-xs font-medium tracking-[0.06em] text-ink uppercase">
          Slop Scorer / Notary
        </p>
        <h1 className="max-w-[20ch] text-h1 font-normal text-ink">
          A record of the making. Never a claim about the maker.
        </h1>
        <p className="max-w-[72ch] text-lead text-ink">
          Hand over the steps of a file&rsquo;s history and you get back a hash-linked chain, a root
          over it, and a credential that states what was recorded, how many authorities stamped it,
          and — in the same breath, every time — what a recorded process cannot show.
        </p>
      </header>

      <section aria-labelledby="submit" className="flex flex-col gap-5">
        <h2 id="submit" className="text-h3 font-medium text-ink">
          Record a chain
        </h2>
        <Submit />
      </section>

      <section aria-labelledby="not-checked" className="flex flex-col gap-5">
        <h2 id="not-checked" className="text-h3 font-medium text-ink">
          What this does not check
        </h2>
        <p className="max-w-[72ch] text-body text-ink">
          Printed here and printed again on every credential, in the package&rsquo;s own words rather
          than a summary of them:
        </p>
        <p
          data-doc
          className="max-w-[72ch] border-l border-border-control bg-surface-raised px-5 py-4 text-body text-ink"
        >
          {LIMITATION}
        </p>
        <p
          data-doc
          className="max-w-[72ch] border-l border-border-control bg-surface-raised px-5 py-4 text-body text-ink"
        >
          {VERIFICATION_CAVEAT}
        </p>
        <div className="flex flex-col gap-3">
          <p className="font-mono text-mono-xs font-medium tracking-[0.06em] text-ink uppercase">
            Checked on every token
          </p>
          <ul className="flex max-w-[72ch] list-none flex-col gap-2 text-body text-ink">
            {TOKEN_VERIFICATION_SCOPE.checked.map((line) => (
              <li key={line} className="border-l border-hairline pl-5">
                {line}
              </li>
            ))}
          </ul>
          <p className="font-mono text-mono-xs font-medium tracking-[0.06em] text-ink uppercase">
            Not checked
          </p>
          <ul className="flex max-w-[72ch] list-none flex-col gap-2 text-body text-ink">
            {TOKEN_VERIFICATION_SCOPE.notChecked.map((line) => (
              <li key={line} className="border-l border-border-control pl-5">
                {line}
              </li>
            ))}
          </ul>
          <p className="max-w-[72ch] font-mono text-mono-sm text-ink-muted">
            Close that gap yourself: {TOKEN_VERIFICATION_SCOPE.independentCheck}
          </p>
        </div>
      </section>

      <section aria-labelledby="this-build" className="flex flex-col gap-5">
        <h2 id="this-build" className="text-h3 font-medium text-ink">
          What this build is
        </h2>
        <ul className="flex max-w-[72ch] list-none flex-col gap-4 text-body text-ink">
          <li className="border-l border-border-control pl-5">{PERSISTENCE}</li>
          <li className="border-l border-border-control pl-5">{STAMPING_NOTE}</li>
          <li className="border-l border-border-control pl-5">
            Your file is not uploaded. It is hashed in your browser and only the digest, the byte
            count and the time your filesystem carries are submitted. So the digest is your claim;
            what is ours is when we saw it, the leaf we computed over it, the link to the step
            before it and the root over all of them.
          </li>
          <li className="border-l border-border-control pl-5">
            There is nowhere in this system to put a person. No name, no face, no document, no
            keystroke trace, no email — not because we chose not to display them, but because no
            type in the package has a field for one.{" "}
            <Link href="/notary/verify" className="text-ink-accent underline underline-offset-4">
              Verify a credential
            </Link>{" "}
            and you will see the same thing from the other side.
          </li>
        </ul>
      </section>
    </div>
  );
}
