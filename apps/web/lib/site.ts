/**
 * One place for the things every route's metadata needs.
 *
 * `siteUrl` is read from the environment because a canonical that points at a bare
 * preview subdomain is one of the defects our own corpus flags
 * (`builder.bare-platform-domain`), and hardcoding the production host would make every
 * local run lie about itself.
 */

export const SITE_NAME = "Slop Scorer";

export const siteUrl = (): string => {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  return "http://localhost:3000";
};

export const absolute = (path: string): string => new URL(path, `${siteUrl()}/`).href;

/**
 * Shown in the nav and used as the scan target of the self-scan. Four items were specified
 * in design/SURFACES.md; "Sign in" is not among these because there is no account system in
 * this build, and a nav item that leads nowhere is a scaffold artifact.
 *
 * The gauntlet used to lead. It was removed on 2026-09-11 with the rest of the verdict surface,
 * and the nav is now SHORTER rather than backfilled: a nav slot is a claim about what this product
 * is for, and inventing a replacement before the new surface exists would be a claim we cannot
 * meet. `/notary` stays deliberately absent for the same reason, though it remains a real route
 * linked from `/llms.txt`.
 */
export const NAV: readonly { readonly href: string; readonly label: string }[] = [
  { href: "/method", label: "Method" },
  // A real route rather than the old `/#mcp` anchor. The founder's complaint was that the
  // downloadable server was nowhere on the site, and a nav item that scrolls to a paragraph is
  // most of the way to being nowhere.
  { href: "/mcp", label: "MCP plugin" },
  { href: "/receipt/self", label: "Our own receipt" },
];
