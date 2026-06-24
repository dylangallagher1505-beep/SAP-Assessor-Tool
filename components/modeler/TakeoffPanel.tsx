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
  heatLossArea: number
}

function buildFabricSchedule(stories: ReturnType<typeof useModelerStore.getState>['stories'], roofConfig: ReturnType<typeof useModelerStore.getState>['roofConfig']): FabricRow[] {
  const rows: FabricRow[] = []
  let wallRef = 1

  for (let si = 0; si < stories.length; si++) {
    const story = stories[si]
    if (story.walls.length === 0) continue

    const floorPolygons = story.rooms.length > 0
      ? story.rooms.map(r => r.polygon)
      : story.footprintPolygon.length >= 3 ? [story.footprintPolygon] : []
    const totalFloorArea = floorPolygons.reduce((s, p) => s + polygonArea(p), 0)
    if (totalFloorArea > 0) {
      const isGround = si === 0
      rows.push({
        ref: `F${wallRef}`,
        element: `${story.name} Floor`,
        type: isGround ? 'Ground Floor' : 'Internal Floor',
        grossArea: totalFloorArea, openingArea: 0, netArea: totalFloorArea,
        uValue: isGround ? 0.25 : 0,
        heatLossArea: isGround ? totalFloorArea : 0,
      })
    }

    for (const wall of story.walls) {
      const len = wallLength(wall.start, wall.end)
      if (len < 0.05) continue
      const grossWallArea = len * story.storyHeight
      const wallOpenings = story.openings.filter(o => o.wallId === wall.id)
      const openingArea = wallOpenings.reduce((s, o) => s + o.width * o.height, 0)
      const netArea = Math.max(0, grossWallArea - openingArea)
      const wType = wall.wallType ?? 'external'
      const uVal = wall.uValue ?? 0.18
      const isHeatLoss = wType === 'external'
      const typeLabel = wType === 'party' ? 'Party Wall' : wType === 'internal' ? 'Internal Wall' : 'External Wall'

      rows.push({
        ref: `W${wallRef}`,
        element: wall.name || `${story.name} Wall ${wallRef}`,
        type: typeLabel,
        grossArea: grossWallArea, openingArea, netArea,
        uValue: uVal,
        heatLossArea: isHeatLoss ? netArea : 0,
      })

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

    const isTop = si === stories.length - 1
    const ceilArea = floorPolygons.reduce((s, p) => s + polygonArea(p), 0)
    if (!isTop && ceilArea > 0) {
      rows.push({
        ref: `C${wallRef}`,
        element: `${story.name} Ceiling`,
        type: 'Internal Ceiling',
        grossArea: ceilArea, openingArea: 0, netArea: ceilArea,
        uValue: 0, heatLossArea: 0,
      })
    }
  }

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
  const allWindows = stories.flatMap(s => s.openings.filter(o => o.type === 'window'))
  const totalWindowArea = allWindows.reduce((s, o) => s + o.width * o.height, 0)
  const totalDoorArea = stories.flatMap(s => s.openings.filter(o => o.type === 'door')).reduce((s, o) => s + o.width * o.height, 0)
  const effectiveSolarArea = allWindows.reduce((s, o) => s + o.width * o.height * (o.gValue ?? 0.63) * 0.9, 0)

  return (
    <div className="flex flex-col gap-3 p-3 bg-white border border-gray-200 rounded-xl text-sm h-full overflow-y-auto shadow-sm">
      <div className="font-semibold text-gray-800 flex items-center gap-2">
        <Ruler size={15} /> Takeoff
      </div>

      {/* Tab switcher */}
      <div className="flex rounded-lg overflow-hidden border border-gray-200 text-xs">
        <button onClick={() => setTab('summary')} className={`flex-1 py-1 font-medium ${tab === 'summary' ? 'bg-blue-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>Summary</button>
        <button onClick={() => setTab('schedule')} className={`flex-1 py-1 font-medium ${tab === 'schedule' ? 'bg-blue-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>SAP Schedule</button>
      </div>

      {tab === 'summary' && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-2">
              <div className="text-xs text-blue-600">Total Floor Area</div>
              <div className="text-lg font-bold text-blue-800">{fmt(totalFloor)} m²</div>
            </div>
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-2">
              <div className="text-xs text-gray-500">Gross Wall Area</div>
              <div className="text-lg font-bold text-gray-800">{fmt(totalWall)} m²</div>
            </div>
            <div className="bg-sky-50 border border-sky-200 rounded-lg p-2">
              <div className="text-xs text-sky-600">Windows</div>
              <div className="text-lg font-bold text-sky-800">{fmt(totalWindowArea)} m²</div>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-2">
              <div className="text-xs text-amber-600">Doors</div>
              <div className="text-lg font-bold text-amber-800">{fmt(totalDoorArea)} m²</div>
            </div>
            {effectiveSolarArea > 0 && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-2 col-span-2">
                <div className="text-xs text-yellow-600">Effective Solar Area (0.9×A×g)</div>
                <div className="text-lg font-bold text-yellow-800">{fmt(effectiveSolarArea)} m²</div>
              </div>
            )}
          </div>

          {/* Per-story */}
          <div>
            <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500 mb-2">
              <Layers size={12} /> Per Storey
            </div>
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="text-gray-500 border-b border-gray-200">
                  <th className="text-left pb-1">Storey</th>
                  <th className="text-right pb-1">Floor</th>
                  <th className="text-right pb-1">Perim</th>
                  <th className="text-right pb-1">Wall</th>
                </tr>
              </thead>
              <tbody>
                {storyTakeoffs.map((t) => (
                  <tr key={t.storyId} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-1 text-gray-700">{t.storyName}</td>
                    <td className="py-1 text-right text-gray-800">{fmt(t.floorArea)}</td>
                    <td className="py-1 text-right text-gray-500">{fmt(t.wallSurfaceArea / (stories.find(s => s.id === t.storyId)?.storyHeight ?? 2.5))}m</td>
                    <td className="py-1 text-right text-gray-800">{fmt(t.wallSurfaceArea)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="text-xs text-gray-400 mt-1">Floor m² · Perimeter m · Wall m²</div>
          </div>

          {/* Roof */}
          {roofTakeoff && (
            <div>
              <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500 mb-2">
                <Home size={12} /> Roof ({roofTakeoff.type})
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-2 mb-2">
                <div className="text-xs text-slate-500">Total Roof Area</div>
                <div className="text-lg font-bold text-slate-700">{fmt(roofTakeoff.totalArea)} m²</div>
              </div>
              <table className="w-full text-xs border-collapse">
                <tbody>
                  {roofTakeoff.planes.map((p, i) => (
                    <tr key={i} className="border-b border-gray-100">
                      <td className="py-1 text-gray-500">{p.label}</td>
                      <td className="py-1 text-right text-gray-700">{fmt(p.area)} m²</td>
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
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500">
              <Table size={12} /> SAP 10.2 Fabric Schedule
            </div>
            <button
              onClick={() => exportCSV(fabricRows)}
              className="flex items-center gap-1 text-xs text-green-600 hover:text-green-700"
            >
              <Download size={11} /> CSV
            </button>
          </div>

          {fabricRows.length === 0 ? (
            <div className="text-xs text-gray-400 italic">Draw a room to generate the schedule.</div>
          ) : (
            <>
              <div className="overflow-x-auto -mx-1">
                <table className="w-full text-xs border-collapse min-w-full">
                  <thead>
                    <tr className="text-gray-500 border-b border-gray-200 text-right">
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
                      <tr key={r.ref} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-0.5 pl-1 text-gray-400 font-mono">{r.ref}</td>
                        <td className="py-0.5 text-gray-700 max-w-[80px] truncate" title={r.element}>{r.element}</td>
                        <td className="py-0.5 text-right text-gray-500">{fmt(r.grossArea, 1)}</td>
                        <td className="py-0.5 text-right text-gray-400">{r.openingArea > 0 ? fmt(r.openingArea, 1) : '—'}</td>
                        <td className="py-0.5 text-right text-gray-700">{fmt(r.netArea, 1)}</td>
                        <td className="py-0.5 text-right text-gray-500">{r.uValue > 0 ? fmt(r.uValue) : '—'}</td>
                        <td className="py-0.5 text-right font-medium pr-1 text-amber-600">{r.heatLossArea > 0 ? fmt(r.heatLossArea * r.uValue, 1) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-gray-300">
                      <td colSpan={6} className="pt-1.5 pl-1 text-xs text-gray-500 font-medium">Total fabric heat loss</td>
                      <td className="pt-1.5 pr-1 text-right font-bold text-amber-600">{fmt(fabricRows.reduce((s, r) => s + r.heatLossArea * r.uValue, 0), 1)} W/K</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <div className="text-xs text-gray-400 mt-1">
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
