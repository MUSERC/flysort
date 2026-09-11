"""Phase 0 gate: can this brain tell two boards apart where it matters?

Plasticity in this model touches only the KC to MBON synapses, so a board that
does not change Kenyon cell activity cannot be learned no matter how it is
rewarded. The number that decides it is not raw pattern distance but its size
relative to the variation the same board produces from a different preceding
state, because that variation is the noise any readout has to beat.

This compares the two ways of delivering a board:

  vision  the board on the screen, driving the photoreceptors
  odor    the board as a glomerular activation profile injected into the real
          projection neurons that feed the Kenyon cells

It also reads the KC drive arriving on each memory compartment, since MBON07
and MBON11 together emit only a handful of spikes per window and cannot rank
anything on their own.

The network needs roughly half a second of input to leave its cold start, so
everything is measured from a warmed anchor. Weights stay frozen; nothing learns.
"""

import argparse
import json
import random
import tempfile
from pathlib import Path

import numpy as np


def cosine_distance(a, b):
    na, nb = np.linalg.norm(a), np.linalg.norm(b)
    if na == 0 or nb == 0:
        return float("nan")
    return float(1 - np.dot(a, b) / (na * nb))


def mean_pairwise(values):
    pairs = [abs(values[i] - values[j]) for i in range(len(values)) for j in range(i + 1, len(values))]
    return float(np.mean(pairs)) if pairs else float("nan")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--boards", type=int, default=12)
    parser.add_argument("--contexts", type=int, default=3)
    parser.add_argument("--colors", type=int, default=3)
    parser.add_argument("--height", type=int, default=3)
    parser.add_argument("--window-ms", type=float, default=200.0)
    parser.add_argument("--warmup-ms", type=float, default=2000.0)
    parser.add_argument("--odor-current-mv", type=float, default=25.0)
    parser.add_argument("--seed", type=int, default=11)
    parser.add_argument("--out", type=Path, default=Path("runs/probe/encoding.json"))
    args = parser.parse_args()

    from flywirehead.engine import FlyEngine
    from flywirehead.game import puzzle, render
    from flywirehead.game.odor import OdorEncoder

    rng = random.Random(args.seed)
    boards, seen = [], set()
    while len(boards) < args.boards:
        board = puzzle.generate(rng, args.colors, args.height, empty_tubes=1)
        if board not in seen:
            seen.add(board)
            boards.append(board)
    contexts = [puzzle.generate(rng, args.colors, args.height, empty_tubes=1) for _ in range(args.contexts)]
    warmup = [puzzle.generate(rng, args.colors, args.height, empty_tubes=1) for _ in range(4)]
    frames = {b: render.board_frame(b, args.height) for b in boards + contexts + warmup}

    print(f"Loading the full graph ({args.boards} boards, {args.contexts} contexts)…", flush=True)
    engine = FlyEngine(frozen=True)
    brain = engine.brain
    kc = brain.circuit["kc"]
    encoder = OdorEncoder(engine, seed=args.seed, current_mv=args.odor_current_mv)
    print(f"KC cells: {len(kc)}   projection neurons: {len(encoder.cells)} across {len(encoder.glomeruli)} glomeruli")
    print(f"Plastic edges: reward compartment {len(engine.reward_edges)}, aversive {len(engine.aversive_edges)}", flush=True)

    def look(board, ms, *, use_odor):
        odor = encoder.stimulus(board) if use_odor else None
        return engine.observe(frames[board], ms, odor=odor)

    conditions = {}
    for name, use_odor in [("vision", False), ("odor", True)]:
        brain.reset()
        remaining, index = args.warmup_ms, 0
        while remaining > 0:
            step = min(500.0, remaining)
            look(warmup[index % len(warmup)], step, use_odor=use_odor)
            remaining -= step
            index += 1
        with tempfile.TemporaryDirectory() as tmp:
            anchor = Path(tmp) / "anchor.npz"
            brain.checkpoint(anchor)
            patterns = np.zeros((len(boards), len(contexts), len(kc)))
            valences = np.zeros((len(boards), len(contexts)))
            per_board = []
            for ci, context in enumerate(contexts):
                for bi, board in enumerate(boards):
                    brain.restore(anchor)
                    look(context, 50.0, use_odor=use_odor)
                    result = look(board, args.window_ms, use_odor=use_odor)
                    patterns[bi, ci] = brain.counts[kc]
                    valences[bi, ci] = result["valence"]
                    if ci == 0:
                        per_board.append(
                            {
                                "board": bi,
                                "total_spikes": result["total_spikes"],
                                "kc_active": result["kc_active"],
                                "kc_hz": round(result["kc_hz"], 3),
                                "valence": round(result["valence"], 2),
                            }
                        )
                print(f"  {name}: context {ci + 1}/{len(contexts)}", flush=True)

        within = np.nanmean(
            [
                cosine_distance(patterns[b, i], patterns[b, j])
                for b in range(len(boards))
                for i in range(len(contexts))
                for j in range(i + 1, len(contexts))
            ]
        )
        between = np.nanmean(
            [
                cosine_distance(patterns[i, c], patterns[j, c])
                for c in range(len(contexts))
                for i in range(len(boards))
                for j in range(i + 1, len(boards))
            ]
        )
        valence_between = float(np.mean([mean_pairwise(list(valences[:, c])) for c in range(len(contexts))]))
        valence_within = float(np.mean([mean_pairwise(list(valences[b, :])) for b in range(len(boards))]))
        conditions[name] = {
            "kc_active_mean": float(np.mean([r["kc_active"] for r in per_board])),
            "kc_distance_between_boards": round(float(between), 5),
            "kc_distance_within_board": round(float(within), 5),
            "kc_separability_ratio": round(float(between / within), 3) if within else None,
            "identical_board_pairs": int(
                sum(
                    1
                    for c in range(len(contexts))
                    for i in range(len(boards))
                    for j in range(i + 1, len(boards))
                    if np.array_equal(patterns[i, c], patterns[j, c])
                )
            ),
            "valence_spread_between_boards": round(valence_between, 4),
            "valence_spread_within_board": round(valence_within, 4),
            "valence_separability_ratio": round(valence_between / valence_within, 3) if valence_within else None,
            "per_board": per_board,
        }

    summary = {
        "boards": len(boards),
        "contexts": len(contexts),
        "colors": args.colors,
        "height": args.height,
        "window_ms": args.window_ms,
        "warmup_ms": args.warmup_ms,
        "kc_cells": len(kc),
        "odor": encoder.report(),
        "conditions": conditions,
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(summary, indent=2) + "\n")

    print()
    header = f"{'':34}{'vision':>12}{'odor':>12}"
    print(header)
    print("-" * len(header))
    for label, key in [
        ("KC cells active per board", "kc_active_mean"),
        ("KC distance between boards", "kc_distance_between_boards"),
        ("KC distance within board", "kc_distance_within_board"),
        ("KC separability ratio (want > 1)", "kc_separability_ratio"),
        ("Identical board pairs", "identical_board_pairs"),
        ("Valence separability (want > 1)", "valence_separability_ratio"),
    ]:
        v, o = conditions["vision"][key], conditions["odor"][key]
        fmt = lambda x: f"{x:12.3f}" if isinstance(x, float) else f"{x:>12}"
        print(f"{label:34}{fmt(v)}{fmt(o)}")
    print(f"\nWritten to {args.out}")


if __name__ == "__main__":
    main()
