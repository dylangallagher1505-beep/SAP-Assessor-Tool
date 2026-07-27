import type { Wall, Point2D, Story } from '../modelerStore'

let n = 0
/** Deterministic wall factory for tests. */
export function W(x1: number, y1: number, x2: number, y2: number, id?: string): Wall {
  return {
    id: id ?? `w${n++}`,
    name: id ?? `w${n}`,
    start: { x: x1, y: y1 },
    end: { x: x2, y: y2 },
    wallType: 'external',
    uValue: 0.18,
  }
}

/** Build a rectangular room's four walls (CCW) starting bottom-left. */
export function rectWalls(x: number, y: number, w: number, h: number, prefix: string): Wall[] {
  return [
    W(x, y, x + w, y, `${prefix}1`),
    W(x + w, y, x + w, y + h, `${prefix}2`),
    W(x + w, y + h, x, y + h, `${prefix}3`),
    W(x, y + h, x, y, `${prefix}4`),
  ]
}

export function rectPolygon(x: number, y: number, w: number, h: number): Point2D[] {
  return [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }]
}

export function makeStory(over: Partial<Story> = {}): Story {
  return {
    id: 's', name: 'GF', startHeight: 0, storyHeight: 2.5,
    walls: [], footprintPolygon: [], rooms: [], openings: [],
    ...over,
  }
}

// ─── Rigid/affine transforms for invariance testing ──────────────────────────

export type Transform = (p: Point2D) => Point2D

export const translate = (dx: number, dy: number): Transform => (p) => ({ x: p.x + dx, y: p.y + dy })
export const rotate = (deg: number): Transform => {
  const r = (deg * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r)
  return (p) => ({ x: p.x * c - p.y * s, y: p.x * s + p.y * c })
}
export const mirrorX: Transform = (p) => ({ x: -p.x, y: p.y })

export function xfWall(w: Wall, t: Transform): Wall {
  return { ...w, start: t(w.start), end: t(w.end) }
}
export function xfStory(st: Story, t: Transform): Story {
  return {
    ...st,
    walls: st.walls.map((w) => xfWall(w, t)),
    rooms: st.rooms.map((r) => ({ ...r, polygon: r.polygon.map(t) })),
    footprintPolygon: st.footprintPolygon.map(t),
  }
}
