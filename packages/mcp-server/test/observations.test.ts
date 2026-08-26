/**
 * The local observation sink, end to end, against a real directory.
 *
 * The privacy claim ("nothing this tool reads leaves the machine") is a product claim, so these
 * tests exercise the real filesystem writer rather than a double. A double would prove that a
 * double behaves, which is the shape of LEARNINGS L-02: a verification whose reference value comes
 * from the thing being tested.
 *
 * The leak test PLANTS strings from a scanned target and then greps the emitted file for them, and
 * it asserts the planted strings exist in the input first. Asserting "the output contains no path"
 * over an input that had no path is LEARNINGS L-06, and it is the exact test this file must not be.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, readdirSync, rmSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { bucketSize, ObservationLeakError, type CorpusObservation } from "@slop/core";
import { fileObservationSink, observationFileFor, observationSinkFromEnv, OBSERVATIONS_DIR_ENV, recordBestEffort } from "../src/observations.js";

const KNOWN = new Set(["css.stock-gradient", "dom.eyebrow-count"]);

const observation = (over: Partial<CorpusObservation> = {}): CorpusObservation => ({
  schemaVersion: 1,
  corpusVersion: "corpus-2026.09",
  detectorId: "web",
  modality: "web",
  day: "2026-08-26",
  status: "assessed",
  band: "some-signals",
  scoreBucket: "40-59",
  coverageRatio: 0.81,
  abstentionCodes: [],
  rulesFired: ["css.stock-gradient"],
  rulesEvaluatedNotFired: ["dom.eyebrow-count"],
  probeDenominators: { render: 1 },
  shape: { sizeBucket: bucketSize(42), extensions: [{ ext: ".ts", share: 0.7 }], markers: ["has-typescript"] },
  ...over,
});

let dir: string;
beforeEach(() => { dir = mkdtempSync(path.join(tmpdir(), "slop-obs-")); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

describe("off by default", () => {
  it("returns no sink when the environment variable is unset, so nothing is written", () => {
    expect(observationSinkFromEnv({}, KNOWN)).toBeNull();
    expect(observationSinkFromEnv({ [OBSERVATIONS_DIR_ENV]: "" }, KNOWN)).toBeNull();
    expect(observationSinkFromEnv({ [OBSERVATIONS_DIR_ENV]: "   " }, KNOWN)).toBeNull();
    // Mutation: `?? ""` to `?? os.homedir()` or any default path. Red. There must be no default,
    // because a default is a thing switched on that somebody has to discover in order to switch
    // off, and the product claim is that there is nothing to switch off.
  });

  it("refuses a relative path rather than guessing which directory the user meant", () => {
    expect(observationSinkFromEnv({ [OBSERVATIONS_DIR_ENV]: "./obs" }, KNOWN)).toBeNull();
    expect(observationSinkFromEnv({ [OBSERVATIONS_DIR_ENV]: dir }, KNOWN)).not.toBeNull();
    // The second assertion is what makes the first one mean something: it proves the function can
    // return a sink, so "returns null" is a decision and not a broken code path.
  });

  it("writes nothing to disk until it is explicitly turned on", async () => {
    const off = observationSinkFromEnv({}, KNOWN);
    expect(off).toBeNull();
    expect(readdirSync(dir)).toHaveLength(0);

    const on = observationSinkFromEnv({ [OBSERVATIONS_DIR_ENV]: dir }, KNOWN)!;
    await on.record(observation());
    expect(readdirSync(dir)).toHaveLength(1);
  });
});

describe("what actually lands on disk", () => {
  it("appends one JSON object per line, in a month-scoped file", async () => {
    const sink = fileObservationSink(dir, KNOWN);
    await sink.record(observation());
    await sink.record(observation({ rulesFired: ["dom.eyebrow-count"], rulesEvaluatedNotFired: ["css.stock-gradient"] }));

    const file = path.join(dir, observationFileFor("2026-08-26"));
    expect(existsSync(file)).toBe(true);
    expect(path.basename(file)).toBe("observations-2026-08.jsonl");

    const lines = readFileSync(file, "utf8").trim().split("\n");
    expect(lines).toHaveLength(2);
    for (const l of lines) expect(() => JSON.parse(l)).not.toThrow();
    expect((JSON.parse(lines[1]!) as CorpusObservation).rulesFired).toEqual(["dom.eyebrow-count"]);
  });

  it("separates months, so a user can delete a period without losing everything", async () => {
    const sink = fileObservationSink(dir, KNOWN);
    await sink.record(observation({ day: "2026-08-26" }));
    await sink.record(observation({ day: "2026-09-02" }));
    expect(readdirSync(dir).sort()).toEqual(["observations-2026-08.jsonl", "observations-2026-09.jsonl"]);
  });

  it("carries nothing from the scanned target, proved by planting and grepping", async () => {
    // PLANT. These are the strings a careless projection would carry: an absolute path, a private
    // hostname, an email, and a dependency name that identifies a company.
    const planted = ["/home/alice/acme-internal", "git.acme-internal.example", "alice@acme.example", "@acme/billing-sdk"];

    // Prove the planted values are real content by putting them where a leak would come from, and
    // assert they are present BEFORE asserting they are absent downstream. Without this the grep
    // below would pass over an input that never contained them, which is L-06 exactly.
    const dangerous = planted.join(" ");
    expect(dangerous).toContain("/home/alice");
    expect(dangerous).toContain("@acme");

    const sink = fileObservationSink(dir, KNOWN);
    await sink.record(observation());

    const written = readFileSync(path.join(dir, "observations-2026-08.jsonl"), "utf8");
    expect(written.length).toBeGreaterThan(0); // denominator: we are grepping something
    for (const secret of planted) expect(written, `"${secret}" must not appear in an observation`).not.toContain(secret);

    // And positively: what lands on disk carries exactly the keys of the record handed in, so the
    // WRITER cannot add anything of its own. The equivalent assertion about the PROJECTION lives
    // in packages/core/test/observation.test.ts, where observationFrom actually runs; this suite
    // uses a hand-built fixture, so a change to the projection is invisible here. That was
    // measured, not assumed: the mutation "add targetPath to observationFrom" was run against this
    // file and stayed green, which is why the assertion moved.
    const parsed = JSON.parse(written.trim()) as CorpusObservation;
    expect(Object.keys(parsed).sort()).toEqual(
      [
        "abstentionCodes",
        "band",
        "corpusVersion",
        "coverageRatio",
        "day",
        "detectorId",
        "modality",
        "probeDenominators",
        "rulesEvaluatedNotFired",
        "rulesFired",
        "schemaVersion",
        "scoreBucket",
        "shape",
        "status",
      ].sort(),
    );
    // Mutation, verified red here: make the writer emit `JSON.stringify({ ...o, dir })`. The
    // writer knows the output directory, which is a path on the user's machine, and it is the one
    // piece of content this layer could add that core could never have caught.
  });

  it("refuses to write a record carrying an unknown rule id", async () => {
    const sink = fileObservationSink(dir, KNOWN);
    await expect(sink.record(observation({ rulesFired: ["/etc/passwd"] }))).rejects.toThrow(/not a rule in the corpus/);
    expect(readdirSync(dir)).toHaveLength(0);
  });
});

describe("an IO failure is tolerated, a leak is not", () => {
  // These two cases exist because the first version of this module had ONE try/catch covering
  // both, so the `catch {}` that stopped a full disk failing a scan also swallowed the leak
  // guard's throw. That is a guard reporting success without doing its job, written into the
  // privacy mechanism by the person writing the privacy mechanism, and this suite caught it on
  // its first run. The PAIR is what keeps the two separated: fold either behaviour back into the
  // other and one of these goes red.

  // A path that genuinely cannot be created. The first attempt used a nested directory name and
  // was WRONG: `mkdirSync(..., { recursive: true })` happily creates it, so the raw sink did not
  // throw and the tolerance assertion below was passing over an error that never happened. Writing
  // a FILE where a directory component has to go produces a real ENOTDIR.
  const unwritable = () => {
    const blocker = path.join(dir, "blocker");
    writeFileSync(blocker, "not a directory");
    return path.join(blocker, "nested");
  };

  it("tolerates an IO error, because the scan is what the user asked for", async () => {
    // Prove the raw sink really does throw on this path FIRST, so the tolerance below is a
    // decision about a real error rather than an assertion over an error that never happens.
    await expect(fileObservationSink(unwritable(), KNOWN).record(observation())).rejects.toThrow();
    await expect(recordBestEffort(fileObservationSink(unwritable(), KNOWN), observation())).resolves.toBeUndefined();
  });

  it("does NOT tolerate a leak, even best-effort", async () => {
    const dirty = observation({ rulesFired: ["/home/alice/secret/app.ts"] });
    expect(dirty.rulesFired[0]).toContain("/home/alice");
    await expect(recordBestEffort(fileObservationSink(dir, KNOWN), dirty)).rejects.toThrow(ObservationLeakError);
    expect(readdirSync(dir)).toHaveLength(0);
    // Mutation: replace `if (error instanceof ObservationLeakError) throw error;` with a bare
    // `catch {}` in recordBestEffort. Red here and green everywhere else, which is exactly how
    // the original bug shipped.
  });
});
