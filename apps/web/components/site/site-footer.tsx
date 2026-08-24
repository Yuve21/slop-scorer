import Link from "next/link";

/**
 * One honest human line, then the standing legal position. Both are permanent fixtures
 * rather than a cookie strip: the second paragraph is the sentence a reader needs before
 * they treat any receipt on this site as an accusation, so it sits on every route.
 */
export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-hairline">
      <div className="mx-auto flex max-w-page flex-col gap-5 px-6 py-11 md:flex-row md:items-start md:justify-between md:px-16">
        <p className="max-w-[52ch] text-sm text-ink-muted">
          Built by one person who got tired of arguing about whether something was made by a
          machine, and decided to measure how long it takes to remake it instead.
        </p>
        <div className="flex flex-col gap-2 text-sm text-ink-muted md:items-end">
          <p className="max-w-[46ch] md:text-right">
            We do not name creators. We do not assert that anything is AI. Read the method
            before you read a receipt.
          </p>
          <Link href="/method" className="text-ink-accent underline-offset-4 hover:underline">
            The method, and what it cannot see
          </Link>
        </div>
      </div>
    </footer>
  );
}
