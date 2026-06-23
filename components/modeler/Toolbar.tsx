'use client'
import { MousePointer2, Minus, Pentagon } from 'lucide-react'
import { useModelerStore, DrawingTool } from '@/lib/modelerStore'

const tools: { id: DrawingTool; label: string; icon: React.ReactNode }[] = [
  { id: 'select', label: 'Select', icon: <MousePointer2 size={15} /> },
  { id: 'wall', label: 'Wall', icon: <Minus size={15} /> },
  { id: 'polygon', label: 'Polygon', icon: <Pentagon size={15} /> },
]

export default function Toolbar() {
  const { drawingTool, setDrawingTool, gridSizeM } = useModelerStore()

  return (
    <div className="flex items-center gap-3 px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm shadow-sm">
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

      <div className="ml-auto flex items-center gap-2 text-xs text-gray-500">
        <span>Grid</span>
        {[0.25, 0.5, 1].map((g) => (
          <button
            key={g}
            // @ts-ignore – accessing store's internal set directly
            onClick={() => useModelerStore.setState({ gridSizeM: g })}
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
