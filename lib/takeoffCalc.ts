import type { Story, Wall, Point2D, RoofConfig, StoryTakeoff, RoofTakeoff } from './modelerStore'
import { buildRoofFaces } from './roofGeometry'
import { computeAdjacencies } from './adjacency'

// ─── Geometry helpers ────────────────────────────────────────────────────────

export function wallLength(w: Wall): number {
  const dx = w.end.x - w.start.x
  const dy = w.end.y - w.start.y
  return Math.sqrt(dx * dx + dy * dy)
}

/** Shoelace formula — returns signed area (positive if CCW). */
export function polygonArea(pts: Point2D[]): number {
  if (pts.length < 3) return 0
  let area = 0
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length
    area += pts[i].x * pts[j].y
    area -= pts[j].x * pts[i].y
  }
  return Math.abs(area) / 2
}

/** Bounding box of a polygon (used for roof geometry). */
export function polygonBBox(pts: Point2D[]): { minX: number; maxX: number; minY: number; maxY: number; w: number; d: number } {
  if (pts.length === 0) return { minX: 0, maxX: 0, minY: 0, maxY: 0, w: 0, d: 0 }
  const xs = pts.map((p) => p.x)
  const ys = pts.map((p) => p.y)
  const minX = Math.min(...xs), maxX = Math.max(...xs)
  const minY = Math.min(...ys), maxY = Math.max(...ys)
  return { minX, maxX, minY, maxY, w: maxX - minX, d: maxY - minY }
}

// ─── Per-story takeoff ────────────────────────────────────────────────────────

export function calcStoryTakeoff(story: Story): StoryTakeoff {
  const adj = computeAdjacencies(story.walls)
  let wallSurfaceArea = 0
  let externalWallArea = 0
  let internalWallArea = 0
  for (const w of story.walls) {
    const hl = w.heightLeft ?? story.storyHeight
    const hr = w.heightRight ?? story.storyHeight
    const avgH = (hl + hr) / 2
    const l = wallLength(w)
    const a = adj.get(w.id)
    const sharedLen = a?.sharedLength ?? 0
    const exposedLen = a?.exposedLength ?? l
    wallSurfaceArea += l * avgH
    // A wall the user marked party/internal is never external heat-loss fabric
    const manualNonExternal = w.wallType === 'party' || w.wallType === 'internal'
    externalWallArea += manualNonExternal ? 0 : exposedLen * avgH
    internalWallArea += (manualNonExternal ? l : sharedLen) * avgH
  }

  // Floor area: sum all named rooms, or fall back to footprintPolygon, or derive from walls
  let floorArea = 0
  if (story.rooms.length > 0) {
    floorArea = story.rooms.reduce((s, r) => s + polygonArea(r.polygon), 0)
  } else if (story.footprintPolygon.length >= 3) {
    floorArea = polygonArea(story.footprintPolygon)
  } else if (story.walls.length >= 3) {
    const pts = story.walls.flatMap((w) => [w.start, w.end])
    // Deduplicate (rough)
    const unique = pts.filter(
      (p, i) => pts.findIndex((q) => Math.abs(q.x - p.x) < 0.01 && Math.abs(q.y - p.y) < 0.01) === i
    )
    floorArea = polygonArea(unique)
  }

  return { storyId: story.id, storyName: story.name, floorArea, wallSurfaceArea, externalWallArea, internalWallArea }
}

// ─── Roof takeoff ─────────────────────────────────────────────────────────────

export function calcRoofTakeoff(topStory: Story, roof: RoofConfig): RoofTakeoff {
  const pts = topStory.footprintPolygon
  if (pts.length < 3) return { type: roof.type, planes: [], totalArea: 0, gableWallArea: 0 }

  // True per-face areas from the tent construction over the actual footprint
  const faces = buildRoofFaces(pts, 0, roof)
  const planes = faces.map((f) => ({ label: f.label, area: f.area, isWall: f.isGableEnd }))
  const totalArea = faces.filter((f) => !f.isGableEnd).reduce((s, f) => s + f.area, 0)
  const gableWallArea = faces.filter((f) => f.isGableEnd).reduce((s, f) => s + f.area, 0)
  return { type: roof.type, planes, totalArea, gableWallArea }
}
