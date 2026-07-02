'use client'
import { MousePointer2, Minus, Pentagon, Layers, RotateCcw, Grid3x3 } from 'lucide-react'
import { useModelerStore, DrawingTool } from '@/lib/modelerStore'

const tools: { id: DrawingTool; label: string; icon: React.ReactNode }[] = [
  { id: 'select', label: 'Select', icon: <MousePointer2 size={14} /> },
  { id: 'wall', label: 'Wall', icon: <Minus size={14} /> },
  { id: 'polygon', label: 'Polygon', icon: <Pentagon size={14} /> },
]

/** iOS-style segmented control group */
function Segmented({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-emerald-950/5 border border-emerald-950/5">
      {children}
    </div>
  )
}

function SegButton({ active, onClick, title, children }: {
  active: boolean; onClick: () => void; title?: string; children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
        active
          ? 'bg-white text-emerald-800 shadow-[0_1px_4px_rgba(12,42,31,0.12)]'
          : 'text-gray-500 hover:text-emerald-800'
      }`}
    >
      {children}
    </button>
  )
}

export default function Toolbar() {
  const { drawingTool, setDrawingTool, gridSizeM, setGridSize, stories, activeStoryId, setActiveStory } = useModelerStore()

  function handleNewModel() {
    if (!confirm('Start a new model? All current work will be cleared.')) return
    // Reset store to initial state via localStorage clear + reload
    localStorage.removeItem('sap-modeler-v1')
    window.location.reload()
  }

  return (
    <div className="flex items-center gap-4 px-3 py-2 bg-white/90 border border-gray-200 rounded-xl text-sm shadow-sm flex-wrap backdrop-blur">
      {/* Drawing tools */}
      <Segmented>
        {tools.map((t) => (
          <SegButton key={t.id} active={drawingTool === t.id} onClick={() => setDrawingTool(t.id)}>
            {t.icon} {t.label}
          </SegButton>
        ))}
      </Segmented>

      {/* Story selector */}
      <div className="flex items-center gap-2">
        <Layers size={13} className="text-emerald-700/60 shrink-0" />
        <Segmented>
          {stories.map((story, i) => {
            const isGround = i === 0
            const isTop = i === stories.length - 1
            return (
              <SegButton
                key={story.id}
                active={story.id === activeStoryId}
                onClick={() => setActiveStory(story.id)}
                title={isGround && stories.length > 1 ? 'Ground floor — flat ceiling' : isTop ? 'Top floor — roof applies here' : story.name}
              >
                {story.name}
              </SegButton>
            )
          })}
        </Segmented>
      </div>

      <div className="ml-auto flex items-center gap-3">
        {/* Grid size */}
        <div className="flex items-center gap-2">
          <Grid3x3 size={13} className="text-emerald-700/60 shrink-0" />
          <Segmented>
            {[0.25, 0.5, 1].map((g) => (
              <SegButton key={g} active={gridSizeM === g} onClick={() => setGridSize(g)}>
                {g}m
              </SegButton>
            ))}
          </Segmented>
        </div>

        <button
          onClick={handleNewModel}
          title="Start a new model"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold text-gray-500 hover:text-red-600 hover:border-red-200 hover:bg-red-50 transition-colors"
        >
          <RotateCcw size={12} /> New model
        </button>
      </div>
    </div>
  )
}
