/**
 * What crosses the boundary on the notary routes. No imports, for the same reason
 * `app/gauntlet/types.ts` has none: this module is pulled into the browser bundle and must
 * never drag a `server-only` module in behind it.
 *
 * `statement` is the credential text VERBATIM as `@slop/notary` composed it. It is never
 * reworded, shortened, re-cased, split or summarised anywhere in this app: the package's
 * `assertAttestable` is what makes the sentence safe to publish, and a paraphrase is a
 * sentence nobody checked. The verify route reproduces it from the facts and reports whether
 * it still matches, which is how a reworded credential would be caught.
 */

export interface CredentialCard {
  readonly credentialId: string;
  readonly chainId: string;
  readonly rootSha256: string;
  /** Verbatim. Rendered as one block of text and nothing else. */
  readonly statement: string;
  readonly statementVersion: number;
  readonly eventCount: number;
  readonly authorityCount: number;
  readonly jurisdictionCount: number;
  readonly earliestGenTime: string | null;
  readonly issuedAt: string;
  /** Every step as recorded, so the holder can see exactly what was committed to. */
  readonly events: readonly {
    readonly sequence: number;
    readonly kind: string;
    readonly contentSha256: string;
    readonly byteLength: number;
    readonly declaredAt: string;
    readonly recordedAt: string;
    readonly leafSha256: string;
  }[];
  /** The self-contained bundle a stranger can verify without this server. */
  readonly bundle: string;
}

export type NotaryState =
  | { readonly status: "idle" }
  | { readonly status: "issued"; readonly credential: CredentialCard }
  | { readonly status: "refused"; readonly reason: string };

export type VerifyState =
  | { readonly status: "idle" }
  | {
      readonly status: "checked";
      /** `formatVerification` output, verbatim. Counts and named problems, no adjectives. */
      readonly report: string;
      readonly recordIntact: boolean;
      readonly statementReproduced: boolean | null;
      readonly statement: string;
    }
  | { readonly status: "refused"; readonly reason: string };
