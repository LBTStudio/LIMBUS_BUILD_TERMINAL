# B-type production UI parity audit — 2026-10-30

## Basis

This pass uses the maintained design review `LBT_UI_Refinement_Review.md`, the current production React DOM, the merged UI PR diffs, and the most recent UI interaction / preview-regression screenshot artifacts. It preserves existing application state, persistence, import, and CCFOLIA generation paths.

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
- Extend Playwright capture across desktop, tablet, mobile portrait, small phone, and phone landscape to capture the token preview, each internal tab, and the real preview-toggle round trip.
- Add structural regression tests for state binding, accessibility, callback wiring, and the production CSS selectors.

## Cross-route inventory

The existing broad UI audit captures two viewport classes and records states for home; account create/manage/edit; preview open/closed; all Build tabs; persona selection and import modes; skill/passive/enhancement/support/E.G.O./spirit/items; shop categories; record/result import and held-persona import; settings; help/search; utility and save/export actions; sharing modes and the share preview; state import scope; and keyboard focus. This PR does not replace that audit; it augments the measured Basic-screen failure and the focused multi-viewport preview test.

## Limitations / merge gate

The interactive source HTML prototype is not present in the repository's current tracked tree; the review document is available, but it explicitly describes itself as a mock and not a pixel-exact reference. This pass therefore fixes the concrete structural gaps evidenced by the review and production screenshots and tightens behavior coverage; it does **not** claim pixel-perfect equality for every page without the approved source HTML / golden screenshots. The PR should be reviewed against that source when it is added or linked.

Required checks: `node --test tests/*.test.mjs`, `node tools/sync-asset-versions.mjs --check`, project verification, UI interaction audit screenshots, preview control visual regression, and tutorial screenshot capture.
