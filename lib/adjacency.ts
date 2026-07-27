import type { Wall, Point2D } from './modelerStore'

/**
 * Adjacency engine — the defining ModelIT feature.
 *
 * Given a storey's flat wall list, work out which portions of each wall are
 * SHARED with another wall (i.e. sit on the boundary between two rooms) versus
 * EXPOSED to outside. Shared portions are internal partitions and carry no
 * heat loss; only the exposed portion of an external wall loses heat.
 *
 * Walls here are 2D segments in world metres. Two walls are adjacent where they
 * are collinear (same infinite line, within tolerance) and their extents
 * overlap. We return the overlapping length per wall so the takeoff can split
 * each wall into exposed vs internal area.
 */

const ANGLE_TOL = 2 * Math.PI / 180   // 2° — collinearity angular tolerance
const DIST_TOL = 0.15                  // 150 mm — perpendicular offset tolerance
const MIN_OVERLAP = 0.1                // ignore slivers below 100 mm

function len(w: Wall): number {
  return Math.hypot(w.end.x - w.start.x, w.end.y - w.start.y)
}

/** Unit direction of a wall, or null for a degenerate segment. */
function dir(w: Wall): Point2D | null {
  const l = len(w)
  if (l < 1e-6) return null
  return { x: (w.end.x - w.start.x) / l, y: (w.end.y - w.start.y) / l }
}

/** Perpendicular distance from point p to the infinite line through wall a. */
function perpDist(p: Point2D, a: Wall, ad: Point2D): number {
  const vx = p.x - a.start.x, vy = p.y - a.start.y
  // reject component along the direction → perpendicular residual
  const along = vx * ad.x + vy * ad.y
  const rx = vx - along * ad.x, ry = vy - along * ad.y
  return Math.hypot(rx, ry)
}

/** Scalar projection of point p onto wall a's direction, measured from a.start. */
function proj(p: Point2D, a: Wall, ad: Point2D): number {
  return (p.x - a.start.x) * ad.x + (p.y - a.start.y) * ad.y
}

/**
 * Length of wall `a` that is collinear-overlapped by wall `b`.
 * Returns 0 when they are not on the same line or don't overlap.
 */
export function overlapLength(a: Wall, b: Wall): number {
  const ad = dir(a), bd = dir(b)
  if (!ad || !bd) return 0

  // Collinear in angle? (parallel, either direction)
  const cross = Math.abs(ad.x * bd.y - ad.y * bd.x)
  if (cross > Math.sin(ANGLE_TOL)) return 0

  // b must lie on a's line (both endpoints within perpendicular tolerance)
  if (perpDist(b.start, a, ad) > DIST_TOL || perpDist(b.end, a, ad) > DIST_TOL) return 0

  // Overlap of the two extents along a's axis
  const a0 = 0, a1 = len(a)
  let b0 = proj(b.start, a, ad), b1 = proj(b.end, a, ad)
  if (b0 > b1) [b0, b1] = [b1, b0]
  const lo = Math.max(a0, b0), hi = Math.min(a1, b1)
  return Math.max(0, hi - lo)
}

export interface WallAdjacency {
  wallId: string
  sharedLength: number   // metres of this wall shared with any other wall
  exposedLength: number  // metres exposed to outside
}

/**
 * For every wall, the length shared with any other wall on the storey.
 * A portion covered by multiple neighbours is only counted once (clamped to
 * the wall length).
 */
export function computeAdjacencies(walls: Wall[]): Map<string, WallAdjacency> {
  const result = new Map<string, WallAdjacency>()
  for (const w of walls) {
    const l = len(w)
    let shared = 0
    for (const other of walls) {
      if (other.id === w.id) continue
      shared += overlapLength(w, other)
    }
    shared = Math.min(l, shared)
    if (shared < MIN_OVERLAP) shared = 0
    result.set(w.id, { wallId: w.id, sharedLength: shared, exposedLength: Math.max(0, l - shared) })
  }
  return result
}

/** True if a wall is (nearly) fully shared with a neighbour — an internal partition. */
export function isInternalPartition(w: Wall, adj: Map<string, WallAdjacency>): boolean {
  const a = adj.get(w.id)
  if (!a) return false
  return a.sharedLength >= len(w) - MIN_OVERLAP && len(w) > MIN_OVERLAP
}
