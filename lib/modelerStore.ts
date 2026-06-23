import { create } from 'zustand'

// ─── Geometry primitives ───────────────────────────────────────────────────

export interface Point2D {
  x: number // metres in world space
  y: number
}

export interface Wall {
  id: string
  start: Point2D
  end: Point2D
}

// ─── Openings ────────────────────────────────────────────────────────────────

export type OpeningType = 'window' | 'door'

export interface Opening {
  id: string
  wallId: string
  type: OpeningType
  uOffset: number   // fraction 0–1 along wall length (left edge of opening)
  width: number     // metres
  height: number    // metres
  sillHeight: number // metres from floor
  uValue: number    // W/m²K
}

// ─── Roof types ─────────────────────────────────────────────────────────────

export type RoofType = 'flat' | 'shed' | 'gable' | 'hip'

export interface RoofConfig {
  type: RoofType
  pitchDegrees: number
  ridgeOffsetFraction: number
}

// ─── Story / layer ──────────────────────────────────────────────────────────

export interface Story {
  id: string
  name: string
  startHeight: number
  storyHeight: number
  walls: Wall[]
  footprintPolygon: Point2D[]
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

interface ModelerState {
  stories: Story[]
  activeStoryId: string | null
  roofConfig: RoofConfig
  drawingTool: DrawingTool
  showRoof: boolean
  gridSizeM: number

  addStory: () => void
  removeStory: (id: string) => void
  updateStory: (id: string, patch: Partial<Omit<Story, 'id' | 'walls' | 'footprintPolygon' | 'openings'>>) => void
  setActiveStory: (id: string) => void

  addWall: (storyId: string, wall: Omit<Wall, 'id'>) => void
  removeWall: (storyId: string, wallId: string) => void
  clearWalls: (storyId: string) => void
  setFootprint: (storyId: string, polygon: Point2D[]) => void
  // Close a polygon: sets footprint AND generates one Wall per edge (enables openings)
  closePolygon: (storyId: string, polygon: Point2D[]) => void
  copyFootprintTo: (fromStoryId: string, toStoryId: string) => void

  // Openings
  addOpening: (storyId: string, opening: Omit<Opening, 'id'>) => void
  updateOpening: (storyId: string, openingId: string, patch: Partial<Omit<Opening, 'id'>>) => void
  removeOpening: (storyId: string, openingId: string) => void

  updateRoof: (patch: Partial<RoofConfig>) => void
  setShowRoof: (v: boolean) => void
  setDrawingTool: (t: DrawingTool) => void
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
    openings: [],
  }
}

// ─── Store ──────────────────────────────────────────────────────────────────

const initial = makeStory(0)

export const useModelerStore = create<ModelerState>((set) => ({
  stories: [initial],
  activeStoryId: initial.id,
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

  addWall: (storyId, wall) =>
    set((s) => ({
      stories: s.stories.map((st) =>
        st.id === storyId ? { ...st, walls: [...st.walls, { ...wall, id: uid() }] } : st
      ),
    })),

  removeWall: (storyId, wallId) =>
    set((s) => ({
      stories: s.stories.map((st) =>
        st.id === storyId ? { ...st, walls: st.walls.filter((w) => w.id !== wallId) } : st
      ),
    })),

  clearWalls: (storyId) =>
    set((s) => ({
      stories: s.stories.map((st) =>
        st.id === storyId ? { ...st, walls: [], footprintPolygon: [], openings: [] } : st
      ),
    })),

  setFootprint: (storyId, polygon) =>
    set((s) => ({
      stories: s.stories.map((st) =>
        st.id === storyId ? { ...st, footprintPolygon: polygon } : st
      ),
    })),

  closePolygon: (storyId, polygon) =>
    set((s) => ({
      stories: s.stories.map((st) => {
        if (st.id !== storyId) return st
        const walls: Wall[] = polygon.map((pt, i) => ({
          id: uid(),
          start: pt,
          end: polygon[(i + 1) % polygon.length],
        }))
        return { ...st, footprintPolygon: polygon, walls, openings: [] }
      }),
    })),

  copyFootprintTo: (fromStoryId, toStoryId) =>
    set((s) => {
      const src = s.stories.find((st) => st.id === fromStoryId)
      if (!src) return s
      return {
        stories: s.stories.map((st) =>
          st.id === toStoryId
            ? { ...st, walls: src.walls.map((w) => ({ ...w, id: uid() })), footprintPolygon: [...src.footprintPolygon], openings: [] }
            : st
        ),
      }
    }),

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
}))
