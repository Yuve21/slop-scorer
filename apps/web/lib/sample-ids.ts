/**
 * The sample receipt ids, and NOTHING else.
 *
 * This module exists because of a specific failure. `lib/receipts.ts` is `server-only` and it
 * pulls in `@slop/core` and the whole `@slop/detectors-web` corpus, because it builds every
 * sample receipt through the same `buildReport` the live scan uses. That is right for the page
 * body and wrong for the two entry points that only need a LIST OF FOUR STRINGS:
 *
 *   generateStaticParams   in app/receipt/[id]/page.tsx
 *   sitemap                in app/sitemap.ts
 *
 * Next evaluates those outside the page render, in its own worker process, and `server-only`
 * throws hard the moment it is loaded anywhere the `react-server` export condition is not
 * applied ("This module cannot be imported from a Client Component module"). A throw inside
 * that worker does not surface as a stack: it surfaces as
 * "Jest worker encountered 2 child process exceptions, exceeding retry limit", and every route
 * that has a `generateStaticParams` answers 500 while every route that does not keeps working.
 * That is exactly the failure this file was extracted to remove, and the partition it produces
 * is the fingerprint to look for if it ever comes back.
 *
 * So: no `server-only` here, no `@slop/*` import here, no report machinery here. If this file
 * ever grows an import, that is the regression.
 *
 * This list is the OWNER of the ids. `lib/receipts.ts` asserts its builders match it at module
 * load, so the two cannot drift without the app refusing to start.
 */

export const SAMPLE_IDS = ["4F2A-9C", "8B10-2D", "C7E3-51", "A05E-13"] as const;

export type SampleId = (typeof SAMPLE_IDS)[number];

/** Narrow an arbitrary string to a sample id. Kept here so callers never widen the tuple. */
export const isSampleId = (id: string): id is SampleId =>
  (SAMPLE_IDS as readonly string[]).includes(id);
