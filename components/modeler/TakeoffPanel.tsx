'use client'
import { useMemo, useState } from 'react'
import { useModelerStore } from '@/lib/modelerStore'
import { calcStoryTakeoff, calcRoofTakeoff, polygonArea } from '@/lib/takeoffCalc'
import { computeAdjacencies } from '@/lib/adjacency'
import { Ruler, Layers, Home, Table, Download } from 'lucide-react'
import UValueCalculator from '@/components/uvalue/UValueCalculator'

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

    const adj = computeAdjacencies(story.walls)

    for (const wall of story.walls) {
      const len = wallLength(wall.start, wall.end)
      if (len < 0.05) continue
      const hl = wall.heightLeft ?? story.storyHeight
      const hr = wall.heightRight ?? story.storyHeight
      const avgH = (hl + hr) / 2
      const grossWallArea = avgH * len
      const wallOpenings = story.openings.filter(o => o.wallId === wall.id)
      const openingArea = wallOpenings.reduce((s, o) => s + o.width * o.height, 0)
      const uVal = wall.uValue ?? 0.18

      // Adjacency: how much of this wall is shared with a neighbouring room
      const a = adj.get(wall.id)
      const sharedLen = a?.sharedLength ?? 0
      const exposedLen = a?.exposedLength ?? len
      const manualType = wall.wallType ?? 'external'
      // A manually-set party/internal wall overrides auto-detection entirely
      const forcedNonExternal = manualType === 'party' || manualType === 'internal'
      const autoInternal = !forcedNonExternal && sharedLen >= len - 0.1

      if (forcedNonExternal || autoInternal) {
        // Whole wall is a partition / party wall — no external heat loss
        const typeLabel = manualType === 'party' ? 'Party Wall' : autoInternal ? 'Internal Partition (auto)' : 'Internal Wall'
        rows.push({
          ref: `W${wallRef}`,
          element: wall.name || `${story.name} Wall ${wallRef}`,
          type: typeLabel,
          grossArea: grossWallArea, openingArea, netArea: Math.max(0, grossWallArea - openingArea),
          uValue: manualType === 'party' ? uVal : 0,
          heatLossArea: 0,
        })
      } else {
        // External wall — only the exposed portion loses heat; any shared
        // portion (partial adjacency) is split off as an internal partition
        const exposedGross = avgH * exposedLen
        const exposedNet = Math.max(0, exposedGross - openingArea)
        rows.push({
          ref: `W${wallRef}`,
          element: wall.name || `${story.name} Wall ${wallRef}`,
          type: sharedLen > 0.1 ? 'External Wall (part shared)' : 'External Wall',
          grossArea: exposedGross, openingArea, netArea: exposedNet,
          uValue: uVal,
          heatLossArea: exposedNet,
        })
        if (sharedLen > 0.1) {
          rows.push({
            ref: `W${wallRef}i`,
            element: `${wall.name || `Wall ${wallRef}`} — shared`,
            type: 'Internal Partition (auto)',
            grossArea: avgH * sharedLen, openingArea: 0, netArea: avgH * sharedLen,
            uValue: 0, heatLossArea: 0,
          })
        }
      }

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
    // Gable-end triangles are wall fabric, not roof
    if (rt.gableWallArea > 0.01) {
      rows.push({
        ref: 'W-G',
        element: 'Gable ends',
        type: 'External Wall',
        grossArea: rt.gableWallArea, openingArea: 0, netArea: rt.gableWallArea,
        uValue: 0.18,
        heatLossArea: rt.gableWallArea,
      })
    }
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
  const [tab, setTab] = useState<'summary' | 'schedule' | 'uvalue'>('summary')

  const storyTakeoffs = useMemo(() => stories.map(calcStoryTakeoff), [stories])
  const roofTakeoff = useMemo(() => {
    const top = stories[stories.length - 1]
    if (!top) return null
    return calcRoofTakeoff(top, roofConfig)
  }, [stories, roofConfig])

  const fabricRows = useMemo(() => buildFabricSchedule(stories, roofConfig), [stories, roofConfig])

  const totalFloor = storyTakeoffs.reduce((s, t) => s + t.floorArea, 0)
  const totalWall = storyTakeoffs.reduce((s, t) => s + t.externalWallArea, 0)
  const totalInternalWall = storyTakeoffs.reduce((s, t) => s + t.internalWallArea, 0)
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
      <div className="flex gap-0.5 p-0.5 rounded-lg bg-emerald-950/5 border border-emerald-950/5 text-xs">
        {([
          { id: 'summary', label: 'Summary' },
          { id: 'schedule', label: 'Schedule' },
          { id: 'uvalue', label: 'U-Value' },
        ] as const).map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex-1 py-1 rounded-md font-semibold whitespace-nowrap transition-all ${
              tab === id ? 'bg-white text-emerald-800 shadow-[0_1px_4px_rgba(12,42,31,0.12)]' : 'text-gray-500 hover:text-emerald-800'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'summary' && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-2">
              <div className="text-[10px] font-medium text-emerald-700 uppercase tracking-wide">Floor Area</div>
              <div className="text-lg font-bold text-emerald-900 whitespace-nowrap">{fmt(totalFloor)}<span className="text-[10px] font-semibold text-emerald-600 ml-0.5">m²</span></div>
            </div>
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-2">
              <div className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">External Wall</div>
              <div className="text-lg font-bold text-gray-800 whitespace-nowrap">{fmt(totalWall)}<span className="text-[10px] font-semibold text-gray-400 ml-0.5">m²</span></div>
              {totalInternalWall > 0.1 && <div className="text-[9px] text-gray-400 mt-0.5">+{fmt(totalInternalWall)} internal</div>}
            </div>
            <div className="bg-sky-50 border border-sky-200 rounded-lg p-2">
              <div className="text-[10px] font-medium text-sky-600 uppercase tracking-wide">Windows</div>
              <div className="text-lg font-bold text-sky-800 whitespace-nowrap">{fmt(totalWindowArea)}<span className="text-[10px] font-semibold text-sky-500 ml-0.5">m²</span></div>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-2">
              <div className="text-[10px] font-medium text-amber-600 uppercase tracking-wide">Doors</div>
              <div className="text-lg font-bold text-amber-800 whitespace-nowrap">{fmt(totalDoorArea)}<span className="text-[10px] font-semibold text-amber-500 ml-0.5">m²</span></div>
            </div>
            {effectiveSolarArea > 0 && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-2 col-span-2">
                <div className="text-[10px] font-medium text-yellow-600 uppercase tracking-wide">Effective Solar Area (0.9×A×g)</div>
                <div className="text-lg font-bold text-yellow-800 whitespace-nowrap">{fmt(effectiveSolarArea)}<span className="text-[10px] font-semibold text-yellow-500 ml-0.5">m²</span></div>
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
                      <td className="py-1 text-gray-500">
                        {p.label}
                        {p.isWall && <span className="ml-1 text-[9px] px-1 py-px rounded bg-gray-100 text-gray-400 font-medium">wall</span>}
                      </td>
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

      {tab === 'uvalue' && (
        <UValueCalculator />
      )}
    </div>
  )
}
