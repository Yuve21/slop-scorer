import type { Metadata } from "next";
import "./globals.css";
import { Backdrop } from "@/components/site/backdrop";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteNav } from "@/components/site/site-nav";
import { SITE_NAME, siteUrl } from "@/lib/site";

/**
 * Root layout.
 *
 * Three things here are load-bearing against our own detector rather than merely tidy:
 *
 *  - NO `next/font/google`. Any Google Fonts request is a third-party font request, which is
 *    a tell we encode. The faces are IBM Plex Sans and IBM Plex Mono, self-hosted as subset
 *    woff2 out of /public/fonts and declared in globals.css. The scaffold this file replaced
 *    imported Geist and Geist Mono, which is doubly wrong: Geist is on the banned list in the
 *    design mandate.
 *    The two Regular files are preloaded by hand rather than by next/font, because they are
 *    referenced from a plain @font-face and the browser would otherwise not discover them
 *    until the stylesheet had parsed. Only the two Regulars: Medium is below the fold on
 *    every surface, and preloading a file the first screen does not use is a wasted request.
 *  - `title.template`, so no route can ship "Create Next App" (craft.scaffold-title).
 *  - `alternates.canonical` is deliberately NOT set here. Metadata is inherited, so a
 *    canonical in the root layout silently points every route at "/" and every receipt
 *    permalink would collapse into one indexed URL. Each route declares its own.
 */

const DESCRIPTION =
  "We do not score you. We try to remake the artifact, time ourselves doing it, and show you every measurement that let us take the shortcut. Abstention is a result.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: {
    default: "Slop Scorer: we remake the artifact and time ourselves doing it",
    template: `%s · ${SITE_NAME}`,
  },
  description: DESCRIPTION,
  applicationName: SITE_NAME,
  openGraph: {
    siteName: SITE_NAME,
    type: "website",
    locale: "en_US",
  },
  twitter: { card: "summary_large_image" },
  // Note the polarity, because someone will "harden" this on instinct for a product with
  // this brand: blocking AI crawlers is the defect our own corpus flags, not the fix.
  robots: { index: true, follow: true },
  formatDetection: { telephone: false, address: false, email: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full">
      <head>
        <link
          rel="preload"
          href="/fonts/IBMPlexSans-Regular.subset.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        <link
          rel="preload"
          href="/fonts/IBMPlexMono-Regular.subset.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
      </head>
      {/* `isolate` gives the page its own stacking context, so the backdrop's z-0 and the
          content's z-10 cannot be escaped by a stray z-index inside a component. */}
      <body className="isolate flex min-h-full flex-col bg-surface text-ink">
        <Backdrop />
        <div className="relative z-10 flex min-h-full flex-1 flex-col">
          <SiteNav />
          <main className="flex-1">{children}</main>
          <SiteFooter />
        </div>
      </body>
    </html>
  );
}
