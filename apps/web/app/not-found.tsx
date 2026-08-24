import Link from "next/link";

/**
 * A real 404.
 *
 * Two failure modes this file exists to prevent, both of which our own corpus flags and both
 * of which shipped in the codebase this design system was learned from:
 *
 *   - An unknown path that 307s to a sign-in route. There is no proxy or middleware in this
 *     app, and if one is ever added it must exempt unknown paths, robots.txt, sitemap.xml and
 *     opengraph-image, or those four things start answering with a redirect.
 *   - A soft 200: a "not found" page served with a success status. Next returns 404 for this
 *     file on a non-streamed response, and the page is well over the 800-byte floor our own
 *     hygiene check uses to distinguish a real page from a stub.
 *
 * The page is a receipt, in the product's own format, because a 404 is a genuine instance of
 * the thing this product keeps insisting on: nothing was assessed, and that is a result.
 */
export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-receipt flex-col gap-11 px-6 py-16 md:px-[72px]">
      <div className="flex flex-wrap items-baseline justify-between gap-4 border-b border-hairline pb-4">
        <p className="font-mono text-mono-xs font-medium tracking-[0.06em] text-ink uppercase">
          Slop Scorer / Receipt
        </p>
        <p className="font-mono text-mono-xs font-medium tracking-[0.06em] text-ink-muted uppercase">
          404 · no artifact at this address
        </p>
      </div>

      <h1 className="max-w-[16ch] text-display font-normal text-ink">Not assessed.</h1>

      <p className="max-w-[72ch] text-lead text-ink">
        There is no page here, so nothing was examined. We are telling you that in the same
        words we would use on a real report, because it is the same situation: a check did not
        run, and the absence of a finding is not a finding.
      </p>

      <div data-doc className="border border-border-control bg-surface-raised">
        <div className="flex flex-col gap-3 p-5">
          <p className="font-mono text-mono-md font-medium text-ink">WHAT WE COULD NOT ASSESS</p>
          <p className="max-w-[72ch] font-mono text-mono-md text-ink">
            All of it. The address you asked for does not resolve to an artifact, a receipt or a
            rule. Nothing about this is an error on your side, and nothing about it is an error
            on ours either: you asked for something that is not here, and this is the honest
            answer to that.
          </p>
        </div>
        <p className="border-t border-hairline px-5 py-3 font-mono text-mono-sm text-ink-muted">
          HTTP 404. This page is served with the status it claims, which is a thing our own
          corpus checks for and a thing a surprising number of sites get wrong.
        </p>
      </div>

      <nav aria-label="Recover" className="flex flex-wrap gap-6 text-body">
        <Link href="/" className="text-ink-accent underline-offset-4 hover:underline">
          The live scan of this site
        </Link>
        <Link href="/receipt" className="text-ink-accent underline-offset-4 hover:underline">
          The sample receipts
        </Link>
        <Link href="/method" className="text-ink-accent underline-offset-4 hover:underline">
          The method
        </Link>
      </nav>
    </div>
  );
}
