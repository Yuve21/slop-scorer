import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import {
  PERSISTENCE,
  TIMING_NOTE,
  corpusVersions,
  gauntlet,
  isParticipantId,
  newParticipantId,
  poolEntries,
} from "@/lib/gauntlet/store";
import { absolute } from "@/lib/site";
import { PARTICIPANT_COOKIE } from "./links";
import { Round } from "./round";

/**
 * The gauntlet.
 *
 * `novel-mechanics.md` #6 asks for the one surface that shows value before the visitor does
 * any work, and this is it: five artifacts, one of them made by a person, no upload, no
 * account, no key. It is also the only honest way this product will ever publish an accuracy
 * claim — a per-artifact record of how often PEOPLE find the human-made one, on the same
 * provenanced corpus the detector is calibrated against.
 *
 * THREE THINGS THIS PAGE IS CAREFUL ABOUT, all of them stated on the page itself rather than
 * only here:
 *
 *  1. NOTHING IS SAVED. There is no database behind this build. `PERSISTENCE` says so in the
 *     copy, because a streak that renders like a record and evaporates on the next deploy is
 *     the "looks finished, isn't" defect this product exists to catch.
 *  2. NO TIMING FIGURE. With no ticket secret configured the service marks every guess
 *     `timingDisputed` and excludes it from published figures rather than recording a duration
 *     the browser chose. `TIMING_NOTE` is that, out loud.
 *  3. THE ROUND IS DERIVABLE. The corpus is public, in this repository, and a round is a pure
 *     function of the day and the pool. Anyone willing to run the builder can compute today's
 *     answer. We are not going to pretend otherwise to make the game feel more secure than it
 *     is; the seed is printed for the same reason, so a player can check after the fact that
 *     the round was not rebuilt around them.
 *
 * `force-dynamic` because the round is a function of today's date and of a per-visitor cookie.
 * A statically rendered puzzle would serve one day's cards forever.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "The gauntlet: five artifacts, one made by a person",
  description:
    "Five cards drawn from our provenanced corpus. Four came out of a generator and one did not. Find it, then read what our own detector made of all five.",
  alternates: { canonical: "/gauntlet" },
  openGraph: {
    title: "The gauntlet · Slop Scorer",
    description:
      "Five artifacts, one made by a person. No upload, no account, no key. The reveal shows the label, its stated basis, and our detector's own reading of every card.",
    url: absolute("/gauntlet"),
    type: "website",
  },
};

export default async function GauntletPage() {
  const jar = await cookies();
  const existing = jar.get(PARTICIPANT_COOKIE)?.value;
  // A Server Component cannot set a cookie during render, so a first-time visitor gets an id
  // minted here and carried in the form; the action writes it to the jar on their first guess.
  const participantId = isParticipantId(existing) ? existing : newParticipantId();

  const service = await gauntlet();
  const { view } = await service.dailyRound({ participantId });

  const pool = poolEntries();
  const versions = corpusVersions();

  return (
    <div className="mx-auto flex max-w-page flex-col gap-16 px-6 py-16 md:px-[72px]">
      <header className="flex flex-col gap-5">
        <p className="font-mono text-mono-xs font-medium tracking-[0.06em] text-ink uppercase">
          Slop Scorer / Gauntlet · {versions.code} + {versions.web}
        </p>
        <h1 className="max-w-[20ch] text-h1 font-normal text-ink">
          You have looked at a thousand of these. Prove it on five.
        </h1>
        <p className="max-w-[72ch] text-lead text-ink">
          Each round draws five artifacts from the same corpus this detector is calibrated
          against. Four of them came out of a generator, and every one of those four says so in
          its own markup or its own README. One was made by a person, and the basis for that
          label is printed under it the moment you answer.
        </p>
      </header>

      <Round
        roundId={view.roundId}
        ticket={view.ticket}
        participantId={participantId}
        dayKey={view.dayKey}
        prompt={view.prompt}
        cards={view.cards.map((c) => ({
          cardId: c.cardId,
          medium: c.medium,
          summary: c.summary,
          panels: c.panels.map((p) => ({ heading: p.heading, lines: p.lines })),
        }))}
      />

      <section aria-labelledby="honesty" className="flex flex-col gap-5">
        <h2 id="honesty" className="text-h3 font-medium text-ink">
          What this game is and is not
        </h2>
        <ul className="flex max-w-[72ch] list-none flex-col gap-4 text-body text-ink">
          <li className="border-l border-border-control pl-5">{PERSISTENCE}</li>
          <li className="border-l border-border-control pl-5">{TIMING_NOTE}</li>
          <li className="border-l border-border-control pl-5">
            The pool holds {pool.length} artifacts, {pool.filter((p) => p.label === "human").length}{" "}
            of them labelled as made by a person. Every label carries a stated basis a stranger can
            check, and the generated members were labelled because they name their own generator,
            not because we thought they looked like it.
          </li>
          <li className="border-l border-border-control pl-5">
            Nothing on a card names a person. Commit history is never presented, and every line that
            does reach a card has had names, emails, handles, copyright lines and links removed
            first. That is a rule with a test behind it, not an intention.
          </li>
          <li className="border-l border-border-control pl-5">
            A round is a pure function of the day and the pool, and the pool is public in our
            repository, so anybody determined enough can compute the answer instead of reading the
            cards. The seed above is published for the same reason: it is what lets you check the
            round was not rebuilt around your answer.
          </li>
          <li className="border-l border-border-control pl-5">
            Winning a round says nothing about you and losing one says nothing about the artifact.
            The number this is being built to produce — how often people find the human-made one,
            per artifact, with an interval — needs a sample nobody has collected yet, and it will
            be published with its sample size or not at all.{" "}
            <Link href="/method" className="text-ink-accent underline underline-offset-4">
              The method page
            </Link>{" "}
            is where the detector's side of that already lives.
          </li>
        </ul>
        <p className="font-mono text-mono-sm text-ink-muted">Round seed: {view.seed}</p>
      </section>
    </div>
  );
}
