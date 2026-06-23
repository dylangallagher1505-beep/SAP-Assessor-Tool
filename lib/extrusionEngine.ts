import type { Point2D, Point3D, Vector3D, Surface, Space, ExtrusionResult } from './types'

// ─── Geometry helpers ─────────────────────────────────────────────────────────

export function polygonArea2D(pts: Point2D[]): number {
  let area = 0
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length
    area += pts[i].x * pts[j].z - pts[j].x * pts[i].z
  }
  return Math.abs(area) / 2
}

export function centroid2D(pts: Point2D[]): Point2D {
  let x = 0, z = 0
  for (const p of pts) { x += p.x; z += p.z }
  return { x: x / pts.length, z: z / pts.length }
}

export function normalize(v: Vector3D): Vector3D {
  const len = Math.sqrt(v.x ** 2 + v.y ** 2 + v.z ** 2)
  return len > 0.0001 ? { x: v.x / len, y: v.y / len, z: v.z / len } : { x: 0, y: 1, z: 0 }
}

function uid() { return Math.random().toString(36).slice(2, 9) }

function azimuthFromNormal(n: Vector3D): number {
  // 0 = North (-Z), 90 = East (+X), 180 = South (+Z), 270 = West (-X)
  return ((Math.atan2(n.x, -n.z) * 180 / Math.PI) + 360) % 360
}

// ─── Core extrusion ──────────────────────────────────────────────────────────

/**
 * Given a Space's 2D footprint + elevation + height, produce:
 *   - 1 floor Surface
 *   - 1 ceiling Surface
 *   - N wall Surfaces (one per footprint edge)
 * All surfaces start with boundaryCondition = 'external'; the AdjacencyEngine
 * will later flip internal/party surfaces.
 */
export function extrudeSpace(space: Space): ExtrusionResult {
  const { footprint, baseElevation, height, id: spaceId } = space
  const floorArea = polygonArea2D(footprint)
  const centroid = centroid2D(footprint)

  // ── Floor ──────────────────────────────────────────────────────────────────
  const floor: Surface = {
    id: uid(),
    spaceId,
    type: 'floor_ground',
    boundaryCondition: 'ground',
    vertices: footprint.map(p => ({ x: p.x, y: baseElevation, z: p.z })),
    normal: { x: 0, y: -1, z: 0 },
    grossArea: floorArea,
    netArea: floorArea,
    openings: [],
    tiltDeg: 0,
    label: 'Floor',
  }

  // ── Ceiling ─────────────────────────────────────────────────────────────────
  // Reversed winding so normal faces up from the inside
  const ceiling: Surface = {
    id: uid(),
    spaceId,
    type: 'ceiling_internal',
    boundaryCondition: 'external',
    vertices: [...footprint].reverse().map(p => ({ x: p.x, y: baseElevation + height, z: p.z })),
    normal: { x: 0, y: 1, z: 0 },
    grossArea: floorArea,
    netArea: floorArea,
    openings: [],
    tiltDeg: 0,
    label: 'Ceiling',
  }

  // ── Walls ───────────────────────────────────────────────────────────────────
  const walls: Surface[] = []
  for (let i = 0; i < footprint.length; i++) {
    const p1 = footprint[i]
    const p2 = footprint[(i + 1) % footprint.length]
    const dx = p2.x - p1.x
    const dz = p2.z - p1.z
    const wallLen = Math.sqrt(dx * dx + dz * dz)
    if (wallLen < 0.001) continue

    // Outward normal: perpendicular to edge, pointing away from centroid
    const candidate = normalize({ x: dz, y: 0, z: -dx })
    const midX = (p1.x + p2.x) / 2 + candidate.x * 0.01
    const midZ = (p1.z + p2.z) / 2 + candidate.z * 0.01
    const outward = ((midX - centroid.x) * candidate.x + (midZ - centroid.z) * candidate.z) > 0
      ? candidate
      : { x: -candidate.x, y: 0, z: -candidate.z }

    const wallArea = wallLen * height

    walls.push({
      id: uid(),
      spaceId,
      type: 'external_wall',
      boundaryCondition: 'external',
      vertices: [
        { x: p1.x, y: baseElevation,          z: p1.z },
        { x: p2.x, y: baseElevation,          z: p2.z },
        { x: p2.x, y: baseElevation + height, z: p2.z },
        { x: p1.x, y: baseElevation + height, z: p1.z },
      ] as Point3D[],
      normal: outward,
      grossArea: wallArea,
      netArea: wallArea,
      openings: [],
      azimuthDeg: azimuthFromNormal(outward),
      tiltDeg: 90,
      label: `Wall ${i + 1}`,
    })
  }

  return { floor, ceiling, walls }
}

export function extrudeToSurfaces(space: Space): Surface[] {
  const { floor, ceiling, walls } = extrudeSpace(space)
  return [floor, ceiling, ...walls]
}
