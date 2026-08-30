"""The rotated hexagonal lattice, worked out once and printed as CSS.

A triangular lattice has, besides its three neighbour directions, pairs of
lattice vectors at right angles to each other. Take one such pair as the sides
of the repeating tile and the tile is a rectangle -- which is the only shape
`background-repeat` can tile -- while the lattice inside it sits at whatever
angle that pair happens to make with the axes.

u = 2a + b and w = 4a - 5b are the smallest such pair that is not at a
multiple of 30 degrees (which would only swap "one row horizontal" for "one
column vertical"). They put the lattice at 19.1 degrees off the axes, and the
rectangle they span holds fourteen points.
"""
import math

W = 122.0                      # nearest-neighbour distance, in px
A = (W, 0.0)
B = (W / 2, W * math.sqrt(3) / 2)
THETA = -math.degrees(math.atan2(B[1], 2 * A[0] + B[0]))   # -19.1066...
TILE_W = W * math.sqrt(7)
TILE_H = W * math.sqrt(21)
ICON = 34.0                    # how big each shape is drawn, by default

def rotate(p):
    t = math.radians(THETA)
    return (p[0] * math.cos(t) - p[1] * math.sin(t),
            p[0] * math.sin(t) + p[1] * math.cos(t))

def points():
    seen = {}
    for n in range(-30, 31):
        for m in range(-30, 31):
            x, y = rotate((n * A[0] + m * B[0], n * A[1] + m * B[1]))
            x, y = x % TILE_W, y % TILE_H
            # A point landing on the far edge is the near edge's point: keep
            # one of the two, or the tile draws that shape twice over itself
            # and it comes out darker than its neighbours.
            if x > TILE_W - 0.5:
                x -= TILE_W
            if y > TILE_H - 0.5:
                y -= TILE_H
            seen[(round(x, 1), round(y, 1))] = None
    return sorted(seen)

def uses(spots, size):
    """Each point, and its wrap where the shape crosses an edge."""
    out, reach = [], size * 0.75
    for x, y in spots:
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                px, py = x + dx * TILE_W, y + dy * TILE_H
                if -reach < px < TILE_W + reach and -reach < py < TILE_H + reach:
                    out.append(f'%3Cuse href=\'%23i\' x=\'{px:.1f}\' y=\'{py:.1f}\'/%3E')
    return "".join(out)

def tile(path, opacity=".075", size=ICON):
    """One tile: the shape, at the lattice's fourteen points, turned against it.

    The lattice leans one way and every shape on it leans the other, by the
    same angle -- `rotate(-THETA)` against the lattice's `THETA`. Turned *with*
    the lattice each shape lay along the line it sat in and the rows read as
    strokes; turned against it, the shape crosses its own row and the pattern
    reads as scattered marks rather than as ruling.

    `size` is per shape rather than one for all. A globe fills its box; a
    pencil is a diagonal line through the middle of one, and drawn to the same
    width it reads as a scratch rather than as a pencil.
    """
    spots = points()
    scale = size / 256          # Phosphor's viewBox is 256
    return (
        "url(\"data:image/svg+xml,"
        f"%3Csvg xmlns='http://www.w3.org/2000/svg' width='{TILE_W:.1f}' height='{TILE_H:.1f}'"
        f" viewBox='0 0 {TILE_W:.1f} {TILE_H:.1f}' fill='%231c1a17' fill-opacity='{opacity}'%3E"
        f"%3Cdefs%3E%3Cg id='i' transform='rotate({-THETA:.2f}) scale({scale:.4f}) translate(-128 -128)'%3E"
        f"%3Cpath d='{path}'/%3E%3C/g%3E%3C/defs%3E"
        f"{uses(spots, size)}"
        "%3C/svg%3E\")"
    )

if __name__ == "__main__":
    spots = points()
    print(f"angle {THETA:.4f}  tile {TILE_W:.1f} x {TILE_H:.1f}  points {len(spots)}  uses {uses(spots, ICON).count('use')}")
