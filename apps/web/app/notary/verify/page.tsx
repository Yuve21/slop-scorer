import type { Metadata } from "next";
import Link from "next/link";
import { TOKEN_VERIFICATION_SCOPE } from "@slop/notary";
import { absolute } from "@/lib/site";
import { VerifyForm } from "./verify-form";

/**
 * Verification, performed as if by somebody who does not trust us.
 *
 * This is the half that makes the other half worth anything. A credential nobody can check
 * independently is a badge, and a badge is a marketing asset with a liability attached. The
 * check recomputes rather than reads: the root is rebuilt from the event fields, each token is
 * re-parsed from its stored DER and compared against that recomputed root, and the statement is
 * rebuilt from the same facts and compared with the stored text. It touches no network, so the
 * same bundle verifies offline, in a different build, on somebody else's machine.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Verify a credential",
  description:
    "Re-check a notary credential from its bundle: the root is recomputed from the steps, every timestamp token is re-parsed against it, and the statement is rebuilt from the facts. No network, no account.",
  alternates: { canonical: "/notary/verify" },
  openGraph: {
    title: "Verify a credential · Slop Scorer",
    description:
      "Recomputes rather than reads. The bundle verifies offline, in a different build, on somebody else's machine.",
    url: absolute("/notary/verify"),
    type: "website",
  },
};

export default function VerifyPage() {
  return (
    <div className="mx-auto flex max-w-receipt flex-col gap-16 px-6 py-16 md:px-[72px]">
      <header className="flex flex-col gap-5">
        <p className="font-mono text-mono-xs font-medium tracking-[0.06em] text-ink uppercase">
          Slop Scorer / Notary / Verify
        </p>
        <h1 className="max-w-[20ch] text-h1 font-normal text-ink">
          Check it as though you did not trust us.
        </h1>
        <p className="max-w-[72ch] text-lead text-ink">
          Paste a bundle. The root is recomputed from the steps rather than read off the
          credential, every stored token is re-parsed against that recomputed root, and the
          statement is rebuilt from the same facts and compared with the text that was issued. None
          of it touches a network, which is why the tokens are stored in full instead of as a
          boolean.
        </p>
      </header>

      <VerifyForm />

      <section aria-labelledby="scope" className="flex flex-col gap-5">
        <h2 id="scope" className="text-h3 font-medium text-ink">
          The edge of this check
        </h2>
        <p className="max-w-[72ch] text-body text-ink">
          What comes back is about the RECORD: that these steps were recorded in this order and
          stamped at these times. It is not about the artifact and it is not about anybody. Two
          things in particular are not checked here, and they are the same two named on{" "}
          <Link href="/notary" className="text-ink-accent underline underline-offset-4">
            the notary page
          </Link>{" "}
          and on every credential:
        </p>
        <ul className="flex max-w-[72ch] list-none flex-col gap-2 text-body text-ink">
          {TOKEN_VERIFICATION_SCOPE.notChecked.map((line) => (
            <li key={line} className="border-l border-border-control pl-5">
              {line}
            </li>
          ))}
        </ul>
        <p className="max-w-[72ch] font-mono text-mono-sm text-ink-muted">
          {TOKEN_VERIFICATION_SCOPE.independentCheck}
        </p>
      </section>
    </div>
  );
}
