import Link from "next/link";
import { NAV } from "@/lib/site";

/**
 * Four items, no CTA button. The CTA is the whole fold (design/SURFACES.md B, row 1), and a
 * nav CTA on a page whose fold is already a live demo is a second ask competing with the
 * first one.
 *
 * The wordmark is set in mono at 13px with +0.08em. That is the top of the tracking range
 * the design allows and it is only allowed here, on two words, because a wordmark is a mark
 * rather than running text.
 */
export function SiteNav() {
  return (
    <header className="border-b border-hairline">
      <nav
        aria-label="Primary"
        className="mx-auto flex max-w-page items-baseline justify-between gap-8 px-6 py-5 md:px-16"
      >
        <Link
          href="/"
          className="font-mono text-mono-sm font-medium tracking-[0.08em] text-ink uppercase"
        >
          Slop Scorer
        </Link>
        <ul className="flex items-baseline gap-6 md:gap-8">
          {NAV.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className="text-sm text-ink-muted underline-offset-4 transition-colors hover:text-ink hover:underline"
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}
