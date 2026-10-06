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

### Contract ownership and examples

The existing operation and shortcut APIs cover the shared semantics. Product
adapters own the visible labels, DOM roles, focus, lifecycle transitions, and
localized number formatting. No common UI component or identical state names
are required.

| Expectation | Shared coverage | Consumer responsibility |
| --- | --- | --- |
| Unknown versus known progress | `running` accepts `progress: null`; `getOperationProgressRatio` validates finite bounds and clamps overruns. | Omit `aria-valuenow` for unknown work; retain genuine 0% and show ETA only from measured data. |
| Busy versus terminal | Presentation and type guards depend on status, including running at 0% and 100%. | Keep finalization busy; enter success only when the operation actually finishes. |
| Cancellation request versus cleanup | A pending operation can remain `running` with `progress: null`. | Display the product's cancellation message while awaiting owned-resource cleanup; enter `cancelled` only afterwards. |
| Browser handoff versus disk completion | Core does not observe browser downloads or disk writes. | Describe a successful handoff as a handoff; do not claim the file has been saved. |
| Collection position versus operation progress | Operation progress describes work, not a media index. | Give the current item a localized collection-position description, using the same item as navigation and download. |
| Selection, focus, proposed change | These independent meanings belong to the interaction contract above. | Render each meaning separately; retain selected state with hover/focus and explain pending changes in text. |

[`operation-state.test.ts`](../test/design/operation-state.test.ts) checks unknown
progress, lifecycle presentation, and numeric boundaries.
[`shortcut.test.ts`](../test/design/shortcut.test.ts) exercises handled events,
inputs, contenteditable boundaries, shadow DOM, and IME composition. Token
generation and [`tokens.test.ts`](../test/design/tokens.test.ts) retain declared
aliases, variants, scope, and contrast checks.

`OPERATION_PRESENTATION.announcement` is a starting policy for operation
transitions, not an instruction to announce every render. Products should
announce an actionable failure in context, avoid repeated assertive alerts for
unchanged diagnostics, and keep continuous progress outside live narration.

Rendered evidence stays with the owning products:

- [dropconvert #261](https://github.com/PiesP/wasm-motion-converter/issues/261)
  owns analysis/conversion busy states, cancellation cleanup, focus recovery,
  diagnostics, and animated-result controls. Its component checks include
  `test/unit/components/progress-bar.test.tsx`; service cancellation tests and
  browser/Windows profiles establish different parts of the flow.
- [XCOM #238](https://github.com/PiesP/xcom-enhanced-gallery/issues/238) owns
  position/download identity, selected fit controls, and return-to-post focus.
  `test/e2e/specs/gallery.spec.ts` and `download-flow.spec.ts` exercise the
  rendered gallery; `validation/windows/README.md` distinguishes artifact-only
  checks from installed-extension and optional public-page evidence.
- [YouTube overlay #175](https://github.com/PiesP/yt-live-chat-overlay/issues/175)
  owns font-control grouping, save/reset feedback, and preview motion.
  `test/e2e/specs/accessibility.spec.ts`, `settings-persistence.spec.ts`, and
  `settings-visual.spec.ts` cover product adapters, alongside main/Worker
  renderer tests. Fixture parity does not establish live YouTube acceptance.
- [DarkReNamer #63](https://github.com/PiesP/DarkReNamer/issues/63) owns native
  proposal-reset wording, workbench scaling, and close-wait feedback. Windows
  callbacks, mutation authorization, and recovery lifetimes remain native policy.

These issue links assign evidence ownership; they do not claim those campaigns
have passed. Each consumer should record its supported appearance modes,
Forced Colors, reduced motion, narrow desktop windows, 200% browser zoom where
applicable, and long translations. UI CSS motion, Canvas animation, and animated
image content require separate checks. Do not add unsupported themes or mobile
targets to satisfy this matrix. Token/unit success, rendered fixture checks,
installed artifacts, and human or assistive-technology acceptance are distinct
evidence; none proves the others. Peglin's game-build eligibility and rendering
remain outside this browser library.
