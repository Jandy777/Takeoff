# Takeoff

An interactive 3D foundation takeoff and estimating tool for residential concrete contractors. Draw wall layouts, place pier pads and window wells, measure square footage, and automatically generate takeoff quantities.

## Features

- **2D CAD-style drawing**: Draw walls with snapping and clean mitered corners
- **3D visualization**: Real-time 3D view with walls, footings, pads, and windows
- **Entities**: Pier pads (custom sizing), window wells and peek windows (with real cutouts), square footage areas
- **Takeoff**: Automatic line-foot counts by wall type, color-coded rows for visibility
- **Dimensions**: Auto-label all walls, or place custom ruler measurements
- **Filtering**: Click takeoff rows to isolate them on the plan
- **Full undo/redo**: 20-step history

## Running Locally

This is a React app built with Three.js for 3D rendering. Run it in a React environment (Create React App, Vite, etc.) or paste the component directly into a React project.

### For Create React App:

```bash
npx create-react-app takeoff
cd takeoff
# Replace src/App.js with foundation-takeoff-poc.jsx, then:
npm start
```

### For Vite:

```bash
npm create vite@latest takeoff -- --template react
cd takeoff
# Copy foundation-takeoff-poc.jsx into src/
npm install
npm run dev
```

## Usage

### Drawing walls
- Select **Wall** mode, pick thickness and depth presets (or custom)
- Click to start a wall run, click again to place endpoints
- Type a length and press Enter to set exact dimensions
- Right-click ends the run

### Placing entities
- **Pad**: Set W×L×D, click the plan to stamp piers
- **Window**: Toggle between peek window (single-click) or well (two-click with facing arrow)
- **Sq Ft**: Pick enclosed wall loops or trace custom boundaries

### Measurements
- **Ruler**: Click two points to create a dimension line; measurements stay until deleted
- Toggle **Auto wall dims** to show/hide automatic length labels

### Takeoff
- Rows are color-coded and match the plan
- Click a row to isolate it; click again to show all
- Click the color swatch to change hues
- All quantities are lineal feet (LF) or square feet (SF), measured centerline-to-centerline

## Tech Stack

- **React** (functional components, hooks)
- **Three.js** (3D rendering)
- **SVG** (2D plan)

## Project Structure

```
foundation-takeoff-poc.jsx  Main component (single file)
README.md                   This file
.gitignore                  Git ignore rules
```

## Key Algorithms

- **Mitered corners**: Walls meet at proper angles, no overlaps
- **Window cutouts**: Real openings in 3D geometry, not just visual
- **Auto-region detection**: Shoelace formula to find enclosed wall loops
- **Dimension snapping**: Walls snap to 90°/45°, endpoints, and grid

## Future Enhancements

- Save/load projects
- PDF blueprint import and tracing
- Pricing and cost breakdowns
- Export to CAD formats
- Mobile UI

## License

MIT

## Contact

West Suburban Concrete — Geneva, IL
