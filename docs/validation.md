# Local model validation

Verified on 2026-09-10 with Python 3.12.11 and the committed dependency lock.

- MaleCNS source files and prepared graph arrays match the upstream SHA-256 locks: 166,700 neurons, 25,582,938 directed connections, 3,335 mapped R1–R6 inputs and 811 mapped R8 inputs.
- From the same checkpoint following 1.5 s of white-input conditioning, a 100 ms white observation produced **127,378 spikes**, versus **92,952** for black input.
- A 200 ms control observation produced **0 PAM11 spikes**; the matched stimulated observation produced **261 PAM11 spikes**. After stimulation, **3,087 plastic edges** differed from their original baseline, and the weight array differed from the unstimulated control. This is a mechanism check, not a claim of learned preference or biological validity.
- Frozen plasticity preserved the saved weights despite reward-cell spiking.
- Restoring the checkpoint and replaying the control input produced the exact same spike hash.
- A real local HTTP worker received RGBA pixels, saved the corresponding RGB image exactly, delivered the requested 200 ms pulse over four observations, stopped receiving observations when paused, and saved a checkpoint at 250 ms neural time.
- Four fast Python checks cover pixel orientation/shape and local API validation, ownership, pause, and stimulation controls. Two full-network integration checks cover the above model and transport behaviors. Six JavaScript checks cover presentation timing and the backend bridge, including no fabricated telemetry on disconnect.

Commands are in the root README. Full-network tests are opt-in because they require the separately downloaded dataset. The browser's GPU rendering and optional WebMCP registration were not interactively tested; source syntax, module references, UI targets, HTTP serving, raw pixel transport, and the full numerical backend were checked.
