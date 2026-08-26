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
 * That is exactly why `/gauntlet/artifact/*` is absent. Those pages are real receipts about
 * corpus members, most of which are somebody else's public work, and every one of them declares
 * `robots: noindex`. `/gauntlet` itself is here; the readings behind its cards are not.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: absolute("/"), lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: absolute("/method"), lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: absolute("/mcp"), lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: absolute("/gauntlet"), lastModified: now, changeFrequency: "daily", priority: 0.8 },
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
