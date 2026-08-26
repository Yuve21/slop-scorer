"use client";

import { useActionState } from "react";
import Link from "next/link";
import { submitGuess } from "./actions";
import type { GuessState, RevealCard } from "./types";

/**
 * The round, and its reveal.
 *
 * WHAT THIS COMPONENT IS NOT ALLOWED TO KNOW. It receives cards with an opaque per-round
 * handle, a medium, a summary and panels. There is no label prop, no artifact id prop and no
 * answer prop, because the server does not send them: the answer key arrives only as the
 * RETURN VALUE of a graded guess, in `state.cards`, which is why the un-answered render
 * cannot leak it even by accident.
 *
 * WHY NOTHING HERE ANIMATES. design/DESIGN.md §7: every moment animates a fact, and an
 * animation that cannot name the fact it reports does not get to move. A reveal transition
 * would report nothing the words do not already say, so the reveal arrives as a document —
 * the same way the receipt's evidence list arrives as one block. The only motion on this
 * route is the site's own 120 ms colour transition on hover and focus, which is a control
 * state rather than a beat.
 *
 * WHY NO COLOUR CARRIES THE RESULT. The palette has no severity ramp by design, and this is
 * the surface where somebody would reach for green-tick / red-cross first. Correct and
 * incorrect are set in words, in ink, and the answer is marked with a rule and a label rather
 * than a hue.
 */

const chip =
  "inline-flex items-center border border-border-control px-2 py-0.5 font-mono text-mono-xs " +
  "font-medium tracking-[0.06em] text-ink uppercase";

function Reading({ card }: { readonly card: RevealCard }) {
  const d = card.detector;
  return (
    <div className="flex flex-col gap-3 border-t border-hairline pt-4">
      <p className="font-mono text-mono-xs font-medium tracking-[0.06em] text-ink-muted uppercase">
        What our detector made of it
      </p>
      <p className="font-mono text-mono-sm text-ink">
        {d.status === "assessed" && d.score !== null
          ? `${d.score.toFixed(1)} / 100 · ${d.bandLabel}`
          : `${d.status.replace("_", " ")} · no score`}
        {" · "}
        {d.findingCount} {d.findingCount === 1 ? "finding" : "findings"}, {d.counterCount} counter
        {" · "}
        {d.elapsedMs.toFixed(1)} ms · {d.corpusVersion}
      </p>
      {d.top.length > 0 && (
        <ul className="flex list-none flex-col gap-1">
          {d.top.map((t) => (
            <li key={t.ruleId} className="font-mono text-mono-sm text-ink-muted">
              +{t.points.toFixed(1)} {t.ruleId} — {t.title}
            </li>
          ))}
        </ul>
      )}
      <p className="max-w-[72ch] text-sm text-ink-muted">
        Source: {card.source}. {card.provenance} Captured {card.captureDate}.
      </p>
      <Link
        href={card.receiptHref}
        className="w-fit font-mono text-mono-sm text-ink-accent underline underline-offset-4"
      >
        Read the full receipt for this artifact
      </Link>
    </div>
  );
}

export interface RoundCardProps {
  readonly cardId: string;
  readonly medium: string;
  readonly summary: string;
  readonly panels: readonly { readonly heading: string; readonly lines: readonly string[] }[];
}

export function Round({
  roundId,
  ticket,
  participantId,
  dayKey,
  prompt,
  cards,
}: {
  readonly roundId: string;
  readonly ticket: string;
  readonly participantId: string;
  readonly dayKey: string;
  readonly prompt: string;
  readonly cards: readonly RoundCardProps[];
}) {
  const [state, formAction, pending] = useActionState<GuessState, FormData>(submitGuess, {
    status: "idle",
  });

  const revealed = state.status === "revealed" ? state : null;
  const byHandle = new Map((revealed?.cards ?? []).map((c) => [c.cardId, c]));

  return (
    <form action={formAction} className="flex flex-col gap-11">
      <input type="hidden" name="roundId" value={roundId} />
      <input type="hidden" name="ticket" value={ticket} />
      <input type="hidden" name="participantId" value={participantId} />

      <div className="flex flex-col gap-4">
        <h2 id="round-prompt" className="max-w-[24ch] text-h2 font-normal text-ink">
          {prompt}
        </h2>
        <p className="font-mono text-mono-sm text-ink-muted">
          Round {dayKey} · five cards · one guess
        </p>
      </div>

      {state.status === "refused" && (
        <p
          role="status"
          data-doc
          className="border border-border-control bg-surface-raised px-5 py-4 font-mono text-mono-md text-ink"
        >
          {state.reason}
        </p>
      )}

      {revealed && (
        <div
          data-doc
          role="status"
          className="flex flex-col gap-3 border border-border-control bg-surface-raised px-5 py-5"
        >
          <p className="text-h3 font-medium text-ink">
            {revealed.correct ? "You found it." : "That was one of the four."}
          </p>
          <p className="max-w-[72ch] text-body text-ink">
            {revealed.correct
              ? "The card you chose is the one whose label says a person made it, and the basis for that label is printed under it below."
              : "The card you chose came out of a generator. The one that did not is marked below, with the stated basis for every label in the round."}
          </p>
          {revealed.replayed ? (
            <p className="font-mono text-mono-sm text-ink-muted">
              You had already answered this round. The first answer is the one that counts, so this is
              it again rather than a second try.
            </p>
          ) : (
            revealed.currentStreak !== null && (
              <p className="font-mono text-mono-sm text-ink-muted">
                Streak {revealed.currentStreak} · longest {revealed.longestStreak}. Held in memory
                only; see the note at the foot of this page.
              </p>
            )
          )}
        </div>
      )}

      <ul aria-labelledby="round-prompt" className="grid list-none gap-5 md:grid-cols-2 xl:grid-cols-3">
        {cards.map((card, index) => {
          const reveal = byHandle.get(card.cardId) ?? null;
          return (
            <li
              key={card.cardId}
              data-doc
              className={`flex flex-col gap-4 bg-surface-raised px-5 py-5 ${
                reveal?.isAnswer ? "border-2 border-border-control" : "border border-hairline"
              }`}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-hairline pb-3">
                <p className="font-mono text-mono-xs font-medium tracking-[0.06em] text-ink uppercase">
                  Card {index + 1} · {card.medium}
                </p>
                {reveal ? (
                  <span className={chip}>
                    {reveal.label === "human" ? "made by a person" : "generated"}
                    {reveal.chosen ? " · your pick" : ""}
                  </span>
                ) : (
                  <span className="font-mono text-mono-xs tracking-[0.06em] text-ink-muted uppercase">
                    unlabelled
                  </span>
                )}
              </div>

              <p className="font-mono text-mono-sm text-ink-muted">{card.summary}</p>

              {card.panels.map((panel) => (
                <div key={panel.heading} className="flex flex-col gap-1">
                  <p className="font-mono text-mono-xs font-medium tracking-[0.06em] text-ink uppercase">
                    {panel.heading}
                  </p>
                  <ul className="flex list-none flex-col gap-1">
                    {panel.lines.map((l, i) => (
                      <li
                        key={`${panel.heading}-${i}`}
                        className="font-mono text-mono-sm break-words text-ink"
                      >
                        {l}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}

              {reveal ? (
                <Reading card={reveal} />
              ) : (
                <button
                  type="submit"
                  name="chosenIndex"
                  value={index}
                  disabled={pending}
                  className="mt-auto w-fit rounded-control border border-border-control bg-ink-accent px-[22px] py-[14px] text-body font-medium text-ink-accent-fg disabled:opacity-60"
                >
                  {pending ? "Grading…" : "A person made this one"}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </form>
  );
}
