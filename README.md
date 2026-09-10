# Fly / Wirehead

A deeply unserious, entirely client-side 3D fly watching an infinite shortform feed.

## Run locally

Requires Python 3 (no installation or build step):

```sh
python3 -m http.server 4173 --bind 127.0.0.1 --directory dist
```

Open http://127.0.0.1:4173. WebGL 2 is required. Three.js is vendored locally; the optional Google Fonts stylesheet falls back to system fonts offline.

## Controls

- Drag to orbit the 3D chamber; use the crosshair button for three camera presets.
- Scroll over the chamber, swipe vertically on touch, press the arrow keys, or click **Next short** to advance.
- **Space** or the pause button freezes the experiment.
- **Inject dopamine** triggers wing flutter, a physical tremor, a reward ping (if sound is enabled), and a telemetry spike.
- Sound is opt-in. Fullscreen is available in supporting browsers.
- Reduced-motion preferences start the experience paused. Hidden tabs stop advancing the simulation.

The five original animated shorts render in a second Three.js scene onto the fly's portrait display: a chrome knot, endless runner, kinetic orbs, banana, and geometric tunnel. Feed changes animate vertically. Everything is fictional: there is no biological model, real animal, trading, backend, or account connection.

## Files

- `dist/scene.js`: original fly, laboratory, lighting, camera, physical screen, and short animations.
- `dist/simulation.js`: feed timing, pause, reward decay, and telemetry state.
- `dist/main.js`: inputs, charts, sound, and optional WebMCP integration.
- `dist/style.css`: responsive interface.

Run the behavioral checks with `node --test tests/*.test.mjs`.

## Reference and attribution

Inspired by [nftechie/stonkfly](https://github.com/nftechie/stonkfly) and the screenshot supplied with the request. The reference was cloned locally at `/private/tmp/fly-wirehead-stonkfly-reference` for inspection. That project contains a Python simulation and generated artwork, but no reusable 3D frontend. This scene and all shorts were authored from scratch; no stonkfly code, generated artwork, neural datasets, or external video clips are included.

Three.js 0.180.0 is included under the MIT license in `dist/vendor/THREE-LICENSE.txt`.

Optional WebMCP support is feature-detected and shares the visible controls. A supporting browser context was not available for its contract verification during creation; this does not affect the normal UI.
