'use client'
import { useMemo, useState } from 'react'
import { Spline, Info, PlusCircle, Trash2 } from 'lucide-react'
import { useModelerStore } from '@/lib/modelerStore'
import { calcStoryTakeoff, calcRoofTakeoff } from '@/lib/takeoffCalc'
import {
  JUNCTION_DEFS, deriveJunctionLengths, calcHTB, yValueHTB, Y_VALUE_OPTIONS,
  type JunctionRow,
} from '@/lib/thermalBridges'

interface CustomRow { id: string; label: string; length: number; psi: number }

export default function ThermalBridges() {
  const { stories, roofConfig } = useModelerStore()
  const [psi, setPsi] = useState<Record<string, number>>(
    () => Object.fromEntries(JUNCTION_DEFS.map((d) => [d.key, d.defaultPsi]))
  )
  const [custom, setCustom] = useState<CustomRow[]>([])
  const [y, setY] = useState(0.15)

  // Live-derived junction lengths from the current geometry
  const lengths = useMemo(() => deriveJunctionLengths(stories, roofConfig), [stories, roofConfig])

  const rows: JunctionRow[] = useMemo(
    () => JUNCTION_DEFS
      .map((d) => ({ key: d.key, ref: d.ref, label: d.label, length: lengths[d.key] ?? 0, psi: psi[d.key] ?? d.defaultPsi, derived: true }))
      .filter((r) => r.length > 0.01),
    [lengths, psi]
  )

  const customRows: JunctionRow[] = custom.map((c) => ({ key: c.id, ref: '—', label: c.label || 'Custom junction', length: c.length, psi: c.psi, derived: false }))
  const allRows = [...rows, ...customRows]
  const htbLinear = calcHTB(allRows)

  // Exposed envelope area for the flat y-value method
  const exposedArea = useMemo(() => {
    let a = 0
    stories.forEach((st, i) => {
      const t = calcStoryTakeoff(st)
      a += t.externalWallArea
      if (i === 0) a += t.floorArea // ground floor
    })
    const top = stories[stories.length - 1]
    if (top && top.footprintPolygon.length >= 3) {
      const rt = calcRoofTakeoff(top, roofConfig)
      a += rt.totalArea + rt.gableWallArea
    }
    return a
  }, [stories, roofConfig])

  const htbY = yValueHTB(exposedArea, y)

  const totalLen = allRows.reduce((s, r) => s + r.length, 0)

  return (
    <div className="flex flex-col gap-3 h-full overflow-y-auto text-sm">
      <div className="flex items-start gap-1.5 text-[11px] text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5">
        <Info size={12} className="mt-0.5 shrink-0 text-emerald-600" />
        <span>Junction <b>lengths are measured from your model</b>. ψ-values are indicative SAP defaults — confirm each against the actual construction or Accredited Construction Details.</span>
      </div>

      {allRows.length === 0 ? (
        <div className="text-xs text-gray-400 italic px-1">Draw a room (and add openings) to measure thermal-bridge junctions.</div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-3 py-2 border-b border-gray-100 text-[10px] text-gray-400 font-medium grid grid-cols-[1fr_52px_60px_60px_20px] gap-1.5 items-center uppercase tracking-wide">
            <span>Junction</span>
            <span className="text-right">L (m)</span>
            <span className="text-right">ψ W/mK</span>
            <span className="text-right">W/K</span>
            <span />
          </div>

          {rows.map((r) => (
            <div key={r.key} className="px-3 py-1.5 border-b border-gray-100 grid grid-cols-[1fr_52px_60px_60px_20px] gap-1.5 items-center text-xs hover:bg-gray-50">
              <span className="text-gray-700 truncate">
                <span className="text-[9px] text-gray-400 font-mono mr-1">{r.ref}</span>{r.label}
              </span>
              <span className="text-right font-mono text-gray-500">{r.length.toFixed(2)}</span>
              <input
                type="number" step="0.01"
                value={psi[r.key]}
                onChange={(e) => setPsi((p) => ({ ...p, [r.key]: parseFloat(e.target.value) || 0 }))}
                className="w-full bg-white border border-gray-200 rounded px-1 py-0.5 text-xs text-right font-mono focus:outline-none focus:border-emerald-500"
              />
              <span className="text-right font-mono text-gray-700">{(r.length * r.psi).toFixed(2)}</span>
              <span />
            </div>
          ))}

          {customRows.map((r, i) => (
            <div key={r.key} className="px-3 py-1.5 border-b border-gray-100 grid grid-cols-[1fr_52px_60px_60px_20px] gap-1.5 items-center text-xs bg-emerald-50/40">
              <input
                value={custom[i].label}
                placeholder="Custom junction"
                onChange={(e) => setCustom((c) => c.map((x, j) => j === i ? { ...x, label: e.target.value } : x))}
                className="bg-transparent text-xs text-gray-700 focus:outline-none w-full"
              />
              <input
                type="number" step="0.1" value={custom[i].length}
                onChange={(e) => setCustom((c) => c.map((x, j) => j === i ? { ...x, length: parseFloat(e.target.value) || 0 } : x))}
                className="w-full bg-white border border-gray-200 rounded px-1 py-0.5 text-xs text-right font-mono focus:outline-none focus:border-emerald-500"
              />
              <input
                type="number" step="0.01" value={custom[i].psi}
                onChange={(e) => setCustom((c) => c.map((x, j) => j === i ? { ...x, psi: parseFloat(e.target.value) || 0 } : x))}
                className="w-full bg-white border border-gray-200 rounded px-1 py-0.5 text-xs text-right font-mono focus:outline-none focus:border-emerald-500"
              />
              <span className="text-right font-mono text-gray-700">{(r.length * r.psi).toFixed(2)}</span>
              <button onClick={() => setCustom((c) => c.filter((_, j) => j !== i))} className="text-gray-300 hover:text-red-500"><Trash2 size={11} /></button>
            </div>
          ))}

          <div className="px-3 py-2 flex items-center justify-between">
            <button
              onClick={() => setCustom((c) => [...c, { id: `c${Date.now()}`, label: '', length: 0, psi: 0.05 }])}
              className="flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-800"
            >
              <PlusCircle size={12} /> Add junction
            </button>
            <span className="text-[10px] text-gray-400 font-mono">Σ {totalLen.toFixed(1)} m</span>
          </div>
        </div>
      )}

      {/* Result */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm px-4 py-3 flex flex-col gap-3">
        <div className="flex items-end gap-3">
          <Spline size={20} className="text-emerald-600 mb-1" />
          <div>
            <div className="text-[10px] text-gray-400 uppercase tracking-wide">HTB — linear method (Σ L×ψ)</div>
            <div className="text-3xl font-bold font-mono text-emerald-700">{htbLinear.toFixed(1)}<span className="text-sm font-semibold text-gray-400 ml-1">W/K</span></div>
          </div>
        </div>

        {/* y-value cross-check */}
        <div className="border-t border-gray-100 pt-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-gray-400 uppercase tracking-wide">Simplified y-value cross-check</span>
            <div className="flex gap-0.5 p-0.5 rounded-lg bg-emerald-950/5 text-[10px]">
              {Y_VALUE_OPTIONS.map((o) => (
                <button
                  key={o.y}
                  onClick={() => setY(o.y)}
                  className={`px-1.5 py-0.5 rounded-md font-semibold ${y === o.y ? 'bg-white text-emerald-800 shadow-sm' : 'text-gray-500'}`}
                >{o.y}</button>
              ))}
            </div>
          </div>
          <div className="flex items-baseline justify-between text-xs text-gray-500">
            <span>y × ΣA = {y} × {exposedArea.toFixed(1)} m²</span>
            <span className="font-mono font-semibold text-gray-700">{htbY.toFixed(1)} W/K</span>
          </div>
          <p className="text-[10px] text-gray-400 mt-1">
            SAP lets you use the flat y-value instead of itemised junctions. The itemised total above is usually lower when good detailing is evidenced.
          </p>
        </div>
      </div>
    </div>
  )
}
