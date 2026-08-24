import { ev, patch } from "../rule.js";
import type { CodeRule } from "../rule.js";

/**
 * Family: agent-artifact.
 *
 * The closest thing to a fingerprint the code modality has, and the one that needs the most
 * care in how it is worded. A committed `CLAUDE.md` proves an agent was pointed at this
 * repository. It does not prove any particular line was generated, and it is increasingly a
 * deliberate, sensible thing for a team to commit. Every rule here is therefore phrased
 * about the FILE, carries the counter-argument in its `falsePositiveNote`, and the family is
 * capped at 35% so the score survives everyone learning to add it to `.gitignore`.
 *
 * The one exception is the transcript rule. A committed chat log is not an instruction file
 * anyone chose to maintain; it is a working directory that got pushed.
 */

const chat = (path: string, tool: string, bytes: number, excerpt: string) => ({
  path,
  bytes,
  tool,
  gitIgnored: false,
  excerpt,
});

export const AGENT_RULES: readonly CodeRule[] = [
  {
    id: "agent.instruction-file-committed",
    family: "agent-artifact",
    title: "An agent instruction file is committed to the repository",
    polarity: "signal",
    severity: "high",
    baseWeight: 1.4,
    maxHits: 3,
    requiresProbe: "agent-files",
    phase: 1,
    since: "code-corpus-2026.09",
    explanation:
      "A CLAUDE.md, AGENTS.md, .cursorrules or equivalent is tracked in the repository. These files exist to steer a coding agent, so their presence establishes that one was pointed at this code.",
    falsePositiveNote:
      "This says how the repository was worked on, not who wrote any given line. Committing an instruction file is increasingly a deliberate team practice, and a repository can hold one while every line in it was written and reviewed by a person.",
    prevention:
      "If the file is a deliberate part of how the team works, keep it and say so in the README. If it is a leftover, add it to .gitignore and remove it from the index.",
    detect: (a) =>
      a.agentFiles
        .filter((f) => !f.gitIgnored && !/history|transcript|chat/i.test(f.path))
        .map((f) =>
          ev("file", f.path, `${f.bytes} bytes, ${f.tool} instruction file`, {
            expected: "not tracked, or documented as a deliberate team practice",
            excerpt: f.excerpt,
          }),
        ),
    fixtures: {
      positive: (base) => ({
        artifact: patch(base, {
          agentFiles: [chat("CLAUDE.md", "Claude Code", 4_200, "# CLAUDE.md\n\nThis file provides guidance to Claude Code")],
        }),
      }),
      mutated: (base) => ({ artifact: patch(base, { agentFiles: [] }) }),
      extra: [
        {
          name: "an agent file that is gitignored is not committed and does not fire",
          shouldFire: false,
          build: (base) => ({
            artifact: patch(base, {
              agentFiles: [{ ...chat("CLAUDE.md", "Claude Code", 4_200, "# CLAUDE.md"), gitIgnored: true }],
            }),
          }),
        },
      ],
    },
  },
  {
    id: "agent.transcript-committed",
    family: "agent-artifact",
    title: "An agent chat transcript is committed to the repository",
    polarity: "signal",
    severity: "high",
    baseWeight: 1.6,
    maxHits: 2,
    requiresProbe: "agent-files",
    phase: 1,
    since: "code-corpus-2026.09",
    explanation:
      "A stored conversation log (.aider.chat.history.md, .specstory/, a session transcript) is tracked. Unlike an instruction file, nobody maintains a transcript deliberately: it is a working directory that got pushed.",
    falsePositiveNote:
      "A transcript can be committed on purpose as a record of a decision, and some teams do exactly that for auditability. The rule reads the file's presence, not its intent.",
    prevention: "Add the transcript path to .gitignore and remove it from the index. It also leaks whatever was pasted into the session.",
    detect: (a) =>
      a.agentFiles
        .filter((f) => !f.gitIgnored && /history|transcript|chat|specstory/i.test(f.path))
        .map((f) => ev("file", f.path, `${f.bytes} bytes, ${f.tool} session log`, { expected: "not tracked", excerpt: f.excerpt })),
    fixtures: {
      positive: (base) => ({
        artifact: patch(base, {
          agentFiles: [chat(".aider.chat.history.md", "aider", 88_000, "#### make the tests pass\n\n> I'll update the reader")],
        }),
      }),
      mutated: (base) => ({ artifact: patch(base, { agentFiles: [] }) }),
    },
  },
];
