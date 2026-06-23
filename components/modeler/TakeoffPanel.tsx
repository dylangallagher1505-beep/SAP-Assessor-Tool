'use client'
import { useMemo } from 'react'
import { useModelerStore } from '@/lib/modelerStore'
import { calcStoryTakeoff, calcRoofTakeoff } from '@/lib/takeoffCalc'
import { Ruler, Layers, Home } from 'lucide-react'

function fmt(n: number) {
  return n.toFixed(2)
}

export default function TakeoffPanel() {
  const { stories, roofConfig } = useModelerStore()

  const storyTakeoffs = useMemo(() => stories.map(calcStoryTakeoff), [stories])
  const roofTakeoff = useMemo(() => {
    const top = stories[stories.length - 1]
    if (!top) return null
    return calcRoofTakeoff(top, roofConfig)
  }, [stories, roofConfig])

  const totalFloor = storyTakeoffs.reduce((s, t) => s + t.floorArea, 0)
  const totalWall = storyTakeoffs.reduce((s, t) => s + t.wallSurfaceArea, 0)

  return (
    <div className="flex flex-col gap-4 p-3 bg-slate-900 border border-slate-700 rounded-lg text-sm h-full overflow-y-auto">
      <div className="font-semibold text-slate-200 flex items-center gap-2">
        <Ruler size={15} /> Takeoff Quantities
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-blue-950/40 border border-blue-800/40 rounded-lg p-2">
          <div className="text-xs text-blue-300">Total Floor Area</div>
          <div className="text-lg font-bold text-white">{fmt(totalFloor)} m²</div>
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-2">
          <div className="text-xs text-slate-400">Total Wall Area</div>
          <div className="text-lg font-bold text-white">{fmt(totalWall)} m²</div>
        </div>
      </div>

      {/* Per-story */}
      <div>
        <div className="flex items-center gap-1.5 text-xs font-medium text-slate-400 mb-2">
          <Layers size={12} /> Per Story
        </div>
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="text-slate-500 border-b border-slate-700">
              <th className="text-left pb-1">Story</th>
              <th className="text-right pb-1">Floor</th>
              <th className="text-right pb-1">Perim</th>
              <th className="text-right pb-1">Wall</th>
            </tr>
          </thead>
          <tbody>
            {storyTakeoffs.map((t) => (
              <tr key={t.storyId} className="border-b border-slate-800 hover:bg-slate-800/40">
                <td className="py-1 text-slate-300">{t.storyName}</td>
                <td className="py-1 text-right text-slate-200">{fmt(t.floorArea)}</td>
                <td className="py-1 text-right text-slate-400">{fmt(t.wallSurfaceArea / (stories.find(s => s.id === t.storyId)?.storyHeight ?? 2.5))}m</td>
                <td className="py-1 text-right text-slate-200">{fmt(t.wallSurfaceArea)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="text-xs text-slate-600 mt-1">Floor m² · Perimeter m · Wall m²</div>
      </div>

      {/* Roof */}
      {roofTakeoff && (
        <div>
          <div className="flex items-center gap-1.5 text-xs font-medium text-slate-400 mb-2">
            <Home size={12} /> Roof ({roofTakeoff.type})
          </div>
          <div className="bg-purple-950/30 border border-purple-800/30 rounded-lg p-2 mb-2">
            <div className="text-xs text-purple-300">Total Roof Area</div>
            <div className="text-lg font-bold text-white">{fmt(roofTakeoff.totalArea)} m²</div>
          </div>
          <table className="w-full text-xs border-collapse">
            <tbody>
              {roofTakeoff.planes.map((p, i) => (
                <tr key={i} className="border-b border-slate-800">
                  <td className="py-1 text-slate-400">{p.label}</td>
                  <td className="py-1 text-right text-slate-200">{fmt(p.area)} m²</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-auto text-xs text-slate-600 border-t border-slate-800 pt-2">
        Areas update live as you draw. Wall area = length × story height.
      </div>
    </div>
  )
}
