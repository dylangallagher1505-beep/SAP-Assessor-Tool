'use client'
import { PlusCircle, Trash2, ChevronDown, ChevronRight, Copy, Square } from 'lucide-react'
import { useState } from 'react'
import { useModelerStore } from '@/lib/modelerStore'
import OpeningsPanel from './OpeningsPanel'

function shoelaceArea(pts: { x: number; y: number }[]): number {
  let a = 0
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length
    a += pts[i].x * pts[j].y - pts[j].x * pts[i].y
  }
  return Math.abs(a) / 2
}

export default function StoryPanel() {
  const { stories, activeStoryId, addStory, removeStory, updateStory, setActiveStory, copyFootprintTo, roofConfig, updateRoof, showRoof, setShowRoof } =
    useModelerStore()
  const [roofOpen, setRoofOpen] = useState(true)
  const [openingsOpen, setOpeningsOpen] = useState(true)

  return (
    <div className="flex flex-col gap-3 p-3 bg-slate-900 border border-slate-700 rounded-lg text-sm h-full overflow-y-auto">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-slate-200">Stories</span>
        <button
          onClick={addStory}
          className="flex items-center gap-1 px-2 py-1 rounded bg-blue-600/30 text-blue-300 hover:bg-blue-600/50 text-xs"
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
                  ? 'border-blue-500 bg-blue-950/40'
                  : 'border-slate-700 hover:border-slate-500'
              }`}
              onClick={() => setActiveStory(story.id)}
            >
              <div className="flex items-center justify-between mb-2">
                <input
                  className="bg-transparent text-slate-200 font-medium w-32 focus:outline-none focus:border-b border-slate-500 text-xs"
                  value={story.name}
                  onChange={(e) => updateStory(story.id, { name: e.target.value })}
                  onClick={(e) => e.stopPropagation()}
                />
                {stories.length > 1 && (
                  <button
                    onClick={(e) => { e.stopPropagation(); removeStory(story.id) }}
                    className="text-slate-500 hover:text-red-400"
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                <label className="text-slate-400">Start (m)</label>
                <label className="text-slate-400">Height (m)</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={story.startHeight}
                  onChange={(e) => updateStory(story.id, { startHeight: parseFloat(e.target.value) || 0 })}
                  onClick={(e) => e.stopPropagation()}
                  className="bg-slate-800 border border-slate-600 rounded px-2 py-0.5 text-slate-200 w-full focus:outline-none focus:border-blue-400"
                />
                <input
                  type="number"
                  step="0.1"
                  min="0.5"
                  value={story.storyHeight}
                  onChange={(e) => updateStory(story.id, { storyHeight: parseFloat(e.target.value) || 2.5 })}
                  onClick={(e) => e.stopPropagation()}
                  className="bg-slate-800 border border-slate-600 rounded px-2 py-0.5 text-slate-200 w-full focus:outline-none focus:border-blue-400"
                />
              </div>

              <div className="mt-1.5 text-xs text-slate-500 flex items-center justify-between">
                <span>
                  {story.footprintPolygon.length >= 3
                    ? `${shoelaceArea(story.footprintPolygon).toFixed(1)} m²`
                    : `${story.walls.length} walls`}
                </span>
                {story.footprintPolygon.length >= 3 && i < stories.length - 1 && (
                  <button
                    title="Copy footprint to next storey"
                    onClick={(e) => { e.stopPropagation(); copyFootprintTo(story.id, stories[i + 1].id) }}
                    className="flex items-center gap-0.5 text-blue-400 hover:text-blue-300"
                  >
                    <Copy size={10} /> copy up
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Openings Section */}
      <div className="border-t border-slate-700 pt-3">
        <button
          className="flex items-center gap-1 font-semibold text-slate-200 w-full mb-2"
          onClick={() => setOpeningsOpen((v) => !v)}
        >
          {openingsOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <Square size={12} /> Windows & Doors
        </button>
        {openingsOpen && <OpeningsPanel />}
      </div>

      {/* Roof Section */}
      <div className="border-t border-slate-700 pt-3">
        <div className="flex items-center">
          <button
            className="flex items-center gap-1 font-semibold text-slate-200 flex-1"
            onClick={() => setRoofOpen((v) => !v)}
          >
            {roofOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            Roof
          </button>
          <label className="flex items-center gap-1 text-xs text-slate-400 cursor-pointer">
            <input type="checkbox" checked={showRoof} onChange={(e) => setShowRoof(e.target.checked)} />
            Show
          </label>
        </div>

        {roofOpen && (
          <div className="mt-2 flex flex-col gap-2 text-xs">
            <div>
              <label className="text-slate-400">Type</label>
              <select
                value={roofConfig.type}
                onChange={(e) => updateRoof({ type: e.target.value as any })}
                className="block mt-0.5 w-full bg-slate-800 border border-slate-600 rounded px-2 py-1 text-slate-200 focus:outline-none"
              >
                <option value="flat">Flat</option>
                <option value="shed">Shed (Mono-pitch)</option>
                <option value="gable">Cross-Gable</option>
                <option value="hip">Hip</option>
              </select>
            </div>

            {roofConfig.type !== 'flat' && (
              <div>
                <label className="text-slate-400">Pitch: {roofConfig.pitchDegrees}°</label>
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
        )}
      </div>
    </div>
  )
}
