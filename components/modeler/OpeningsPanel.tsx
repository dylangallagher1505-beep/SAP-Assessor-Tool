'use client'
import { useState } from 'react'
import { PlusCircle, Trash2, ChevronDown, ChevronRight } from 'lucide-react'
import { useModelerStore, Opening, OpeningType } from '@/lib/modelerStore'

function wallLength(start: { x: number; y: number }, end: { x: number; y: number }) {
  const dx = end.x - start.x, dy = end.y - start.y
  return Math.sqrt(dx * dx + dy * dy)
}

function wallLabel(i: number, len: number) {
  const dirs = ['N', 'E', 'S', 'W']
  return `Wall ${i + 1} (${dirs[i % 4]}) — ${len.toFixed(2)}m`
}

const DEFAULT_OPENING: Omit<Opening, 'id' | 'wallId'> = {
  type: 'window',
  uOffset: 0.3,
  width: 1.2,
  height: 1.0,
  sillHeight: 0.9,
  uValue: 1.4,
  gValue: 0.63,
}

export default function OpeningsPanel() {
  const { stories, activeStoryId, addOpening, updateOpening, removeOpening } = useModelerStore()
  const story = stories.find((s) => s.id === activeStoryId)
  const [expandedWall, setExpandedWall] = useState<string | null>(null)

  if (!story || story.walls.length === 0) {
    return (
      <div className="text-xs text-gray-400 italic px-1 pt-1">
        Draw a room first to add windows and doors.
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1">
      {story.walls.map((wall, i) => {
        const len = wallLength(wall.start, wall.end)
        if (len < 0.1) return null
        const wallOpenings = story.openings.filter((o) => o.wallId === wall.id)
        const isOpen = expandedWall === wall.id

        return (
          <div key={wall.id} className="border border-gray-200 rounded-lg overflow-hidden">
            {/* Wall header */}
            <button
              className="w-full flex items-center gap-1.5 px-2 py-1.5 text-left hover:bg-gray-50 text-xs"
              onClick={() => setExpandedWall(isOpen ? null : wall.id)}
            >
              {isOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
              <span className="text-gray-700 flex-1">{wallLabel(i, len)}</span>
              <span className="text-gray-400">{wallOpenings.length > 0 ? `${wallOpenings.length} opening${wallOpenings.length > 1 ? 's' : ''}` : ''}</span>
            </button>

            {isOpen && (
              <div className="px-2 pb-2 bg-gray-50 flex flex-col gap-2">
                {/* Existing openings */}
                {wallOpenings.map((op) => (
                  <OpeningEditor
                    key={op.id}
                    opening={op}
                    wallLen={len}
                    storyHeight={story.storyHeight}
                    storyId={story.id}
                    onUpdate={(patch) => updateOpening(story.id, op.id, patch)}
                    onRemove={() => removeOpening(story.id, op.id)}
                  />
                ))}

                {/* Add button */}
                <button
                  onClick={() => addOpening(story.id, { ...DEFAULT_OPENING, wallId: wall.id })}
                  className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 mt-0.5"
                >
                  <PlusCircle size={11} /> Add opening
                </button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function OpeningEditor({
  opening, wallLen, storyHeight, storyId, onUpdate, onRemove,
}: {
  opening: Opening
  wallLen: number
  storyHeight: number
  storyId: string
  onUpdate: (patch: Partial<Omit<Opening, 'id'>>) => void
  onRemove: () => void
}) {
  const maxWidth = Math.max(0.2, wallLen - opening.uOffset * wallLen - 0.1)
  const maxHeight = Math.max(0.2, storyHeight - opening.sillHeight - 0.05)

  return (
    <div className="bg-white border border-gray-200 rounded p-2 flex flex-col gap-1.5 text-xs">
      {/* Type + remove */}
      <div className="flex items-center gap-2">
        <select
          value={opening.type}
          onChange={(e) => onUpdate({ type: e.target.value as OpeningType })}
          className="flex-1 bg-white border border-gray-200 rounded px-1.5 py-0.5 text-gray-700 focus:outline-none focus:border-blue-400"
        >
          <option value="window">Window</option>
          <option value="door">Door</option>
        </select>
        <button onClick={onRemove} className="text-gray-400 hover:text-red-500"><Trash2 size={11} /></button>
      </div>

      {/* Position along wall */}
      <div className="flex items-center gap-2">
        <label className="text-gray-500 w-14 shrink-0">Position</label>
        <input
          type="range" min={0} max={0.95} step={0.01}
          value={opening.uOffset}
          onChange={(e) => onUpdate({ uOffset: parseFloat(e.target.value) })}
          className="flex-1 accent-blue-500"
        />
        <span className="text-gray-500 w-10 text-right">{(opening.uOffset * wallLen).toFixed(1)}m</span>
      </div>

      {/* Width */}
      <div className="flex items-center gap-2">
        <label className="text-gray-500 w-14 shrink-0">Width</label>
        <input
          type="range" min={0.3} max={Math.min(3, maxWidth)} step={0.05}
          value={opening.width}
          onChange={(e) => onUpdate({ width: parseFloat(e.target.value) })}
          className="flex-1 accent-blue-500"
        />
        <span className="text-gray-500 w-10 text-right">{opening.width.toFixed(2)}m</span>
      </div>

      {/* Height */}
      <div className="flex items-center gap-2">
        <label className="text-gray-500 w-14 shrink-0">Height</label>
        <input
          type="range" min={0.3} max={Math.min(2.4, maxHeight)} step={0.05}
          value={opening.height}
          onChange={(e) => onUpdate({ height: parseFloat(e.target.value) })}
          className="flex-1 accent-blue-500"
        />
        <span className="text-gray-500 w-10 text-right">{opening.height.toFixed(2)}m</span>
      </div>

      {/* Sill height */}
      {opening.type === 'window' && (
        <div className="flex items-center gap-2">
          <label className="text-gray-500 w-14 shrink-0">Sill</label>
          <input
            type="range" min={0} max={Math.min(1.5, storyHeight - opening.height - 0.05)} step={0.05}
            value={opening.sillHeight}
            onChange={(e) => onUpdate({ sillHeight: parseFloat(e.target.value) })}
            className="flex-1 accent-blue-500"
          />
          <span className="text-gray-500 w-10 text-right">{opening.sillHeight.toFixed(2)}m</span>
        </div>
      )}

      {/* U-value */}
      <div className="flex items-center gap-2">
        <label className="text-gray-500 w-14 shrink-0">U-value</label>
        <input
          type="number" step={0.1} min={0.5} max={5}
          value={opening.uValue}
          onChange={(e) => onUpdate({ uValue: parseFloat(e.target.value) || 1.4 })}
          className="w-16 bg-white border border-gray-200 rounded px-1.5 py-0.5 text-gray-700 focus:outline-none focus:border-blue-400"
        />
        <span className="text-gray-400">W/m²K</span>
      </div>

      <div className="text-gray-400 text-right">
        Area: {(opening.width * opening.height).toFixed(2)} m²
      </div>
    </div>
  )
}
