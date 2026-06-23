'use client'
import { useMemo, useState } from 'react'
import { useModelerStore } from '@/lib/modelerStore'
import { calcStoryTakeoff, calcRoofTakeoff, polygonArea } from '@/lib/takeoffCalc'
import { Ruler, Layers, Home, Table, Download } from 'lucide-react'

function fmt(n: number, dp = 2) { return n.toFixed(dp) }

function wallLength(start: { x: number; y: number }, end: { x: number; y: number }) {
  const dx = end.x - start.x, dy = end.y - start.y
  return Math.sqrt(dx * dx + dy * dy)
}

// ─── SAP fabric schedule row ──────────────────────────────────────────────────

interface FabricRow {
  ref: string
  element: string
  type: string
  grossArea: number
  openingArea: number
  netArea: number
  uValue: number
  heatLossArea: number  // = netArea for external, 0 for internal
}

function buildFabricSchedule(stories: ReturnType<typeof useModelerStore.getState>['stories'], roofConfig: ReturnType<typeof useModelerStore.getState>['roofConfig']): FabricRow[] {
  const rows: FabricRow[] = []
  let wallRef = 1

  for (const story of stories) {
    if (story.walls.length === 0) continue

    // Floor (ground floor only for first storey, otherwise internal)
    if (story.footprintPolygon.length >= 3) {
      const floorArea = polygonArea(story.footprintPolygon)
      const isGround = story.startHeight < 0.01
      rows.push({
        ref: `F${wallRef}`,
        element: `${story.name} Floor`,
        type: isGround ? 'Ground Floor' : 'Internal Floor',
        grossArea: floorArea, openingArea: 0, netArea: floorArea,
        uValue: isGround ? 0.25 : 0,
        heatLossArea: isGround ? floorArea : 0,
      })
    }

    // Walls
    for (const wall of story.walls) {
      const len = wallLength(wall.start, wall.end)
      if (len < 0.05) continue
      const grossWallArea = len * story.storyHeight
      const wallOpenings = story.openings.filter(o => o.wallId === wall.id)
      const openingArea = wallOpenings.reduce((s, o) => s + o.width * o.height, 0)
      const netArea = Math.max(0, grossWallArea - openingArea)

      rows.push({
        ref: `W${wallRef}`,
        element: `${story.name} Wall ${wallRef}`,
        type: 'External Wall',
        grossArea: grossWallArea, openingArea, netArea,
        uValue: 0.18,
        heatLossArea: netArea,
      })

      // Window rows
      for (const op of wallOpenings.filter(o => o.type === 'window')) {
        rows.push({
          ref: `Gw${wallRef}`,
          element: `Window on ${story.name} W${wallRef}`,
          type: 'Window',
          grossArea: op.width * op.height, openingArea: 0, netArea: op.width * op.height,
          uValue: op.uValue,
          heatLossArea: op.width * op.height,
        })
      }

      // Door rows
      for (const op of wallOpenings.filter(o => o.type === 'door')) {
        rows.push({
          ref: `Gd${wallRef}`,
          element: `Door on ${story.name} W${wallRef}`,
          type: 'Door',
          grossArea: op.width * op.height, openingArea: 0, netArea: op.width * op.height,
          uValue: op.uValue,
          heatLossArea: op.width * op.height,
        })
      }

      wallRef++
    }

    // Ceiling (only if not top storey, else roof handles it)
    const isTop = story === stories[stories.length - 1]
    if (!isTop && story.footprintPolygon.length >= 3) {
      const ceilArea = polygonArea(story.footprintPolygon)
      rows.push({
        ref: `C${wallRef}`,
        element: `${story.name} Ceiling`,
        type: 'Internal Ceiling',
        grossArea: ceilArea, openingArea: 0, netArea: ceilArea,
        uValue: 0, heatLossArea: 0,
      })
    }
  }

  // Roof
  const top = stories[stories.length - 1]
  if (top && top.footprintPolygon.length >= 3) {
    const rt = calcRoofTakeoff(top, roofConfig)
    rows.push({
      ref: 'R1',
      element: `Roof (${rt.type})`,
      type: 'Roof',
      grossArea: rt.totalArea, openingArea: 0, netArea: rt.totalArea,
      uValue: 0.16,
      heatLossArea: rt.totalArea,
    })
  }

  return rows
}

function exportCSV(rows: FabricRow[]) {
  const header = 'Ref,Element,Type,Gross Area (m²),Opening Area (m²),Net Area (m²),U-value (W/m²K),Heat Loss Area (m²),Heat Loss (W/K)\n'
  const body = rows.map(r =>
    `${r.ref},"${r.element}",${r.type},${fmt(r.grossArea)},${fmt(r.openingArea)},${fmt(r.netArea)},${fmt(r.uValue)},${fmt(r.heatLossArea)},${fmt(r.heatLossArea * r.uValue)}`
  ).join('\n')
  const blob = new Blob([header + body], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = 'sap-fabric-schedule.csv'; a.click()
  URL.revokeObjectURL(url)
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function TakeoffPanel() {
  const { stories, roofConfig } = useModelerStore()
  const [tab, setTab] = useState<'summary' | 'schedule'>('summary')

  const storyTakeoffs = useMemo(() => stories.map(calcStoryTakeoff), [stories])
  const roofTakeoff = useMemo(() => {
    const top = stories[stories.length - 1]
    if (!top) return null
    return calcRoofTakeoff(top, roofConfig)
  }, [stories, roofConfig])

  const fabricRows = useMemo(() => buildFabricSchedule(stories, roofConfig), [stories, roofConfig])

  const totalFloor = storyTakeoffs.reduce((s, t) => s + t.floorArea, 0)
  const totalWall = storyTakeoffs.reduce((s, t) => s + t.wallSurfaceArea, 0)
  const totalWindowArea = stories.flatMap(s => s.openings.filter(o => o.type === 'window')).reduce((s, o) => s + o.width * o.height, 0)
  const totalDoorArea = stories.flatMap(s => s.openings.filter(o => o.type === 'door')).reduce((s, o) => s + o.width * o.height, 0)
  const totalHeatLoss = fabricRows.reduce((s, r) => s + r.heatLossArea * r.uValue, 0)

  return (
    <div className="flex flex-col gap-3 p-3 bg-slate-900 border border-slate-700 rounded-lg text-sm h-full overflow-y-auto">
      <div className="font-semibold text-slate-200 flex items-center gap-2">
        <Ruler size={15} /> Takeoff
      </div>

      {/* Tab switcher */}
      <div className="flex rounded-lg overflow-hidden border border-slate-700 text-xs">
        <button onClick={() => setTab('summary')} className={`flex-1 py-1 font-medium ${tab === 'summary' ? 'bg-blue-700 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}>Summary</button>
        <button onClick={() => setTab('schedule')} className={`flex-1 py-1 font-medium ${tab === 'schedule' ? 'bg-blue-700 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}>SAP Schedule</button>
      </div>

      {tab === 'summary' && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-blue-950/40 border border-blue-800/40 rounded-lg p-2">
              <div className="text-xs text-blue-300">Total Floor Area</div>
              <div className="text-lg font-bold text-white">{fmt(totalFloor)} m²</div>
            </div>
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-2">
              <div className="text-xs text-slate-400">Gross Wall Area</div>
              <div className="text-lg font-bold text-white">{fmt(totalWall)} m²</div>
            </div>
            <div className="bg-sky-950/40 border border-sky-800/40 rounded-lg p-2">
              <div className="text-xs text-sky-300">Windows</div>
              <div className="text-lg font-bold text-white">{fmt(totalWindowArea)} m²</div>
            </div>
            <div className="bg-amber-950/40 border border-amber-800/40 rounded-lg p-2">
              <div className="text-xs text-amber-300">Doors</div>
              <div className="text-lg font-bold text-white">{fmt(totalDoorArea)} m²</div>
            </div>
          </div>

          {/* Per-story */}
          <div>
            <div className="flex items-center gap-1.5 text-xs font-medium text-slate-400 mb-2">
              <Layers size={12} /> Per Storey
            </div>
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="text-slate-500 border-b border-slate-700">
                  <th className="text-left pb-1">Storey</th>
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
        </>
      )}

      {tab === 'schedule' && (
        <>
          {/* SAP fabric schedule */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-medium text-slate-400">
              <Table size={12} /> SAP 10.2 Fabric Schedule
            </div>
            <button
              onClick={() => exportCSV(fabricRows)}
              className="flex items-center gap-1 text-xs text-green-400 hover:text-green-300"
            >
              <Download size={11} /> CSV
            </button>
          </div>

          {fabricRows.length === 0 ? (
            <div className="text-xs text-slate-500 italic">Draw a room to generate the schedule.</div>
          ) : (
            <>
              <div className="overflow-x-auto -mx-1">
                <table className="w-full text-xs border-collapse min-w-full">
                  <thead>
                    <tr className="text-slate-500 border-b border-slate-700 text-right">
                      <th className="text-left pb-1 pl-1 font-medium">Ref</th>
                      <th className="text-left pb-1 font-medium">Element</th>
                      <th className="pb-1 font-medium">A<sub>g</sub></th>
                      <th className="pb-1 font-medium">A<sub>op</sub></th>
                      <th className="pb-1 font-medium">A<sub>n</sub></th>
                      <th className="pb-1 font-medium">U</th>
                      <th className="pb-1 font-medium pr-1">H (W/K)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fabricRows.map((r) => (
                      <tr key={r.ref} className="border-b border-slate-800/60 hover:bg-slate-800/40">
                        <td className="py-0.5 pl-1 text-slate-500 font-mono">{r.ref}</td>
                        <td className="py-0.5 text-slate-300 max-w-[80px] truncate" title={r.element}>{r.element}</td>
                        <td className="py-0.5 text-right text-slate-400">{fmt(r.grossArea, 1)}</td>
                        <td className="py-0.5 text-right text-slate-500">{r.openingArea > 0 ? fmt(r.openingArea, 1) : '—'}</td>
                        <td className="py-0.5 text-right text-slate-200">{fmt(r.netArea, 1)}</td>
                        <td className="py-0.5 text-right text-slate-400">{r.uValue > 0 ? fmt(r.uValue) : '—'}</td>
                        <td className="py-0.5 text-right font-medium pr-1 text-amber-300">{r.heatLossArea > 0 ? fmt(r.heatLossArea * r.uValue, 1) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-slate-600">
                      <td colSpan={6} className="pt-1.5 pl-1 text-xs text-slate-400 font-medium">Total fabric heat loss</td>
                      <td className="pt-1.5 pr-1 text-right font-bold text-amber-300">{fmt(totalHeatLoss, 1)} W/K</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <div className="text-xs text-slate-600 mt-1">
                A<sub>g</sub>=gross · A<sub>op</sub>=openings · A<sub>n</sub>=net · U=W/m²K · H=heat loss<br />
                U-values are defaults — assign constructions to refine.
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
