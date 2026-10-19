# Design system — BioAvalia v0.2

A small, opinionated visual language for a daily-use business console. The
guiding idea is **an instrument, not a showpiece**: dense, legible, fast, and
quiet. Decoration never competes with the numbers.

Implemented as CSS-first Tailwind v4 tokens in
[`src/app/globals.css`](../src/app/globals.css), consumed by shadcn/ui
components in `src/components/ui` and by the app components in
`src/components/app`.

## Principles

1. **The ledger is the interface.** Tables, rows and totals are first-class;
   chrome recedes (hairline borders, flat surfaces, no drop shadows on data).
2. **Instant feedback.** Hover/press states respond in 100–150 ms. No page-load
   choreography, no staggered entrances, no parallax.
3. **Density with air.** 32 px table rows, 13 px table text, generous page
   padding. Dense where you scan, calm where you read.
4. **Familiarity over novelty.** pt-BR labels follow the spreadsheet vocabulary
   (Valor recebido, Custo do produto, Cartela, Negócio…). Native date inputs.
5. **Accessible by default.** Real `<label>`s, `aria-current` on navigation,
   `role="alert"` for errors, visible focus rings, 40 px controls on mobile.

## Color tokens

All tokens are CSS custom properties defined on `:root`. Page background is
`--paper`; raised surfaces (cards, menus, tables) are `--surface`.

| Token | Hex | Usage |
|-------|-----|-------|
| `--paper` | `#f2f3ea` | Page background — warm, green-tinted “ledger paper” |
| `--surface` | `#fafbf6` | Cards, menus, table surfaces |
| `--ink` | `#1a1f1a` | Primary text, selected segments |
| `--ink-soft` | `#5b6355` | Secondary text, labels, metadata |
| `--line` | `#dcdecd` | Hairline borders, table rules |
| `--line-strong` | `#c7cab6` | Input borders |
| `--moss` | `#2f5d3d` | Primary actions, brand, positive results |
| `--moss-ink` | `#21452d` | Text on moss tints, pressed states |
| `--moss-soft` | `#e2ede3` | Active nav item, EVS chip |
| `--citrus` | `#b9c43e` | Accent — discounts, PV highlights (sparingly) |
| `--citrus-ink` | `#6b771f` | Text on citrus tint |
| `--citrus-soft` | `#f1f4d5` | Discount chip, selection |
| `--steel` | `#35566c` | Info, focus ring, CASA chip |
| `--steel-ink` | `#2a4759` | Text on steel tint |
| `--steel-soft` | `#e3edf2` | CASA chip background |
| `--rust` | `#a33d26` | Negative values, destructive actions, errors |
| `--rust-ink` | `#7e2d1b` | Error text |
| `--rust-soft` | `#f7e4dd` | Error banner background |

Semantic aliases (`--background`, `--foreground`, `--card`, `--primary`,
`--muted`, `--accent`, `--border`, `--input`, `--ring`, `--chart-1…5`,
`--sidebar…`) map onto these values for shadcn/ui compatibility. **Light theme
only for now**; the `.dark` variant hook exists but no dark tokens are shipped.

Color is used semantically, never decoratively: moss for money-positive and
brand actions, rust for money-negative, steel for focus and CASA, citrus only
for discounts/PV attention. Origins render as small mono chips (`EVS`, `CASA`).

## Typography

- **IBM Plex Sans** (400/500/600/700) — UI and prose, loaded via `next/font`.
- **IBM Plex Mono** (400/500/600) — every number, currency, date, code and SKU.
- `.num` utility: mono + `font-variant-numeric: tabular-nums` + slight negative
  tracking. Use it for all monetary values, counts, PV, dates and codes so
  columns align when scanning.

| Element | Size / weight |
|---------|----------------|
| Page title (`h1`) | 20 px / 600, tracking-tight |
| Section title | 14 px / 600 |
| Body / inputs | 15 px / 400 |
| Table text | 13 px, headers 11 px / 500 in `--ink-soft` |
| Labels & hints | 14 px label / 11 px hint in `--ink-soft` |
| KPI value | 22 px / 500 mono |
| Chips & badges | 10–11 px / 500 |

## Layout & shape

- **Desktop**: fixed 232 px sidebar (`--paper`, right hairline, sticky), content
  column max 1120 px, page padding 24–32 px.
- **Mobile**: 52 px translucent top bar, fixed bottom navigation with the
  primary action (Lançar) raised in a moss circle; content gets 112 px bottom
  padding to clear the nav. Safe-area insets respected.
- Table rows 32 px tall (13 px text); borders are always 1 px `--line`.
- Radius: 8 px for inputs/buttons/cards (`--radius`), 4 px for chips; rows and
  tables use square corners inside a rounded container.
- KPI strip uses a 1 px gap on a `--line` background to draw hairlines between
  cells instead of cards, keeping the “instrument panel” feel.
- Forms group fields in 1–2 columns (2 columns from `sm`), native `<details>`
  for advanced fields (custos/observações).

## Motion

- Feedback only: color/background transitions (120–150 ms), button press scale
  0.98, bottom-nav action scale 0.95, dropdown/popover origin-aware fades from
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
  `Brand`, `AppShell`, `SidebarNav`, `MobileNav`, `UserMenu`, `PageHeader`,
  `OriginBadge`/`DealBadge`, `Combobox` (Popover + Command), `FlashToast`.
- Origin chips: `EVS` moss tint, `CASA` steel tint. Deal chips are neutral
  outlines; a discount renders a citrus `−14%` chip next to it.
- Empty states use the shadcn `Empty` pattern with a single clear action.
- Loading uses a 16 px ring spinner; buttons show inline “Entrando…” /
  “Registrando…” with the spinner and disable while pending.
