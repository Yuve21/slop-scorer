import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { FORBIDDEN_VIEW_FIELDS } from "@slop/gauntlet";

/**
 * THE ROUTE MUST NOT LEAK THE ANSWER, and the package's own leak test cannot see the route.
 *
 * `packages/gauntlet/test/corpus.test.ts` serialises a `RoundView` built from the corpus and
 * greps it. That holds one seam. This file holds the two after it:
 *
 *  1. THE APP'S OWN PAYLOAD. The route serves a view built from `lib/gauntlet/pool.json` — a
 *     committed snapshot, not the corpus loader — through this app's own service configuration.
 *     A snapshot that carried a stray field, or a service configured with the wrong corpus,
 *     would pass the package's test and fail here. This is also the object React serialises
 *     into the RSC payload as props for the client component, so it is the real wire.
 *  2. THE RENDERED HTML. A Server Component renders whatever it was handed, so a page can be
 *     given a clean view and still print an answer next to it.
 *
 * Both greps are mutation-tested against a component that does leak, because every assertion
 * here passes trivially against an empty string.
 *
 * `next/headers` is mocked because `cookies()` throws outside a request scope and there is no
 * public request-scope harness. The mock returns an empty jar, which is the first-time-visitor
 * path — the one where the page mints a participant id rather than reading one.
 */

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => undefined }),
}));

const { default: GauntletPage } = await import("@/app/gauntlet/page");
const { default: GauntletArtifactPage, generateStaticParams } = await import(
  "@/app/gauntlet/artifact/[corpus]/[name]/page"
);
const { Round } = await import("@/app/gauntlet/round");
const { PERSISTENCE, gauntlet, poolEntries } = await import("@/lib/gauntlet/store");
const { default: POOL_IDS } = await import("@/lib/gauntlet/pool-ids.json");

const pool = poolEntries();

// `GauntletPage` takes no props: it is a leaf route with no dynamic segment and it reads the
// participant from the cookie jar rather than the query string. Passing it the usual
// `{ params, searchParams }` pair type-errors, which is the signature drifting under the test.
const renderPage = async (): Promise<string> => renderToStaticMarkup(await GauntletPage());

const servedView = async () => {
  const service = await gauntlet();
  const { view } = await service.dailyRound({ participantId: "00000000-0000-4000-8000-000000000000" });
  return view;
};

describe("the gauntlet page serves a real round", () => {
  it("renders five cards with content on them", async () => {
    const html = await renderPage();
    // The denominator: every assertion below is vacuous against a page that rendered nothing.
    expect(html).toContain("Slop Scorer / Gauntlet");
    expect(html.match(/Card \d · (code|web)/g) ?? []).toHaveLength(5);
    expect(html).toContain("A person made this one");
    expect(html.length).toBeGreaterThan(4_000);
  });

  it("states plainly that nothing is saved", async () => {
    // The instruction kept as an assertion rather than a good intention: a streak that renders
    // like a record and evaporates on the next deploy is the exact "looks finished, isn't"
    // defect this product exists to catch.
    expect(await renderPage()).toContain(PERSISTENCE);
    expect(PERSISTENCE).toMatch(/no database/i);
  });

  it("has a pool with both labels and both media, so a round is winnable and not guessable", () => {
    expect(pool.length).toBeGreaterThanOrEqual(15);
    expect(pool.filter((p) => p.label === "human").length).toBeGreaterThanOrEqual(5);
    expect(pool.filter((p) => p.label === "generated").length).toBeGreaterThanOrEqual(6);
    for (const label of ["human", "generated"] as const) {
      const media = new Set(pool.filter((p) => p.label === label).map((p) => p.corpus));
      expect([...media].sort(), `every ${label} member is one medium`).toEqual(["code", "web"]);
    }
  });
});

describe("the payload this route serves leaks nothing", () => {
  it("carries no corpus id, no label, no provenance and no forbidden field", async () => {
    const json = JSON.stringify(await servedView());

    expect(json).not.toContain("humanIndex");
    expect(json).not.toContain("human_index");
    expect(json).not.toContain('"label"');
    for (const value of ["human", "generated"]) {
      expect(json.toLowerCase(), `the view mentions "${value}"`).not.toContain(`"${value}"`);
    }
    for (const entry of pool) {
      expect(json, `the view carries the corpus id ${entry.artifactId}`).not.toContain(entry.artifactId);
      expect(json, `the view carries the provenance of ${entry.artifactId}`).not.toContain(entry.provenance);
      expect(json, `the view carries the source of ${entry.artifactId}`).not.toContain(entry.source);
    }
    for (const field of FORBIDDEN_VIEW_FIELDS) {
      expect(json, `the view has a "${field}" field`).not.toContain(`"${field}":`);
    }
  });

  it("keys its cards by an opaque per-round handle", async () => {
    const view = await servedView();
    expect(view.cards).toHaveLength(5);
    expect(new Set(view.cards.map((c) => c.cardId)).size).toBe(5);
    expect(view.cards.every((c) => /^[0-9a-f]{16}$/.test(c.cardId))).toBe(true);
    expect(view.cards.every((c) => c.panels.length > 0)).toBe(true);
    // The ids are descriptive on purpose and one of them says the answer out loud, which is
    // the whole reason the handle exists.
    expect(pool.map((p) => p.artifactId)).toContain("code:synthetic-scaffold");
  });
});

describe("the rendered HTML leaks nothing", () => {
  it("prints no corpus id, no label word, no provenance and nothing that names a person", async () => {
    const html = await renderPage();

    expect(html).not.toContain("humanIndex");
    for (const entry of pool) {
      expect(html, `the page prints the corpus id ${entry.artifactId}`).not.toContain(entry.artifactId);
      expect(html, `the page prints the provenance of ${entry.artifactId}`).not.toContain(entry.provenance);
      expect(html, `the page prints the source of ${entry.artifactId}`).not.toContain(entry.source);
    }
    for (const field of FORBIDDEN_VIEW_FIELDS) {
      expect(html, `the page has a "${field}" field`).not.toContain(`"${field}":`);
    }

    // The card list on its own, because the surrounding copy legitimately uses both words.
    // Bounded by the honesty section that follows it: taking the LAST `</ul>` swallowed that
    // section, and the grep then passed only because it was reading our own prose.
    const cardList = html.slice(html.indexOf("<ul aria-labelledby"), html.indexOf('id="honesty"'));
    expect(cardList.length).toBeGreaterThan(1_000);
    expect(cardList.toLowerCase()).not.toContain("made by a person");
    expect(cardList.toLowerCase()).not.toContain("generated");

    // Identity is a separate rule from the answer: no card may name a person, carry an email,
    // a handle or a link. The corpus is full of all four.
    expect(cardList).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.-]+/);
    expect(cardList).not.toMatch(/https?:\/\//);
    for (const name of ["Holowaychuk", "Dalton", "Sorhus", "Reitz", "Ronacher", "McLeod"]) {
      expect(cardList.toLowerCase(), `a card names ${name}`).not.toContain(name.toLowerCase());
    }
  });

  it("would catch a leak if the round component were handed one", () => {
    // Mutation of the check itself, against the same greps: a card whose summary and panels
    // carry the id, the label and a maintainer's name must fail every one of them.
    const leaky = renderToStaticMarkup(
      createElement(Round, {
        roundId: "rnd_leak",
        ticket: "",
        participantId: "00000000-0000-4000-8000-000000000000",
        dayKey: "2026-08-24",
        prompt: "Find it.",
        cards: [
          {
            cardId: "aaaaaaaaaaaaaaaa",
            medium: "code",
            summary: "code:sinatra · generated · made by a person",
            panels: [{ heading: "Comments", lines: ["Written by TJ Holowaychuk, tj@vision-media.ca"] }],
          },
        ],
      }),
    );
    const cardList = leaky.slice(leaky.indexOf("<ul aria-labelledby"), leaky.lastIndexOf("</ul>"));
    expect(cardList).toContain("code:sinatra");
    expect(cardList.toLowerCase()).toContain("made by a person");
    expect(cardList.toLowerCase()).toContain("generated");
    expect(cardList).toMatch(/[\w.+-]+@[\w-]+\.[\w.-]+/);
    expect(cardList.toLowerCase()).toContain("holowaychuk");
  });
});

describe("a guess is graded and the reveal is the payoff", () => {
  it("returns the label, the stated basis and our own reading for all five cards", async () => {
    const { submitGuess } = await import("@/app/gauntlet/actions");
    const participantId = "11111111-1111-4111-8111-111111111111";
    const service = await gauntlet();
    const { view } = await service.dailyRound({ participantId });

    const form = new FormData();
    form.set("roundId", view.roundId);
    form.set("ticket", view.ticket);
    form.set("participantId", participantId);
    form.set("chosenIndex", "0");

    const state = await submitGuess({ status: "idle" }, form);
    expect(state.status).toBe("revealed");
    if (state.status !== "revealed") throw new Error("unreachable");

    expect(state.cards).toHaveLength(5);
    // Exactly one answer, and it is the one the pool labels human.
    const answers = state.cards.filter((c) => c.isAnswer);
    expect(answers).toHaveLength(1);
    expect(answers[0]!.label).toBe("human");
    expect(state.cards.filter((c) => c.chosen)).toHaveLength(1);
    expect(state.correct).toBe(state.cards[0]!.isAnswer);

    // Every card comes back with the education: a stated basis and a real detector reading.
    for (const card of state.cards) {
      expect(card.provenance.length).toBeGreaterThan(40);
      expect(card.source.length).toBeGreaterThan(0);
      expect(["assessed", "inconclusive", "not_assessed"]).toContain(card.detector.status);
      expect(card.detector.corpusVersion.length).toBeGreaterThan(0);
      expect(card.receiptHref).toMatch(/^\/gauntlet\/artifact\/(code|web)\//);
      // The handles match the ones the round was served under, so a client can pair them up.
      expect(view.cards.map((c) => c.cardId)).toContain(card.cardId);
    }
  });

  it("returns the first answer again rather than a second try", async () => {
    const { submitGuess } = await import("@/app/gauntlet/actions");
    const participantId = "22222222-2222-4222-8222-222222222222";
    const service = await gauntlet();
    const { view } = await service.dailyRound({ participantId });
    const form = (index: number) => {
      const f = new FormData();
      f.set("roundId", view.roundId);
      f.set("ticket", view.ticket);
      f.set("participantId", participantId);
      f.set("chosenIndex", String(index));
      return f;
    };

    const first = await submitGuess({ status: "idle" }, form(0));
    const second = await submitGuess({ status: "idle" }, form(1));
    expect(first.status).toBe("revealed");
    expect(second.status).toBe("revealed");
    if (first.status !== "revealed" || second.status !== "revealed") throw new Error("unreachable");
    expect(second.replayed).toBe(true);
    expect(second.correct).toBe(first.correct);
    expect(second.cards.find((c) => c.chosen)?.position).toBe(0);
  });

  it("refuses a round it has never served", async () => {
    const { submitGuess } = await import("@/app/gauntlet/actions");
    const form = new FormData();
    form.set("roundId", "rnd_not_a_round");
    form.set("participantId", "33333333-3333-4333-8333-333333333333");
    form.set("chosenIndex", "0");
    const state = await submitGuess({ status: "idle" }, form);
    expect(state.status).toBe("refused");
  });
});

describe("the receipt behind a card", () => {
  const ids = POOL_IDS as readonly { readonly corpus: string; readonly name: string }[];

  it("enumerates every pool member without loading the answer key", () => {
    // `generateStaticParams` runs in a worker of its own. It must not reach `server-only` or
    // `pool.json`; `pool-ids.json` holds ids and nothing else.
    expect(generateStaticParams()).toEqual(ids.map(({ corpus, name }) => ({ corpus, name })));
    expect(ids.length).toBe(pool.length);
    expect(JSON.stringify(ids)).not.toContain("provenance");
    expect(JSON.stringify(ids)).not.toContain('"label"');
  });

  it("renders a real receipt for a member, with the reading the detector actually produced", async () => {
    const first = ids[0]!;
    const html = renderToStaticMarkup(
      await GauntletArtifactPage({
        params: Promise.resolve({ corpus: first.corpus, name: first.name }),
        searchParams: Promise.resolve({}),
      }),
    );
    expect(html).toContain("Slop Scorer / Receipt");
    expect(html).toContain(`${first.corpus}:${first.name}`);
    expect(html).toContain("<figure");
  });

  it("404s on an artifact that is not in the pool", async () => {
    await expect(
      GauntletArtifactPage({
        params: Promise.resolve({ corpus: "code", name: "not-a-member" }),
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toThrow();
  });
});
