# Design tokens — Figma bridge

`figma-tokens.json` is the platform palette (colors + font families + shadow
scale), generated from the single source of truth `app/globals.css` `:root`.
It is committed so a designer can import it without running the app.

## App → Figma (export)

```bash
npm run design:tokens        # regenerate figma-tokens.json from globals.css
```

In Figma, install the **Tokens Studio** plugin → Import → load
`figma-tokens.json`. Colors come through as exact `#rrggbb` (the hex in the
globals.css comments is designer-rounded; this export carries the true
HSL→hex). Type is the W3C Design Tokens format (`$value`/`$type`).

## Figma → App (round-trip)

When a designer edits tokens in Tokens Studio and exports the JSON back,
`globalsCssVarsFromTokens` (in `lib/design/figma-tokens.ts`) converts each
color back to the `H S% L%` triplet form that Tailwind's `hsl(var(--x))`
wiring expects — paste those lines into the `:root` block of `globals.css`.
Keep `globals.css` as the source of truth; never hand-edit
`figma-tokens.json`.

## PowerPoint / PDF

The same hex palette is what the deck/report exporters use for brand color,
so a Figma palette change flows through to IM decks and PDFs once it lands in
`globals.css`.
