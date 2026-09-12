import type { MetadataRoute } from "next";
import { SAMPLE_IDS } from "@/lib/sample-ids";
import { absolute } from "@/lib/site";

/**
 * The sitemap enumerates the real routes and nothing else.
 *
 * The sample receipts are in it because every artifact behind them is ours. Receipts about
 * somebody else's artifact would not be: our own legal research is explicit that reports
 * should not be indexed by default, and a sitemap entry is a request to index.
 *
 * The gauntlet and its per-artifact readings were REMOVED on 2026-09-11 rather than de-indexed:
 * it was the demo of a product that is no longer sold. The reasoning it used to carry still
 * governs whatever replaces it, so it stays written down here instead of leaving with the route.
 * A page that is a real reading about somebody else's public work declares `robots: noindex`, and
 * a sitemap entry is a request to index.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: absolute("/"), lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: absolute("/method"), lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: absolute("/mcp"), lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: absolute("/notary"), lastModified: now, changeFrequency: "weekly", priority: 0.6 },
    { url: absolute("/notary/verify"), lastModified: now, changeFrequency: "weekly", priority: 0.4 },
    { url: absolute("/receipt"), lastModified: now, changeFrequency: "weekly", priority: 0.6 },
    { url: absolute("/receipt/self"), lastModified: now, changeFrequency: "daily", priority: 0.7 },
    ...SAMPLE_IDS.map((id) => ({
      url: absolute(`/receipt/${id}`),
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.5,
    })),
  ];
}
