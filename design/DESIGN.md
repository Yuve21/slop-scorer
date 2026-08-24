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

### What actually shipped, 2026-08-24

| Role | Face | Designer / foundry | Weights shipped | Licence |
|---|---|---|---|---|
| Text + display | **IBM Plex Sans** | Mike Abbink with Bold Monday | Regular 400, Medium 500 | SIL OFL 1.1 |
| Evidence, locators, code, all numerals in a receipt | **IBM Plex Mono** | Bold Monday | Regular 400, Medium 500 | SIL OFL 1.1 |

Self-hosted `woff2` out of `/public/fonts`, subset by `scripts/vendor-fonts.mjs` from the official
`@ibm/plex-sans@1.1.0` and `@ibm/plex-mono@2.5.0` npm packages. **Zero third-party font requests.**
No Google Fonts CDN, no Adobe kit, no Fontshare link tag. Verified in a browser against the built
site: `document.fonts` reports all four faces `loaded`, the computed stack head on every heading is
`IBM Plex Sans`, the mono column is `IBM Plex Mono`, and the page makes zero off-origin requests.

| File | Subset | Shipped |
|---|---|---|
| `IBMPlexSans-Regular.subset.woff2` | see below | 17.6 KB |
| `IBMPlexSans-Medium.subset.woff2` | | 18.7 KB |
| `IBMPlexMono-Regular.subset.woff2` | | 13.1 KB |
| `IBMPlexMono-Medium.subset.woff2` | | 13.4 KB |
| **Total** | | **62.9 KB** |

Half the 120 KB cap and 40 KB under the Diatype budget below. Hinting is kept (it costs about 5 KB a
file) because most of this site is 13-16px text and a large share of the audience is on Windows,
where DirectWrite uses it.

**The subset range is measured, not copied.** It is the union of Latin-1, the two Latin-Extended-A
letters Plex's kerning expects, General Punctuation, the currency and trademark marks, and
`U+2190-2193`. That last one is load-bearing: `→` is set ten times in this codebase and is **absent
from Google Fonts' "latin" subset**, which carries only `U+2191` and `U+2193`. Shipping the
`@fontsource` latin build would have dropped every arrow on the site to a fallback face at a
different width — the exact class of defect this product sells the detection of. Emoji and CJK are
deliberately excluded: they appear in this repo only as detector *inputs*, never as UI chrome.

Loading: `font-display: swap` on all four, the two Regulars preloaded from the root layout (Medium is
below the fold on every surface), and a metric-matched fallback pair whose four override numbers are
measured rather than invented — `ascent/descent/line-gap` from the shipped subsets' `hhea` table with
fonttools, `size-adjust` from rendering the same string in both faces in headless chromium against
the running build. The numbers and their provenance are in the `globals.css` header.

### Why IBM Plex, in one paragraph

Plex is the only free, self-hostable, genuinely-drawn family on the shortlist whose sans and mono are
**one design on one skeleton**, and that is the whole argument. This product's core UI is a document
with a machine-read citation column running down it: a finding title in sans, its locator in mono,
one baseline grid, one voice. Satoshi, Switzer and Cabinet Grotesk are all good faces with no mono
sibling, so choosing one means a Frankenstein pairing in the single place the design cannot afford
one. Plex is also a commissioned face with a designer and a brief rather than a default — it was
drawn for IBM by Bold Monday, it has a slightly awkward humanist-grotesque temperament that reads as
somebody's decision, and it carries none of the AI-default associations. It is not Inter, not Geist,
not Space Grotesk, not General Sans (Lark's face — these two products must never look related), and
not Söhne. Its one genuine cost: it is free, so it does **not** earn our own
`counter.licensed-foundry-face`, which requires a self-hosted non-free face. We are not going to
pretend otherwise, and the Diatype note below is what closes that gap when somebody pays for it.

### The intended upgrade, still open: ABC Diatype

Everything from here to the end of §1 describes the face we would rather have licensed. It is kept
because the argument is still right and the purchase is still a live decision, **not** because it
describes what is on the site. Nothing below is shipped.

### Why Diatype and not the alternatives

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
commit that sets type, or we run a face we are entitled to run until it does.

**How the interim was got wrong, so nobody repeats it.** The original wording of that rule was "or we
run the system stack until it does", and `ABC Diatype` was left at the head of the CSS stack with its
`@font-face` blocks commented out. The result was not a documented interim: it was a production site
whose every headline silently rendered in **Segoe UI**, which `SELF-AUDIT.md` §4 had predicted in
advance ("do not launch in the interim state and call it the design") and which the 2026-08-24 UI
audit found first and ranked as the single largest contributor to the founder's verdict on the site.
A font stack must only ever name faces that are actually being served. If a face is unbought, it does
not appear in `--font-doc-sans`; it appears in this document.

### Weight budget, as originally planned for Diatype

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

Fallback stack (unchanged, and now sitting behind Plex rather than in front of nothing):
`ui-sans-serif, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif` and
`ui-monospace, "SF Mono", "Cascadia Mono", "Roboto Mono", Menlo, monospace`.
Note the absence of `Inter` and `system-ui` — `system-ui` resolves to Roboto/Inter-alikes and quietly
reintroduces the tell on some Linux and Android configurations.

**If the Diatype licence is bought:** run `scripts/vendor-fonts.mjs` as the model, drop the four
woff2s into `public/fonts/`, swap the four `@font-face` blocks and the two custom properties in
`globals.css`, re-measure the two `size-adjust` values against Diatype rather than reusing Plex's, and
update the table at the top of this section. Plex stays in the stack behind it as the second name.

---

## 1b. The non-UI artifact

`SELF-AUDIT.md` §Risk 1 named the largest open gap in this foundation: every human-made comparable
carries **one object that is not UI** (Amata's photographed handwriting, Rodeo's joke domain,
Overtone's 1,854-word essay) and we had none — the entire site was two SVG wireframes. Its proposal
was to print a receipt, photograph it, and let that photograph be the only image on the site. The
2026-08-24 UI audit repeated it as change 2 of 5.

**What shipped is the render, not the photograph, and the difference is stated everywhere it appears.**

| | |
|---|---|
| Asset | `apps/web/public/artifact/printed-receipt-4F2A-9C.png`, 518 KB, 1088×1568 |
| Produced by | `scripts/render-printed-receipt.mjs` — headless chromium, committed, reproducible |
| Component | `apps/web/components/artifact/printed-receipt.tsx`, a self-contained full-bleed `<section>` |
| Provenance sidecar | `apps/web/public/artifact/printed-receipt-4F2A-9C.json`, served publicly |

Four decisions in it are not cosmetic:

1. **It is labelled as a render in three places**: the figure caption, the `alt` text, and printed on
   the receipt inside the picture, in the same face and size as the rest of its footer, where a crop
   cannot separate the label from the image. A product that sells the detection of unlabelled
   synthetic imagery cannot carry an unlabelled synthetic image on its own homepage.
2. **The content is real.** Every line is rebuilt from the live `4F2A-9C` report through `@slop/core`
   and the corpus — the same six rule ids, the same points, the same 82.0 — rather than typed into a
   mockup. The script asserts the finding count and the total and fails rather than draw a stale one.
3. **It is a PNG, and it is served through a plain `<img>` rather than `next/image`.** Our own probe
   classifies any jpg/webp/avif over 320px as `photographic`; a JPEG here, or a `next/image` re-encode
   to webp, would make `counter.real-photography` fire on a picture nobody photographed. Not gaming
   our own corpus with our own image is worth more than the bytes.
4. **It claims no counter-evidence, and the page says so.** `counter.real-photography` and
   `counter.handmade-artifact` both want something a person shot or made by hand. A render is neither
   and we do not claim either. What it buys is a focal point on a page the audit measured as having
   none. When somebody prints one on real stock and photographs it, the picture is replaced, the rule
   fires honestly, and §1's `counter.licensed-foundry-face` gap is the only one left.

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
