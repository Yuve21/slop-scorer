import type { Metadata } from "next";
import "./globals.css";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteNav } from "@/components/site/site-nav";
import { SITE_NAME, siteUrl } from "@/lib/site";

/**
 * Root layout.
 *
 * Three things here are load-bearing against our own detector rather than merely tidy:
 *
 *  - NO `next/font/google`. Any Google Fonts request is a third-party font request, which is
 *    a tell we encode. The faces are declared in globals.css against local sources only.
 *    The scaffold this file replaced imported Geist and Geist Mono, which is doubly wrong:
 *    Geist is on the banned list in the design mandate.
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
      <body className="flex min-h-full flex-col bg-surface text-ink">
        <SiteNav />
        <main className="flex-1">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
