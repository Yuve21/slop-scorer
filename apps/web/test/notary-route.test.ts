import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  FORBIDDEN_ATTESTATION_PHRASES,
  LIMITATION,
  VERIFICATION_CAVEAT,
  findAttestationViolations,
  neutralizeAuthorityNoun,
} from "@slop/notary";
import NotaryPage from "@/app/notary/page";
import VerifyPage from "@/app/notary/verify/page";
import { checkCredential, issueCredential } from "@/app/notary/actions";
import { PERSISTENCE, STAMPING_NOTE } from "@/lib/notary/store";

/**
 * THE ROUTE MUST NOT RESTATE THE CREDENTIAL.
 *
 * `packages/notary` bans the certification vocabulary at construction and mutation-tests the
 * ban. That protects the sentence the package composes. It does not protect the page, and the
 * page is where a friendlier restatement gets added: a badge, a green tick, a "verified" chip,
 * a summary line above the block. Any one of those is a claim nobody checked, on the most
 * legally load-bearing surface in this repository.
 *
 * So these tests run the package's own claim guard over the RENDERED HTML of both routes and
 * over the credential the route actually issues, and then mutation-test the guard against a
 * page that does restate it.
 */

const steps = [
  { kind: "draft", contentSha256: "a".repeat(64), byteLength: 1024, declaredAt: "2026-08-01T09:00:00.000Z" },
  { kind: "save", contentSha256: "b".repeat(64), byteLength: 2048, declaredAt: "2026-08-01T10:30:00.000Z" },
  { kind: "export", contentSha256: "c".repeat(64), byteLength: 4096, declaredAt: "2026-08-02T11:15:00.000Z" },
];

/** Rendered text, with the entities React escaped put back. */
const decode = (html: string): string =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

/**
 * The phrases a PAGE may not contain.
 *
 * "you " and "your " are on the package's list because they are banned in a VERDICT SENTENCE,
 * where a second person turns a measurement into an accusation. They are not banned in copy
 * that addresses a visitor, and this page addresses one. Everything else on the list is a
 * claim about humanity, certainty or certification, and none of it may appear anywhere.
 */
const PAGE_BANNED = FORBIDDEN_ATTESTATION_PHRASES.filter((p) => p !== "you " && p !== "your ");

const issue = async (payload: unknown = steps) => {
  const form = new FormData();
  form.set("steps", JSON.stringify(payload));
  return issueCredential({ status: "idle" }, form);
};

describe("the notary pages render", () => {
  it("prints the limitation and the caveat in the package's own words", async () => {
    const html = renderToStaticMarkup(NotaryPage());
    expect(html).toContain("Slop Scorer / Notary");
    // Imported from the package rather than retyped, so the page cannot drift from the
    // credential. Rendered text is HTML-escaped, so the comparison is made on decoded text.
    const text = decode(html);
    expect(text).toContain(LIMITATION);
    expect(text).toContain(VERIFICATION_CAVEAT);
    expect(text).toContain(PERSISTENCE);
    expect(text).toContain(STAMPING_NOTE);
    expect(text).toContain("the CMS signature over the token");
  });

  it("the verify page renders and states what it does not check", () => {
    const html = renderToStaticMarkup(VerifyPage());
    expect(html).toContain("Slop Scorer / Notary / Verify");
    expect(html).toContain("openssl ts -verify");
  });

  it("neither page contains a forbidden attestation phrase", () => {
    for (const page of [renderToStaticMarkup(NotaryPage()), renderToStaticMarkup(VerifyPage())]) {
      // Through the package's own carve-out: "the authority" CONTAINS "the author", and this
      // page cannot describe an RFC 3161 timestamp authority without saying the word. The
      // neutralisation is exactly one noun wide, which is why it is imported rather than
      // reimplemented as a looser exception here.
      const text = neutralizeAuthorityNoun(decode(page).replace(/\s+/g, " ").toLowerCase());
      for (const phrase of PAGE_BANNED) {
        expect(text, `the page contains ${JSON.stringify(phrase)}`).not.toContain(phrase);
      }
    }
  });

  it("would catch a restatement if one were added", () => {
    // Mutation of the check itself. The three assertions above pass trivially against an empty
    // string, so the same greps are pointed at the copy somebody will eventually want to write.
    const tempting = "Verified human. This credential proves the author made it themselves.";
    const lower = neutralizeAuthorityNoun(tempting.toLowerCase());
    expect(PAGE_BANNED.some((p) => lower.includes(p))).toBe(true);
    expect(findAttestationViolations(tempting).length).toBeGreaterThan(0);
    expect(PAGE_BANNED).toContain("verified human");
    expect(PAGE_BANNED.length).toBeGreaterThan(30);
  });
});

describe("the route issues a bounded credential", () => {
  it("returns the package's statement verbatim, and it passes the package's own guard", async () => {
    const state = await issue();
    expect(state.status).toBe("issued");
    if (state.status !== "issued") throw new Error("unreachable");
    const c = state.credential;

    expect(c.eventCount).toBe(3);
    expect(c.statement.length).toBeGreaterThan(200);
    // The guard, over the exact text this route hands to a browser.
    expect(findAttestationViolations(c.statement)).toEqual([]);
    // Both mandatory closing lines, in full, on a credential that stamped nothing.
    expect(c.statement).toContain(LIMITATION);
    expect(c.statement).toContain(VERIFICATION_CAVEAT);
    // The honest empty case: no authority stamped this, and the sentence says so rather than
    // leaning on the hash. This is the line that a mock transport would have made false.
    expect(c.authorityCount).toBe(0);
    expect(c.statement).toContain("nothing here establishes that the record existed before now");
    expect(c.earliestGenTime).toBeNull();
  });

  it("commits to our observation as well as the caller's claim", async () => {
    const state = await issue();
    if (state.status !== "issued") throw new Error("unreachable");
    for (const e of state.credential.events) {
      expect(e.leafSha256).toMatch(/^[0-9a-f]{64}$/);
      expect(Date.parse(e.recordedAt)).not.toBeNaN();
    }
    // Ordered, and each leaf distinct: a chain whose leaves collided would verify against
    // whichever branch a reader happened to load.
    expect(state.credential.events.map((e) => e.sequence)).toEqual([0, 1, 2]);
    expect(new Set(state.credential.events.map((e) => e.leafSha256)).size).toBe(3);
  });

  it("refuses malformed steps rather than repairing them", async () => {
    for (const bad of [
      [],
      [{ kind: "save", contentSha256: "not-a-digest", byteLength: 1, declaredAt: "2026-08-01T09:00:00.000Z" }],
      [{ kind: "invented", contentSha256: "a".repeat(64), byteLength: 1, declaredAt: "2026-08-01T09:00:00.000Z" }],
      [{ kind: "save", contentSha256: "a".repeat(64), byteLength: -1, declaredAt: "2026-08-01T09:00:00.000Z" }],
      [{ kind: "save", contentSha256: "a".repeat(64), byteLength: 1, declaredAt: "whenever" }],
    ]) {
      const state = await issue(bad);
      expect(state.status, JSON.stringify(bad)).toBe("refused");
    }
    const notJson = new FormData();
    notJson.set("steps", "just some text");
    expect((await issueCredential({ status: "idle" }, notJson)).status).toBe("refused");
  });
});

describe("verification re-checks independently", () => {
  it("re-derives the root and reproduces the statement from a pasted bundle alone", async () => {
    const issued = await issue();
    if (issued.status !== "issued") throw new Error("unreachable");

    const form = new FormData();
    form.set("bundle", issued.credential.bundle);
    const state = await checkCredential({ status: "idle" }, form);

    expect(state.status).toBe("checked");
    if (state.status !== "checked") throw new Error("unreachable");
    expect(state.report).toContain("VERIFICATION  credential");
    expect(state.report).toContain("chain re-derives to the credential's root: yes");
    expect(state.statementReproduced).toBe(true);
    expect(state.statement).toBe(issued.credential.statement);
    // Narrow on purpose: with no token, nothing independently stamps the root, so the record
    // is NOT reported intact. A build that answered "intact" here would be asserting that an
    // unstamped chain establishes something.
    expect(state.recordIntact).toBe(false);
    expect(findAttestationViolations(state.report)).toEqual([]);
  });

  it("catches a statement that was edited after issue", async () => {
    const issued = await issue();
    if (issued.status !== "issued") throw new Error("unreachable");
    const bundle = JSON.parse(issued.credential.bundle) as { credential: { statement: string } };
    bundle.credential.statement = `${bundle.credential.statement} It also shows who made it.`;

    const form = new FormData();
    form.set("bundle", JSON.stringify(bundle));
    const state = await checkCredential({ status: "idle" }, form);
    if (state.status !== "checked") throw new Error("unreachable");
    expect(state.statementReproduced).toBe(false);
    expect(state.report).toContain("its text was changed after issue");
  });

  it("catches a chain whose steps were altered", async () => {
    const issued = await issue();
    if (issued.status !== "issued") throw new Error("unreachable");
    const bundle = JSON.parse(issued.credential.bundle) as { events: { byteLength: number }[] };
    bundle.events[1]!.byteLength = 9_999_999;

    const form = new FormData();
    form.set("bundle", JSON.stringify(bundle));
    const state = await checkCredential({ status: "idle" }, form);
    if (state.status !== "checked") throw new Error("unreachable");
    expect(state.recordIntact).toBe(false);
    expect(state.report).toMatch(/re-derive|problem/);
  });

  it("refuses an unreadable bundle rather than answering the question it could not ask", async () => {
    for (const input of ["", "not json at all", '{"credential":{}}']) {
      const form = new FormData();
      form.set("bundle", input);
      const state = await checkCredential({ status: "idle" }, form);
      expect(state.status, input).toBe("refused");
    }
  });
});
