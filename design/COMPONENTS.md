# Components

Everything here came out of the shadcn MCP against the `@shadcn` registry, not out of my head.
Calls made: `get_project_registries`, `list_items_in_registries` (61 `registry:ui` items enumerated),
`search_items_in_registries`, `view_items_in_registries`, `get_item_examples_from_registries`
(`empty-demo`, `item-demo`), `get_add_command_for_items`, `get_audit_checklist`.

> Note on tooling: `get_project_registries` returns an **empty** registry list because the workspace
> has no `components.json` yet. The registry calls still resolve against `@shadcn` when it is named
> explicitly. Also, the `Add command:` line in `list_items_in_registries` / `search_items_in_registries`
> output is literally `[object Promise]` — a bug in that server. The commands below come from
> `get_add_command_for_items`, which is correct.
>
> Second note: fuzzy search is single-concept. `search_items_in_registries("tabs accordion
> collapsible")` returns **zero** results while each term individually matches. Enumerate with
> `list_items_in_registries` instead of guessing at multi-word queries.

---

## Install

One command, run after `npx shadcn@latest init` (which is what creates `components.json`):

```bash
npx shadcn@latest add @shadcn/card @shadcn/item @shadcn/empty @shadcn/resizable @shadcn/tabs \
  @shadcn/dialog @shadcn/tooltip @shadcn/alert @shadcn/badge @shadcn/separator @shadcn/button \
  @shadcn/collapsible @shadcn/scroll-area @shadcn/table @shadcn/skeleton @shadcn/spinner \
  @shadcn/kbd @shadcn/field @shadcn/input-group @shadcn/sonner @shadcn/aspect-ratio \
  @shadcn/hover-card @shadcn/progress @shadcn/toggle-group
```

**Immediately after init, before writing any component,** override the generated theme: set
`--radius` to `0` (see `DESIGN.md` §5), replace the default neutral scale with our tokens, and delete
the `--destructive` / `--chart-1..5` variables. Those are the shadcn defaults that make every
shadcn app look like every other shadcn app, and `--destructive` in particular would reintroduce the
severity ramp the palette deliberately does not have.

---

## Per surface

### Receipt / verdict view

| Need | Component | Notes |
|---|---|---|
| The receipt container | `@shadcn/card` | Radius 0, no shadow, 1px `--border-control`. |
| The **figure** holding the side-by-side | `@shadcn/aspect-ratio` per panel, inside one `card` | The disclaimer is a sibling **inside the same card**. See below. |
| Draggable split between original and recreation | `@shadcn/resizable` (`react-resizable-panels@^4`) | Optional interaction, off by default. |
| Evidence / findings list | **`@shadcn/item`** | The single most important pick. `Item / ItemMedia / ItemContent / ItemTitle / ItemDescription / ItemActions` maps 1:1 onto locator / title / citation / verify-link. Deps: `radix-ui`. `variant="outline"`, `size="sm"`. |
| Rows as a list | `@shadcn/separator` + a 1px-gap flex column | We use a hairline-coloured parent with `gap: 1px` rather than per-row borders, so no double-border seams. |
| Locator chips (`FONT-01`, `INCONCLUSIVE`) | `@shadcn/badge` `variant="outline"` | Never `variant="destructive"`. |
| Expanding a finding to raw evidence | `@shadcn/collapsible` | Inline, in place. Not a modal — the evidence must stay next to the claim. |
| Raw evidence payload (bytes, computed styles, prompt) | `@shadcn/scroll-area` + a `<pre>` styled with `--t-mono-sm` | See "what we are not using" for why not a code-block component. |
| Rule ID → full rule definition | `@shadcn/hover-card` (pointer) + `@shadcn/tooltip` (focus/keyboard) | Both, because a hover-only affordance is inaccessible. |
| Method / prompt / provenance disclosure | `@shadcn/dialog` | |
| Keyboard hints in the method dialog | `@shadcn/kbd` | |
| `inconclusive` and `not_assessed` bands | `@shadcn/alert` | Default variant only. Neutral ink, `--border-control`, no icon colour. |
| Loading a receipt | `@shadcn/skeleton` shaped as the actual figure | Not `@shadcn/spinner` — a spinner tells you nothing; a skeleton in the receipt's own geometry tells you what is coming. |
| In-flight reproduction (long, 5–60s) | `@shadcn/progress` **only if the backend reports real stages** | If we cannot report a true stage, this is a fake progress bar and it does not ship. |
| Export / share confirmation | `@shadcn/sonner` | |
| Comparison tables (hygiene run, 54 checks) | `@shadcn/table` | |

### Landing page

| Need | Component | Notes |
|---|---|---|
| The live self-scan card in the fold | `@shadcn/card` + `@shadcn/item` | Literally the same two components as the receipt. The landing page is not a separate design language; it is the product, rendered smaller. |
| URL input + submit as one control | **`@shadcn/input-group`** | One bordered control, not an input floating next to a detached button. |
| Form structure, label, validation copy | `@shadcn/field` | |
| Empty / pre-scan state | **`@shadcn/empty`** (`Empty / EmptyHeader / EmptyMedia / EmptyTitle / EmptyDescription / EmptyContent`) | Verified via `get_item_examples_from_registries("empty-demo")`. |
| Nav | plain `<nav>` + `@shadcn/button variant="ghost"` | |
| Modality switch (URL / image / repo) | `@shadcn/toggle-group` | |

### MCP plugin page

`@shadcn/tabs` (macOS / Windows / manual), `@shadcn/button` with a copy affordance, `@shadcn/kbd`,
`@shadcn/scroll-area`, `@shadcn/table` for the tool reference.

---

## What we are deliberately NOT using, and why

| Not using | Why |
|---|---|
| `@shadcn/chart` (recharts) | We report *citations*, not distributions. A confidence chart is the exact readout the founder rejected, and shipping the component invites someone to build one. Also drags in recharts. |
| `@shadcn/progress` on the reproduction pipeline **unless stages are real** | A progress bar that is not measuring anything is a lie in a product whose entire pitch is measurement. |
| `@shadcn/carousel` | A carousel of findings hides evidence behind an interaction. Everything cited is visible or one `collapsible` away. |
| `@shadcn/avatar` | We never name or depict a creator. There is no person in this UI, by legal design. |
| `@shadcn/sidebar` | A dashboard shell we do not need. It is also the single most recognisable "I ran the shadcn blocks generator" artifact in existence. |
| `@shadcn/accordion` (in favour of `collapsible`) | Accordion's one-open-at-a-time semantics means opening evidence B closes evidence A. Findings must be comparable side by side. |
| `@shadcn/alert variant="destructive"` and `--destructive` entirely | Red is an assertion of guilt. The product must not assert. Deleted from the theme so it cannot be reached. |
| A syntax-highlighted code block component | Highlighting is a taste layer applied to someone else's source. The evidence payload renders as plain mono with the cited span underlined in `--accent` and nothing else coloured. That is a forensic exhibit, not a code sample. |
| `@shadcn/drawer` / `@shadcn/sheet` | Everything on desktop is a document. Mobile uses `dialog`. |
| shadcn **blocks** (`registry:block`) of any kind | Pre-composed marketing sections are the tell. We compose from primitives. |
| Any icon set as a decorative layer | Icons appear only where they carry information (`ItemMedia` on a finding type). No icon tiles above headings — a named tell. |
| `next/font/google` | Any Google Fonts request is a third-party font request. Faces are self-hosted `woff2` via a local `@font-face`. |

---

## Audit checklist

Returned verbatim by `mcp__gateway__shadcn__get_audit_checklist`, to be run after every component
batch:

- [ ] Ensure imports are correct i.e named vs default imports
- [ ] If using next/image, ensure images.remotePatterns next.config.js is configured correctly
- [ ] Ensure all dependencies are installed
- [ ] Check for linting errors or warnings
- [ ] Check for TypeScript errors
- [ ] Use the Playwright MCP if available

Our additions, non-negotiable, from the Lark corpus:

- [ ] **Measured in a real browser at 390×844 and 1440×900, not in server HTML.** Lark's "0 H1s"
      false finding came from reading the response body of a client-rendered route.
- [ ] shadcn `--radius` overridden to 0; `--destructive` and `--chart-*` deleted from the theme
- [ ] Zero `rounded-2xl`, zero two-layer box-shadows, zero gradients in the built CSS (grep the
      output, not the source)
- [ ] Exactly one animation timeline per route
- [ ] `prefers-reduced-motion` honoured by jumping to end state
