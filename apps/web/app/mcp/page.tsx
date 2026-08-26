import type { Metadata } from "next";
import Link from "next/link";
import { CommandBlock } from "@/components/mcp/command-block";
import EXAMPLE from "@/lib/mcp-example.json";
import {
  CLIENTS,
  COMMANDS,
  CONFIG_BLOCKS,
  LOOP,
  NPM_PACKAGE,
  PUBLISHED_ON_NPM,
  REPO_IS_PUBLIC,
  REPO_URL,
  TOOLS,
} from "@/lib/mcp";
import { absolute } from "@/lib/site";

/**
 * The plugin page.
 *
 * The founder's complaint that produced it was one sentence: "i dont see the downloadable mcp
 * server on the site anywhere." He was right. The landing page carried a paragraph saying there
 * would be no copy button until there was something real to copy, which was honest and also
 * meant the strongest thing this product has was invisible to every visitor.
 *
 * THE ORDER OF THIS PAGE IS THE ARGUMENT. What the tools return comes before how to install
 * them, because a reader deciding whether to clone a repository needs to know what falls out of
 * it first. The worked example is captured from the real server by
 * `scripts/capture-mcp-example.mjs`, it is a reading OF THIS REPOSITORY, and it contains
 * findings about us. That is deliberate: the same posture as the `builder.bare-platform-domain`
 * finding we publish about ourselves in the fold.
 *
 * THE INSTALL SECTION MAY NOT PRINT A COMMAND THAT FAILS. The server now has its own public
 * repository, so the npx-from-GitHub line genuinely works and is offered first. It was run from
 * a clean npm cache before it was printed here, and the measured cold start is printed with it,
 * because a client that gives up at 30 seconds will make a working install look broken. The
 * package is still unpublished, so the registry line is still labelled with what it waits on.
 * `lib/mcp.ts` holds the flag and every command string; flipping the flag is the whole edit.
 *
 * Note that no command is spelled out in this comment, and that is not squeamishness:
 * `test/mcp-commands.test.ts` greps this file for install strings, because a command typed into
 * JSX is a copy no flag can relabel. A prose mention reads the same to a grep.
 */

export const metadata: Metadata = {
  title: "The MCP plugin, and what it returns",
  description:
    "Five tools for a coding agent: scan a checkout, scan a rendered page, read the rule corpus before generating, turn findings into caveated edits, and re-scan to check. Deterministic, cited, and it writes no files.",
  alternates: { canonical: "/mcp" },
  openGraph: {
    title: "The MCP plugin, and what it returns · Slop Scorer",
    description:
      "The rule corpus, exposed to your own coding agent, so it can read what not to produce before it produces it.",
    url: absolute("/mcp"),
    type: "article",
  },
};

const capturedOn = new Date(EXAMPLE.capturedAt).toISOString().slice(0, 10);

export default function McpPage() {
  return (
    <div className="mx-auto flex max-w-receipt flex-col gap-16 px-6 py-16 md:px-[72px]">
      <header className="flex flex-col gap-5">
        <p className="font-mono text-mono-xs font-medium tracking-[0.06em] text-ink uppercase">
          Slop Scorer / MCP plugin
        </p>
        <h1 className="max-w-[22ch] text-h1 font-normal text-ink">
          Your agent can read the corpus before it writes the code.
        </h1>
        <p className="max-w-[72ch] text-lead text-ink">
          Detection is a race that gets lost eventually: generators improve and tells decay.
          Prevention does not decay. Five tools, no model anywhere in them, every finding citing
          a file and a line or a CSS selector you can go and check.
        </p>
        <p className="max-w-[72ch] text-body text-ink-muted">
          {LOOP}. The server proposes and you dispose: it has no filesystem write, no process
          spawn and no request for write access anywhere in it. Your agent applies the edits with
          the tools and the approval prompt your user already trusts.
        </p>
      </header>

      <section aria-labelledby="what-it-returns" className="flex flex-col gap-5">
        <h2 id="what-it-returns" className="text-h3 font-medium text-ink">
          One real run, on this repository
        </h2>
        <p className="max-w-[72ch] text-body text-ink">
          This is not a sample. It is what <span className="font-mono text-mono-sm">scan_codebase</span>{" "}
          printed when the server was pointed at the checkout this site is built from, captured by{" "}
          <span className="font-mono text-mono-sm">scripts/capture-mcp-example.mjs</span> at commit{" "}
          <span className="font-mono text-mono-sm text-ink">{EXAMPLE.commit}</span> on {capturedOn}.
          Two of the four rules that matched are about us: unfilled placeholder markers in our own
          detector source, and two of our own test files carrying no assertions. They stay in the
          example.
        </p>
        <pre
          data-doc
          className="max-h-[560px] overflow-auto border border-border-control bg-surface-raised px-5 py-5 font-mono text-mono-sm whitespace-pre text-ink"
        >
          {EXAMPLE.scanText}
        </pre>
        <p className="max-w-[72ch] text-sm text-ink-muted">
          The{" "}
          <span className="font-mono text-mono-sm text-ink">
            {"⟦untrusted:…⟧"}
          </span>{" "}
          fences are part of the output, not typography. Everything inside one is text copied
          verbatim out of the artifact being scanned, which means an artifact can contain
          instructions aimed at the agent reading the report. Fencing it is how the reading agent
          is told that this is data and not a request.
        </p>
      </section>

      <section aria-labelledby="as-an-edit" className="flex flex-col gap-5">
        <h2 id="as-an-edit" className="text-h3 font-medium text-ink">
          The same finding, as an edit your agent can act on
        </h2>
        <p className="max-w-[72ch] text-body text-ink">
          <span className="font-mono text-mono-sm">propose_fixes</span> re-scans and returns every
          finding as a proposal. From the same capture, one of the{" "}
          {EXAMPLE.proposalSummary.proposals} it returned for this repository:
        </p>
        <dl
          data-doc
          className="grid grid-cols-1 gap-x-8 gap-y-3 border border-hairline bg-surface-raised px-5 py-5 sm:grid-cols-[9rem_minmax(0,1fr)]"
        >
          <dt className="font-mono text-mono-sm text-ink-muted">rule</dt>
          <dd className="font-mono text-mono-sm text-ink">{EXAMPLE.proposal.ruleId}</dd>

          <dt className="font-mono text-mono-sm text-ink-muted">locator</dt>
          <dd className="font-mono text-mono-sm break-all text-ink">
            {EXAMPLE.proposal.remediation.locator}
          </dd>

          <dt className="font-mono text-mono-sm text-ink-muted">observed</dt>
          <dd className="font-mono text-mono-sm text-ink">
            {EXAMPLE.proposal.evidence[0]?.observed}
            {EXAMPLE.proposal.evidence[0]?.expected
              ? `, expected ${EXAMPLE.proposal.evidence[0].expected}`
              : ""}
          </dd>

          <dt className="font-mono text-mono-sm text-ink-muted">kind</dt>
          <dd className="text-sm text-ink">
            <span className="font-mono text-mono-sm">{EXAMPLE.proposal.remediation.kind}</span>, so
            no replacement text is invented. A person decides.
          </dd>

          <dt className="font-mono text-mono-sm text-ink-muted">guidance</dt>
          <dd className="max-w-[72ch] text-sm text-ink">
            {EXAMPLE.proposal.remediation.guidance}
          </dd>

          <dt className="font-mono text-mono-sm text-ink-muted">do not apply if</dt>
          <dd className="max-w-[72ch] text-sm text-ink">
            {EXAMPLE.proposal.remediation.doNotApplyIf}
          </dd>

          <dt className="font-mono text-mono-sm text-ink-muted">rebuttal</dt>
          <dd className="max-w-[72ch] text-sm text-ink-muted">
            {EXAMPLE.proposal.remediation.rebuttal}
          </dd>
        </dl>
        <p className="max-w-[72ch] text-sm text-ink-muted">
          Every proposal carries the argument against itself, injected from the rule&apos;s own
          false-positive note so the two cannot drift apart. Counter-evidence findings, the ones
          that argue for the artifact, can never carry a fix at all: the corpus refuses to load if
          anyone attaches one.
        </p>
        <Link href="/method" className="w-fit text-body text-ink-accent underline-offset-4 hover:underline">
          Every rule, its weight, and the conditions under which it is wrong
        </Link>
      </section>

      <section aria-labelledby="tools" className="flex flex-col gap-5">
        <h2 id="tools" className="text-h3 font-medium text-ink">
          The five tools
        </h2>
        <dl className="flex flex-col gap-5">
          {TOOLS.map((tool) => (
            <div key={tool.name} className="border-l border-border-control pl-5">
              <dt className="font-mono text-mono-md font-medium text-ink">{tool.name}</dt>
              <dd className="mt-1 max-w-[72ch] text-body text-ink-muted">{tool.does}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="install" className="flex flex-col gap-5">
        <h2 id="install" className="text-h3 font-medium text-ink">
          Install it
        </h2>
        <p className="max-w-[72ch] text-body text-ink">
          Read this paragraph before you copy anything. The server lives in its own{" "}
          {REPO_IS_PUBLIC ? "public" : "private"} repository at{" "}
          <Link
            href={REPO_URL}
            className="text-ink-accent underline-offset-4 hover:underline"
            rel="noreferrer"
          >
            {REPO_URL.replace("https://", "")}
          </Link>
          , MIT, with its own tests, so the first command below works for anybody with Node 20 and
          npx. {NPM_PACKAGE} is{" "}
          {PUBLISHED_ON_NPM ? "on the npm registry" : "still not on the npm registry"}, so the last
          one does not, and it is labelled with what it is waiting on rather than left to fail on
          the person who presses copy.
        </p>
        {COMMANDS.map((entry) => (
          <CommandBlock
            key={entry.command}
            label={entry.label}
            command={entry.command}
            availability={entry.availability}
            note={entry.note}
            tone={entry.availability === "works-today" ? "primary" : "quiet"}
          />
        ))}
        <p className="max-w-[72ch] text-sm text-ink-muted">
          Rendering pages needs a browser. <span className="font-mono text-mono-sm">scan_ui</span>{" "}
          drives real Chromium, so run{" "}
          <span className="font-mono text-mono-sm text-ink">npx playwright install chromium</span>{" "}
          once. Without it that tool returns{" "}
          <span className="font-mono text-mono-sm">not_assessed</span> and says so. It will not
          fall back to reading the server HTML, because a fetch-only read produces confident
          findings about a document nobody sees.
        </p>
      </section>

      <section aria-labelledby="by-hand" className="flex flex-col gap-5">
        <h2 id="by-hand" className="text-h3 font-medium text-ink">
          By hand, in any client
        </h2>
        <p className="max-w-[72ch] text-body text-ink">
          Every client takes the identical block. Only the file it goes in differs. Use the first
          form if you want it to look after itself, the second if you have a checkout and want it
          to run the code you are editing, and the third once the package is published.
        </p>
        {CONFIG_BLOCKS.map((block) => (
          <CommandBlock
            key={block.label}
            label={block.label}
            command={block.json}
            availability={block.availability}
            tone={block.availability === "works-today" ? "primary" : "quiet"}
          />
        ))}
        <dl className="flex flex-col gap-5">
          {CLIENTS.map((client) => (
            <div key={client.name} className="border-l border-hairline pl-5">
              <dt className="text-body font-medium text-ink">{client.name}</dt>
              <dd className="mt-1 max-w-[72ch] text-sm text-ink-muted">{client.where}</dd>
              <dd className="max-w-[72ch] text-sm text-ink-muted">{client.then}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="contract" className="flex flex-col gap-5">
        <h2 id="contract" className="text-h3 font-medium text-ink">
          What an integrator has to know
        </h2>
        <ul className="flex max-w-[72ch] list-none flex-col gap-4 text-body text-ink">
          <li className="border-l border-border-control pl-5">
            Abstention is a result. Every response carries a{" "}
            <span className="font-mono text-mono-sm">status</span> of{" "}
            <span className="font-mono text-mono-sm">assessed</span>,{" "}
            <span className="font-mono text-mono-sm">inconclusive</span> or{" "}
            <span className="font-mono text-mono-sm">not_assessed</span>. Branch on it before you
            read a score. A withheld score is not a low score and not a clean bill of health.
          </li>
          <li className="border-l border-border-control pl-5">
            No response asserts that a person used AI. Findings are statements about an artifact,
            and the verdict sentence describes what the server did, so it has no grammatical slot
            for a person and cannot be quoted as an allegation about one.
          </li>
          <li className="border-l border-border-control pl-5">
            Scores are bounded at 99. There is no arrangement of evidence that reaches certainty,
            and low coverage withholds the score rather than reporting a low one.
          </li>
          <li className="border-l border-border-control pl-5">
            Counter-evidence subtracts. Some rules argue for the artifact rather than against it,
            and two of them fired in the run above and pulled our own score down.
          </li>
        </ul>
        <Link href="/llms.txt" className="w-fit text-body text-ink-accent underline-offset-4 hover:underline">
          The same thing, machine readable, at /llms.txt
        </Link>
      </section>
    </div>
  );
}
