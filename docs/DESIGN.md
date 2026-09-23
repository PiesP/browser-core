# Quiet Instruments design contract

Quiet Instruments gives PiesP products a shared construction language without
making them visually identical. Neutral surfaces, typography, spacing, focus,
motion, icon geometry, and status colors are common. WMC uses the Iris accent,
XCOM Enhanced Gallery uses Tide, and YouTube Live Chat Overlay uses Flare.

## Tokens and CSS scope

The DTCG-format
[`quiet-instruments.tokens.json`](../src/design/quiet-instruments.tokens.json)
file is canonical. `pnpm generate:design` deterministically creates typed values
and a reference stylesheet; `pnpm check:design` rejects stale generated files
and invalid aliases, incomplete variants, or declared contrast pairs below their
minimum ratio. The generator contract lives in
[`scripts/generate-design-tokens.ts`](../scripts/generate-design-tokens.ts).

The [generated stylesheet](../src/design/generated/tokens.css) never writes to
`:root` or `html`. It applies only below `.pp-design`, selects a product with
`data-pp-product="wmc|xeg|ytco"`, and selects `light`, `dark`, or system-following
behavior with `data-pp-theme="light|dark|auto"`.

Consumers should keep their existing public token names and adapt them to this
contract. This is especially important for injected extension UI: do not import
the stylesheet globally into a host page. Canvas code and runtime-generated CSS
can consume the typed token values instead.

## Interaction semantics

The [design entry point](../src/design/index.ts) provides framework-independent
interaction contracts. `DESIGN_ICON_CONTRACT` fixes a 24-unit rounded-stroke
geometry while leaving each product free to choose its own symbols.
`OperationState` separates starting, running, completed, failed, and cancelled
work so a success check is never shown before completion; its presentation map
deliberately contains no user-facing strings. `shouldHandleGlobalShortcut`
protects text inputs, contenteditable surfaces, IME composition, and events
already handled by a closer component. Products retain their own shortcut chords
and translations. See [`icon-contract.ts`](../src/design/icon-contract.ts),
[`operation-state.ts`](../src/design/operation-state.ts), and
[`shortcut.ts`](../src/design/shortcut.ts).

Control state has independent meanings: selection identifies the current choice,
focus identifies keyboard input, and a proposed change remains pending until
execution succeeds. Warnings explain what needs attention; blocked actions
explain what must change. Keep these distinctions in text as well as color.
Cancellation requests remain busy until cleanup settles. A browser download
handoff confirms only that the request was passed to the browser.

## Consumer validation

Validate these roles in each consumer's rendered controls, including selection
with hover or keyboard focus, disabled controls, cancellation, and error
recovery. Use the consumer's supported themes, Forced Colors, narrow windows,
zoom, and long translations. Check computed styles and keyboard interactions
through the real product adapter: token contrast checks alone cannot detect
cascade conflicts, translucent surfaces, clipped controls, or lost focus.
Native clients can share these semantics with a static palette and platform
controls; layouts and renderer implementations remain product-specific.
