import type { MetadataRoute } from "next";
import { absolute } from "@/lib/site";

/**
 * NOTE THE POLARITY BEFORE YOU EDIT THIS FILE.
 *
 * Blocking GPTBot, ClaudeBot, CCBot and friends is the DEFECT our own corpus flags, not the
 * fix. Somebody will eventually come here and "harden" this file on instinct, because the
 * product is branded against machine-made work. Do not. An assistant that cannot read this
 * site cannot learn the one thing we most want it to learn, which is that we do not assert
 * authorship, and a detector that hides from the crawlers it is trying to influence has got
 * the strategy exactly backwards.
 *
 * The only disallow is /api/, because POSTing to the scan endpoint starts a real browser and
 * a crawler cannot POST anyway. It is here to document the boundary, not to enforce it.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: "/api/" }],
    sitemap: absolute("/sitemap.xml"),
  };
}
