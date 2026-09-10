# Fly / Wirehead

A local Python/C++ fly-connectome experiment with a 3D observation window. The full **166,700-neuron / 25,582,938-connection MaleCNS v1.0 network** receives RGB pixels captured from the shortform screen. The displayed firing rates, raster, and synaptic changes come from that running network.

## Start

From this repository, with Python 3.11+, a C++17 compiler, and [uv](https://docs.astral.sh/uv/):

```sh
uv sync
uv run flywirehead prepare
uv run flywirehead run
```

Preparation downloads approximately 1.1 GB, verifies source SHA-256 hashes, retains the full graph, and verifies every graph array against the upstream locks. It is already prepared on the development machine. Data, native build products, and runtime checkpoints stay local and are excluded from Git. Allow several GB of disk space; 16 GB RAM is recommended.

`run` opens **http://127.0.0.1:4173**. On macOS, double-click `run.command` after setup. The local Python process must stay running. This is a local application; the older hosted static demo does not run the new brain.

Without uv:

```sh
python3.12 -m venv .venv
.venv/bin/python -m pip install -e .
.venv/bin/python -m flywirehead prepare
.venv/bin/python -m flywirehead run
```

## What actually runs

1. Three.js renders an original short on the portrait screen, including its captions and swipe transition.
2. The browser reads that composited screen into a **90×160 RGBA** frame. Python flips WebGL's rows and removes alpha. The most recent accepted screen image is saved as `runs/local/latest-input.png`.
3. The upstream inferred visual projection stimulates **3,335 R1–R6 inputs and 811 R8 inputs** from the image's luminance and color.
4. Python calls the compiled C++17 kernel through `ctypes`. It integrates the full retained spiking graph in **0.1 ms** steps.
5. Each accepted frame advances **50 ms of neural time** by default. The interface explicitly separates wall-clock exposure, simulated brain time, and compute time. It samples the video; it does not claim frame-for-frame biological real-time playback.
6. Actual network spike counts, mean PAM11/KC firing rates, and 10 ms bins for 96 fixed identified cells return to the observation window. Missing/disconnected engines display no measurements; there is no fake fallback.

The five shorts are original rendered animations, not downloaded social-media videos. The subject is compelled to receive whichever clip is on screen; the feed's order and playback timing are presentation controls, not learned behavior.

## Reward, learning, and movement

**Stimulate PAM11** schedules a **200 ms, 20 mV-equivalent current** into the 15 annotated PAM11 cells. The pulse advances in neural time as frames are processed. Repeated clicks replace the remaining pulse rather than stacking unlimited current. There are no hardcoded per-video dopamine scores and no automatic reward on a swipe.

The upstream experimental plasticity rule can modify the **7,835 existing KC→MBON07/11 connections**. The panel reports how many differ from baseline. A changing weight alone is not evidence of useful learning, pleasure, attention, or addiction. PAM11 is shown in **spikes per neuron per neural second (Hz)**, not a fabricated dopamine concentration or percentage.

The 3D movement is an artistic readout: wing flutter maps MN9/DNp09 firing, head turning maps DNa02 right-minus-left firing, and electrode glow maps PAM11 firing. Ambient breathing, city lighting, and screen motion are visual effects. This is not a validated biomechanical fly model.

## Controls and persistence

- Drag to orbit; use the crosshair button for three camera positions.
- Scroll, swipe vertically, press an arrow key, or click **Next short**.
- **Space / pause** stops new neural observations after any already-running step finishes.
- **Stimulate PAM11** applies a real current input to the numerical model.
- **Save brain** writes a checkpoint. Checkpoints are also saved every two active minutes and on **Ctrl-C**.
- Restarting restores neural state and plastic weights from `runs/local/brain.npz`. Queued stimulation is not replayed on restart.
- Sound is opt-in. Reduced-motion preferences start the experiment paused. Hidden or closed observation windows supply no new frames, so the brain waits.
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

The numerical backend is adapted from [nftechie/stonkfly](https://github.com/nftechie/stonkfly), commit `78ef3e05ab0fa086032098558d893667068944a0`, under MIT. The local copy includes the source, provenance, lockfiles, and license; it does not depend on the reference clone or import its trading stack. See [THIRD_PARTY.md](THIRD_PARTY.md) for MaleCNS CC BY 4.0 attribution and [flywirehead/upstream.json](flywirehead/upstream.json) for source hashes.

The model combines real reconstructed wiring with approximate physiology and an unvalidated experimental memory rule. It does not reproduce a complete living fly or establish consciousness. No real animals are involved.

The optional WebMCP controls share the normal interface actions; their browser registration was not verified in a supporting WebMCP context. WebGL 2 is needed for the 3D window. Three.js is vendored locally; the Google Fonts stylesheet is optional and falls back to system fonts offline.
