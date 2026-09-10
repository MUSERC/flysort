# Sources and provenance

The `flywirehead/neural/` modules (except the trading-specific controller, which is omitted) and `flywirehead/data.py` are adapted from [nftechie/stonkfly](https://github.com/nftechie/stonkfly), itself derived from DOOMFLY. The original MIT notice is preserved in [licenses/stonkfly-MIT.txt](licenses/stonkfly-MIT.txt). Source revision is recorded in `flywirehead/upstream.json`.

The retained graph and checksum locks are MaleCNS v1.0. The [MaleCNS collaboration and upstream contributors](https://male-cns.janelia.org/download/) distribute the data under CC BY 4.0. The original dataset registry, source hashes, array hashes, and neuron metadata hashes remain in `flywirehead/neural/`. Datasets are downloaded separately into ignored local storage.

This app reuses the upstream LIF kernel, inferred R1–R6/R8 projection, and experimental KC→MBON memory rule. It replaces the trading environment with RGB frames of the shortform display. Manual stimulation delivers a 200 ms, 20 mV-equivalent current to the 15 annotated PAM11 neurons. Any effect on a display, animation, or feed is an engineered interface. Wiring data does not establish accurate physiology, subjective experience, attention, addiction, or learning.

The 3D scene and synthetic short animations are original to this repository. Three.js 0.180.0 is distributed under `dist/vendor/THREE-LICENSE.txt`.
