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

// Snapshot of one story's walls+openings+footprint for undo
type WallSnapshot = Pick<Story, 'id' | 'walls' | 'openings' | 'footprintPolygon' | 'rooms'>

// Selected face in the 3D view
export type SelectedFace =
  | { type: 'wall'; storyId: string; wallId: string }
  | { type: 'roof'; faceIndex: number; faceLabel: string }
  | null

interface ModelerState {
  stories: Story[]
  activeStoryId: string | null
  selectedWallId: string | null
  selectedFace: SelectedFace
  wallHistory: WallSnapshot[]  // undo stack (most recent last)
  roofConfig: RoofConfig
  drawingTool: DrawingTool
  showRoof: boolean
  gridSizeM: number

  addStory: () => void
  removeStory: (id: string) => void
  updateStory: (id: string, patch: Partial<Omit<Story, 'id' | 'walls' | 'footprintPolygon' | 'openings'>>) => void
  setActiveStory: (id: string) => void

  addWall: (storyId: string, wall: Pick<Wall, 'start' | 'end'> & Partial<Pick<Wall, 'wallType' | 'uValue'>>, name?: string) => void
  updateWall: (storyId: string, wallId: string, patch: Partial<Pick<Wall, 'name' | 'wallType' | 'uValue'>>) => void
  removeWall: (storyId: string, wallId: string) => void
  undoWall: (storyId: string) => void
  clearWalls: (storyId: string) => void
  setFootprint: (storyId: string, polygon: Point2D[]) => void
  registerRoom: (storyId: string, polygon: Point2D[], roomName?: string) => void
  closePolygon: (storyId: string, polygon: Point2D[], roomName?: string) => void
  copyFootprintTo: (fromStoryId: string, toStoryId: string) => void
  updateRoom: (storyId: string, roomId: string, patch: Partial<Pick<Room, 'name'>>) => void
  removeRoom: (storyId: string, roomId: string) => void

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

// ─── Store ──────────────────────────────────────────────────────────────────

const initial = makeStory(0)

export const useModelerStore = create<ModelerState>()(
  persist(
    (set) => ({
  stories: [initial],
  activeStoryId: initial.id,
  selectedWallId: null,
  selectedFace: null,
  wallHistory: [],
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
      return { stories: [...s.stories, next], activeStoryId: next.id }
    }),

  removeStory: (id) =>
    set((s) => {
      const stories = s.stories.filter((st) => st.id !== id)
      return {
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
    set((s) => {
      const st = s.stories.find(x => x.id === storyId)
      const snapshot: WallSnapshot = st
        ? { id: st.id, walls: st.walls, openings: st.openings, footprintPolygon: st.footprintPolygon, rooms: st.rooms }
        : { id: storyId, walls: [], openings: [], footprintPolygon: [], rooms: [] }
      return {
        wallHistory: [...s.wallHistory.slice(-49), snapshot],
        stories: s.stories.map((st) => {
          if (st.id !== storyId) return st
          const autoName = name ?? `Wall ${st.walls.length + 1}`
          const defaults = { wallType: 'external' as WallType, uValue: 0.18 }
          return { ...st, walls: [...st.walls, { ...defaults, ...wall, id: uid(), name: autoName }] }
        }),
      }
    }),

  updateWall: (storyId, wallId, patch) =>
    set((s) => ({
      stories: s.stories.map((st) =>
        st.id === storyId
          ? { ...st, walls: st.walls.map((w) => (w.id === wallId ? { ...w, ...patch } : w)) }
          : st
      ),
    })),

  undoWall: (storyId) =>
    set((s) => {
      // Find the most recent snapshot for this story
      const idx = [...s.wallHistory].reverse().findIndex(snap => snap.id === storyId)
      if (idx === -1) return s
      const realIdx = s.wallHistory.length - 1 - idx
      const snap = s.wallHistory[realIdx]
      return {
        wallHistory: s.wallHistory.filter((_, i) => i !== realIdx),
        selectedWallId: null,
        stories: s.stories.map((st) =>
          st.id === storyId
            ? { ...st, walls: snap.walls, openings: snap.openings, footprintPolygon: snap.footprintPolygon, rooms: snap.rooms }
            : st
        ),
      }
    }),

  removeWall: (storyId, wallId) =>
    set((s) => ({
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
    set((s) => {
      const st = s.stories.find(x => x.id === storyId)
      const snapshot: WallSnapshot = st
        ? { id: st.id, walls: st.walls, openings: st.openings, footprintPolygon: st.footprintPolygon, rooms: st.rooms }
        : { id: storyId, walls: [], openings: [], footprintPolygon: [], rooms: [] }
      return {
        wallHistory: [...s.wallHistory.slice(-49), snapshot],
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
      }
    }),

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

  copyFootprintTo: (fromStoryId, toStoryId) =>
    set((s) => {
      const src = s.stories.find((st) => st.id === fromStoryId)
      if (!src) return s
      return {
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
      // Persist only model data — not transient UI state
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
