"""Self-play training on the bottle-sorting puzzle.

The fly is never told which pour is correct. For each decision it considers every
legal pour, and what it considers is the board as it *would* look afterwards. The
valence it reads off that imagined board is its value estimate, and it samples a
pour from those values. Reward arrives only at the end of the episode: dopamine
(PAM11) if the puzzle came out solved, the aversive channel (PPL101) if it ran
out of pours or dried up.

Two facts from the Phase 0 gate shape everything here.

The board reaches the mushroom body as an odor, not as a picture, because the
plastic synapses sit in a structure that receives 0.5% of its input from vision.

Episodes are kept short in neural time because the eligibility trace that carries
credit backwards is about one second long. A pour that happened earlier than that
is invisible to the reward, so long episodes would be training on nothing.
"""

import json
import random
import time
from pathlib import Path

import numpy as np

from . import puzzle, render
from .odor import OdorEncoder

def load_baselines(path=Path("runs/baselines.json")):
    """Random-play win rates per difficulty, measured by scripts/measure_baselines.py.

    Without these a solve rate means nothing: an earlier version of this board
    shape was solved ~100% of the time by pouring at random.
    """
    try:
        return {name: row["baseline"] for name, row in json.loads(Path(path).read_text()).items()}
    except (OSError, ValueError, KeyError):
        return {}


def softmax(values, temperature):
    scaled = values / max(temperature, 1e-6)
    scaled -= scaled.max()
    weights = np.exp(scaled)
    return weights / weights.sum()


class Trainer:
    def __init__(
        self,
        engine,
        run_dir,
        *,
        seed=0,
        eval_ms=100.0,
        outcome_ms=200.0,
        warmup_ms=2000.0,
        temperature=1.0,
        temperature_floor=0.25,
        anneal=0.997,
        move_budget=3.0,
        window=40,
        shuffle_reward=False,
        only=None,
        patience=5,
        max_help=3,
        observer=None,
    ):
        self.engine = engine
        self.run_dir = run_dir
        self.run_dir.mkdir(parents=True, exist_ok=True)
        # Two streams, deliberately. If the policy drew from the same generator as
        # the level builder, a fly that sampled pours differently would also get
        # different puzzles, and a learner could never be compared against a
        # control on equal ground.
        self.rng = random.Random(seed)
        self.policy_rng = random.Random(seed + 10_000)
        self.eval_ms = eval_ms
        self.outcome_ms = outcome_ms
        self.warmup_ms = warmup_ms
        self.temperature = temperature
        self.temperature_floor = temperature_floor
        self.anneal = anneal
        self.move_budget = move_budget
        self.window = window
        self.shuffle_reward = shuffle_reward
        self.observer = observer
        self.odor = OdorEncoder(engine, seed=seed)
        self.baselines = load_baselines()
        self.only = only
        self.patience = patience
        self.max_help = max_help
        self.current = None
        self.episodes = 0
        self.history = []
        self.by_tier = {d["name"]: [] for d in puzzle.DIFFICULTIES}
        self._frames = {}

    def next_spec(self):
        if self.only:
            return puzzle.BY_NAME[self.only]
        return puzzle.pick_difficulty(self.rng)

    def next_level(self):
        """The level to play now, and how much help it has been given.

        A level is kept until it is beaten. After `patience` failures it is handed
        back with one more empty bottle, and again after another `patience`, so a
        fly that is stuck is eventually given a level it can finish rather than
        failing the same board forever. Past `max_help` the level is retired.
        """
        if self.current is None:
            spec = self.next_spec()
            level, solution = puzzle.generate_level(self.rng, spec)
            self.current = {"spec": spec, "level": level, "solution": solution,
                            "failures": 0, "help": 0}
        return self.current

    def finish_level(self, solved):
        entry = self.current
        if solved or entry["help"] >= self.max_help:
            self.current = None
            return 0
        entry["failures"] += 1
        if entry["failures"] < self.patience:
            return 0
        eased = puzzle.with_extra_bottle(entry["level"])
        solution, exhausted = puzzle.search(eased, puzzle.start(eased))
        if solution is None and exhausted:
            self.current = None
            return 0
        if solution is None:
            # The search ran out of budget on the bigger board, which is not the
            # same as the level being unwinnable. An extra empty bottle can always
            # be ignored, so the level is still winnable and its best line can be
            # no longer than before; the old solution is a sound stand-in.
            solution = entry["solution"]
        entry.update(level=eased, solution=solution, failures=0, help=entry["help"] + 1)
        return entry["help"]

    def frame(self, view, height):
        """Cached picture of a board. The fly still watches it; it learns by smell."""
        cached = self._frames.get((view, height))
        if cached is None:
            cached = render.board_frame(view, height)
            self._frames[(view, height)] = cached
        return cached

    def look(self, view, height, ms, *, reward=False, punish=False):
        """Observe one board. `view` is what the player can see, locked bottles included."""
        return self.engine.observe_game(
            self.frame(view, height), ms, reward=reward, punish=punish,
            odor=self.odor.stimulus(view),
        )

    def warm_up(self):
        """The mushroom body needs about half a second of input to leave its cold start."""
        remaining = self.warmup_ms
        while remaining > 0:
            step = min(500.0, remaining)
            level, _ = puzzle.generate_level(self.rng, self.next_spec())
            self.look(puzzle.observed(level, puzzle.start(level)), level.height, step)
            remaining -= step

    def decide(self, level, state):
        """Value every legal pour by the board it would produce, then sample one.

        The fly evaluates what it would *see* after the pour, so a bottle that is
        still locked stays opaque to it. When a pour opens one, the surprise is
        real: the contents were fixed when the level was built, but nothing in the
        input revealed them beforehand.
        """
        moves = puzzle.level_moves(level, state)
        if not moves:
            return None, [], []
        values, afterstates = [], []
        for move in moves:
            after = puzzle.level_apply(level, state, move)
            view = puzzle.observed(level, after)
            afterstates.append(view)
            values.append(self.look(view, level.height, self.eval_ms)["valence"])
        values = np.asarray(values, dtype=np.float64)
        spread = values.std()
        centered = (values - values.mean()) / spread if spread > 1e-9 else np.zeros_like(values)
        probabilities = softmax(centered, self.temperature)
        index = self.policy_rng.choices(range(len(moves)), weights=probabilities.tolist())[0]
        return index, moves, list(zip(afterstates, values.tolist(), probabilities.tolist()))

    def episode(self):
        entry = self.next_level()
        spec, level, optimal = entry["spec"], entry["level"], entry["solution"]
        state = puzzle.start(level)
        budget = max(3, int(len(optimal) * self.move_budget))
        started = time.perf_counter()
        pours, trace, opened, ending = 0, [], 0, "budget"
        while pours < budget and not puzzle.level_solved(level, state):
            index, moves, options = self.decide(level, state)
            if index is None:
                ending = "stuck"
                break
            chosen = moves[index]
            before = state.revealed
            state = puzzle.level_apply(level, state, chosen)
            opened += state.revealed - before
            pours += 1
            trace.append(
                {
                    "pour": chosen,
                    "valence": options[index][1],
                    "probability": options[index][2],
                    "considered": len(moves),
                    "opened": state.revealed - before,
                }
            )
            if self.observer:
                self.observer(
                    {
                        "kind": "pour",
                        "board": puzzle.observed(level, state),
                        "height": level.height,
                        "pour": chosen,
                        "pours": pours,
                        "budget": budget,
                        "moves": moves,
                        "options": [(v, p) for _, v, p in options],
                        "chosen": index,
                        "tier": spec["name"],
                        "baseline": self.baselines.get(spec["name"], 0.0),
                        "locked": len(level.unlock_after) - state.revealed,
                        "opened": state.revealed - before,
                    }
                )
            # Every level starts winnable, so an unwinnable position is one the
            # fly made. Ending here rather than pouring out the rest of the budget
            # puts the punishment on the move that lost the game instead of on a
            # dozen meaningless moves after it.
            if not puzzle.level_solved(level, state) and puzzle.is_dead(level, state):
                ending = "dead"
                break
        solved = puzzle.level_solved(level, state)
        if solved:
            ending = "solved"
        view = puzzle.observed(level, state)
        # Outcome only. A shuffled control severs reward from the result while
        # delivering exactly the same amount of dopamine over a run.
        outcome = self.policy_rng.random() < 0.5 if self.shuffle_reward else solved
        result = self.look(view, level.height, self.outcome_ms, reward=outcome, punish=not outcome)
        memory = result["memory"]
        self.episodes += 1
        self.temperature = max(self.temperature_floor, self.temperature * self.anneal)
        self.history.append(solved)
        # Scored only on levels the fly was given no help with, so the assist
        # cannot quietly inflate the number being compared against chance.
        if not entry["help"]:
            self.by_tier[spec["name"]].append(solved)
        record = {
            "episode": self.episodes,
            "tier": spec["name"],
            "colors": spec["colors"],
            "bottles": len(level.board),
            "locked_total": len(level.unlock_after),
            "unlock_after": list(level.unlock_after),
            "opened": opened,
            "ending": ending,
            "help": entry["help"],
            "attempt": entry["failures"] + 1,
            "baseline": self.baselines.get(spec["name"], 0.0),
            "height": level.height,
            "optimal_pours": len(optimal),
            "pours": pours,
            "budget": budget,
            "solved": solved,
            "final_board": [list(tube) for tube in view],
            "rewarded": outcome,
            "temperature": round(self.temperature, 4),
            "valence": round(result["valence"], 3),
            "reward_drive": round(result["reward_drive"], 3),
            "aversive_drive": round(result["aversive_drive"], 3),
            "kc_active": result["kc_active"],
            "pam11_hz": round(result["pam11_hz"], 2),
            "ppl101_hz": round(result["ppl101_hz"], 2),
            "changed_edges": memory["changed_edges"],
            "mean_efficacy": round(memory["mean_efficacy"], 6),
            "weight_sha256": memory["sha256"],
            "seconds": round(time.perf_counter() - started, 2),
            "trace": trace,
        }
        record["helped_to"] = self.finish_level(solved)
        if self.observer:
            self.observer({"kind": "episode", "board": view, "height": level.height, "record": record})
        return record

    def solve_rate(self, window=None):
        recent = self.history[-(window or self.window):]
        return sum(recent) / len(recent) if recent else 0.0

    def tier_rates(self):
        """Solve rate against the random-play baseline, per difficulty."""
        return {
            name: {
                "n": len(results),
                "solved": sum(results) / len(results) if results else 0.0,
                "baseline": self.baselines.get(name, 0.0),
            }
            for name, results in self.by_tier.items()
            if results
        }

