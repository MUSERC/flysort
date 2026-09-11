"""Export the retained network as 3D geometry the browser can draw.

Positions are the published soma coordinates from the MaleCNS annotations. They
are not invented, not laid out by a graph algorithm, and not projected: this is
where the cell bodies physically sit in the animal.

Two honest limits are baked into the output and reported in meta.json.

Only 139,662 of the 166,700 retained neurons have a published soma location. The
rest are not drawn, because placing them would mean making up a position for a
real cell.

The network has 25,582,938 connections, which no browser will draw. A seeded
random sample is exported instead, plus every synapse of the mushroom body
learning circuit, since those are the ones the training actually changes.
"""

import argparse
import json
from pathlib import Path

import numpy as np
import pyarrow.feather as feather

ROOT = Path(__file__).resolve().parent.parent


def soma_positions(ids):
    table = feather.read_table(
        ROOT / "data/annotations.feather", columns=["bodyId", "somaLocation"]
    ).to_pydict()
    lookup = {b: v for b, v in zip(table["bodyId"], table["somaLocation"]) if v is not None}
    known = np.array([b in lookup for b in ids])
    coords = np.zeros((len(ids), 3), dtype=np.float32)
    for i, body in enumerate(ids):
        if known[i]:
            coords[i] = lookup[body]
    return coords, known


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--edges", type=int, default=240000, help="Connections to draw")
    parser.add_argument("--out", type=Path, default=ROOT / "dist/media/brain")
    parser.add_argument("--seed", type=int, default=0)
    args = parser.parse_args()

    graph = np.load(ROOT / "data/graph.npz")
    ids, ptr, post = graph["ids"], graph["ptr"], graph["post"]
    superclass = graph["superclass"]
    print(f"{len(ids):,} neurons, {len(post):,} connections")

    coords, known = soma_positions(ids)
    order = np.flatnonzero(known).astype(np.int64)
    print(f"{len(order):,} have a published soma location ({known.mean():.1%})")

    # Brain index -> render index, or -1 for neurons that are not drawn.
    render_of = np.full(len(ids), -1, dtype=np.int64)
    render_of[order] = np.arange(len(order))

    points = coords[order]
    centre = points.mean(axis=0)
    scale = float(np.abs(points - centre).max())
    points = ((points - centre) / scale).astype(np.float32)

    pre = np.repeat(np.arange(len(ids), dtype=np.int64), np.diff(ptr))
    drawable = (render_of[pre] >= 0) & (render_of[post] >= 0)
    usable = np.flatnonzero(drawable)
    print(f"{len(usable):,} connections have both ends placed")

    rng = np.random.default_rng(args.seed)
    take = rng.choice(usable, size=min(args.edges, len(usable)), replace=False)

    # Always include the plastic circuit in full, whatever the sample happened to
    # pick. identify() only reads these four arrays, so there is no need to build
    # the simulator just to locate the synapses.
    from types import SimpleNamespace

    from flywirehead.neural.circuit import identify  # noqa: E402

    circuit = identify(
        SimpleNamespace(ids=ids, post=post, ptr=ptr, weight=graph["weight"], n=len(ids))
    )
    circuit_edges = np.asarray(circuit["edges"], dtype=np.int64)
    circuit_edges = circuit_edges[drawable[circuit_edges]]
    print(f"{len(circuit_edges):,} plastic synapses added in full")

    chosen = np.unique(np.concatenate([take, circuit_edges])) if len(circuit_edges) else np.unique(take)
    lines = np.stack([render_of[pre[chosen]], render_of[post[chosen]]], axis=1).astype(np.uint32)
    plastic = np.isin(chosen, circuit_edges).astype(np.uint8)

    families = sorted({str(s).split("_")[0] for s in superclass[order]})
    family_of = np.array(
        [families.index(str(s).split("_")[0]) for s in superclass[order]], dtype=np.uint8
    )

    args.out.mkdir(parents=True, exist_ok=True)
    points.tofile(args.out / "positions.f32")
    lines.tofile(args.out / "edges.u32")
    plastic.tofile(args.out / "edge-plastic.u8")
    family_of.tofile(args.out / "family.u8")
    np.save(args.out / "order.npy", order)

    meta = {
        "neurons_total": int(len(ids)),
        "neurons_drawn": int(len(order)),
        "neurons_without_soma": int(len(ids) - len(order)),
        "connections_total": int(len(post)),
        "connections_drawn": int(len(lines)),
        "plastic_drawn": int(plastic.sum()),
        "families": families,
        "centre": centre.tolist(),
        "scale": scale,
        "source": "MaleCNS v1.0 somaLocation; positions are published anatomy, not a layout",
        "caveat": (
            f"{len(ids) - len(order):,} retained neurons have no published soma location and are "
            f"not drawn. {len(post) - len(lines):,} connections are not drawn; the sample is seeded "
            "and includes every plastic synapse."
        ),
    }
    (args.out / "meta.json").write_text(json.dumps(meta, indent=2) + "\n")
    print(json.dumps(meta, indent=2))


if __name__ == "__main__":
    import sys

    sys.path.insert(0, str(ROOT))
    main()
