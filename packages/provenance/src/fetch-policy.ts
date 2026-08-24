/**
 * What we will and will not go and get.
 *
 * This module exists so that "we did not fetch that" is a TYPE rather than a decision made
 * again at every call site. `market-check-reproduction.md` records the founder-level version
 * of the same rule for the reproduction path: no URL-scraping ingest. The reasoning carries
 * over unchanged to detection, and hardens for the video modality, where every interesting
 * URL belongs to a platform whose terms forbid automated retrieval.
 *
 * The decision, stated plainly so it can be argued with:
 *
 *   A product whose entire pitch is "we tell you what is verifiable" cannot have a scraper
 *   in it. If we route around a platform's access controls to get the bytes, then every
 *   receipt we print rests on an act we would not want printed on it. There is also a
 *   practical reason that is just as decisive: what a scraper gets back is the PLATFORM'S
 *   transcode, and the re-encoding gate would refuse to score it anyway. We would be
 *   breaking terms of service to obtain an artifact we have already committed to abstaining
 *   on.
 *
 * So a platform URL returns a typed `cannot_fetch` outcome that names the constraint and
 * asks for the file. That is a worse conversion rate and a better product.
 */

/** Hosts whose terms prohibit automated retrieval of member content. Not exhaustive. */
const PLATFORM_HOSTS: readonly { readonly pattern: RegExp; readonly name: string }[] = [
  { pattern: /(^|\.)tiktok\.com$/i, name: "TikTok" },
  { pattern: /(^|\.)instagram\.com$/i, name: "Instagram" },
  { pattern: /(^|\.)youtube\.com$/i, name: "YouTube" },
  { pattern: /(^|\.)youtu\.be$/i, name: "YouTube" },
  { pattern: /(^|\.)facebook\.com$/i, name: "Facebook" },
  { pattern: /(^|\.)x\.com$/i, name: "X" },
  { pattern: /(^|\.)twitter\.com$/i, name: "X" },
  { pattern: /(^|\.)snapchat\.com$/i, name: "Snapchat" },
  { pattern: /(^|\.)threads\.net$/i, name: "Threads" },
  { pattern: /(^|\.)reddit\.com$/i, name: "Reddit" },
  { pattern: /(^|\.)linkedin\.com$/i, name: "LinkedIn" },
  { pattern: /(^|\.)vimeo\.com$/i, name: "Vimeo" },
  { pattern: /(^|\.)twitch\.tv$/i, name: "Twitch" },
];

export type FetchDecision =
  | { readonly allowed: true; readonly url: string }
  | {
      readonly allowed: false;
      readonly code: "cannot_fetch";
      readonly reason: "platform_terms" | "unsupported_scheme" | "not_a_url";
      readonly platform: string | null;
      readonly detail: string;
    };

/**
 * Decide whether a URL may be retrieved.
 *
 * The default for an unrecognised host is ALLOWED, because a person's own site or a direct
 * link to a file they control is the normal permitted case. The list above is the exception,
 * and it is a list of platforms rather than a heuristic, because guessing at "is this a
 * platform" would either block half the web or none of it.
 */
export function decideFetch(rawUrl: string): FetchDecision {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return {
      allowed: false,
      code: "cannot_fetch",
      reason: "not_a_url",
      platform: null,
      detail: `We were given "${rawUrl}", which we could not read as a URL, so we did not try to retrieve anything.`,
    };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return {
      allowed: false,
      code: "cannot_fetch",
      reason: "unsupported_scheme",
      platform: null,
      detail: `We only retrieve over http and https. This link uses "${url.protocol}", so we did not try.`,
    };
  }
  const hit = PLATFORM_HOSTS.find((h) => h.pattern.test(url.hostname));
  if (hit) {
    return {
      allowed: false,
      code: "cannot_fetch",
      reason: "platform_terms",
      platform: hit.name,
      detail: platformRefusal(hit.name),
    };
  }
  return { allowed: true, url: url.toString() };
}

/**
 * The sentence a user sees. Says what WE decided and why, offers the route that works, and
 * makes no claim about the artifact, which we have not seen.
 */
export function platformRefusal(platform: string): string {
  return (
    `We did not retrieve this. ${platform} prohibits automated downloading of member content, and we do not route ` +
    `around access controls to obtain an artifact. There is a second reason that would apply even if the terms did ` +
    `not: what a download returns is the platform's own transcode, and our re-encoding gate declines to report a ` +
    `score for re-encoded bytes, so we would be breaking an agreement to obtain a file we had already committed to ` +
    `abstaining on. Save the file and hand it to us directly, ideally as it left the tool that wrote it, and we can ` +
    `read what it declares about itself.`
  );
}

/** Exported so a test can assert the table is not empty and the patterns are anchored. */
export const PLATFORM_HOST_PATTERNS = PLATFORM_HOSTS;
