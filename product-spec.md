# Product spec (founder-decided, 2026-08-23)

Decisions made by the founder. This supersedes the "0-100 score" plan.

## Feature 1 — THE MAIN FEATURE: "we remade it" (chosen)

When a user checks something, the app does not return a score. It **attempts to reproduce the
artifact** and shows the result side by side, with the effort gap:

> **8 seconds.** That is how long it took us to remake this. A person doing it by hand: about a day.
> Here is ours next to theirs. Here are the tells that let us shortcut it.

Why this and not a score (see `image-detection-reality.md`):
- A score is an accusation, and at consumer prevalence roughly half of them would be wrong (48.6%
  precision at 5% AI prevalence / 5% FPR). Not a tuning problem, a structural one.
- Reproduction is evidence the user evaluates with their own eyes. No trust in our black box.
- It is the only output that works honestly on images and video, where deterministic tells cannot be
  cited at all.
- It reframes off the legally dangerous claim ("you lied") onto a defensible one ("this is cheap to
  reproduce").
- The side-by-side is a screenshot, so distribution is built into the output.

**Open question being researched:** is anyone already doing reproduction-as-verdict? (Founder: if the
market is empty, this is definitely the direction.)

## Feature 2 — THE MCP PLUGIN (founder's description, verbatim intent)

A one-line install onto the user's own LLM/coding agent:
- **Windows:** a `curl` command
- **Mac:** a `curl` command

Once installed, the agent can call tools:
1. **Scan the codebase for vibe-coded flaws** — the CodeRabbit-shaped feature. Points at a repo,
   returns cited findings (file, line, the tell, why it reads as machine-generated boilerplate).
2. **Scan the UI/UX for weird-looking vibe-coded flaws** — renders the app/site and returns the
   visual tells (default fonts, template gradients, stock spacing, the giveaway component library
   defaults), each with a concrete citation.

This is the prevention half of the product: the agent queries it to learn what NOT to produce.
Source corpus already exists in the Lark repo (54 encoded hygiene tells + the design-tell research).

## Feature 3 — PROVE-HUMAN / verified human (interested, pending feasibility)

Flip from accusing strangers to letting creators prove authorship, with a "verified human" stamp.
Founder's question, now being researched: **can we actually get a license to verify people as
human?** (identity-verification licensing, KYC/AML obligations, whether we must be a regulated
entity, or whether we ride a provider like Stripe Identity / Persona.)

Strategic note: detection accuracy decays as generators improve; **provenance compounds.** This is
the durable business and the B2B wedge (schools, publishers, marketplaces, hiring).

## Feature 4 — The Turing gauntlet (secondary, growth + data)

Five artifacts, one human-made, spot it. Daily streaks and leaderboards. The game is simultaneously
the growth loop and the labeling pipeline that lets us publish honest accuracy numbers, which nobody
in the category does. Also the best onboarding: play it before anything is explained.

## DESIGN MANDATE (founder, 2026-08-23) — carry over everything learned on Lark Dating

**The product will be judged by its own standard.** The first thing a skeptic does is run our detector
on us. A slop detector that looks vibe-coded is dead on arrival, and conversely "we score 12/100 on
our own tool, here is the receipt" is the single best marketing asset available. **Design target: pass
our own `scan_ui` in the lowest band, and publish that.**

### Use the real tools. Do not hand-roll.
The founder's standing rule, learned expensively on Lark ("the waitlist UI kept being hand-rolled in
raw Tailwind and reading vibe-coded"): **before touching any UI, use the MCPs** — `shadcn` (search and
install REAL components), `figma` (design/layout), `canva`, `anime` (motion), `higgsfield` (generated
imagery/video). **Do not invent CSS when a component or design source exists.**

### The taste calibration Lark paid for (all of it applies here)
- **Banned typefaces: Inter, Geist, Space Grotesk.** These are the most common faces on vibe-coded
  sites; using one is self-incrimination. Lark went to **General Sans** (Fontshare, self-hosted, 4
  static weights, ~90KB, no third-party request). **A self-hosted paid/foundry face is strong NEGATIVE
  evidence in our own rule corpus** — so using one is both honest and on-brand.
- **Cream/eggshell palettes are NOT a tell** (3 of 4 funded human dating sites use them). Do not avoid
  warm neutrals out of superstition.
- **One accent colour, used sparingly**, for CTAs and moments — never smeared across the page, never
  on content that should read neutral.
- **De-slop list from the Lark waitlist rebuild:** no eyebrow pills, no ping dots, no identical card
  grids, no infinite float loops, no per-card staggers, no crushed letter-spacing, no AI-serif set.
  **One motion moment per view, maximum.**
- **Measure the RENDERED page in a real browser, never server HTML** — the discipline that caught a
  false "0 H1s" finding on Lark, and the methodological line this whole product lives on.
- Respect `prefers-reduced-motion`. SSR-safe reveals (no `initial:{opacity:0}` shipped in server HTML
  that flashes blank).
- **Show, don't tell** (the single highest-leverage Lark lesson): do not explain the mechanic in prose
  when a live demo can perform it. On Lark this became the PitchDemo. Here, the equivalent is running
  the detector on something in front of the visitor, immediately.
- **One honest human line beats a paragraph of institutional voice** (Lark's founder's note).

### Non-negotiables from the hygiene corpus (we must pass our own checks)
Real 404 page, `og:image`, canonical, sitemap, `lang`, alt text on every image, no scaffold titles, no
source maps in prod, zero console errors, no raw `*.vercel.app` domain, bundle size disciplined.
`node scripts/audit-frontend-hygiene.mjs` in the Lark repo is the reference implementation of the bar.

## Hard rules carried forward

- **Evidence per finding or it is not the product.** No black box.
- **Never a bare verdict on a screenshot** — detect re-encoding/resampling and downgrade to
  INCONCLUSIVE. Abstention is a feature.
- **No VLM narrating why something "looks AI"** — documented failure mode (fluent, specific, wrong).
- Deterministic rules for code/web; demonstration + provenance for image/video/voice.
- Separate from Lark Dating. Never conflated.
