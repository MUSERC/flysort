"""Present the board to the mushroom body through the pathway it actually has.

Phase 0 measured why this module exists. Board identity is vivid at the retina
(R8 separability 54.9, R1-R6 13.0) and gone by the central brain (Kenyon cells
0.81, below the noise floor). Of the 572,399 units of synaptic weight arriving
on Kenyon cells, visual projections contribute 0.5%; the rest is olfactory
projection neurons, KC recurrence and APL. The mushroom body is an olfactory
organ, and the only plastic synapses in this model sit inside it.

So the board is delivered as a synthetic odor: a board-dependent current into
the 219 reconstructed projection-neuron cells spanning 52 glomeruli that really
do feed the KCs. Every synapse downstream stays exactly as reconstructed. The
board-to-glomerulus mapping is a declared modeling assumption of the same kind
the project already makes when it turns screen pixels into photoreceptor
current, and it is no more validated than that one. A real fly does not smell a
puzzle.

Each (tube, slot, color) feature recruits a small fixed set of glomeruli with
fixed weights, the way an odorant activates an overlapping receptor subset. Two
boards sharing most of their contents therefore smell similar, which is what
lets anything the fly learns generalize instead of memorizing.
"""

import re

import numpy as np

from .puzzle import LOCKED

PROJECTION_NEURON = re.compile(r"^(?P<glomerulus>[A-Za-z0-9]+)_(?:ad|l|v|il|vl|m)PN\d*$")

# Not a physiological current. In this model `drive` is a steady-state
# depolarization offset, and anything past a few tens of millivolts simply pins
# the cell at its maximum rate. This value means "switch these glomeruli fully
# on"; the measured separability below is what selected it, and the value was
# chosen with weights frozen so it could not be tuned against a training result.
LOCKED_CODE = 900
SATURATING_CURRENT_MV = 400.0
DEFAULT_SPARSITY = 16


def find_projection_neurons(engine):
    """Reconstructed uniglomerular PNs that synapse onto Kenyon cells."""
    brain = engine.brain
    is_kc = np.zeros(brain.n, bool)
    is_kc[brain.circuit["kc"]] = True
    edges = np.flatnonzero(is_kc[brain.post])
    sources = np.unique(np.searchsorted(brain.ptr, edges, side="right") - 1)
    groups = {}
    for index in sources:
        match = PROJECTION_NEURON.match(engine.types.iloc[index])
        if match:
            groups.setdefault(match.group("glomerulus"), []).append(int(index))
    if not groups:
        raise ValueError("No olfactory projection neurons feed the Kenyon cells")
    return {name: np.asarray(sorted(cells), dtype=np.int32) for name, cells in sorted(groups.items())}


class OdorEncoder:
    """Turns a board into a graded activation profile across glomeruli."""

    def __init__(
        self,
        engine,
        *,
        seed=0,
        channels_per_feature=4,
        current_mv=SATURATING_CURRENT_MV,
        sparsity=DEFAULT_SPARSITY,
        graded=False,
    ):
        if channels_per_feature < 1:
            raise ValueError("Each feature must recruit at least one glomerulus")
        if not np.isfinite(current_mv) or current_mv <= 0:
            raise ValueError("Odor current must be positive and finite")
        if sparsity < 1:
            raise ValueError("An odor must reach at least one glomerulus")
        self.groups = find_projection_neurons(engine)
        self.glomeruli = list(self.groups)
        self.seed = int(seed)
        self.channels_per_feature = int(channels_per_feature)
        self.current_mv = float(current_mv)
        self.sparsity = int(sparsity)
        self.graded = bool(graded)
        self.cells = np.concatenate([self.groups[g] for g in self.glomeruli]).astype(np.int32)
        self.cell_glomerulus = np.concatenate(
            [np.full(len(self.groups[g]), i, dtype=np.int32) for i, g in enumerate(self.glomeruli)]
        )
        self._features = {}

    def feature(self, tube, slot, color):
        """Fixed glomerulus subset and weights for one board feature."""
        key = (tube, slot, color)
        cached = self._features.get(key)
        if cached is None:
            # Seeded per feature so the code is stable across runs, processes and
            # board sizes without storing a matrix sized to one curriculum stage.
            rng = np.random.default_rng((self.seed, tube, slot, color))
            width = min(self.channels_per_feature, len(self.glomeruli))
            channels = rng.choice(len(self.glomeruli), size=width, replace=False)
            weights = 0.5 + rng.random(width)
            cached = (channels.astype(np.int32), weights.astype(np.float64))
            self._features[key] = cached
        return cached

    def activation(self, board):
        """Per-glomerulus activation in 0..1, peak-normalized like a concentration.

        Only the strongest few glomeruli are kept, and by default they are driven
        on or off rather than by degree. The projection neurons already fire hard
        with no odor at all, so a graded profile spread over every glomerulus is a
        low-contrast perturbation on a large background and the Kenyon cells
        cannot tell two of them apart. Measured separability across the sparsity
        and amplitude sweep: dense graded 0.67, sparse graded 2.33, sparse binary
        3.23, against 0.84 for showing the board on the screen.
        """
        profile = np.zeros(len(self.glomeruli), dtype=np.float64)
        for tube, contents in enumerate(board):
            for slot, color in enumerate(contents):
                # A locked bottle gets its own code rather than a color. The fly
                # is told there is a bottle it cannot use, not what is inside it.
                code = LOCKED_CODE if int(color) == LOCKED else int(color)
                channels, weights = self.feature(tube, slot, code)
                profile[channels] += weights
        if self.sparsity < len(profile):
            cut = np.argpartition(profile, -self.sparsity)[: -self.sparsity]
            profile[cut] = 0.0
        if not self.graded:
            return (profile > 0).astype(np.float64)
        peak = profile.max() if profile.size else 0.0
        return profile / peak if peak > 0 else profile

    def stimulus(self, board):
        """The (cells, current) pulse to hand to the engine."""
        profile = self.activation(board)
        return self.cells, (self.current_mv * profile[self.cell_glomerulus]).astype(np.float32)

    def report(self):
        return {
            "model": "board-to-glomerulus-v1",
            "projection_neurons": int(len(self.cells)),
            "glomeruli": len(self.glomeruli),
            "glomerulus_names": self.glomeruli,
            "channels_per_feature": self.channels_per_feature,
            "sparsity": self.sparsity,
            "current_mv": self.current_mv,
            "seed": self.seed,
            "encoding": "Each (tube, slot, color) recruits a fixed random glomerulus subset; the strongest few survive and the profile is peak-normalized.",
            "caveat": "A declared input assumption, exactly like pixels-to-photoreceptor current. A real fly does not smell a puzzle.",
            "validated": False,
        }
