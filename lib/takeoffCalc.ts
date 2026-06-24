import type { Story, Wall, Point2D, RoofConfig, StoryTakeoff, RoofTakeoff } from './modelerStore'

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
  const wallSurfaceArea = story.walls.reduce((sum, w) => {
    const hl = w.heightLeft ?? story.storyHeight
    const hr = w.heightRight ?? story.storyHeight
    return sum + wallLength(w) * ((hl + hr) / 2)
  }, 0)

  // Floor area: prefer explicit footprint polygon, else derive from wall endpoints
  let floorArea = 0
  if (story.footprintPolygon.length >= 3) {
    floorArea = polygonArea(story.footprintPolygon)
  } else if (story.walls.length >= 3) {
    const pts = story.walls.flatMap((w) => [w.start, w.end])
    // Deduplicate (rough)
    const unique = pts.filter(
      (p, i) => pts.findIndex((q) => Math.abs(q.x - p.x) < 0.01 && Math.abs(q.y - p.y) < 0.01) === i
    )
    floorArea = polygonArea(unique)
  }

  return { storyId: story.id, storyName: story.name, floorArea, wallSurfaceArea }
}

// ─── Roof takeoff ─────────────────────────────────────────────────────────────

export function calcRoofTakeoff(topStory: Story, roof: RoofConfig): RoofTakeoff {
  const bbox = topStory.footprintPolygon.length >= 3
    ? polygonBBox(topStory.footprintPolygon)
    : { w: 0, d: 0, minX: 0, maxX: 0, minY: 0, maxY: 0 }

  const { w, d } = bbox
  const pitchRad = (roof.pitchDegrees * Math.PI) / 180
  const slopeFactor = 1 / Math.cos(pitchRad) // horizontal → sloped length multiplier

  switch (roof.type) {
    case 'flat':
      return {
        type: 'flat',
        planes: [{ label: 'Flat Roof', area: w * d }],
        totalArea: w * d,
      }
    case 'shed': {
      const area = w * d * slopeFactor
      return {
        type: 'shed',
        planes: [{ label: 'Shed Plane', area }],
        totalArea: area,
      }
    }
    case 'gable': {
      // Two planes, each covers half the depth
      const halfD = d / 2
      const rakeLength = Math.sqrt((halfD) ** 2 + (halfD * Math.tan(pitchRad)) ** 2)
      const area = w * rakeLength
      return {
        type: 'gable',
        planes: [
          { label: 'Gable Plane A', area },
          { label: 'Gable Plane B', area },
        ],
        totalArea: area * 2,
      }
    }
    case 'hip': {
      // Approximate: two trapezoidal sides + two triangular ends
      const rise = (d / 2) * Math.tan(pitchRad)
      const sideSlant = Math.sqrt((d / 2) ** 2 + rise ** 2)
      const endSlant = Math.sqrt((w / 2) ** 2 + rise ** 2)
      const sideArea = ((w + (w - d)) / 2) * sideSlant  // trapezoid
      const endArea = ((d / 2) * endSlant) / 2 * 2 // two triangles
      return {
        type: 'hip',
        planes: [
          { label: 'Hip Side A', area: sideArea },
          { label: 'Hip Side B', area: sideArea },
          { label: 'Hip End A', area: endArea / 2 },
          { label: 'Hip End B', area: endArea / 2 },
        ],
        totalArea: sideArea * 2 + endArea,
      }
    }
  }
}
