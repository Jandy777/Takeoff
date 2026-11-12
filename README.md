# Takeoff

**Foundation drawing, quantity takeoff, and a shared drawing library for West Suburban Concrete.**

[Open Takeoff](https://foundationtakeoff.com) · [Database and account setup](supabase/README.md) · [Development guidelines](CLAUDE.md)

Takeoff is a browser-based tool for recreating residential foundation layouts from plan dimensions, checking them in 2D and 3D, and generating a bill of materials (BOM). It supports estimating, drawing revisions, and field viewing for both custom jobs and tract-home projects.

**Current status — November 12, 2026:** deployed on Netlify with Supabase accounts, a folder-based drawing library, cloud storage, revisions, and owner-controlled team access.

## How it fits the estimating workflow

1. Review the source blueprint PDF in the company's existing file system.
2. Create a drawing with customer, project, city, estimator, print date/revision, optional model and elevation, and custom/tract job type.
3. Recreate the foundation using the plan's wall-face dimensions, then add the required foundation details.
4. Check the layout and quantities in 2D, 3D, and the BOM panel.
5. Save the drawing, create a new revision when plans change, and let registered field users open the shared library.

Takeoff stores editable drawing data, not source blueprint PDFs. PDF upload, automatic blueprint interpretation, and OCR are not implemented.

## Drawing tools

| Tool | Current behavior |
| --- | --- |
| Walls | Preset/custom thickness and height, outside/centerline/inside length bases, wall-side controls, and corner snapping. |
| Reference start | Start a new wall at a typed distance along a selected existing wall face. |
| Fillet | Select two wall ends to trim or extend them into a connected corner. |
| Footings | Dimensions and colors separate from wall properties. Hidden in the 2D plan by default; quantities and 3D remain available. |
| Drain tile | Trace interior or exterior runs with corner anchors that follow wall geometry changes. |
| Brick/slab ledges | One-sided, recessed ledges in 2×4, 2×6, and 4×6 sizes, shown in 2D and 3D. |
| Pier pads | Place pads with custom width, length, and depth. |
| Thickened slabs | Place, move, and rotate slabs with custom width, length, and total concrete depth. |
| Windows | Wall-attached peek windows and window wells, with openings represented in 3D. |
| Wing arms | Wall-attached markers with a contrasting, sloped 3D profile; counted individually. |
| Square footage | Pick a closed clear interior or trace an area manually. |
| DTEXT | Place and edit drawing text, including size and color. |
| Ruler | Add persistent point-to-point dimensions. |

Select individual items to edit their properties. Drag a selection box to include touched items, or use **Shift-click** to add/remove individual items. Multiple selections have their own quantity summary and support group movement/deletion. Connected or wall-attached items may require their adjoining walls to be selected before a group can move.

Other editing controls include snapping, pan/zoom, fit-to-drawing, row isolation, color overrides, and undo/redo with up to 50 snapshots.

## Measurement rules

- **Outside wall-face dimensions are the drawing default.** Centerline and inside-face modes are also available. Wall and footing takeoff lengths follow each wall's selected basis.
- **Footing bands do not define wall lengths or drawing snap points.** New walls reference wall geometry.
- **Picked square footage uses the clear interior**, excluding wall thickness. A manually traced area uses the boundary the user draws.
- A 15-foot outside square with 8-inch walls has a clear interior of **13 feet 8 inches × 13 feet 8 inches**, approximately **186.78 SF** (displayed as 187 SF).
- Drain tile quantities use the traced path, with no automatic 6-inch offset adjustment.
- Ledge sizes are **vertical drop × horizontal width**, in inches. A 2×4 ledge is 2 inches deep and 4 inches wide.
- Pad and thickened-slab dimensions are entered in inches. Thickened-slab depth is the **total depth**.

### Feet and inches

Point in the intended direction while drawing, type a length, and press **Enter**. Accepted examples:

| Entry | Meaning |
| --- | --- |
| `15` | 15 feet |
| `15'7"` | 15 feet, 7 inches |
| `15'7.5"` | 15 feet, 7½ inches |
| `7.5"` | 7½ inches |
| `15.625` | 15 feet, 7½ inches, expressed as decimal feet |

Use decimal inches for fractional inches; slash-style fractions such as `7 1/2"` are not parsed. An inches-to-decimal-feet reference is available beside the drawing.

## Quantities, 3D, and printing

The BOM groups walls by their properties and measurement basis, and footings by their own sizes. It also reports pad/window counts, area square footage, interior/exterior drain-tile lengths, ledge lengths by type/size, thickened-slab counts and gross cubic yards, and wing-arm counts.

Wall and footing colors are independent, so changing a footing size does not change the wall's color. Row colors and isolation help compare the plan with the quantity list.

**Print** prepares the 2D plan, 3D view, drawing details, and BOM together using the browser's print dialog. The 3D view is for review; geometry editing happens in the 2D plan.

## Drawing library and revisions

- The dark **Folder Explorer** organizes existing drawings by **builder/customer → project → model → elevation**, omitting optional levels when blank. Print revisions remain separate files. Folders derive from saved details; no manual file moves or PDF uploads are required.
- Sidebar views include **All drawings**, **Custom jobs**, **Tract homes**, and **Builders**, with an expandable folder tree and clickable breadcrumbs.
- Select a drawing to see its saved-plan preview, builder/customer, project, city, estimator, and revision details. **Open drawing** (or double-click the file) opens the editor. Tablet layouts move the details panel below the file list.
- Search finds drawing details such as city, estimator, model, and revision across folders within the selected view.
- Editing autosaves to Supabase. The save indicator distinguishes saved, unsaved, saving, and error states.
- Browser recovery drafts retain recent unsaved work per account/drawing. A JSON backup can also be exported.
- Saves use version checks to prevent silently overwriting another user's newer work.
- **New revision** preserves the previous drawing as read-only and creates an editable copy. Preserved revisions can also be the starting point for another revision.
- Field viewers can open drawings, inspect quantities, switch views, print, and pan/pinch-zoom the 2D plan on a tablet.

Drawing geometry is stored as versioned JSON, with appearance settings and project metadata. There are no PDF storage buckets in the current implementation. See [the storage and revision notes](supabase/README.md#saves-and-revisions).

### Importing the existing CAD archive

Estimators and administrators can choose **Import CAD drawing** beside **New drawing**. Select a legacy ASCII DXF, review the wall preview and LF, then complete the usual drawing-details card. **Create drawing** saves a separate editable drawing through the existing library; selecting and editing its walls works normally. **New drawing** continues to start with an empty plan.

This import profile targets the company's existing **WALLS / WALLDATA** CAD workflow, using inches. It pairs wall faces, reads thickness and initial height, removes duplicate descriptions of square sections, and checks the resulting wall footprints and outside-face lengths against the source before allowing creation. Heights can be adjusted after import without changing LF.

Conversion runs in a browser worker on the user's device. The source DXF and conversion diagnostics are not uploaded; only the resulting Takeoff document, appearance settings, and project details are saved. Cancelling before creation leaves existing drawings intact. Ordinary text and dimension annotations on the WALLS layer are skipped and counted in the review notes. Files with missing, unsupported, or ambiguous wall geometry stop for review.

If a DXF contains disconnected wall groups, the preview requires a layout choice before continuing. Each option shows its wall count, thicknesses, and LF; layouts are numbered from left to right. This lets different CAD revisions in the same file become separate Takeoff drawings. An explicit **Keep all layouts together** option is available when the groups belong in one drawing.

The first version imports walls only. Footings use Takeoff defaults; pads, windows, drain tile, ledges, text, and other CAD details must be reviewed or added separately. Direct DWG import and bulk-folder conversion are not included. Files must be nonempty, at most 10 MB, and contain no more than 2,000 model-space wall-face lines.

## Accounts and team access

Email/password signup is active and does not require a confirmation email. The employee signup path offers the configured West Suburban name list and requires a work email, but choosing a name or entering a company address does not automatically grant editing.

| Role | Access |
| --- | --- |
| Viewer | Open the shared drawing library, inspect drawings/quantities, and print. |
| Estimator | Viewer access plus creating and editing drawings and revisions. |
| Administrator | Drawing access plus managing team accounts. |

All new accounts start as **Viewer**. The owner's existing admin account can explicitly assign roles to any registered email address, including personal accounts used for development/testing. Other administrators retain the company-domain restriction for elevated roles. Team Access also supports enabling/disabling accounts; the final active administrator is protected from accidental removal.

Roles and owner approvals are stored in protected database records and enforced by row-level security. Signup metadata cannot grant privileges. Editing approval must be renewed after an account changes its email address.

**Google sign-in:** client support exists, but the production provider is currently disabled and its end-to-end setup is unfinished. Microsoft sign-in is not enabled. Email/password is the available signup path. Password-reset email delivery still depends on the project's email-sending configuration; skipping signup confirmation does not remove that dependency.

The privacy and usage pages are available at [Privacy](https://foundationtakeoff.com/privacy.html) and [Terms of use](https://foundationtakeoff.com/terms.html).

## Run the existing project locally

Use **Node.js 22** and npm, matching the Netlify build environment. An IDE such as Visual Studio or VS Code is optional.

From the repository root:

```sh
npm ci
```

Copy [.env.example](.env.example) to `.env.local` and fill in the Supabase project URL and **publishable** browser key:

```dotenv
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_your_key
```

The cloud library requires the matching Supabase tables, functions, and policies. Follow [supabase/README.md](supabase/README.md) for the database references and allowed authentication return URLs. Never put service-role keys or OAuth client secrets in browser configuration.

Start the local app on the configured authentication callback port:

```sh
npm run dev -- --host 127.0.0.1 --port 4176 --strictPort
```

Open [http://127.0.0.1:4176/index.html](http://127.0.0.1:4176/index.html). The plain `npm run dev` command otherwise uses Vite's configured port 3000; auth callbacks for another port need to be allowed in Supabase.

## Verification and deployment

```sh
npm test
npm run build
```

- `npm test` runs geometry and library checks, including drawing serialization, metadata, signup presentation, and permission behavior.
- `npm run build` creates the production site in `dist/`.
- The transactional `supabase/test-*.sql` scripts check saves, revisions, signup access, owner-only external role overrides, revocation, and administrator protection. They roll back their fixtures; see [the verification guide](supabase/README.md#verification).
- Manually exercise the affected drawing or library flow after behavior changes. Database tests do not replace a real authentication-provider round trip.

Netlify builds the GitHub **main** branch using [netlify.toml](netlify.toml). Pushing an app change to main triggers the production deployment at [foundationtakeoff.com](https://foundationtakeoff.com). Documentation-only commits can use `[skip netlify]` to avoid an unnecessary site rebuild.

## Code structure

| Location | Responsibility |
| --- | --- |
| [src/FoundationTakeoff.jsx](src/FoundationTakeoff.jsx) | Connects editor, library, accounts, viewport, and print UI. |
| [src/foundation/geometry.js](src/foundation/geometry.js), [fillet.js](src/foundation/fillet.js), [selection.js](src/foundation/selection.js) | Geometry, measurements, wall joins, and selection operations. |
| [src/foundation/model.js](src/foundation/model.js), [takeoff.js](src/foundation/takeoff.js) | Document entities, grouping keys, and quantity calculations. |
| [src/foundation/hooks](src/foundation/hooks) | Editor interactions, undo/redo, viewport, 3D scene, accounts, autosave, library, and tablet navigation. |
| [src/foundation/render2d](src/foundation/render2d), [render3d](src/foundation/render3d) | SVG plan drawing and Three.js geometry/print capture. |
| [src/foundation/library](src/foundation/library) | Document serialization, Supabase repository, authentication helpers, and permission interpretation. |
| [src/foundation/ui](src/foundation/ui) | Drawing tools, entity editors, quantity panel, library, team access, account screens, and print layout. |
| [supabase](supabase) | Database/account documentation, applied-schema references, and transactional checks. |
| [scripts](scripts) | Local geometry and library verification. |
| [public](public) | Static privacy/usage pages and their styling. |

The frontend uses **React 18**, **Vite 4**, **SVG**, and **Three.js**. **Supabase** provides authentication and Postgres drawing storage; **Netlify** hosts the compiled site.

Follow [CLAUDE.md](CLAUDE.md) when changing the application. Keep geometry and quantity calculations separate from UI, and keep `FoundationTakeoff.jsx` focused on wiring modules together.

## Current limits and future work

- Thickened-slab cubic yards are **gross**; overlap with other slabs is not deducted. Whole-foundation concrete volumes are not yet calculated.
- Wing-arm geometry and drain-tile elevations in 3D are illustrative.
- Source PDFs remain outside the app. PDF import, automated takeoff, pricing, and CAD export are not implemented.
- Tablet viewing is supported; the full editing workflow remains oriented toward a mouse and keyboard.
- Recovery drafts help with interrupted saves, but the app is not a complete offline/synchronization system.
- Stoop modeling and its area calculations, reinforcement/mesh/insulation takeoff, and a dedicated approved field-release workflow remain areas for future work.

## Project information

Maintained for **West Suburban Concrete — Geneva, Illinois**. Account/application contact: [jake@concretews.com](mailto:jake@concretews.com).

License: MIT, as declared in the project metadata.

