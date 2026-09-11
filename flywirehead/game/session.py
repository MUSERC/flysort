"""Run a training session and show it happening."""

import json
import time
from pathlib import Path

import numpy as np

from . import puzzle
from .train import Trainer
from .viewer import LiveState, serve

LETTERS = "YBWGRC"
# Full brightness in the 3D view means this rate. A stated reference, so that a
# neuron's brightness means the same thing from one frame to the next.
ACTIVITY_REFERENCE_HZ = 100.0


def show_board(board, height):
    def tube(contents):
        if contents and contents[0] == puzzle.LOCKED:
            return "?" * height
        return "".join(LETTERS[c % len(LETTERS)] for c in contents).ljust(height, "·")

    return " ".join("|" + tube(t) + "|" for t in board)


def run(args):
    from ..engine import FlyEngine

    run_dir = Path(args.run_dir).resolve()
    run_dir.mkdir(parents=True, exist_ok=True)
    print("FLY / SORT — self-play on the bottle puzzle", flush=True)
    print("Loading the full connectome…", flush=True)
    engine = FlyEngine(frozen=args.frozen)
    brain = engine.brain

    live = LiveState() if args.port else None
    if live:
        serve(live, args.port)

    # Maps brain index to the order the 3D view draws neurons in. Neurons with no
    # published soma location are absent from it and simply are not shown.
    geometry = Path(__file__).resolve().parent.parent.parent / "dist/media/brain/order.npy"
    order = np.load(geometry) if geometry.exists() else None
    if order is None:
        print("  no dist/media/brain — run scripts/export_brain_geometry.py for the 3D view", flush=True)
        render_of = None
    else:
        render_of = np.full(brain.n, -1, dtype=np.int64)
        render_of[order] = np.arange(len(order))

    dopamine = []

    def publish_activity(window_ms):
        """Per-neuron firing rate for the drawn neurons, as raw bytes.

        Scaled against a fixed reference rate rather than against the frame's own
        peak. Peak-normalizing looked reasonable and was badly misleading: in a
        60 ms window a busy neuron fires perhaps three times, so a neuron with a
        single spike came out at a third of full brightness and almost the whole
        brain read as active.
        """
        if order is None:
            return
        seconds = max(window_ms, 1e-6) / 1000.0
        rate = brain.counts[order] / (seconds * ACTIVITY_REFERENCE_HZ)
        live.set_activity(np.clip(rate * 255.0, 0, 255).astype(np.uint8).tobytes())

    def publish(event):
        if not live:
            return
        if event["kind"] == "pour":
            live.update(
                board=[list(t) for t in event["board"]],
                height=event["height"],
                pour=list(event["pour"]),
                pours=event["pours"],
                budget=event["budget"],
                chosen=event["chosen"],
                options=[[m[0], m[1], v, p] for m, (v, p) in zip(event["moves"], event["options"])],
                kc=brain.counts[brain.circuit["kc"]].tolist(),
                kc_active=int((brain.counts[brain.circuit["kc"]] > 0).sum()),
                episode=trainer.episodes + 1,
                tier=event["tier"],
                baseline=event["baseline"],
                locked=event["locked"],
                opened=event["opened"],
                solve_rate=trainer.solve_rate(),
                episodes_done=len(trainer.history),
                tiers=trainer.tier_rates(),
                plastic_edges=len(brain.circuit["edges"]),
            )
            publish_activity(trainer.eval_ms)
        else:
            record = event["record"]
            dopamine.append({
                "episode": record["episode"],
                "rewarded": record["rewarded"],
                "hz": record["pam11_hz"] if record["rewarded"] else record["ppl101_hz"],
                "tier": record["tier"],
            })
            live.update(
                outcome="solved" if record["solved"] else "failed",
                reward_drive=record["reward_drive"],
                aversive_drive=record["aversive_drive"],
                pam11_hz=record["pam11_hz"],
                ppl101_hz=record["ppl101_hz"],
                changed_edges=record["changed_edges"],
                mean_efficacy=record["mean_efficacy"],
                solve_rate=trainer.solve_rate(),
                episodes_done=len(trainer.history),
                tiers=trainer.tier_rates(),
                ending=record["ending"],
                help=record["help"],
                # Dopamine fires for 200 ms at the very end of an episode that
                # lasts tens of seconds. Without a record of the moment the page
                # would only ever show a stale number and look like nothing fired.
                dopamine=dopamine[-40:],
            )
            publish_activity(trainer.outcome_ms)

    trainer = Trainer(
        engine,
        run_dir,
        seed=args.seed,
        eval_ms=args.eval_ms,
        shuffle_reward=args.shuffle_reward,
        only=args.only,
        observer=publish,
    )
    if not trainer.baselines:
        print(
            "\n  no runs/baselines.json — solve rates will have nothing to be compared\n"
            "  against. Run: python scripts/measure_baselines.py\n",
            flush=True,
        )

    checkpoint = run_dir / "brain.npz"
    if checkpoint.exists() and not args.fresh:
        brain.restore(checkpoint)
        brain.weights_frozen = args.frozen
        print(f"Resumed from {checkpoint} at {brain.sim_ms:.0f} ms of neural time", flush=True)

    odor = trainer.odor.report()
    condition = "frozen weights" if args.frozen else ("shuffled reward" if args.shuffle_reward else "learning")
    print(
        f"{brain.n:,} neurons · {len(brain.circuit['kc']):,} Kenyon cells · "
        f"{len(brain.circuit['edges']):,} plastic synapses",
        flush=True,
    )
    print(
        f"odor: {odor['sparsity']} of {odor['glomeruli']} glomeruli · "
        f"{odor['projection_neurons']} projection neurons · condition: {condition}",
        flush=True,
    )
    (run_dir / "provenance.json").write_text(
        json.dumps(
            {
                "neurons": brain.n,
                "kenyon_cells": len(brain.circuit["kc"]),
                "plastic_edges": len(brain.circuit["edges"]),
                "condition": condition,
                "frozen": args.frozen,
                "shuffle_reward": args.shuffle_reward,
                "eval_ms": args.eval_ms,
                "seed": args.seed,
                "difficulties": puzzle.DIFFICULTIES,
                "baselines": trainer.baselines,
                "odor": odor,
                "reward": "PAM11 on solve, PPL101 otherwise, outcome only; no per-pour teacher",
                "started_at": time.time(),
            },
            indent=2,
        )
        + "\n"
    )

    if live:
        if render_of is not None:
            visible = lambda group: [int(i) for i in render_of[group] if i >= 0]  # noqa: E731
            live.update(
                kc_index=visible(brain.circuit["kc"]),
                circuit_index=visible(np.r_[brain.circuit["dan"], brain.circuit["mb"]]),
            )
        print(f"\nwatch it train at http://127.0.0.1:{args.port}", flush=True)
    print(f"\nwarming up ({trainer.warmup_ms:.0f} ms of neural time)…", flush=True)
    trainer.warm_up()
    print("", flush=True)
    for spec in puzzle.DIFFICULTIES:
        if args.only and spec["name"] != args.only:
            continue
        base = trainer.baselines.get(spec["name"])
        bottles = spec["colors"] + spec["spread"] + spec["spare"] + spec["hidden"]
        chance = f"random pouring wins {base:.0%}" if base is not None else "chance unmeasured"
        print(
            f"  {spec['name']:>6}: {spec['colors']} colors · {bottles} bottles · "
            f"{spec['hidden']} locked · capacity {spec['height']} · {chance}",
            flush=True,
        )
    print("", flush=True)

    log = (run_dir / "episodes.jsonl").open("a", buffering=1)
    started = time.perf_counter()
    try:
        for _ in range(args.episodes):
            record = trainer.episode()
            log.write(json.dumps(record) + "\n")
            tier = trainer.by_tier[record["tier"]]
            rate = f"{sum(tier) / len(tier):>4.0%}" if tier else "   –"
            ENDINGS = {"solved": "SOLVED", "dead": "LOST  ", "stuck": "STUCK ", "budget": "failed"}
            marks = "".join(
                [f" +{record['opened']}open" if record["opened"] else "",
                 f" try{record['attempt']}" if record["attempt"] > 1 else "",
                 f" +{record['help']}bottle" if record["help"] else ""]
            )
            print(
                f"ep {record['episode']:>4} {record['tier']:>6}  {ENDINGS[record['ending']]} "
                f"{record['pours']:>2}/{record['budget']:<2} (best {record['optimal_pours']:>2})"
                f"{marks:<20}  {record['tier']} {rate} vs {record['baseline']:.0%}  "
                f"{'PAM11' if record['rewarded'] else 'PPL101'} "
                f"{record['pam11_hz'] if record['rewarded'] else record['ppl101_hz']:>5.0f}Hz  "
                f"Δw {record['changed_edges']:>5}  {record['seconds']:>5.1f}s  "
                f"{show_board(record['final_board'], record['height'])}",
                flush=True,
            )
            if record["helped_to"]:
                print(
                    f"       failed it {trainer.patience}x — replaying with "
                    f"{record['helped_to']} extra empty bottle(s)",
                    flush=True,
                )
            if record["episode"] % args.save_every == 0:
                brain.checkpoint(checkpoint)
    except KeyboardInterrupt:
        print("\nstopping…", flush=True)
    finally:
        log.close()
        brain.checkpoint(checkpoint)
        elapsed = time.perf_counter() - started
        tiers = trainer.tier_rates()
        summary = {
            "condition": condition,
            "episodes": trainer.episodes,
            "tiers": tiers,
            "wall_seconds": round(elapsed, 1),
            "neural_ms": brain.sim_ms,
        }
        (run_dir / "summary.json").write_text(json.dumps(summary, indent=2) + "\n")
        print(f"\n{trainer.episodes} episodes in {elapsed / 60:.1f} min · {condition}", flush=True)
        print(f"\n{'tier':>8} {'levels':>7} {'solved':>8} {'chance':>8}", flush=True)
        for name, row in tiers.items():
            print(
                f"{name:>8} {row['n']:>7} {row['solved']:>7.0%} {row['baseline']:>7.0%}",
                flush=True,
            )
        print(f"\ncheckpoint saved to {checkpoint}", flush=True)
