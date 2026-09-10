# How the experiment works

[← Back to the README](../README.md)

## What actually runs

1. An HTML video element plays the downloaded insect playlist. Its decoded frames fill the portrait phone canvas edge to edge, which Three.js displays. Clip changes slide vertically; there is no blurred filler or letterboxing added by the player.
2. The browser reads that composited screen into a **90×160 RGBA** frame. Python flips WebGL's rows and removes alpha. The most recent accepted screen image is saved as `runs/local/latest-input.png`.
3. The upstream inferred visual projection stimulates **3,335 R1–R6 inputs and 811 R8 inputs** from the image's luminance and color.
4. Python calls the compiled C++17 kernel through `ctypes`. It integrates the full retained spiking graph in **0.1 ms** steps.
5. Each accepted frame advances **50 ms of neural time** by default. The overlay shows wall-clock exposure; API telemetry and local logs retain simulated brain time and compute time. It samples the video; it does not claim frame-for-frame biological real-time playback.
6. Actual network spike counts, mean PAM11/KC firing rates, and 10 ms bins for 96 fixed identified cells return to the observation window. Missing/disconnected engines display no measurements; there is no fake fallback.

The playlist automatically advances after three seconds of actual media playback and wraps after the final clip. Pausing, buffering, or hiding the window holds that timer. An early video end also advances to the next clip. Its titles and creator links come from the downloaded metadata. The subject is compelled to receive whichever clip is on screen; the feed's order and playback timing are presentation controls, not learned behavior. Loading, failed, paused, or stalled playback supplies no new observations; the most recent valid measurements remain visible.

## Reward, learning, and movement

**PAM11 stimulation** (keyboard **P** or WebMCP) schedules a **200 ms, 20 mV-equivalent current** into the 15 annotated PAM11 cells. The pulse advances in neural time as frames are processed. Repeated requests replace the remaining pulse rather than stacking unlimited current. There are no hardcoded per-video dopamine scores and no automatic reward on a swipe.

The upstream experimental plasticity rule can modify the **7,835 existing KC→MBON07/11 connections**. The API and saved telemetry report how many differ from baseline. A changing weight alone is not evidence of useful learning, pleasure, attention, or addiction. PAM11 telemetry uses **spikes per neuron per neural second (Hz)**, not a fabricated dopamine concentration or percentage.

The 3D movement is an amplified artistic readout: wing flutter and body/leg motion map MN9/DNp09 firing, head turning maps DNa02 right-minus-left firing, and electrode glow maps PAM11 firing. Motor rates use a saturating response tuned for the observed 5–30 Hz range, with a 100 ms attack and 700 ms release so brief bursts remain visible. Turning is smoothed over 200 ms. This changes only the animation; it adds no neural spikes or stimulation. Ambient breathing, city lighting, and screen motion are visual effects. This is not a validated biomechanical fly model.

The display puts network activity and the spike raster over the chamber, with no current-video captions or visible controls. **Network firing** counts spikes across the full graph per simulated second; **Fly spikes** is the actual count in the most recent 50 ms neural sample. The network graph uses a labelled zero-based scale. Quiet PAM11 cells are not a measure of overall network activity.

## Controls and persistence

- Playback runs automatically with no visible controls. Drag to orbit; **C** cycles three camera positions and **F** toggles fullscreen.
- Scroll, swipe vertically, or press an arrow key to skip a short.
- **Space** pauses the actual video and stops new neural observations after any already-running step finishes.
- **P** applies PAM11 stimulation to the numerical model.
- **S** requests a checkpoint. Checkpoints are also saved every two active minutes and on **Ctrl-C**.
- Restarting restores neural state and plastic weights from `runs/local/brain.npz`. Queued stimulation is not replayed on restart.
- **M** toggles the video's original audio, which starts muted. Reduced-motion preferences start the experiment paused. Hidden or closed observation windows pause playback and supply no new frames, so the brain waits.
- One observation window at a time supplies the sensory stream. A second can take over after four seconds without input from the first.

`runs/local/events.jsonl` contains actual measurements and input/spike hashes; `latest.json` is the last observation; `provenance.json` records the data/model/source configuration. Neuron IDs are serialized as strings to preserve integer precision.

Useful options:

```sh
uv run flywirehead verify
uv run flywirehead run --no-browser
uv run flywirehead run --neural-ms 100
uv run flywirehead run --run-dir runs/control --frozen
uv run flywirehead run --run-dir runs/new-experiment --fresh
uv run flywirehead --data /path/to/data run
```

Use a separate `--run-dir` for independent experiments. `--fresh` explicitly starts over and will replace that run's checkpoint when saved. Only one worker can own a run directory. The server binds to loopback, validates local origins, and uses an ephemeral session token for controls. No cloud service or trading credentials are used.

## Validation

```sh
uv sync --extra test
uv run pytest -q
FLYWIREHEAD_FULL_TEST=1 uv run pytest -q -s tests/test_full_connectome.py
node --test tests/*.test.mjs
```

The full-graph assay compares black/white visual input from the same checkpoint, stimulated/control trials, frozen plasticity, and exact replay after restore. It checks actual mechanism behavior, not biological validity or whether the fly has learned to prefer shorts.

## Sources

The numerical backend is adapted from [nftechie/stonkfly](https://github.com/nftechie/stonkfly), commit `78ef3e05ab0fa086032098558d893667068944a0`, under MIT. The local copy includes the source, provenance, lockfiles, and license; it does not depend on the reference clone or import its trading stack. See [THIRD_PARTY.md](../THIRD_PARTY.md) for MaleCNS CC BY 4.0 attribution and [flywirehead/upstream.json](../flywirehead/upstream.json) for source hashes.

The model combines real reconstructed wiring with approximate physiology and an unvalidated experimental memory rule. It does not reproduce a complete living fly or establish consciousness. No real animals are involved.

The optional WebMCP controls share the normal interface actions; status, pause, resume, and next-short actions were verified in the local browser. WebGL 2 and H.264 video playback are needed for the 3D window. Three.js is vendored locally; the Google Fonts stylesheet is optional and falls back to system fonts offline.
