import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

// ─── Geometry primitives ───────────────────────────────────────────────────

export interface Point2D {
  x: number // metres in world space
  y: number
}

export type WallType = 'external' | 'party' | 'internal'

export interface Wall {
  id: string
  name: string
  start: Point2D
  end: Point2D
  wallType: WallType  // SAP: only external walls count toward heat loss
  uValue: number      // W/m²K — defaults vary by wall type
  heightLeft?: number  // top-left corner height in metres (defaults to storyHeight)
  heightRight?: number // top-right corner height in metres (defaults to storyHeight)
}

// ─── Openings ────────────────────────────────────────────────────────────────

export type OpeningType = 'window' | 'door'

export interface Opening {
  id: string
  wallId: string
  type: OpeningType
  uOffset: number    // fraction 0–1 along wall length (left edge of opening)
  width: number      // metres
  height: number     // metres
  sillHeight: number // metres from floor
  uValue: number     // W/m²K
  gValue: number     // solar energy transmittance (SHGC), 0–1; SAP solar gain calc
}

// ─── Roof types ─────────────────────────────────────────────────────────────

export type RoofType = 'flat' | 'shed' | 'gable' | 'hip'

export interface RoofConfig {
  type: RoofType
  pitchDegrees: number
  ridgeOffsetFraction: number
}

// ─── Room (zone within a story) ──────────────────────────────────────────────

export interface Room {
  id: string
  name: string
  polygon: Point2D[]
}

// ─── Story / layer ──────────────────────────────────────────────────────────

export interface Story {
  id: string
  name: string
  startHeight: number
  storyHeight: number
  walls: Wall[]
  footprintPolygon: Point2D[]  // first/primary room footprint (legacy compat)
  rooms: Room[]                // all named room polygons on this floor
  openings: Opening[]
}

// ─── Takeoff summaries (derived, not stored) ────────────────────────────────

export interface StoryTakeoff {
  storyId: string
  storyName: string
  floorArea: number
  wallSurfaceArea: number
}

export interface RoofTakeoff {
  type: RoofType
  planes: { label: string; area: number }[]
  totalArea: number
}

// ─── Store shape ────────────────────────────────────────────────────────────

export type DrawingTool = 'select' | 'wall' | 'polygon'

// Selected face in the 3D view
export type SelectedFace =
  | { type: 'wall'; storyId: string; wallId: string }
  | { type: 'roof'; faceIndex: number; faceLabel: string }
  | null

export type LengthAnchor = 'start' | 'end'

interface ModelerState {
  stories: Story[]
  activeStoryId: string | null
  selectedWallId: string | null
  selectedFace: SelectedFace
  history: Story[][]   // global undo stack (most recent last)
  future: Story[][]    // redo stack
  roofConfig: RoofConfig
  drawingTool: DrawingTool
  showRoof: boolean
  gridSizeM: number

  addStory: () => void
  removeStory: (id: string) => void
  updateStory: (id: string, patch: Partial<Omit<Story, 'id' | 'walls' | 'footprintPolygon' | 'openings'>>) => void
  setActiveStory: (id: string) => void

  addWall: (storyId: string, wall: Pick<Wall, 'start' | 'end'> & Partial<Pick<Wall, 'wallType' | 'uValue'>>, name?: string) => void
  updateWall: (storyId: string, wallId: string, patch: Partial<Pick<Wall, 'name' | 'wallType' | 'uValue' | 'heightLeft' | 'heightRight'>>) => void
  removeWall: (storyId: string, wallId: string) => void
  clearWalls: (storyId: string) => void
  setFootprint: (storyId: string, polygon: Point2D[]) => void
  registerRoom: (storyId: string, polygon: Point2D[], roomName?: string) => void
  closePolygon: (storyId: string, polygon: Point2D[], roomName?: string) => void
  copyFootprintTo: (fromStoryId: string, toStoryId: string) => void
  updateRoom: (storyId: string, roomId: string, patch: Partial<Pick<Room, 'name'>>) => void
  removeRoom: (storyId: string, roomId: string) => void

  // ── Geometry editing ──
  moveVertex: (storyId: string, roomId: string, vertIdx: number, newPos: Point2D) => void
  moveEdge: (storyId: string, roomId: string, edgeIdx: number, newA: Point2D, newB: Point2D) => void
  insertVertex: (storyId: string, roomId: string, edgeIdx: number, pos: Point2D) => void
  deleteVertex: (storyId: string, roomId: string, vertIdx: number) => void
  setWallLength: (storyId: string, wallId: string, newLen: number, anchor: LengthAnchor) => void

  // ── History ──
  pushHistory: () => void  // explicit snapshot (call before starting a drag)
  undo: () => void
  redo: () => void

  setSelectedWallId: (id: string | null) => void
  setSelectedFace: (face: SelectedFace) => void

  // Openings
  addOpening: (storyId: string, opening: Omit<Opening, 'id'>) => void
  updateOpening: (storyId: string, openingId: string, patch: Partial<Omit<Opening, 'id'>>) => void
  removeOpening: (storyId: string, openingId: string) => void

  updateRoof: (patch: Partial<RoofConfig>) => void
  setShowRoof: (v: boolean) => void
  setDrawingTool: (t: DrawingTool) => void
  setGridSize: (m: number) => void
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function uid() {
  return Math.random().toString(36).slice(2, 9)
}

const EPS = 0.001
const ptEq = (a: Point2D, b: Point2D) => Math.abs(a.x - b.x) < EPS && Math.abs(a.y - b.y) < EPS
const dist = (a: Point2D, b: Point2D) => Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2)

/** Move every occurrence of a point (wall endpoints, room polygons, footprint) to a new position. */
function movePointInStory(st: Story, oldPos: Point2D, newPos: Point2D): Story {
  return {
    ...st,
    walls: st.walls.map((w) => ({
      ...w,
      start: ptEq(w.start, oldPos) ? newPos : w.start,
      end: ptEq(w.end, oldPos) ? newPos : w.end,
    })),
    rooms: st.rooms.map((r) => ({
      ...r,
      polygon: r.polygon.map((p) => (ptEq(p, oldPos) ? newPos : p)),
    })),
    footprintPolygon: st.footprintPolygon.map((p) => (ptEq(p, oldPos) ? newPos : p)),
  }
}

/** Find the wall whose endpoints match a polygon edge (either direction). */
function findWallForEdge(st: Story, a: Point2D, b: Point2D): { wall: Wall; reversed: boolean } | null {
  for (const w of st.walls) {
    if (ptEq(w.start, a) && ptEq(w.end, b)) return { wall: w, reversed: false }
    if (ptEq(w.start, b) && ptEq(w.end, a)) return { wall: w, reversed: true }
  }
  return null
}

function makeStory(index: number): Story {
  const startHeight = index * 2.5
  return {
    id: uid(),
    name: index === 0 ? 'Ground Floor' : `Floor ${index + 1}`,
    startHeight,
    storyHeight: 2.5,
    walls: [],
    footprintPolygon: [],
    rooms: [],
    openings: [],
  }
}

const HISTORY_CAP = 50

/** Returns the state patch that snapshots the current stories onto the undo stack. */
function snap(s: Pick<ModelerState, 'history' | 'stories'>): Pick<ModelerState, 'history' | 'future'> {
  return { history: [...s.history.slice(-(HISTORY_CAP - 1)), s.stories], future: [] }
}

// ─── Store ──────────────────────────────────────────────────────────────────

const initial = makeStory(0)

export const useModelerStore = create<ModelerState>()(
  persist(
    (set) => ({
  stories: [initial],
  activeStoryId: initial.id,
  selectedWallId: null,
  selectedFace: null,
  history: [],
  future: [],
  roofConfig: { type: 'gable', pitchDegrees: 30, ridgeOffsetFraction: 0.5 },
  drawingTool: 'wall',
  showRoof: true,
  gridSizeM: 0.5,

  addStory: () =>
    set((s) => {
      const next = makeStory(s.stories.length)
      if (s.stories.length > 0) {
        const last = s.stories[s.stories.length - 1]
        next.startHeight = last.startHeight + last.storyHeight
      }
      return { ...snap(s), stories: [...s.stories, next], activeStoryId: next.id }
    }),

  removeStory: (id) =>
    set((s) => {
      const stories = s.stories.filter((st) => st.id !== id)
      return {
        ...snap(s),
        stories,
        activeStoryId: s.activeStoryId === id ? (stories[0]?.id ?? null) : s.activeStoryId,
      }
    }),

  updateStory: (id, patch) =>
    set((s) => ({
      stories: s.stories.map((st) => (st.id === id ? { ...st, ...patch } : st)),
    })),

  setActiveStory: (id) => set({ activeStoryId: id }),

  addWall: (storyId, wall, name) =>
    set((s) => ({
      ...snap(s),
      stories: s.stories.map((st) => {
        if (st.id !== storyId) return st
        const autoName = name ?? `Wall ${st.walls.length + 1}`
        const defaults = { wallType: 'external' as WallType, uValue: 0.18 }
        return { ...st, walls: [...st.walls, { ...defaults, ...wall, id: uid(), name: autoName }] }
      }),
    })),

  updateWall: (storyId, wallId, patch) =>
    set((s) => ({
      stories: s.stories.map((st) =>
        st.id === storyId
          ? { ...st, walls: st.walls.map((w) => (w.id === wallId ? { ...w, ...patch } : w)) }
          : st
      ),
    })),

  removeWall: (storyId, wallId) =>
    set((s) => ({
      ...snap(s),
      stories: s.stories.map((st) => {
        if (st.id !== storyId) return st
        // Removing any wall from a closed room reopens it (footprint no longer valid)
        return {
          ...st,
          walls: st.walls.filter((w) => w.id !== wallId),
          openings: st.openings.filter((o) => o.wallId !== wallId),
          footprintPolygon: st.footprintPolygon.length > 0 ? [] : st.footprintPolygon,
        }
      }),
    })),

  clearWalls: (storyId) =>
    set((s) => ({
      ...snap(s),
      stories: s.stories.map((st) =>
        st.id === storyId ? { ...st, walls: [], footprintPolygon: [], rooms: [], openings: [] } : st
      ),
    })),

  setFootprint: (storyId, polygon) =>
    set((s) => ({
      stories: s.stories.map((st) =>
        st.id === storyId ? { ...st, footprintPolygon: polygon } : st
      ),
    })),

  registerRoom: (storyId, polygon, roomName) =>
    set((s) => ({
      stories: s.stories.map((st) => {
        if (st.id !== storyId) return st
        const room: Room = {
          id: uid(),
          name: roomName ?? `Room ${st.rooms.length + 1}`,
          polygon,
        }
        const isFirst = st.rooms.length === 0
        return {
          ...st,
          rooms: [...st.rooms, room],
          footprintPolygon: isFirst ? polygon : st.footprintPolygon,
        }
      }),
    })),

  closePolygon: (storyId, polygon, roomName) =>
    set((s) => ({
      ...snap(s),
      stories: s.stories.map((st) => {
        if (st.id !== storyId) return st
        const existingWalls = st.walls
        const wallOffset = existingWalls.length
        const newWalls: Wall[] = polygon.map((pt, i) => ({
          id: uid(),
          name: `Wall ${wallOffset + i + 1}`,
          wallType: 'external' as WallType,
          uValue: 0.18,
          start: pt,
          end: polygon[(i + 1) % polygon.length],
        }))
        const room: Room = {
          id: uid(),
          name: roomName ?? `Room ${st.rooms.length + 1}`,
          polygon,
        }
        // First room also sets the primary footprintPolygon for backward compat
        const isFirst = st.rooms.length === 0
        return {
          ...st,
          footprintPolygon: isFirst ? polygon : st.footprintPolygon,
          rooms: [...st.rooms, room],
          walls: [...existingWalls, ...newWalls],
          openings: st.openings,
        }
      }),
    })),

  updateRoom: (storyId, roomId, patch) =>
    set((s) => ({
      stories: s.stories.map((st) =>
        st.id === storyId
          ? { ...st, rooms: st.rooms.map(r => r.id === roomId ? { ...r, ...patch } : r) }
          : st
      ),
    })),

  removeRoom: (storyId, roomId) =>
    set((s) => ({
      ...snap(s),
      stories: s.stories.map((st) => {
        if (st.id !== storyId) return st
        const room = st.rooms.find(r => r.id === roomId)
        if (!room) return st
        // Remove walls that form this room's polygon edges
        const roomEdges = new Set(
          room.polygon.map((pt, i) => {
            const end = room.polygon[(i + 1) % room.polygon.length]
            return `${pt.x},${pt.y}-${end.x},${end.y}`
          })
        )
        const remainingWalls = st.walls.filter(w => !roomEdges.has(`${w.start.x},${w.start.y}-${w.end.x},${w.end.y}`))
        const removedWallIds = new Set(st.walls.filter(w => roomEdges.has(`${w.start.x},${w.start.y}-${w.end.x},${w.end.y}`)).map(w => w.id))
        const remainingRooms = st.rooms.filter(r => r.id !== roomId)
        return {
          ...st,
          rooms: remainingRooms,
          walls: remainingWalls,
          openings: st.openings.filter(o => !removedWallIds.has(o.wallId)),
          footprintPolygon: remainingRooms.length > 0 ? remainingRooms[0].polygon : [],
        }
      }),
    })),

  // ── Geometry editing ──────────────────────────────────────────────────────
  // moveVertex / moveEdge fire continuously during drags — the canvas calls
  // pushHistory() once on drag start instead of snapshotting per move.

  moveVertex: (storyId, roomId, vertIdx, newPos) =>
    set((s) => ({
      stories: s.stories.map((st) => {
        if (st.id !== storyId) return st
        const room = st.rooms.find((r) => r.id === roomId)
        if (!room || !room.polygon[vertIdx]) return st
        return movePointInStory(st, room.polygon[vertIdx], newPos)
      }),
    })),

  moveEdge: (storyId, roomId, edgeIdx, newA, newB) =>
    set((s) => ({
      stories: s.stories.map((st) => {
        if (st.id !== storyId) return st
        const room = st.rooms.find((r) => r.id === roomId)
        if (!room) return st
        const a = room.polygon[edgeIdx]
        const b = room.polygon[(edgeIdx + 1) % room.polygon.length]
        if (!a || !b) return st
        return movePointInStory(movePointInStory(st, a, newA), b, newB)
      }),
    })),

  insertVertex: (storyId, roomId, edgeIdx, pos) =>
    set((s) => ({
      ...snap(s),
      stories: s.stories.map((st) => {
        if (st.id !== storyId) return st
        const room = st.rooms.find((r) => r.id === roomId)
        if (!room) return st
        const a = room.polygon[edgeIdx]
        const b = room.polygon[(edgeIdx + 1) % room.polygon.length]
        if (!a || !b || ptEq(pos, a) || ptEq(pos, b)) return st

        const rooms = st.rooms.map((r) =>
          r.id === roomId
            ? { ...r, polygon: [...r.polygon.slice(0, edgeIdx + 1), pos, ...r.polygon.slice(edgeIdx + 1)] }
            : r
        )

        // Split the matching wall into two, re-homing openings by physical position
        const match = findWallForEdge(st, a, b)
        let walls = st.walls
        let openings = st.openings
        if (match) {
          const { wall, reversed } = match
          // Wall runs wall.start→wall.end; split point is `pos` either way
          const len = dist(wall.start, wall.end)
          const len1 = dist(wall.start, pos)
          const len2 = dist(pos, wall.end)
          const w1: Wall = { ...wall, id: uid(), end: pos, name: wall.name }
          const w2: Wall = { ...wall, id: uid(), start: pos, name: `${wall.name}b`, heightLeft: undefined, heightRight: undefined }
          walls = st.walls.flatMap((w) => (w.id === wall.id ? [w1, w2] : [w]))
          openings = st.openings.map((o) => {
            if (o.wallId !== wall.id) return o
            const physical = o.uOffset * len
            if (physical + o.width <= len1 + EPS) {
              return { ...o, wallId: w1.id, uOffset: len1 > 0 ? physical / len1 : 0 }
            }
            const intoSecond = Math.max(0, physical - len1)
            return { ...o, wallId: w2.id, uOffset: len2 > 0 ? Math.min(0.95, intoSecond / len2) : 0 }
          })
          void reversed
        }

        const isFirst = st.rooms[0]?.id === roomId
        return {
          ...st,
          rooms,
          walls,
          openings,
          footprintPolygon: isFirst ? rooms.find((r) => r.id === roomId)!.polygon : st.footprintPolygon,
        }
      }),
    })),

  deleteVertex: (storyId, roomId, vertIdx) =>
    set((s) => ({
      ...snap(s),
      stories: s.stories.map((st) => {
        if (st.id !== storyId) return st
        const room = st.rooms.find((r) => r.id === roomId)
        if (!room || room.polygon.length <= 3) return st
        const n = room.polygon.length
        const v = room.polygon[vertIdx]
        const prev = room.polygon[(vertIdx - 1 + n) % n]
        const next = room.polygon[(vertIdx + 1) % n]

        const rooms = st.rooms.map((r) =>
          r.id === roomId ? { ...r, polygon: r.polygon.filter((_, i) => i !== vertIdx) } : r
        )

        // Merge the two walls meeting at this vertex into one prev→next wall
        const m1 = findWallForEdge(st, prev, v)
        const m2 = findWallForEdge(st, v, next)
        let walls = st.walls
        let openings = st.openings
        if (m1 && m2 && m1.wall.id !== m2.wall.id) {
          const len1 = dist(prev, v)
          const merged: Wall = { ...m1.wall, id: uid(), start: prev, end: next, heightLeft: undefined, heightRight: undefined }
          const newLen = dist(prev, next)
          walls = st.walls
            .filter((w) => w.id !== m1.wall.id && w.id !== m2.wall.id)
            .concat(merged)
          // Remap openings from both old walls onto the merged wall by path distance
          openings = st.openings.map((o) => {
            if (o.wallId === m1.wall.id) {
              const physical = o.uOffset * len1
              return { ...o, wallId: merged.id, uOffset: newLen > 0 ? Math.min(0.95, physical / newLen) : 0 }
            }
            if (o.wallId === m2.wall.id) {
              const physical = len1 + o.uOffset * dist(v, next)
              return { ...o, wallId: merged.id, uOffset: newLen > 0 ? Math.min(0.95, physical / newLen) : 0 }
            }
            return o
          })
        }

        const isFirst = st.rooms[0]?.id === roomId
        return {
          ...st,
          rooms,
          walls,
          openings,
          footprintPolygon: isFirst ? rooms.find((r) => r.id === roomId)!.polygon : st.footprintPolygon,
        }
      }),
    })),

  setWallLength: (storyId, wallId, newLen, anchor) =>
    set((s) => {
      if (!(newLen > 0.05)) return s
      const st = s.stories.find((x) => x.id === storyId)
      const wall = st?.walls.find((w) => w.id === wallId)
      if (!st || !wall) return s
      const oldLen = dist(wall.start, wall.end)
      if (oldLen < EPS) return s
      const dir = { x: (wall.end.x - wall.start.x) / oldLen, y: (wall.end.y - wall.start.y) / oldLen }
      // The non-anchored endpoint moves along the wall direction
      const oldPos = anchor === 'start' ? wall.end : wall.start
      const newPos = anchor === 'start'
        ? { x: wall.start.x + dir.x * newLen, y: wall.start.y + dir.y * newLen }
        : { x: wall.end.x - dir.x * newLen, y: wall.end.y - dir.y * newLen }

      return {
        ...snap(s),
        stories: s.stories.map((story) => {
          if (story.id !== storyId) return story
          const moved = movePointInStory(story, oldPos, newPos)
          // Keep openings on this wall at the same physical position from wall start
          const openings = moved.openings.map((o) => {
            if (o.wallId !== wallId) return o
            const physical = o.uOffset * oldLen
            return { ...o, uOffset: Math.min(0.95, physical / newLen) }
          })
          return { ...moved, openings }
        }),
      }
    }),

  // ── History ───────────────────────────────────────────────────────────────

  pushHistory: () => set((s) => snap(s)),

  undo: () =>
    set((s) => {
      if (s.history.length === 0) return s
      const prev = s.history[s.history.length - 1]
      return {
        stories: prev,
        history: s.history.slice(0, -1),
        future: [...s.future.slice(-(HISTORY_CAP - 1)), s.stories],
        selectedWallId: null,
        activeStoryId: prev.some((st) => st.id === s.activeStoryId) ? s.activeStoryId : (prev[0]?.id ?? null),
      }
    }),

  redo: () =>
    set((s) => {
      if (s.future.length === 0) return s
      const next = s.future[s.future.length - 1]
      return {
        stories: next,
        future: s.future.slice(0, -1),
        history: [...s.history.slice(-(HISTORY_CAP - 1)), s.stories],
        selectedWallId: null,
        activeStoryId: next.some((st) => st.id === s.activeStoryId) ? s.activeStoryId : (next[0]?.id ?? null),
      }
    }),

  copyFootprintTo: (fromStoryId, toStoryId) =>
    set((s) => {
      const src = s.stories.find((st) => st.id === fromStoryId)
      if (!src) return s
      return {
        ...snap(s),
        stories: s.stories.map((st) =>
          st.id === toStoryId
            ? {
                ...st,
                walls: src.walls.map((w) => ({ ...w, id: uid() })),
                footprintPolygon: [...src.footprintPolygon],
                rooms: src.rooms.map(r => ({ ...r, id: uid() })),
                openings: [],
              }
            : st
        ),
      }
    }),

  setSelectedWallId: (id) => set({ selectedWallId: id }),
  setSelectedFace: (face) => set({ selectedFace: face }),

  addOpening: (storyId, opening) =>
    set((s) => ({
      ...snap(s),
      stories: s.stories.map((st) =>
        st.id === storyId ? { ...st, openings: [...st.openings, { ...opening, id: uid() }] } : st
      ),
    })),

  updateOpening: (storyId, openingId, patch) =>
    set((s) => ({
      stories: s.stories.map((st) =>
        st.id === storyId
          ? { ...st, openings: st.openings.map((o) => (o.id === openingId ? { ...o, ...patch } : o)) }
          : st
      ),
    })),

  removeOpening: (storyId, openingId) =>
    set((s) => ({
      ...snap(s),
      stories: s.stories.map((st) =>
        st.id === storyId ? { ...st, openings: st.openings.filter((o) => o.id !== openingId) } : st
      ),
    })),

  updateRoof: (patch) =>
    set((s) => ({ roofConfig: { ...s.roofConfig, ...patch } })),

  setShowRoof: (v) => set({ showRoof: v }),

  setDrawingTool: (t) => set({ drawingTool: t }),
  setGridSize: (m) => set({ gridSizeM: m }),
    }),
    {
      name: 'sap-modeler-v1',
      storage: createJSONStorage(() => localStorage),
      // Persist only model data — not transient UI state or undo stacks
      partialize: (s) => ({
        stories: s.stories,
        activeStoryId: s.activeStoryId,
        roofConfig: s.roofConfig,
        showRoof: s.showRoof,
        gridSizeM: s.gridSizeM,
      }),
    }
  )
)
