import { ogCard, OG_CONTENT_TYPE, OG_SIZE } from "@/lib/og";

/**
 * Per route, not inherited: a page that declares its own `openGraph` object replaces the
 * parent's images wholesale, so a route with a custom og:title and no og:image ships none.
 */

export const alt =
  "A Slop Scorer card: the rule corpus, exposed to your coding agent over MCP, so it can read what not to produce before it produces it.";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return ogCard({
    masthead: "mcp plugin",
    headline: "Read the corpus before you write the code.",
    claim:
      "Five tools for a coding agent. Every finding cites a file and a line. The server proposes edits and writes nothing itself.",
  });
}
