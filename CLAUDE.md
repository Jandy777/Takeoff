# Takeoff

Interactive 2D/3D foundation takeoff and estimating tool (React + SVG for the
2D plan, Three.js for the 3D view). Single-page Vite app; `src/main.jsx`
mounts `FoundationTakeoff` and nothing else.

## Module map

`FoundationTakeoff.jsx` is a thin orchestrator: it calls the hooks below,
threads their state into the presentational components, and renders the
layout. It should stay small — logic belongs in `src/foundation/`.

```
src/foundation/
  constants.js        Colors, presets, palette. No logic.
  geometry.js          Pure math: parsing/formatting, distances, wall-polygon
                        miter/cut geometry, region detection, snapping math.
                        No React, no THREE. Safe to unit test directly.
  color.js             Hex color helpers (shade, alpha, hash-to-palette).
  model.js             Document entity shapes: id generation, footing
                        defaults, the wall/pad/window/area grouping keys used
                        by both the takeoff panel and the row-color/solo system.
  takeoff.js           computeTakeoff(doc) — pure rollup into the panel rows.
  fillet.js            Trim/extend selected wall ends into a joined corner.
  selection.js         Box selection, grouped document subsets, move/delete.

  library/             Drawing serialization, Supabase repository, auth-return
                        helpers, employee signup requests, and protected-role
                        interpretation. Database policies enforce authorization.

  hooks/
    useTakeoffAccount  Auth session, current membership, owner/admin permissions,
                        sign-in and account actions. Refreshes access on focus.
    useDrawingLibrary  Cloud autosave, revisions, optimistic version checks,
                        local recovery drafts, and JSON backup export.
    usePlanTouchNavigation
                        One-finger pan and pinch zoom in the read-only plan.
    useUndoableDoc      Owns `doc` + snapshot undo/redo. The only place that
                        should call setDoc directly outside a drag gesture.
    useViewport         Pan/zoom transform, SVG sizing, fit-to-view.
    useRowVisibility    Per-row color overrides + "solo" isolation.
    useSnapping         Endpoint/angle/grid snap for the drawing tools.
    useTakeoff          useMemo wrapper around takeoff.js.
    useThreeScene       Mounts the Three.js renderer/camera/orbit rig and
                        calls render3d/buildScene on doc changes.
    useEditorInteractions
                        The interaction engine: current tool/mode, in-progress
                        drawing state, selection, pointer + keyboard handling,
                        and the doc-mutating actions they trigger. This is the
                        one intentionally-large hook — see "Why one big hook"
                        below.

  render2d/            Presentational SVG glyphs (WallGlyph, PadGlyph,
                        WindowGlyph, AreaGlyph, DimGlyph, Grid) plus
                        PlanCanvas, which composes them and every in-progress
                        drawing preview. No state, no handlers of their own —
                        everything comes in as props.
  render3d/
    buildScene.js       Pure(-ish) mesh builder: (group, doc, sel, shown,
                        rowColor) -> mutates the THREE.Group. No React.

  ui/                  Chrome: Toolbar, TakeoffPanel (row list + selected-
                        entity editors), PlacementModal, StatusBar,
                        PlanOverlays, and shared primitives (Pill, Label,
                        Swatch, TakeoffRow, inputStyle, mono).
```

### Why one big hook (`useEditorInteractions`)

Mode switching, drawing state, selection, pointer handlers, keyboard
shortcuts, and doc-mutating actions all read and write each other's state in
the same gesture (e.g. a mouse-down in "draw" mode reads `start`, calls
`snapPreview`, mutates the doc via `apply`, and updates `runStart`). Splitting
that further moves the coupling around without reducing it. Don't force it
apart — instead keep pulling *reusable* logic out of it into `geometry.js`/
`model.js` (pure) so the hook itself shrinks over time.

## Rules for new features

**Before writing a new feature, decide which bucket it's in and add a module
there — don't grow `FoundationTakeoff.jsx` or an existing file past its
stated job.**

- **New pure calculation** (geometry, formatting, a new grouping key) →
  `geometry.js` or `model.js`. No React/THREE imports allowed in these files.
- **New takeoff rollup / summary numbers** → extend `takeoff.js`'s
  `computeTakeoff`, not the panel component. The panel only renders what the
  function returns.
- **New tool/mode** (a new drawing tool, a new placement flow) → add its
  state and handlers inside `useEditorInteractions` (it already owns
  mode/selection/pointer/keyboard), then add its toolbar entry to
  `ui/Toolbar.jsx` and its status-bar hint to `ui/StatusBar.jsx`. If the tool
  needs a placement modal, extend `ui/PlacementModal.jsx` or add a sibling
  modal component — don't inline a new modal in the orchestrator.
- **New entity type** (something beyond wall/pad/window/area/dim) needs, in
  parallel:
  - a shape + key function in `model.js`
  - grouping/rollup in `takeoff.js`
  - a glyph component in `render2d/` (props-only, no internal state)
  - a mesh branch in `render3d/buildScene.js`
  - wiring in `render2d/PlanCanvas.jsx` and `ui/TakeoffPanel.jsx`
  Follow the existing wall/pad/window/area/dim as the template for all five.
- **New hook-owned state** (e.g. a new view-level setting) → put it in the
  hook that already owns that concern (`useViewport` for pan/zoom/sizing,
  `useRowVisibility` for color/visibility, `useEditorInteractions` for
  tool/selection/drawing state) rather than adding a new `useState` to the
  orchestrator.
- **New UI chrome** (panel, toolbar section, banner) → its own component
  under `ui/`, taking data and callbacks as props. Don't reach into hooks
  from inside a `ui/` component — the orchestrator wires props in.
- **3D-only or 2D-only features**: `render3d/` must stay pure with respect to
  React (it's called from `useThreeScene`, not rendered as JSX); `render2d/`
  components must stay presentational (props in, JSX out — no `useEffect`,
  no fetching, no owning of document state).

## Conventions

- Grouping/row keys (`wallKey`, `padKey`, `winKey`, `areaKey` in `model.js`)
  are the join key between the document, the takeoff panel rows, and the
  per-row color/solo system (`useRowVisibility`). If you add an entity type,
  give it a key function of the same shape.
- Document mutations always go through `apply(fn)` from `useUndoableDoc` (it
  snapshots for undo first) — the only exception is live drag updates, which
  write via `setDoc` directly each mousemove and push a single undo snapshot
  on mouseup (see `dragRef`/`dragEntRef` in `useEditorInteractions`).
- Units: plan coordinates are in feet; most entity dimensions (thickness,
  pad/window sizes) are stored in inches. Check neighboring code for which
  one applies before adding a field — this is not automatically converted.

## Verifying changes

Run `npm test` for the geometry/library checks and `npm run build` for
production compilation after behavior changes. Manually exercise the affected
flow too (draw/select/undo, 3D, or library/team access as appropriate).

For database or permission changes, use the relevant transactional
`supabase/test-*.sql` checks; fixtures must roll back. See `supabase/README.md`
for the applied-schema references and account model. Those schema reference
files are not scripts to rerun over an existing project. Never treat signup
metadata as a role or owner approval.

The current feature inventory, dimension rules, local startup commands, and
known limitations are in `README.md`. Keep it aligned with shipped behavior;
do not describe unfinished provider setup or planned tools as available.

