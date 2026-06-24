'use client'
import { PlusCircle, Trash2, ChevronDown, ChevronRight, Copy, Square, Ruler } from 'lucide-react'
import { useState } from 'react'
import { useModelerStore } from '@/lib/modelerStore'
import OpeningsPanel from './OpeningsPanel'

function wallLength(start: { x: number; y: number }, end: { x: number; y: number }) {
  const dx = end.x - start.x, dy = end.y - start.y
  return Math.sqrt(dx * dx + dy * dy)
}

function shoelaceArea(pts: { x: number; y: number }[]): number {
  let a = 0
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length
    a += pts[i].x * pts[j].y - pts[j].x * pts[i].y
  }
  return Math.abs(a) / 2
}

export default function StoryPanel() {
  const { stories, activeStoryId, addStory, removeStory, updateStory, setActiveStory, copyFootprintTo, roofConfig, updateRoof, showRoof, setShowRoof, selectedWallId, setSelectedWallId, updateWall, removeWall, undoWall, wallHistory } =
    useModelerStore()
  const [roofOpen, setRoofOpen] = useState(true)
  const [openingsOpen, setOpeningsOpen] = useState(true)
  const [wallsOpen, setWallsOpen] = useState(true)

  const activeStory = stories.find(s => s.id === activeStoryId)
  const activeStoryIndex = stories.findIndex(s => s.id === activeStoryId)
  const isTopStory = activeStoryIndex === stories.length - 1
  const isGroundFloor = activeStoryIndex === 0

  return (
    <div className="flex flex-col gap-3 p-3 bg-white border border-gray-200 rounded-xl text-sm h-full overflow-y-auto shadow-sm">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-gray-800">Stories</span>
        <button
          onClick={addStory}
          className="flex items-center gap-1 px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-700 text-xs"
        >
          <PlusCircle size={13} /> Add
        </button>
      </div>

      <div className="flex flex-col gap-2">
        {stories.map((story, i) => {
          const isActive = story.id === activeStoryId
          return (
            <div
              key={story.id}
              className={`rounded-lg border p-2 cursor-pointer transition-colors ${
                isActive
                  ? 'border-blue-400 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300 bg-white'
              }`}
              onClick={() => setActiveStory(story.id)}
            >
              <div className="flex items-center justify-between mb-2">
                <input
                  className={`bg-transparent font-medium w-32 focus:outline-none focus:border-b text-xs ${isActive ? 'text-blue-700 border-blue-300' : 'text-gray-700 border-gray-300'}`}
                  value={story.name}
                  onChange={(e) => updateStory(story.id, { name: e.target.value })}
                  onClick={(e) => e.stopPropagation()}
                />
                {stories.length > 1 && (
                  <button
                    onClick={(e) => { e.stopPropagation(); removeStory(story.id) }}
                    className="text-gray-400 hover:text-red-500"
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                <label className="text-gray-500">Start (m)</label>
                <label className="text-gray-500">Height (m)</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={story.startHeight}
                  onChange={(e) => updateStory(story.id, { startHeight: parseFloat(e.target.value) || 0 })}
                  onClick={(e) => e.stopPropagation()}
                  className="bg-white border border-gray-200 rounded px-2 py-0.5 text-gray-700 w-full focus:outline-none focus:border-blue-400"
                />
                <input
                  type="number"
                  step="0.1"
                  min="0.5"
                  value={story.storyHeight}
                  onChange={(e) => updateStory(story.id, { storyHeight: parseFloat(e.target.value) || 2.5 })}
                  onClick={(e) => e.stopPropagation()}
                  className="bg-white border border-gray-200 rounded px-2 py-0.5 text-gray-700 w-full focus:outline-none focus:border-blue-400"
                />
              </div>

              <div className="mt-1.5 text-xs text-gray-500 flex items-center justify-between">
                <span>
                  {story.footprintPolygon.length >= 3
                    ? `${shoelaceArea(story.footprintPolygon).toFixed(1)} m²`
                    : `${story.walls.length} walls`}
                </span>
                {story.footprintPolygon.length >= 3 && i < stories.length - 1 && (
                  <button
                    title="Copy footprint to next storey"
                    onClick={(e) => { e.stopPropagation(); copyFootprintTo(story.id, stories[i + 1].id) }}
                    className="flex items-center gap-0.5 text-blue-500 hover:text-blue-700"
                  >
                    <Copy size={10} /> copy up
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Walls Section */}
      {activeStory && activeStory.walls.length > 0 && (
        <div className="border-t border-gray-200 pt-3">
          <button
            className="flex items-center gap-1 font-semibold text-gray-800 w-full mb-2"
            onClick={() => setWallsOpen(v => !v)}
          >
            {wallsOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <Ruler size={12} /> Walls
            <span className="ml-auto text-xs text-gray-400 font-normal">{activeStory.walls.length}</span>
          </button>
          {wallsOpen && (
            <div className="flex flex-col gap-0.5">
              {activeStory.walls.map((wall) => {
                const len = wallLength(wall.start, wall.end)
                const isSelected = wall.id === selectedWallId
                return (
                  <div
                    key={wall.id}
                    onClick={() => setSelectedWallId(isSelected ? null : wall.id)}
                    className={`flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer text-xs transition-colors ${
                      isSelected ? 'bg-amber-50 border border-amber-300' : 'hover:bg-gray-50 border border-transparent'
                    }`}
                  >
                    <input
                      value={wall.name}
                      onChange={(e) => updateWall(activeStory.id, wall.id, { name: e.target.value })}
                      onClick={(e) => e.stopPropagation()}
                      className={`flex-1 bg-transparent focus:outline-none focus:border-b text-xs min-w-0 ${
                        isSelected ? 'text-amber-800 border-amber-400 font-medium' : 'text-gray-700 border-gray-300'
                      }`}
                    />
                    <span className="text-gray-400 font-mono shrink-0">{len.toFixed(2)}m</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); removeWall(activeStory.id, wall.id) }}
                      className="text-gray-300 hover:text-red-500 transition-colors shrink-0"
                      title="Delete wall"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                )
              })}
              {/* Undo button — shown when there's history for this story */}
              {wallHistory.some(s => s.id === activeStory.id) && (
                <button
                  onClick={() => undoWall(activeStory.id)}
                  className="flex items-center gap-1 mt-1 text-xs text-blue-500 hover:text-blue-700 px-2"
                >
                  ↩ Undo last change
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Openings Section */}
      <div className="border-t border-gray-200 pt-3">
        <button
          className="flex items-center gap-1 font-semibold text-gray-800 w-full mb-2"
          onClick={() => setOpeningsOpen((v) => !v)}
        >
          {openingsOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <Square size={12} /> Windows & Doors
        </button>
        {openingsOpen && <OpeningsPanel />}
      </div>

      {/* Roof Section */}
      <div className="border-t border-gray-200 pt-3">
        <div className="flex items-center">
          <button
            className="flex items-center gap-1 font-semibold text-gray-800 flex-1"
            onClick={() => setRoofOpen((v) => !v)}
          >
            {roofOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            {isTopStory ? 'Roof' : 'Ceiling'}
          </button>
          {isTopStory && (
            <label className="flex items-center gap-1 text-xs text-gray-500 cursor-pointer">
              <input type="checkbox" checked={showRoof} onChange={(e) => setShowRoof(e.target.checked)} />
              Show
            </label>
          )}
        </div>

        {roofOpen && (
          !isTopStory ? (
            <p className="mt-2 text-xs text-gray-400 italic">
              Flat ceiling — covered by {stories[activeStoryIndex + 1]?.name ?? 'floor above'}.
              Roof controls apply to the top floor only.
            </p>
          ) : (
            <div className="mt-2 flex flex-col gap-2 text-xs">
              <div>
                <label className="text-gray-500">Type</label>
                <select
                  value={roofConfig.type}
                  onChange={(e) => updateRoof({ type: e.target.value as any })}
                  className="block mt-0.5 w-full bg-white border border-gray-200 rounded px-2 py-1 text-gray-700 focus:outline-none focus:border-blue-400"
                >
                  <option value="flat">Flat</option>
                  <option value="shed">Shed (Mono-pitch)</option>
                  <option value="gable">Cross-Gable</option>
                  <option value="hip">Hip</option>
                </select>
              </div>

              {roofConfig.type !== 'flat' && (
                <div>
                  <label className="text-gray-500">Pitch: {roofConfig.pitchDegrees}°</label>
                  <input
                    type="range"
                    min={5}
                    max={60}
                    step={1}
                    value={roofConfig.pitchDegrees}
                    onChange={(e) => updateRoof({ pitchDegrees: parseInt(e.target.value) })}
                    className="w-full mt-0.5 accent-blue-500"
                  />
                </div>
              )}
            </div>
          )
        )}
      </div>
    </div>
  )
}
