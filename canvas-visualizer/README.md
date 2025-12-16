# Canvas State Space Glow

A lightweight Vite + TypeScript sketch that renders a dark canvas with glowing points and trails. Four movement modes (`run`, `stay`, `keep`, `pause`) use different trajectory rules. UI controls expose animation parameters and PNG capture buttons.

## Quick start
1. Install dependencies:
   ```bash
   cd canvas-visualizer
   npm install
   ```
2. Start the dev server:
   ```bash
   npm run dev -- --host
   ```
   Then open the printed URL (defaults to http://localhost:5173).
3. Build for production:
   ```bash
   npm run build
   npm run preview -- --host
   ```

## Controls
- **Mode**: switch between `run` (forward, non-intersecting path), `stay` (orbiting), `keep` (band-limited drift), `pause` (bursty motion with holds).
- **Sliders**: speed, trail length, glow strength, noise amplitude, keep band height, pause duration, axis opacity.
- **Capture buttons**: download the current frame as PNG (`Capture Start/Key/End`).

## Notes
- Canvas automatically scales for device pixel ratio and window resize.
- Trails are rendered with layered strokes for a soft glow; older points fade out while the newest remain bright.
