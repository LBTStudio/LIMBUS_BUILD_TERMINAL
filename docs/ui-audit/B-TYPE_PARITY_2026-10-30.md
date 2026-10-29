# B-type production UI parity audit — 2026-10-30

## Basis

This pass uses the maintained design review `LBT_UI_Refinement_Review.md` and the interactive `LBT_UI_Refinement_Prototypes.html` from the user Library package `LBT_UI_Refinement_Package.zip`, plus the current production React DOM and UI screenshot artifacts. The prototype package is not tracked in this repository, but it is available as the design source for this audit. Existing application state, persistence, import, and CCFOLIA generation paths are preserved.

## Confirmed defects addressed here

- The Basic sheet showed the portrait and identity fields but had no live CCFOLIA-token summary in the identity column, despite the design review specifying an in-place token preview that follows name, PL name, initiative, and color.
- The ST list and label/parameter editor were both rendered as one long vertical sequence. The review calls for distinct ST, labels, and preview tabs in the Basic formatting area.
- There was no Basic-area action that deliberately opened the existing CCFOLIA preview; the design ended with a separate preview context but the live output was only reachable via the global preview control.
- CSS selectors for settings heading layout previously assumed the parameter header was a direct child of `.baseinfo-workspace`. The new semantic wrapper requires targeting the actual production DOM.

## Changes

- Add a real state-bound token preview to `BaseSection`. It reads current app state and current portrait image; it does not store duplicate identity data.
- Add accessible ST / labels / live-output tabs around the existing status and parameter editors. The original handlers, order, default/unique statuses, custom items, and labels remain the same; the inactive panel is hidden, not replaced with a mock.
- Wire the live-output tab action through `App → BuildWorkspace → BaseInfoWorkspace → BuildParamsPanel` to the existing preview toggle.
- Add responsive styles against the classes actually emitted by the production React components.
- Make the global preview panel closed by default, matching the review requirement that the editor is not compressed before the user asks to inspect output. The Home preview shortcut also explicitly closes the global panel and opens the Basic-area preview.
- Keep the sidebar grid valid at tablet widths; previously the B-type media query reduced the column count without updating the inherited grid areas, allowing the sticky build tabs to intercept navigation clicks.
- Extend Playwright capture across desktop, tablet, mobile portrait, small phone, and phone landscape to capture the token preview, each internal tab, and the real preview-toggle round trip.
- Add structural regression tests for state binding, accessibility, callback wiring, and the production CSS selectors.

## Cross-route inventory

The existing broad UI audit captures two viewport classes and records states for home; account create/manage/edit; preview open/closed; all Build tabs; persona selection and import modes; skill/passive/enhancement/support/E.G.O./spirit/items; shop categories; record/result import and held-persona import; settings; help/search; utility and save/export actions; sharing modes and the share preview; state import scope; and keyboard focus. This PR does not replace that audit; it augments the measured Basic-screen failure and the focused multi-viewport preview test.

## Limitations / merge gate

The prototype and review are available from the user Library package but are not currently checked into the repository. The prototype is an interactive concept reference rather than an image-by-image golden master of every production React route. This pass now uses it alongside the v2/v3 Basic-sheet notes and production screenshots to fix concrete structure, state routing, and responsive geometry defects; no claim is made that every page is pixel-identical. The next parity step is to version the reference package and retain named target screenshots for each route/viewport so visual drift is a blocking regression rather than a subjective review.

Required checks: `node --test tests/*.test.mjs`, `node tools/sync-asset-versions.mjs --check`, project verification, UI interaction audit screenshots, preview control visual regression, and tutorial screenshot capture.
