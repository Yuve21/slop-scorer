/**
 * The two constants the gauntlet route needs that are not server actions.
 *
 * They lived in `actions.ts` until the build refused them: a `"use server"` module may export
 * ASYNC FUNCTIONS AND NOTHING ELSE, because every export becomes a callable endpoint. A cookie
 * name and a URL builder are neither, so they live here, in a module with no imports that both
 * the page and the action can read.
 */

/** Carries the participant id. Scoped to /gauntlet: nothing else in this app has a use for it. */
export const PARTICIPANT_COOKIE = "slop_gauntlet_participant";

/** `code:sinatra` -> `/gauntlet/artifact/code/sinatra`. The colon is not a path character. */
export const receiptHref = (artifactId: string): string => {
  const cut = artifactId.indexOf(":");
  return `/gauntlet/artifact/${artifactId.slice(0, cut)}/${artifactId.slice(cut + 1)}`;
};
