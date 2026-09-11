"""Magic Sort style color-sorting puzzle. Pure logic; nothing here touches the brain.

A board is a tuple of tubes, each tube a bottom-to-top tuple of color indices.
Pouring follows the published rules: only the top color moves, only onto an
empty tube or a matching top color, and only while the target has room.
"""

from collections import deque, namedtuple

EMPTY = ()

# A bottle nobody has opened yet. It sits at the end of the board, it cannot be
# poured from or into, and its contents are not shown. They are decided when the
# level is built, so the level can still be proven winnable, but the player finds
# out what is inside only when it opens.
LOCKED = -1

Level = namedtuple("Level", "board height unlock_after name")
State = namedtuple("State", "board revealed")


def top_run(tube):
    """Return the contiguous run of the top color, as (color, count)."""
    if not tube:
        return None, 0
    color = tube[-1]
    count = 0
    for value in reversed(tube):
        if value != color:
            break
        count += 1
    return color, count


def is_uniform(tube):
    return len(set(tube)) <= 1


def legal_moves(board, height):
    """Every (source, target) pour permitted by the rules.

    Pouring a tube that already holds a single color into an empty tube is
    excluded: it never changes anything the player cares about and it lets a
    search or a policy loop forever between two equivalent states.
    """
    moves = []
    for source, tube in enumerate(board):
        if not tube:
            continue
        color, run = top_run(tube)
        pointless_source = is_uniform(tube)
        for target, other in enumerate(board):
            if target == source or len(other) >= height:
                continue
            if other:
                if other[-1] != color:
                    continue
            elif pointless_source:
                continue
            moves.append((source, target))
    return moves


def apply_move(board, move, height):
    """Pour the whole top run, limited by the room left in the target."""
    source, target = move
    tubes = [list(t) for t in board]
    color, run = top_run(board[source])
    space = height - len(board[target])
    poured = min(run, space)
    if poured < 1:
        raise ValueError("Illegal pour")
    if board[target] and board[target][-1] != color:
        raise ValueError("Illegal pour: color mismatch")
    del tubes[source][len(board[source]) - poured :]
    tubes[target].extend([color] * poured)
    return tuple(tuple(t) for t in tubes)


def is_solved(board, height):
    """Every tube is either empty or a full stack of a single color."""
    return all(not tube or (len(tube) == height and is_uniform(tube)) for tube in board)


def solve(board, height, limit=200000):
    """Shortest solution by breadth-first search, or None.

    Used for scoring and for rejecting unsolvable generated levels. It is never
    consulted as a training signal; the fly is rewarded only by its own outcome.
    """
    if is_solved(board, height):
        return []
    seen = {board}
    queue = deque([(board, ())])
    explored = 0
    while queue:
        state, path = queue.popleft()
        explored += 1
        if explored > limit:
            return None
        for move in legal_moves(state, height):
            nxt = apply_move(state, move, height)
            if nxt in seen:
                continue
            if is_solved(nxt, height):
                return list(path + (move,))
            seen.add(nxt)
            queue.append((nxt, path + (move,)))
    return None


def generate(rng, colors, height, empty_tubes=1, attempts=200):
    """A shuffled, verified-solvable, not-already-solved starting board."""
    if colors < 1 or height < 2 or empty_tubes < 1:
        raise ValueError("Need at least one color, height 2, and one empty tube")
    for _ in range(attempts):
        balls = [c for c in range(colors) for _ in range(height)]
        rng.shuffle(balls)
        filled = [tuple(balls[i * height : (i + 1) * height]) for i in range(colors)]
        board = tuple(filled) + tuple(EMPTY for _ in range(empty_tubes))
        if is_solved(board, height):
            continue
        if solve(board, height) is not None:
            return board
    raise RuntimeError("Could not generate a solvable level")


def disorder(board, height):
    """Count of tubes that still need work; 0 exactly when the board is solved."""
    return sum(1 for tube in board if tube and not (len(tube) == height and is_uniform(tube)))


# --- levels with locked bottles -------------------------------------------------
#
# Everything above treats the board as fully visible. A Level adds bottles that
# start locked and open as the player finishes others, which is both a constraint
# and a gamble: the board that opens up may help or may hand you a color you had
# no room for.


def completed(board, height):
    """Bottles that are finished: full, and all one color."""
    return sum(1 for tube in board if len(tube) == height and is_uniform(tube))


def open_count(level, revealed):
    """How many bottles are currently in play."""
    return len(level.board) - len(level.unlock_after) + revealed


def unlock(level, board, revealed):
    """Open every locked bottle whose threshold the board now meets.

    Bottles never close again. Completing a bottle and then pouring out of it
    would otherwise take back a bottle the player had already been given.
    """
    done = completed(board, level.height)
    while revealed < len(level.unlock_after) and done >= level.unlock_after[revealed]:
        revealed += 1
    return revealed


def start(level):
    return State(level.board, unlock(level, level.board, 0))


def level_moves(level, state):
    """Legal pours, restricted to bottles that have been opened."""
    live = state.board[: open_count(level, state.revealed)]
    return legal_moves(live, level.height)


def level_apply(level, state, move):
    board = apply_move(state.board, move, level.height)
    return State(board, unlock(level, board, state.revealed))


def level_solved(level, state):
    """Solved means every bottle is opened and sorted. Liquid cannot stay locked away."""
    return state.revealed == len(level.unlock_after) and is_solved(state.board, level.height)


def search(level, state, limit=400000):
    """Shortest winning line from `state`, as (moves, exhausted).

    `moves` is None when no win was found, and `exhausted` says whether the
    search actually finished. The pair matters: a None with exhausted False means
    "ran out of budget", not "cannot be won", and calling a position dead on that
    basis would end games that were still winnable.
    """
    if level_solved(level, state):
        return [], True
    seen = {state}
    queue = deque([(state, ())])
    explored = 0
    while queue:
        current, path = queue.popleft()
        explored += 1
        if explored > limit:
            return None, False
        for move in level_moves(level, current):
            nxt = level_apply(level, current, move)
            if nxt in seen:
                continue
            if level_solved(level, nxt):
                return list(path + (move,)), True
            seen.add(nxt)
            queue.append((nxt, path + (move,)))
    return None, True


def level_solve(level, limit=400000):
    """Shortest winning line from the start, or None. Scoring and validation only."""
    return search(level, start(level), limit)[0]


def is_dead(level, state, limit=120000):
    """True only when the position is provably unwinnable.

    Every level starts winnable, so a dead position is always something the
    player did: pouring into the last empty bottle instead of saving it, or
    burying a color under one it can no longer sit on. Detecting it is what lets
    a lost game end at the moment it is lost rather than grinding out the budget.
    """
    moves, exhausted = search(level, state, limit)
    return moves is None and exhausted


def has_trap(level, limit=120000):
    """Does some legal opening move throw the game away?

    A level where every move keeps you alive is a level with nothing to get
    wrong. Requiring at least one losing move is what makes a level a puzzle.
    """
    state = start(level)
    for move in level_moves(level, state):
        if is_dead(level, level_apply(level, state, move), limit):
            return True
    return False


def _layout(rng, colors, height, liquid_bottles):
    """Deal colors*height units into liquid_bottles bottles, none over height."""
    units = [c for c in range(colors) for _ in range(height)]
    rng.shuffle(units)
    sizes = [height] * colors + [0] * (liquid_bottles - colors)
    # Move units off full bottles onto the spare ones so bottles end up unevenly
    # filled, which is what produces part-filled starts and repeated colors
    # sitting on top of each other.
    for _ in range(liquid_bottles - colors):
        for _ in range(rng.randint(1, height - 1)):
            donor = max(range(liquid_bottles), key=lambda i: sizes[i])
            taker = min(range(liquid_bottles), key=lambda i: sizes[i])
            if sizes[donor] <= 1 or sizes[taker] >= height:
                break
            sizes[donor] -= 1
            sizes[taker] += 1
    tubes, cut = [], 0
    for size in sizes:
        tubes.append(tuple(units[cut : cut + size]))
        cut += size
    return tubes


def generate_level(rng, spec, attempts=400, require_trap=True):
    """A verified-winnable level matching a difficulty spec.

    `spec` carries colors, height, spare (always-open empty bottles), hidden
    (bottles that start locked) and spread (how many extra bottles the liquid is
    dealt across, which is what creates part-filled starting bottles).

    Every level returned is winnable and, by default, losable: at least one legal
    opening move throws the game away. A level you cannot lose is not a puzzle.
    """
    colors, height = spec["colors"], spec["height"]
    hidden, spare, spread = spec.get("hidden", 0), spec.get("spare", 1), spec.get("spread", 0)
    fallback = None
    for attempt in range(attempts):
        tubes = _layout(rng, colors, height, colors + spread)
        tubes += [EMPTY] * spare
        rng.shuffle(tubes)
        # Locked bottles are the last ones. Because the deal was shuffled first,
        # a locked bottle may be empty or may be holding liquid.
        unlock_after = tuple(sorted(rng.randint(1, max(1, colors - 1)) for _ in range(hidden)))
        level = Level(tuple(tubes), height, unlock_after, spec["name"])
        if level_solved(level, start(level)):
            continue
        solution = level_solve(level)
        if not solution:
            continue
        if not require_trap or has_trap(level):
            return level, solution
        # Winnable but foolproof. Keep it only in case nothing better turns up,
        # so a tier can never fail to produce a level at all.
        fallback = fallback or (level, solution)
    if fallback:
        return fallback
    raise RuntimeError(f"Could not generate a solvable {spec['name']} level")


def with_extra_bottle(level):
    """The same level, one empty bottle easier.

    The bottle is inserted ahead of the locked ones so it is usable immediately
    and so the locked bottles stay last, which is what open_count assumes.
    """
    cut = len(level.board) - len(level.unlock_after)
    board = level.board[:cut] + (EMPTY,) + level.board[cut:]
    return Level(board, level.height, level.unlock_after, level.name)


# Difficulty tiers. `weight` is how often a tier is drawn, so a run is a mix of
# easy and hard levels rather than a uniform grind. `baseline` is filled in by
# scripts/measure_baselines.py: the share of levels a random pourer wins under the
# same pour budget. It is the number the fly has to beat to have done anything.
DIFFICULTIES = [
    # Ordered by measured random win rate, which disagrees with color count.
    # `brutal` has fewer colors than `hard` and is still harder: what decides
    # difficulty is how little spare room a level leaves, and every extra bottle
    # makes a level dramatically easier. Adding colors while adding bottles can
    # make a level easier, which is how an earlier "easy" tier ended up being won
    # by random pouring 100% of the time.
    {"name": "easy", "colors": 3, "height": 4, "spare": 1, "hidden": 0, "spread": 0, "weight": 2},
    {"name": "medium", "colors": 4, "height": 4, "spare": 1, "hidden": 1, "spread": 0, "weight": 3},
    {"name": "hard", "colors": 6, "height": 4, "spare": 1, "hidden": 2, "spread": 1, "weight": 3},
    {"name": "brutal", "colors": 5, "height": 4, "spare": 1, "hidden": 1, "spread": 0, "weight": 2},
]
BY_NAME = {d["name"]: d for d in DIFFICULTIES}


def pick_difficulty(rng):
    return rng.choices(DIFFICULTIES, weights=[d["weight"] for d in DIFFICULTIES])[0]


def observed(level, state):
    """The board as the player sees it: locked bottles hidden behind LOCKED."""
    live = open_count(level, state.revealed)
    return tuple(
        tube if i < live else (LOCKED,) for i, tube in enumerate(state.board)
    )
