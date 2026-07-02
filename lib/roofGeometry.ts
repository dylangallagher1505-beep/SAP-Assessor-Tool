import type { Point2D, RoofConfig, RoofType } from './modelerStore'

/** Each face = array of coplanar-ish [x,y,z] vertices, rendered as a fan from v[0]. */
export type RoofFace = {
  verts: [number, number, number][]
  label: string
  area: number       // true 3D surface area
  isGableEnd: boolean // near-vertical face — counts as wall, not roof
}

export interface Ridge { start: Point2D; end: Point2D }

// ─── Basic helpers ────────────────────────────────────────────────────────────

function bbox(pts: Point2D[]) {
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y)
  const minX = Math.min(...xs), maxX = Math.max(...xs)
  const minY = Math.min(...ys), maxY = Math.max(...ys)
  return { minX, maxX, minY, maxY, w: maxX - minX, d: maxY - minY, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 }
}

function closestOnSegment(p: Point2D, a: Point2D, b: Point2D): Point2D {
  const dx = b.x - a.x, dy = b.y - a.y
  const lenSq = dx * dx + dy * dy
  if (lenSq < 1e-9) return a
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq))
  return { x: a.x + t * dx, y: a.y + t * dy }
}

function dist2D(a: Point2D, b: Point2D) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2)
}

function triArea3D(a: [number, number, number], b: [number, number, number], c: [number, number, number]): number {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2]
  const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2]
  const cx = uy * vz - uz * vy
  const cy = uz * vx - ux * vz
  const cz = ux * vy - uy * vx
  return Math.sqrt(cx * cx + cy * cy + cz * cz) / 2
}

function faceArea(verts: [number, number, number][]): number {
  let area = 0
  for (let i = 1; i < verts.length - 1; i++) area += triArea3D(verts[0], verts[i], verts[i + 1])
  return area
}

/** A face is a gable end if its projected plan area is ~zero (vertical surface). */
function isVertical(verts: [number, number, number][]): boolean {
  // plan-projected shoelace area
  let a = 0
  for (let i = 0; i < verts.length; i++) {
    const j = (i + 1) % verts.length
    a += verts[i][0] * verts[j][2] - verts[j][0] * verts[i][2]
  }
  const planArea = Math.abs(a) / 2
  const trueArea = faceArea(verts)
  return trueArea > 0.01 && planArea / trueArea < 0.05
}

function polygonPlanArea(pts: Point2D[]): number {
  let a = 0
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length
    a += pts[i].x * pts[j].y - pts[j].x * pts[i].y
  }
  return Math.abs(a) / 2
}

// ─── Ridge defaults ───────────────────────────────────────────────────────────

/** Default ridge for a footprint + roof type: midline of the bbox along its longer axis. */
export function defaultRidge(pts: Point2D[], type: RoofType): Ridge | null {
  if (pts.length < 3 || type === 'flat') return null
  const { minX, maxX, minY, maxY, w, d, cx, cy } = bbox(pts)
  const alongX = w >= d
  if (type === 'shed') {
    // Ridge along one long edge — high side of the monopitch
    return alongX
      ? { start: { x: minX, y: maxY }, end: { x: maxX, y: maxY } }
      : { start: { x: maxX, y: minY }, end: { x: maxX, y: maxY } }
  }
  const inset = type === 'hip' ? Math.min(w, d) / 2 : 0
  if (alongX) {
    const a = Math.min(minX + inset, cx), b = Math.max(maxX - inset, cx)
    return { start: { x: a, y: cy }, end: { x: b, y: cy } }
  }
  const a = Math.min(minY + inset, cy), b = Math.max(maxY - inset, cy)
  return { start: { x: cx, y: a }, end: { x: cx, y: b } }
}

/** Effective ridge for a config (explicit if set, else derived from type). */
export function effectiveRidge(pts: Point2D[], cfg: RoofConfig): Ridge | null {
  if (cfg.type === 'flat') return null
  return cfg.ridge ?? defaultRidge(pts, cfg.type)
}

/** Effective ridge height above the eaves: explicit, else pitch × longest run to the ridge. */
export function effectiveRidgeHeight(pts: Point2D[], cfg: RoofConfig): number {
  if (cfg.ridgeHeight !== undefined && cfg.ridgeHeight !== null) return Math.max(0, cfg.ridgeHeight)
  const ridge = effectiveRidge(pts, cfg)
  if (!ridge) return 0
  const pitchRad = (cfg.pitchDegrees * Math.PI) / 180
  const maxRun = Math.max(0.001, ...pts.map(p => dist2D(p, closestOnSegment(p, ridge.start, ridge.end))))
  return maxRun * Math.tan(pitchRad)
}

// ─── Tent roof construction ───────────────────────────────────────────────────
//
// The roof is a "tent" pitched from the footprint boundary (at eave height)
// up to the ridge segment (at eave + ridgeHeight). Each boundary edge produces
// one face joining it to its projection on the ridge:
//   · edge projects to a ridge span   → sloped quad (roof plane)
//   · edge projects to a ridge point  → sloped triangle (hip end)
//   · ridge endpoint lies ON the edge → vertical triangle(s) (gable end = wall)
// Flat roofs are a single horizontal face over the footprint.

export function buildRoofFaces(pts: Point2D[], eaveY: number, cfg: RoofConfig): RoofFace[] {
  if (pts.length < 3) return []

  if (cfg.type === 'flat') {
    const verts = pts.map(p => [p.x, eaveY + 0.02, p.y] as [number, number, number])
    return [{ verts, label: 'Flat Roof', area: polygonPlanArea(pts), isGableEnd: false }]
  }

  const ridge = effectiveRidge(pts, cfg)
  const ridgeH = effectiveRidgeHeight(pts, cfg)
  if (!ridge || ridgeH <= 0.001) {
    const verts = pts.map(p => [p.x, eaveY + 0.02, p.y] as [number, number, number])
    return [{ verts, label: 'Flat Roof', area: polygonPlanArea(pts), isGableEnd: false }]
  }

  const topY = eaveY + ridgeH
  const faces: RoofFace[] = []
  let planeN = 0, gableN = 0

  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % pts.length]
    if (dist2D(a, b) < 0.01) continue
    const pa = closestOnSegment(a, ridge.start, ridge.end)
    const pb = closestOnSegment(b, ridge.start, ridge.end)

    let verts: [number, number, number][]
    if (dist2D(pa, pb) < 0.01) {
      // Triangle — hip end or gable end
      verts = [
        [a.x, eaveY, a.y],
        [b.x, eaveY, b.y],
        [pa.x, topY, pa.y],
      ]
    } else {
      // Quad roof plane
      verts = [
        [a.x, eaveY, a.y],
        [b.x, eaveY, b.y],
        [pb.x, topY, pb.y],
        [pa.x, topY, pa.y],
      ]
    }
    const area = faceArea(verts)
    if (area < 0.005) continue
    const gable = isVertical(verts)
    faces.push({
      verts,
      area,
      isGableEnd: gable,
      label: gable ? `Gable End ${++gableN}` : `Roof Plane ${++planeN}`,
    })
  }

  return faces
}
