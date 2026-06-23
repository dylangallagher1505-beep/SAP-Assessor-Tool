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

// ─── Roof types ─────────────────────────────────────────────────────────────

export type RoofType = 'flat' | 'shed' | 'gable' | 'hip'

export interface RoofConfig {
  type: RoofType
  pitchDegrees: number // rise/run angle (0–60°)
  ridgeOffsetFraction: number // 0–1, where ridge sits across width (for shed = 1 = full height one side)
}

// ─── Story / layer ──────────────────────────────────────────────────────────

export interface Story {
  id: string
  name: string
  startHeight: number  // metres from ground (elevation)
  storyHeight: number  // wall height in metres
  walls: Wall[]
  footprintPolygon: Point2D[] // closed polygon derived from walls (used for area calc)
}

// ─── Takeoff summaries (derived, not stored) ────────────────────────────────

export interface StoryTakeoff {
  storyId: string
  storyName: string
  floorArea: number       // m²
  wallSurfaceArea: number // m²
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
  gridSizeM: number // metres per grid cell (e.g. 0.5)

  // Story CRUD
  addStory: () => void
  removeStory: (id: string) => void
  updateStory: (id: string, patch: Partial<Omit<Story, 'id' | 'walls' | 'footprintPolygon'>>) => void
  setActiveStory: (id: string) => void

  // Wall drawing
  addWall: (storyId: string, wall: Omit<Wall, 'id'>) => void
  removeWall: (storyId: string, wallId: string) => void
  clearWalls: (storyId: string) => void

  // Footprint polygon (used when drawing in polygon mode)
  setFootprint: (storyId: string, polygon: Point2D[]) => void

  // Copy the footprint + walls of one storey onto another
  copyFootprintTo: (fromStoryId: string, toStoryId: string) => void

  // Roof
  updateRoof: (patch: Partial<RoofConfig>) => void
  setShowRoof: (v: boolean) => void

  // Drawing tool
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
      // Auto-stack: set startHeight above the last story
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
        activeStoryId:
          s.activeStoryId === id ? (stories[0]?.id ?? null) : s.activeStoryId,
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
        st.id === storyId
          ? { ...st, walls: [...st.walls, { ...wall, id: uid() }] }
          : st
      ),
    })),

  removeWall: (storyId, wallId) =>
    set((s) => ({
      stories: s.stories.map((st) =>
        st.id === storyId
          ? { ...st, walls: st.walls.filter((w) => w.id !== wallId) }
          : st
      ),
    })),

  clearWalls: (storyId) =>
    set((s) => ({
      stories: s.stories.map((st) =>
        st.id === storyId ? { ...st, walls: [], footprintPolygon: [] } : st
      ),
    })),

  setFootprint: (storyId, polygon) =>
    set((s) => ({
      stories: s.stories.map((st) =>
        st.id === storyId ? { ...st, footprintPolygon: polygon } : st
      ),
    })),

  copyFootprintTo: (fromStoryId, toStoryId) =>
    set((s) => {
      const src = s.stories.find((st) => st.id === fromStoryId)
      if (!src) return s
      return {
        stories: s.stories.map((st) =>
          st.id === toStoryId
            ? { ...st, walls: src.walls.map((w) => ({ ...w, id: uid() })), footprintPolygon: [...src.footprintPolygon] }
            : st
        ),
      }
    }),

  updateRoof: (patch) =>
    set((s) => ({ roofConfig: { ...s.roofConfig, ...patch } })),

  setShowRoof: (v) => set({ showRoof: v }),

  setDrawingTool: (t) => set({ drawingTool: t }),
}))
