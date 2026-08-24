# Slop Scorer — design system

Status: foundation, pre-code. Written 2026-08-23.
Governing constraint: **this product will be run through its own detector.** Every token below has to
survive `scan_ui` and a hostile human reading the CSS. No magic numbers; each line carries its reason.

Companion docs: `COMPONENTS.md` (what we install), `SURFACES.md` (what we build),
`SELF-AUDIT.md` (where we are still at risk).

---

## 0. Figma artifacts

Private personal draft, in the founder's own Drafts folder (`Yuvraj Chandyok's team`, student plan,
**View seat** — drafts are still editable, team/project files are not, so a draft was the only
compliant *and* possible option; this also matches the standing "no shared team/project file" rule).

| Artifact | URL |
|---|---|
| File | https://www.figma.com/design/NnoU34k0nkZWqRsJwYQLs2/Slop-Scorer---design-foundation--private-draft- |
| Page `Slop Scorer — surfaces` | node `1:2` |
| **RECEIPT — verdict view** (1200×1601) | https://www.figma.com/design/NnoU34k0nkZWqRsJwYQLs2?node-id=1-3 |
| **LANDING — fold runs the detector on us** (1440×1126) | https://www.figma.com/design/NnoU34k0nkZWqRsJwYQLs2?node-id=1-69 |

Both frames are set in **IBM Plex Sans / IBM Plex Mono**, which are stand-ins available inside Figma.
They are *not* the shipping faces. Read §1.

MCP calls made: `mcp__figma__whoami`, `create_new_file`, `use_figma` ×2, `get_screenshot` ×2.
**Caveat stated plainly:** the Figma server asks that `/figma-use` be loaded before `use_figma`. That
skill is not installed in this environment and there is no resource-reader tool available here to
fetch the `skill://figma/figma-use/SKILL.md` fallback. I proceeded without it, verified the output by
screenshot, and repaired the two layout defects it produced (four `SPACE_BETWEEN` rows had collapsed
to hug-width and were overlapping their own labels). Anyone continuing this work should load the
skill first.

---

## 1. Typeface

### The decision

| Role | Face | Foundry | Weights shipped |
|---|---|---|---|
| Text + display | **ABC Diatype** | Dinamo (Berlin/Basel) | Regular 400, Medium 500 |
| Evidence, locators, code, all numerals in a receipt | **ABC Diatype Mono** | Dinamo | Regular 400, Medium 500 |

Self-hosted `woff2` out of `/public/fonts`. **Zero third-party font requests.** No Google Fonts CDN,
no Adobe kit, no Fontshare link tag.

### Why this and not the alternatives

- **Inter / Geist / Space Grotesk are banned** by the founder mandate and by our own corpus — they are
  the three most common faces on vibe-coded sites. Using one is self-incrimination.
- **Söhne is rejected on purpose, and this is the most opinionated call in the document.** It is the
  obvious "serious tech" answer, and it is also OpenAI's typeface. An AI-slop detector set in the
  typeface of the largest AI company is a self-own that every design-literate reader will notice on
  first glance. Do not revisit this.
- **The Pangram Pangram catalogue (PP Mori, PP Neue Montreal) is rejected** because it has become the
  Framer/startup default. Sitch — one of the four comparables Lark measured — is set in PP Mori.
  Cheap licence, but the differentiation is gone.
- **Diatype wins on a structural argument, not a taste one:** it has a true monospace sibling drawn on
  the same skeleton. This product's core UI is a *document with a citation column* — prose and
  machine-read locators sitting on the same baseline grid. One family covering both means the evidence
  column and the sentence above it are one voice, not a Frankenstein pairing. No other face on the
  shortlist gives us that from a single licence and a single invoice.
- **A bought foundry face is negative evidence inside our own rule corpus.** Three of four funded
  human-made comparables Lark measured bought a face (Focal Maxi/Commercial Type, NaN Jaune/NaN,
  Seriously Nostalgic/Nicky Laatz). Paying for type is one of the cheapest, most reliable human
  signals there is. Buying one is therefore both honest and literally on-brand for us.

### Licence and cost

Dinamo sells a **webfont licence priced by monthly pageviews**, purchased per style at
`abcdinamo.com`. Four styles at the entry pageview tier.
**UNVERIFIED: I did not fetch live pricing.** Budget €300–700 and confirm before purchase; treat any
number I state as an estimate, not a quote.

**Hard rule, from the corpus:** Overtone ships a `Focal *Trial*` build to production and Sitch ships
`Belmonte Ballpoint *Trial*` and `Padlock Script *DEMO*`. We will not. There is no development period
during which we run an unlicensed build "just locally" — the licensed webfont lands with the first
commit that sets type, or we run the system stack until it does.

### Weight budget

| File | Subset | Est. |
|---|---|---|
| `Diatype-Regular.woff2` | latin | ~26 KB |
| `Diatype-Medium.woff2` | latin | ~26 KB |
| `DiatypeMono-Regular.woff2` | latin | ~26 KB |
| `DiatypeMono-Medium.woff2` | latin | ~26 KB |
| **Total** | | **~104 KB** |

Hard cap **120 KB**. Latin only, `unicode-range` declared, no latin-ext, no variable file (we need two
weights, not an axis, and the static pair is smaller than the VF). Reference point: Lark ships
General Sans at ~90 KB.

Loading: `font-display: swap`, plus a `@font-face` **fallback override** on the local system stack
using `size-adjust` / `ascent-override` / `descent-override` so the swap costs 0 CLS. Preload the two
Regular files only; Medium is used below the fold on both surfaces.

Fallback stack (also the pre-licence dev stack):
`ui-sans-serif, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif` and
`ui-monospace, "SF Mono", "Cascadia Mono", "Roboto Mono", Menlo, monospace`.
Note the absence of `Inter` and `system-ui` — `system-ui` resolves to Roboto/Inter-alikes and quietly
reintroduces the tell on some Linux and Android configurations.

---

## 2. Palette

**One accent. No severity ramp.** That second half is the important part and it is a legal decision as
much as an aesthetic one: this product must never *assert* that something is AI. A red/amber/green
severity scale asserts it in colour before a single word is read, and a court reading a screenshot
would see a verdict. So the palette contains **no red, no amber, no green**. Findings are set in ink;
the only chromatic element on a receipt is the accent, and the accent means *interactive*, never
*guilty*.

This also, conveniently, deletes an entire family of slop tells at once (the emerald-check /
rose-warning / violet-primary Tailwind default triad).

### Light

| Token | Hex | Role | Why |
|---|---|---|---|
| `--surface` | `#F4F4F2` | page | Neutral warm-grey, the colour of thermal receipt stock. Warm neutrals are explicitly *not* a tell (3 of 4 funded human dating sites use one) but this is deliberately **greyer than cream** so it is never confused with Lark's `#F4EFE4` paper. Different product, different room. |
| `--surface-raised` | `#FFFFFF` | receipt card, figure frame, evidence rows | Pure white sits *on* the paper, so a receipt reads as a document laid on a desk. This is the only place white appears. |
| `--ink` | `#14161A` | body + display text | Near-black with a faint cool cast. Not `#000000` (a default) and not `#111827` (Tailwind gray-900, a default). |
| `--ink-muted` | `#5A6068` | citations, metadata, timestamps | One step down, still AA at body size. Not a 40%-opacity black — opacity-derived greys are a scaffold habit. |
| `--hairline` | `#C9C9C3` | decorative structure: row separators, card edges | Explicitly non-load-bearing. Does not need 3:1 (WCAG 1.4.11 applies to boundaries required to identify a control) and is documented as such so nobody "fixes" it later. |
| `--border-control` | `#8A8A84` | inputs, buttons, the figure frame | Load-bearing. Meets 3:1. |
| `--accent` | `#123E70` | CTA fill, evidence locators, links | Deep cobalt ink. Institutional, not alarming. Deliberately **not** a Tailwind hex (`#3B82F6`, `#6366F1`, `#8B5CF6` are all named tells), not a dev-tool acid lime, not a gradient endpoint. |
| `--accent-ink` | `#FFFFFF` | text on accent | |

### Dark

| Token | Hex | Role |
|---|---|---|
| `--surface` | `#101215` | page. Not `#000` — pure black destroys elevation and is a default. |
| `--surface-raised` | `#191C21` | receipt card |
| `--ink` | `#E8E8E4` | body |
| `--ink-muted` | `#9AA0A8` | citations |
| `--hairline` | `#2A2E34` | decorative |
| `--border-control` | `#4C525A` | load-bearing |
| `--accent` | `#7FA8E8` | lifted cobalt, legible on dark |
| `--accent-ink` | `#101215` | text on accent |

### Contrast, computed (WCAG 2.x relative luminance, not eyeballed)

| Pair | Ratio | Verdict |
|---|---|---|
| `--ink` `#14161A` on `--surface` `#F4F4F2` | **16.6 : 1** | AAA |
| `--ink` on `--surface-raised` `#FFFFFF` | **18.1 : 1** | AAA |
| `--ink-muted` `#5A6068` on `--surface` | **5.8 : 1** | AA body, AAA large |
| `--accent` `#123E70` on `--surface` | **9.7 : 1** | AAA |
| `--accent-ink` `#FFFFFF` on `--accent` fill | **10.6 : 1** | AAA |
| `--border-control` `#8A8A84` on `--surface` | **3.19 : 1** | passes 1.4.11 (3:1) |
| `--hairline` `#C9C9C3` on `--surface` | 1.53 : 1 | decorative only, by declaration |
| dark `--ink` `#E8E8E4` on dark `--surface` `#101215` | **15.3 : 1** | AAA |
| dark `--ink-muted` `#9AA0A8` on dark `--surface` | **7.1 : 1** | AAA |
| dark `--accent` `#7FA8E8` on dark `--surface` | **7.7 : 1** | AAA |

Nothing on either surface relies on colour alone to carry meaning — a hard requirement here, since the
palette has no severity ramp to lean on in the first place.

---

## 3. Type scale

Ten steps, all snapped to the 4px grid, **not** a clean geometric ratio. A perfectly regular 1.25 ramp
is itself a generated-looking artifact; the irregular steps (13, 21, 26) are human choices and are
meant to be visible as such under audit.

| Token | px | Line-height | Face / weight | Use |
|---|---|---|---|---|
| `--t-mono-xs` | 12 | 145% | Mono Medium, `+0.06em` | mastheads, chips (`INCONCLUSIVE`), the fold marker |
| `--t-mono-sm` | 13 | 145% | Mono Regular | citations, timestamps, machine metadata |
| `--t-mono-md` | 14 | 145% | Mono Medium/Regular | panel labels **and the equal-prominence disclaimer** — these two share a size by law, not by accident |
| `--t-sm` | 14 | 145% | Sans Regular | secondary UI |
| `--t-body` | 16 | 145% | Sans Regular/Medium | finding titles, controls |
| `--t-lg` | 18 | 140% | Sans Regular | long-form method copy |
| `--t-lead` | 21 | 132% | Sans Regular | the claim sentence under a receipt headline |
| `--t-h3` | 26 | 128% | Sans Medium, `-0.005em` | section heads ("What let us shortcut it") |
| `--t-h2` | 32 | 118% | Sans Regular, `-0.01em` | |
| `--t-h1` | 42 | 108% | Sans Regular, `-0.01em` | receipt headline |
| `--t-display` | 56 | 106% | Sans Regular, `-0.01em` | the elapsed-time figure; landing H1 at 52 |

Two rules that come straight out of the Lark audit and are non-negotiable:

1. **The headline is set at Regular 400, not Bold.** Every measured human comparable sets its headline
   *lighter* than expected: Overtone 500, Rodeo 700, **Amata 300**. Lark's Inter 800 hero was one of
   the things that read machine-made. Our largest type is our lightest weight.
2. **Tracking never goes below `-0.01em`.** "Crushed letter-spacing" is a named tell; Lark was shipping
   `-0.04em` at weight 800. `-0.01em` at 400 is optical correction. `-0.04em` at 800 is a look.

Never used anywhere: `letter-spacing` above `+0.08em` on sentence case, all-caps sans headings,
italic serif, and any face outside the two above.

---

## 4. Spacing grid

4px base. Allowed steps:

```
4  8  12  16  20  24  32  44  64  96
```

`20` and `44` are deliberately off a pure doubling ramp. That is not decoration — it is a direct
countermeasure to our own `SPACE-02` rule ("every gap on the page ∈ {16, 24, 32, 64}: no off-scale
value anywhere"). A layout whose gaps are entirely predictable from the default scale is one of the
strongest machine-authorship signals we detect, and we would fail our own check without this.

Component padding is intentionally uneven where the content asks for it: receipt gutters are 72,
figure panels are 20, evidence rows are `18` vertical / `20` horizontal, buttons are `14/22`. Every
one of those is a decision about that element, not a token applied globally.

Measure: content column caps at **1056px** on the receipt, **1248px** on the landing. Prose line
length caps at **72ch** (the claim sentence, the method copy) — long measures are how a report starts
looking like a blog template.

---

## 5. Radii

| Token | Value | Applied to | Why |
|---|---|---|---|
| `--r-doc` | `0` | receipt frame, figure frame, evidence rows, panels | **Documents do not have rounded corners.** This is the single strongest visual argument the product makes about itself. |
| `--r-control` | `3px` | buttons, inputs, chips | Just enough to read as pressable. |
| `--r-overlay` | `6px` | dialog, popover, tooltip | |

**Banned: `16px` (`rounded-2xl`).** Lark's audit named the `rounded-2xl` + hairline-border +
diffuse-shadow card as a signature slop combination, and shadcn's default `--radius` of `0.625rem`
(10px) applied uniformly is the same tell one notch quieter. We override the shadcn radius token at
install time rather than accepting it.

---

## 6. Elevation

**There are no box-shadows in light mode. None.**

Elevation is expressed by two things only: a change of surface value (`#F4F4F2` → `#FFFFFF`) and a
1px border. The named tell we are avoiding is Lark's own `--shadow-sm: 0 1px 2px, 0 6px 16px` — the
two-layer hairline-plus-diffuse stack that ships with every component library and every generated
card.

Dark mode gets exactly one affordance, because surface-value change alone is too weak there: a 1px
top inner highlight, `inset 0 1px 0 rgba(255,255,255,0.04)`. Nothing else.

Overlays (dialog, popover) may use a single scrim: `rgba(20,22,26,0.42)`. That is a modality signal,
not elevation.

---

## 7. Motion budget

**One moment per view. Total budget 500 ms. Transform and opacity only.**

The one moment on the receipt view is **the reveal of the reproduction**, and it is a three-beat
timeline, not three animations:

| Beat | What | Duration | Offset |
|---|---|---|---|
| 1 | The elapsed figure counts `0.0 → 8.4` | 480 ms | 0 |
| 2 | The `GENERATED BY US` panel wipes in beside the submitted one (opacity + 8px translateX) | 320 ms | `-=340` |
| 3 | The evidence list appears **as one block** (opacity + 2px translateY) | 180 ms | `-=140` |

Wall-clock end to end: ~500 ms.

Beat 3 is one block **on purpose**: per-card staggers are on the de-slop list. A staggered evidence
list would also be a lie about the data — the findings were computed simultaneously.

Beat 1 is the honest centrepiece: the number counting up is the product's entire thesis, and it is a
*measured* number, so animating it is reporting rather than decoration.

Library: **anime.js**. Sourced from `mcp__gateway__anime__*`:
`list_anime_components` (8 components: `anime()`, `anime.timeline()`, `anime.stagger()`,
`anime.random()`, `anime.set()`, `anime.get()`, `anime.remove()`, `anime.path()`),
`get_anime_example('timeline-sequence')` for the citable timeline-with-negative-offset pattern,
`get_anime_docs('performance')` for the transform/opacity-only and `will-change` guidance, and
`get_anime_docs('getting-started')` for the object-target pattern
(`targets: {x: 100}` — non-DOM animation) which is exactly how the count-up in beat 1 is driven.

**Version discrepancy, stated rather than papered over:** the MCP server documents **anime.js 3.2.1**
(`anime.timeline()`, `import anime from 'animejs/lib/anime.es.js'`). Anime.js v4 renamed this to
`createTimeline` and changed the import surface. Either pin `animejs@3.2.1` to match the cited example
exactly, or install v4 and port the three beats — but do not assume the MCP snippet compiles against
whatever `npm i animejs` resolves to today.

Rules the budget enforces:

- `prefers-reduced-motion: reduce` → **jump to the end state.** The number renders as `8.4 s`
  immediately, the panel is present, the list is present. No fade-only "compromise" version.
- **SSR-safe.** No `initial: { opacity: 0 }` shipped in the server HTML. The end state is the markup;
  the animation runs backwards from it after hydration. A blank flash on a receipt is worse than no
  animation, and a server-rendered `opacity:0` is itself a hydration tell.
- No infinite loops, anywhere, ever. No floats, no pulses, no ping dots, no shimmer.
- `will-change` set on entry and removed on `complete`.

The landing page's one moment is **the same component** — the live self-scan card resolving. It is
literally the receipt reveal, at smaller scale, which is why the landing page needs no motion of its
own.
