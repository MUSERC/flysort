"""How often does random pouring win each difficulty?

Every claim that the fly learned something has to be measured against this. A
difficulty a coin already beats is not evidence of anything, and early on this
project produced exactly that: a board shape where random pouring won ~100% of
the time and every policy looked brilliant.

Writes runs/baselines.json, which the trainer reads at startup.
"""

import argparse
import json
import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from flywirehead.game import puzzle as P  # noqa: E402


def random_playout(level, solution, rng, move_budget):
    state = P.start(level)
    budget = max(3, int(len(solution) * move_budget))
    for _ in range(budget):
        if P.level_solved(level, state):
            return True
        moves = P.level_moves(level, state)
        if not moves:
            break
        state = P.level_apply(level, state, rng.choice(moves))
    return P.level_solved(level, state)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--trials", type=int, default=150)
    parser.add_argument("--playouts", type=int, default=12, help="Random attempts per level")
    parser.add_argument("--move-budget", type=float, default=3.0)
    parser.add_argument("--out", type=Path, default=Path("runs/baselines.json"))
    args = parser.parse_args()

    rng = random.Random(12345)
    results = {}
    print(f"{'tier':>8} {'bottles':>8} {'locked':>7} {'best pours':>11} {'random wins':>12}")
    for spec in P.DIFFICULTIES:
        wins = plays = 0
        lengths, bottles = [], 0
        for _ in range(args.trials):
            level, solution = P.generate_level(rng, spec)
            lengths.append(len(solution))
            bottles = len(level.board)
            for _ in range(args.playouts):
                wins += random_playout(level, solution, rng, args.move_budget)
                plays += 1
        rate = wins / plays
        results[spec["name"]] = {
            "baseline": round(rate, 4),
            "mean_optimal_pours": round(sum(lengths) / len(lengths), 2),
            "bottles": bottles,
            "levels": args.trials,
            "playouts": plays,
        }
        print(
            f"{spec['name']:>8} {bottles:>8} {spec['hidden']:>7} "
            f"{sum(lengths) / len(lengths):>11.1f} {rate:>11.0%}"
        )

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(results, indent=2) + "\n")
    print(f"\nwrote {args.out}")


if __name__ == "__main__":
    main()
