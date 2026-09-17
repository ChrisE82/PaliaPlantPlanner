"""Brute-force checks for the plan's plot-arrangement examples.

Confirmed rules used here: crops may cross plot borders when plots touch; buffs
pass between orthogonally touching tiles; a crop is never buffed by its own
type; a 2x2 crop needs 2 touching tiles that give the buff, a 3x3 needs 3.

Each problem places one large crop type (k x k) and assumes every other garden
tile holds a 1x1 crop of a different type that gives the buff (e.g. Wheat gives
Harvest Boost). It finds the most large crops that each receive the buff.
need=0 means no buff requirement (plain packing).
"""
import sys
import time

sys.setrecursionlimit(100000)


def gen_fixed(n):
    shapes = {frozenset([(0, 0)])}
    for _ in range(1, n):
        new = set()
        for s in shapes:
            for (x, y) in s:
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    c = (x + dx, y + dy)
                    if c in s:
                        continue
                    t = s | {c}
                    mx = min(p[0] for p in t)
                    my = min(p[1] for p in t)
                    new.add(frozenset((p[0] - mx, p[1] - my) for p in t))
        shapes = new
    return shapes


def canon(s):
    best = None
    for f in range(8):
        pts = []
        for (x, y) in s:
            if f & 4:
                x, y = y, x
            if f & 1:
                x = -x
            if f & 2:
                y = -y
            pts.append((x, y))
        mx = min(p[0] for p in pts)
        my = min(p[1] for p in pts)
        key = tuple(sorted((p[0] - mx, p[1] - my) for p in pts))
        if best is None or key < best:
            best = key
    return best


def tiles_of(shape):
    return {(3 * px + i, 3 * py + j) for (px, py) in shape for i in range(3) for j in range(3)}


def shared_edges(shape):
    s = set(shape)
    return sum(1 for (x, y) in s for c in ((x + 1, y), (x, y + 1)) if c in s)


def best_count(tiles, k, need):
    cells = sorted(tiles, key=lambda p: (p[1], p[0]))
    idx = {c: i for i, c in enumerate(cells)}
    n = len(cells)
    fp = [0] * n
    border = [0] * n
    for i, (x, y) in enumerate(cells):
        m = 0
        ok = True
        for dy in range(k):
            for dx in range(k):
                c = (x + dx, y + dy)
                if c not in idx:
                    ok = False
                    break
                m |= 1 << idx[c]
            if not ok:
                break
        if not ok:
            continue
        fp[i] = m
        b = 0
        for d in range(k):
            for c in ((x + d, y - 1), (x + d, y + k), (x - 1, y + d), (x + k, y + d)):
                if c in idx:
                    b |= 1 << idx[c]
        border[i] = b
    # Every k x k square covers exactly one cell of each residue class
    # (x mod k, y mod k), so the undecided cells of any one class bound how
    # many more squares fit.
    classes = [0] * (k * k)
    for i, (x, y) in enumerate(cells):
        classes[(x % k) * k + (y % k)] |= 1 << i
    allmask = (1 << n) - 1
    best = [-1]

    def dfs(i, used, mask, placed):
        while i < n and (used >> i) & 1:
            i += 1
        if need:
            alive = sum(1 for p in placed if (border[p] & ~mask).bit_count() >= need)
        else:
            alive = len(placed)
        if i >= n:
            if alive > best[0]:
                best[0] = alive
            return
        undecided = allmask & ~used
        if alive + min((undecided & c).bit_count() for c in classes) <= best[0]:
            return
        m = fp[i]
        if m and not (used & m):
            placed.append(i)
            dfs(i + 1, used | m, mask | m, placed)
            placed.pop()
        dfs(i + 1, used | (1 << i), mask, placed)

    dfs(0, 0, 0, [])
    return best[0]


def draw(shape):
    s = set(shape)
    w = max(x for x, _ in s) + 1
    h = max(y for _, y in s) + 1
    return "\n".join("".join("#" if (x, y) in s else "." for x in range(w)) for y in range(h))


NAMED = {
    "3x3 block": {(x, y) for x in range(3) for y in range(3)},
    "row of 9": {(x, 0) for x in range(9)},
    "2 rows of 4 + 1 at end": {(x, y) for x in range(4) for y in range(2)} | {(0, 2)},
    "2 rows of 4 + 1 in middle": {(x, y) for x in range(4) for y in range(2)} | {(1, 2)},
    "row of 5 next to row of 4": {(x, 0) for x in range(5)} | {(x, 1) for x in range(4)},
}

PROBLEMS = [
    ("Blueberry count (2x2, no buff needed)", 2, 0),
    ("Blueberries that get Harvest Boost (2x2, need 2)", 2, 2),
    ("Apples that get Harvest Boost (3x3, need 3)", 3, 3),
]

if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "named"
    if mode == "named":
        for label, k, need in PROBLEMS:
            print(label)
            for name, shape in NAMED.items():
                t0 = time.time()
                v = best_count(tiles_of(shape), k, need)
                print(f"  {name:28s} {v:3d}   ({time.time() - t0:.2f}s)")
    else:
        nplots = int(mode)
        t0 = time.time()
        free = {canon(s) for s in gen_fixed(nplots)}
        print(f"{nplots} plots: {len(free)} arrangements (rotations/mirrors removed), generated in {time.time() - t0:.1f}s")
        for label, k, need in PROBLEMS:
            t0 = time.time()
            results = [(best_count(tiles_of(s), k, need), shared_edges(s), s) for s in free]
            top = max(r[0] for r in results)
            winners = [r for r in results if r[0] == top]
            block = [r for r in results if r[1] == max(x[1] for x in results)][0]
            print(f"\n{label}: {time.time() - t0:.1f}s")
            print(f"  most compact arrangement ({block[1]} shared plot edges): {block[0]}")
            print(f"  best: {top}, reached by {len(winners)} arrangements; most compact of those:")
            w = max(winners, key=lambda r: r[1])
            print(f"  ({w[1]} shared plot edges)")
            print("  " + draw(w[2]).replace("\n", "\n  "))
