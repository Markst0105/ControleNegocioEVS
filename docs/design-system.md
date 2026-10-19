# Design system — Controle de Negócio v0.3

A small, opinionated visual language for a daily-use business console. The
guiding idea is **an instrument with a voice**: the ledger stays dense and fast,
while the brand appears at the threshold — the side column, the month masthead and
the mobile panel — instead of decorating the data.

The current identity follows the **Balcão** direction: warm ledger paper, deep
moss chrome, a citrus marker, a leaf that opens the mobile panel, and an
editorial serif for headings. The month is the signature display element set in
Bricolage Grotesque (the dominant KPI reuses that face); section titles
deliberately use a different typeface.

Implemented as CSS-first Tailwind v4 tokens in
[`src/app/globals.css`](../src/app/globals.css), consumed by shadcn/ui
components in `src/components/ui` and by the app components in
`src/components/app`.

## Principles

1. **The ledger is the interface.** Tables, rows and totals are first-class;
   chrome recedes (hairline rules, flat surfaces, no drop shadows on data).
2. **Identity at the threshold.** Brand colour lives in the desktop side column
   and the mobile panel, not in every card. The working surface stays quiet.
3. **Instant feedback.** Hover/press states respond in 100–150 ms. No page-load
   choreography, no staggered entrances, no parallax.
4. **Density with air.** 36–40 px table rows, 13 px table text, generous page
   padding. Dense where you scan, calm where you read.
5. **Familiarity over novelty.** pt-BR labels follow the spreadsheet vocabulary
   (Valor recebido, Custo do produto, Cartela, Negócio…). Native date inputs.
6. **Accessible by default.** Real `<label>`s, `aria-current` on navigation,
   `aria-label` on icon-only controls, visible focus rings, 40 px controls on
   mobile, focus-trapped and Escape-closable mobile panel.

## Color tokens

All tokens are CSS custom properties defined on `:root`. Page background is
`--paper`; raised form surfaces and menus are `--surface`.

| Token | Hex | Usage |
|-------|-----|-------|
| `--paper` | `#f2f3ea` | Page background — warm, green-tinted “ledger paper” |
| `--surface` | `#fafbf6` | Form sections, menus, dropdowns, cards |
| `--ink` | `#1a1f1a` | Primary text, selected segments |
| `--ink-soft` | `#5b6355` | Secondary text, labels, metadata |
| `--line` | `#dcdecd` | Hairline borders, table rules |
| `--line-strong` | `#c7cab6` | Input borders |
| `--moss` | `#2f5d3d` | Brand mark, positive results, EVS stripe |
| `--moss-ink` | `#21452d` | Desktop side column, mobile top bar/panel, text on moss tints |
| `--moss-soft` | `#e2ede3` | Active nav tint (light contexts), EVS chip |
| `--citrus` | `#b9c43e` | Accent — primary CTA, attention |
| `--marker` | `#c3cf3f` | Month marker only — exact accent from direction A |
| `--citrus-ink` | `#6b771f` | Text on citrus tint |
| `--citrus-soft` | `#f1f4d5` | Discount chip, selection |
| `--steel` | `#35566c` | Info, focus ring, CASA stripe |
| `--steel-ink` | `#2a4759` | Text on steel tint |
| `--steel-soft` | `#e3edf2` | CASA chip background |
| `--rust` | `#a33d26` | Negative values, destructive actions, errors |
| `--rust-ink` | `#7e2d1b` | Error text |
| `--rust-soft` | `#f7e4dd` | Error banner background |

Semantic aliases (`--background`, `--foreground`, `--card`, `--primary`,
`--muted`, `--accent`, `--border`, `--input`, `--ring`, `--chart-1…5`,
`--sidebar…`) map onto these values for shadcn/ui compatibility. **Light theme
only for now**; the `.dark` variant hook exists but no dark tokens are shipped.

Color is used semantically, never decoratively: moss for money-positive, brand
and EVS; rust for money-negative; steel for focus and CASA; citrus for primary
calls to action and discount/PV attention; `--marker` for the month marker band
only.

## Typography

Four faces, each with a job:

- **Bricolage Grotesque** (variable) — brand wordmark, the month masthead and
  the dominant KPI number. Display only; never body copy.
- **Instrument Serif** (400) — page titles, section titles and empty-state
  titles. The contrast with the month is intentional.
- **IBM Plex Sans** (400/500/600/700) — UI, labels, prose and controls.
- **IBM Plex Mono** (400/500/600) — every number, currency, date, code and SKU.

`.num` utility: mono + `font-variant-numeric: tabular-nums` + slight negative
tracking. Use it for all monetary values, counts, PV, dates and codes so columns
align when scanning.

| Element | Face / size / weight |
|---------|----------------------|
| Month masthead (`h1` on Painel) | Bricolage, 44–58 px / 600, tracking −0.045em |
| Month year | Bricolage, 20–23 px / 400 in `--ink-soft` |
| Page title (`h1` elsewhere) | Instrument Serif, 32–36 px / 400 |
| Section title | Instrument Serif, 25–28 px / 400 |
| Form section title | Instrument Serif, 19–20 px / 400 |
| Dominant KPI | Bricolage, 32–38 px / 600 |
| Secondary KPI | Plex Mono, 19–21 px / 500 |
| Brand wordmark | Bricolage, 15 px / 600 |
| Body / inputs | Plex Sans, 15 px / 400 |
| Table text | 13 px; headers 10.5 px / 500 in `--ink-soft` |
| Labels & notes | 11.5 px label / 10.5 px note in `--ink-soft` |
| Chips & badges | 10–11 px / 500 |

Instrument Serif has only one weight. Do not apply `font-semibold` to serif
titles; use size and the surrounding rule to establish hierarchy.

The month marker (`.month-mark`, used on the `<mark>` inside the month `h1`) is a
solid `--marker` band behind the lower 30% of the word, starting 12% above the
box bottom. It is a partial marker, not a filled highlight.

## Layout & shape

- **Desktop side column**: 232 px, sticky, full height, `--moss-ink`. It carries
  the brand, the full-width citrus “Lançar venda” CTA, navigation and the account
  menu at the bottom. The page content sits to its right; the column is part of
  the layout, not an overlay.
- **Mobile top bar**: 56 px sticky, `--moss-ink`, cream wordmark. The leaf mark is
  the panel trigger; the compact account menu sits at the right. The primary
  action lives in the bottom navigation and in the panel.
- **Mobile side panel**: 304 px (never wider than the viewport minus 48 px),
  fixed to the left, `--moss-ink`, portaled above a 50% ink scrim with a
  two-pixel blur and a strong drop shadow. It overlays the page; the page never
  reflows or changes width. `scrollbar-gutter: stable` on `html` prevents
  scrollbar-induced shifts. The panel mirrors the desktop column: brand, citrus
  CTA, navigation and account menu. Clicking a link closes it. Escape and the
  scrim close it; focus is trapped and returned to the leaf button.
- **Content**: one column, max 1120 px, page padding 16–32 px.
- **Mobile**: the top bar and panel, plus a fixed bottom navigation with the
  primary action raised in a citrus circle; content gets 112 px bottom padding to
  clear the nav. Safe-area insets respected.
- **Painel masthead**: “Painel · mês corrente” eyebrow, large month with the
  partial `--marker` band, year in soft ink, an “Em aberto” stamp and the update
  date in mono. No page title “Painel” — navigation provides that context.
- **KPI strip**: a single `dl` on `--paper` with 1 px `--line` gaps and top/bottom
  rules. No cards; the dominant ganho value is display type, the other three are
  mono. On mobile the first and last cells span both columns.
- **Tables**: full-bleed, top rule in ink, header rule, hairline rows and a 3 px
  origin stripe in the first cell (moss for EVS, steel for CASA). Rows are 36–40
  px tall. No rounded container around the table.
- **Forms** keep grouped `--surface` sections for focus, with 1–2 columns (2 from
  `sm`), native `<details>` for advanced fields (custos/observações).
- **Radius**: 8 px for inputs/buttons/form sections (`--radius`), 4 px for chips
  and stamps; tables and KPI bands are square.
- **Bold primary actions**: “Lançar venda” and “Registrar venda” use weight 700.
  Citrus CTA labels use `--primary-foreground` (pastel white), as requested; other
  buttons stay at 500.

## Motion

- The mobile side panel slides in from the left in 300 ms and out in 200 ms; the
  scrim fades. The desktop side column is static. This is the only large motion
  in the app.
- Feedback only: color/background transitions (120–150 ms), button press scale
  0.98, leaf press scale 0.95, dropdown/popover origin-aware fades from
  shadcn/tw-animate-css.
- No entrance animations on page load, no scroll-triggered effects.
- `prefers-reduced-motion: reduce` collapses all animations/transitions to
  effectively zero in `globals.css`.

## Formatting conventions (pt-BR)

| Kind | Format | Example |
|------|--------|---------|
| Money | `Intl.NumberFormat("pt-BR", BRL)` | `R$ 1.234,56` |
| Date (display) | `dd/mm/aaaa` | `19/10/2026` |
| Month | lowercase month + year | `outubro de 2026` |
| Percent in DB | fraction (`0.14`) | shown as `14%` |
| Percent input | human percent (`14`) | parsed to `0.14` |
| PV / quantities | 2 decimals | `1.953,80` |
| Business timezone | `America/Sao_Paulo` | “today”/“current month” |

Money/percent inputs accept both `1.234,56` and `1234.56` (`parseMoneyInput`),
and normalize to pt-BR on blur. Invalid values return friendly pt-BR messages
from the server action, never raw database errors.

## Component conventions

- shadcn/ui (new-york style) is the base; components are owned source in
  `src/components/ui` and themed exclusively through tokens.
- App-level components live in `src/components/app`:
  `Brand`, `AppShell`, `AppSidebar`, `SidePanel`, `SidebarNav`, `MobileNav`,
  `UserMenu`, `PageHeader`, `OriginBadge`/`DealBadge`, `Combobox`
  (Popover + Command), `FlashToast`.
- `BrandMark` is the leaf logo: moss square/cream leaf by default, cream square/
  moss leaf on dark chrome (`tone="paper"`). It is static in the desktop side
  column and the mobile panel; in the mobile top bar it is the panel trigger.
- Origin chips: `EVS` moss tint, `CASA` steel tint, reinforced by the row stripe.
  Deal chips are neutral outlines; a discount renders a citrus `−14%` chip next
  to it.
- Empty states use the shadcn `Empty` pattern with a single clear action; their
  title uses Instrument Serif and the action is bold.
- Loading uses a 16 px ring spinner; buttons show inline “Entrando…” /
  “Registrando…” with the spinner and disable while pending.

## Font loading

The app loads all four families through `next/font/google` in
`src/app/layout.tsx`, which self-hosts the files at build time. The static study
in `docs/design/identity-directions.html` uses Google Fonts directly and needs
network access; the application itself does not.
