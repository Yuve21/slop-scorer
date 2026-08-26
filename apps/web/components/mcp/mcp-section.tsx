import Link from "next/link";
import { CommandBlock } from "@/components/mcp/command-block";
import EXAMPLE from "@/lib/mcp-example.json";
import { COMMANDS, NPM_PACKAGE, NPX_INSTALL, REPO_URL, TOOLS } from "@/lib/mcp";

/**
 * The MCP section of the landing page, lifted out of `app/page.tsx` into its own file.
 *
 * IT IS A COMPONENT FOR A BORING REASON. Two agents were editing this page at the same time: one
 * reworking the whole visual system, one writing this section. A section that lives in its own
 * file is a section the other rework can move, reorder or restyle by touching one line, instead
 * of a 90-line block two people take turns clobbering inside a file neither of them owns.
 *
 * THE ORDER IS THE ARGUMENT, AND IT USED TO BE BACKWARDS. The earlier version of this section
 * described the plugin and then offered a command, which sells nothing: a reader is being asked
 * to wire a stranger's binary into their agent on the strength of an adjective. So the evidence
 * comes first now, and it is evidence ABOUT US. The finding below is captured from the real
 * server pointed at this repository by `scripts/capture-mcp-example.mjs`, it cites one of our own
 * files at a line number, and the number it puts on us is a real one we did not choose.
 *
 * NO ENTRANCE ANIMATION, DELIBERATELY. `motion.every-section-reveals` fires at five or more
 * animating sections and this page spends its whole budget on two beats elsewhere. A section
 * that is a statement of fact does not need to arrive; and a site that scores other people for
 * uniform scroll-triggered reveals does not get to add a fifth one to sell its own plugin.
 */

const capturedOn = new Date(EXAMPLE.capturedAt).toISOString().slice(0, 10);
const finding = EXAMPLE.lineCited;
const evidence = finding.evidence[0];

/** The loop, spelled out. `LOOP` in `lib/mcp.ts` is the one-line form; this is the same thing
 *  with the step that is NOT ours called out, because that is the part integrators ask about. */
const STEPS: readonly { readonly tool: string; readonly does: string }[] = [
  { tool: "scan_codebase", does: "reads the checkout and cites a file and a line for each finding" },
  { tool: "propose_fixes", does: "returns the same findings as edits, each with its own rebuttal" },
  { tool: "your agent applies them", does: "with its own tools, under the approval flow you already trust" },
  { tool: "verify_fix", does: "re-scans and names what is gone, what persists, what is newly broken" },
];

export function McpSection() {
  return (
    <section id="mcp" className="border-y border-hairline bg-surface-sunk">
      <div className="mx-auto grid max-w-page gap-8 px-6 py-20 md:grid-cols-[minmax(0,19rem)_minmax(0,1fr)] md:gap-16 md:px-16">
        <div className="flex flex-col gap-4">
          <h2 className="text-h2 font-normal text-balance text-ink">
            The other half is prevention
          </h2>
          <p className="max-w-[40ch] text-lg text-ink-muted">
            Detection decays as generators improve. A rule that stops the artifact being made does
            not.
          </p>
        </div>

        <div className="flex flex-col gap-6 md:border-l md:border-hairline md:pl-16">
          <p className="max-w-[64ch] text-lg text-ink">
            The same corpus is exposed to your own coding agent over MCP, so it can ask what not
            to produce before it produces it. Here is what it produced when we pointed it at this
            repository.
          </p>

          {/* The evidence, before the install. Every value in this block is read out of the
              capture; none of it is typed here. */}
          <div data-doc className="flex flex-col border border-border-control bg-surface-raised">
            <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-hairline px-5 py-3">
              <span className="font-mono text-mono-md font-medium text-ink">
                {EXAMPLE.score} / {EXAMPLE.ceiling}
              </span>
              <span className="text-sm text-ink-muted">
                {EXAMPLE.band}, on our own checkout at {EXAMPLE.commit}, {capturedOn}
              </span>
            </div>
            <dl className="grid grid-cols-1 gap-x-8 gap-y-3 px-5 py-5 sm:grid-cols-[8rem_minmax(0,1fr)]">
              <dt className="font-mono text-mono-sm text-ink-muted">rule</dt>
              <dd className="font-mono text-mono-sm text-ink">{finding.ruleId}</dd>

              <dt className="font-mono text-mono-sm text-ink-muted">line</dt>
              <dd className="font-mono text-mono-sm break-all text-ink">{evidence.locator}</dd>

              <dt className="font-mono text-mono-sm text-ink-muted">read there</dt>
              <dd className="font-mono text-mono-sm text-ink">
                {evidence.observed}
                <span className="text-ink-muted"> (expected {evidence.expected})</span>
              </dd>

              <dt className="font-mono text-mono-sm text-ink-muted">rebuttal</dt>
              <dd className="max-w-[64ch] text-sm text-ink-muted">
                {finding.remediation.rebuttal}
              </dd>
            </dl>
          </div>

          <p className="max-w-[64ch] text-sm text-ink-muted">
            That is our number and our file, and the rule arrives carrying the argument against
            itself. Nothing in the block above was typed into this page: it is read out of a
            capture of the running server, and it changes when the repository does.
          </p>

          <ol className="flex max-w-[64ch] list-none flex-col gap-2 text-body text-ink">
            {STEPS.map((step, index) => (
              <li key={step.tool} className="flex gap-4 border-l border-hairline pl-5">
                <span className="font-mono text-mono-sm text-ink-muted">{index + 1}</span>
                <span>
                  <span className="font-mono text-mono-md text-ink">{step.tool}</span>{" "}
                  <span className="text-ink-muted">{step.does}</span>
                </span>
              </li>
            ))}
          </ol>

          <ul className="flex max-w-[64ch] list-none flex-col gap-3 text-body text-ink">
            {TOOLS.map((tool) => (
              <li key={tool.name} className="border-l border-hairline pl-5">
                <span className="font-mono text-mono-md text-ink">{tool.name}</span>{" "}
                <span className="text-ink-muted">{tool.summary}</span>
              </li>
            ))}
          </ul>

          <CommandBlock
            label={COMMANDS[0].label}
            command={COMMANDS[0].command}
            availability={COMMANDS[0].availability}
            note={COMMANDS[0].note}
          />

          <p className="max-w-[64ch] text-sm text-ink-muted">
            Said plainly, because one command on this page has a precondition:{" "}
            <span className="font-mono text-mono-sm text-ink">{NPM_PACKAGE}</span> is not published
            to npm, so{" "}
            <span className="font-mono text-mono-sm text-ink">{NPX_INSTALL}</span> will 404 today.
            The command above does not go near the registry. It fetches{" "}
            <Link
              href={REPO_URL}
              className="text-ink-accent underline-offset-4 hover:underline"
              rel="noreferrer"
            >
              the public repository
            </Link>
            , which is MIT, carries its own tests, and is where the rules actually live.
          </p>

          <Link
            href="/mcp"
            className="w-fit text-body text-ink-accent underline-offset-4 hover:underline"
          >
            The plugin, per-client config, and the whole receipt this finding came out of
          </Link>
        </div>
      </div>
    </section>
  );
}
