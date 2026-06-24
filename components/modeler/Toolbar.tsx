'use client'
import { MousePointer2, Minus, Pentagon, Layers } from 'lucide-react'
import { useModelerStore, DrawingTool } from '@/lib/modelerStore'

const tools: { id: DrawingTool; label: string; icon: React.ReactNode }[] = [
  { id: 'select', label: 'Select', icon: <MousePointer2 size={15} /> },
  { id: 'wall', label: 'Wall', icon: <Minus size={15} /> },
  { id: 'polygon', label: 'Polygon', icon: <Pentagon size={15} /> },
]

export default function Toolbar() {
  const { drawingTool, setDrawingTool, gridSizeM, setGridSize, stories, activeStoryId, setActiveStory } = useModelerStore()

  return (
    <div className="flex items-center gap-3 px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm shadow-sm flex-wrap">
      {/* Drawing tools */}
      <span className="text-gray-500 text-xs font-medium mr-1">Tool</span>
      {tools.map((t) => (
        <button
          key={t.id}
          onClick={() => setDrawingTool(t.id)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
            drawingTool === t.id
              ? 'bg-blue-600 text-white'
              : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'
          }`}
        >
          {t.icon} {t.label}
        </button>
      ))}

      {/* Story selector */}
      <div className="flex items-center gap-1.5 ml-2 pl-3 border-l border-gray-200">
        <Layers size={13} className="text-gray-400 shrink-0" />
        <span className="text-gray-500 text-xs font-medium mr-0.5">Floor</span>
        {stories.map((story, i) => {
          const isActive = story.id === activeStoryId
          const isGround = i === 0
          const isTop = i === stories.length - 1
          return (
            <button
              key={story.id}
              onClick={() => setActiveStory(story.id)}
              title={isGround && stories.length > 1 ? 'Ground floor — flat ceiling' : isTop ? 'Top floor — roof applies here' : story.name}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors border ${
                isActive
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
              }`}
            >
              {story.name}
              {isGround && stories.length > 1 && (
                <span className={`ml-1 text-[9px] ${isActive ? 'text-blue-200' : 'text-gray-400'}`}>●</span>
              )}
            </button>
          )
        })}
      </div>

      <div className="ml-auto flex items-center gap-2 text-xs text-gray-500">
        <span>Grid</span>
        {[0.25, 0.5, 1].map((g) => (
          <button
            key={g}
            onClick={() => setGridSize(g)}
            className={`px-2 py-1 rounded text-xs border ${
              gridSizeM === g ? 'bg-blue-50 border-blue-400 text-blue-700' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
            }`}
          >
            {g}m
          </button>
        ))}
      </div>
    </div>
  )
}
