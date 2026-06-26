'use client'
import { useState, useRef } from 'react'
import { PlusCircle, Trash2, Upload, FileText, Calculator, ChevronDown, ChevronRight, AlertTriangle } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

type HeatFlow = 'horizontal' | 'upward' | 'downward'

interface Layer {
  id: string
  description: string
  thickness_mm: number | null
  lambda: number | null      // conductivity W/mK — use this OR resistance
  resistance: number | null  // fixed R m²K/W
  notes: string
}

// ISO 6946 surface resistances
const RSI: Record<HeatFlow, number> = { horizontal: 0.13, upward: 0.10, downward: 0.17 }
const RSE: Record<HeatFlow, number> = { horizontal: 0.04, upward: 0.04, downward: 0.04 }

function uid() { return Math.random().toString(36).slice(2, 8) }

function emptyLayer(): Layer {
  return { id: uid(), description: '', thickness_mm: null, lambda: null, resistance: null, notes: '' }
}

function calcR(layer: Layer): number | null {
  if (layer.resistance !== null) return layer.resistance
  if (layer.lambda !== null && layer.lambda > 0 && layer.thickness_mm !== null && layer.thickness_mm > 0) {
    return (layer.thickness_mm / 1000) / layer.lambda
  }
  return null
}

function calcUValue(layers: Layer[], heatFlow: HeatFlow): { u: number; rtotal: number; valid: boolean; unknowns: string[] } {
  const unknowns: string[] = []
  let rtotal = RSI[heatFlow] + RSE[heatFlow]
  for (const l of layers) {
    const r = calcR(l)
    if (r === null) {
      unknowns.push(l.description || 'unnamed layer')
    } else {
      rtotal += r
    }
  }
  return { u: 1 / rtotal, rtotal, valid: unknowns.length === 0, unknowns }
}

// Default wall construction (typical UK timber frame, ~0.18 W/m²K)
const DEFAULT_LAYERS: Omit<Layer, 'id'>[] = [
  { description: 'Brick outer leaf', thickness_mm: 102, lambda: 0.77, resistance: null, notes: '' },
  { description: 'Cavity (unventilated)', thickness_mm: null, lambda: null, resistance: 0.18, notes: '' },
  { description: 'Mineral wool insulation', thickness_mm: 100, lambda: 0.038, resistance: null, notes: '' },
  { description: 'Plasterboard', thickness_mm: 12.5, lambda: 0.21, resistance: null, notes: '' },
]

function defaultLayers(): Layer[] {
  return DEFAULT_LAYERS.map(l => ({ ...l, id: uid() }))
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function UValueCalculator() {
  const [layers, setLayers] = useState<Layer[]>(defaultLayers())
  const [heatFlow, setHeatFlow] = useState<HeatFlow>('horizontal')
  const [specText, setSpecText] = useState('')
  const [parsing, setParsing] = useState(false)
  const [parseError, setParseError] = useState('')
  const [inputOpen, setInputOpen] = useState(true)
  const fileRef = useRef<HTMLInputElement>(null)

  // ── Layer helpers ─────────────────────────────────────────────────────────

  function updateLayer(id: string, patch: Partial<Layer>) {
    setLayers(prev => prev.map(l => l.id === id ? { ...l, ...patch } : l))
  }

  function removeLayer(id: string) {
    setLayers(prev => prev.filter(l => l.id !== id))
  }

  function addLayer() {
    setLayers(prev => [...prev, emptyLayer()])
  }

  function moveLayer(id: string, dir: -1 | 1) {
    setLayers(prev => {
      const idx = prev.findIndex(l => l.id === id)
      if (idx < 0) return prev
      const next = [...prev]
      const swap = idx + dir
      if (swap < 0 || swap >= next.length) return prev
      ;[next[idx], next[swap]] = [next[swap], next[idx]]
      return next
    })
  }

  // ── Parse API call ────────────────────────────────────────────────────────

  async function parse(imageBase64?: string, mediaType?: string) {
    if (!specText.trim() && !imageBase64) return
    setParsing(true)
    setParseError('')
    try {
      const res = await fetch('/api/parse-spec', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: specText || undefined, imageBase64, mediaType }),
      })
      if (!res.ok) {
        const text = await res.text()
        if (text.includes('ANTHROPIC_API_KEY') || res.status === 500) {
          throw new Error('API key not configured. Add ANTHROPIC_API_KEY to your Vercel environment variables (Settings → Environment Variables), then redeploy.')
        }
        throw new Error(text)
      }
      const data = await res.json()
      if (data.error) {
        if (String(data.error).includes('API key') || String(data.error).includes('authentication')) {
          throw new Error('API key not configured. Add ANTHROPIC_API_KEY to your Vercel environment variables (Settings → Environment Variables), then redeploy.')
        }
        throw new Error(data.error)
      }
      setHeatFlow(data.heatFlowDirection ?? 'horizontal')
      setLayers((data.layers ?? []).map((l: Omit<Layer, 'id'>) => ({ ...l, id: uid() })))
      setInputOpen(false)
    } catch (e) {
      setParseError(String(e))
    } finally {
      setParsing(false)
    }
  }

  function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result as string
      const [header, base64] = dataUrl.split(',')
      const mediaType = header.match(/data:([^;]+)/)?.[1] as 'image/jpeg' | 'image/png' | 'image/webp' | undefined
      if (base64 && mediaType) parse(base64, mediaType)
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  // ── Result ────────────────────────────────────────────────────────────────

  const result = calcUValue(layers, heatFlow)
  const rsi = RSI[heatFlow], rse = RSE[heatFlow]

  const uColor = result.u < 0.11 ? 'text-emerald-600' : result.u < 0.18 ? 'text-blue-600' : result.u < 0.30 ? 'text-amber-600' : 'text-red-600'
  const uLabel = result.u < 0.11 ? 'Passivhaus grade' : result.u < 0.18 ? 'Part L compliant' : result.u < 0.30 ? 'Below Part L' : 'Poor'

  return (
    <div className="flex flex-col gap-3 h-full overflow-y-auto text-sm">

      {/* ── Spec input panel ── */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <button
          className="flex items-center gap-2 w-full px-3 py-2.5 text-left font-semibold text-gray-800"
          onClick={() => setInputOpen(v => !v)}
        >
          {inputOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <Calculator size={14} /> U-Value Calculator
        </button>

        {inputOpen && (
          <div className="px-3 pb-3 flex flex-col gap-2 border-t border-gray-100">
            <p className="text-xs text-gray-400 mt-1">Paste a construction spec or upload a photo of the spec sheet — Claude will extract the layers.</p>

            <textarea
              value={specText}
              onChange={e => setSpecText(e.target.value)}
              placeholder="e.g. EWT-02: Outside — 3mm Zinc, 22mm WBP Plywood, 50mm batten void, 2mm membrane, 12mm OSB, 150mm studs with 120mm Kooltherm (λ=0.019), 90mm Kooltherm continuous (λ=0.019), 11mm OSB, 22mm batten, VCL, 25mm plasterboard — Inside"
              rows={4}
              className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-xs text-gray-700 resize-none focus:outline-none focus:border-blue-400 bg-gray-50"
            />

            <div className="flex gap-2">
              <button
                onClick={() => parse()}
                disabled={parsing || !specText.trim()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                <FileText size={12} />
                {parsing ? 'Reading…' : 'Parse text'}
              </button>

              <button
                onClick={() => fileRef.current?.click()}
                disabled={parsing}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-gray-200 text-gray-600 text-xs font-medium hover:bg-gray-50 disabled:opacity-50"
              >
                <Upload size={12} /> Upload image
              </button>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
            </div>

            {parseError && (
              <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1">{parseError}</div>
            )}
          </div>
        )}
      </div>

      {/* ── Heat flow direction ── */}
      <div className="flex items-center gap-2 text-xs">
        <span className="text-gray-500 shrink-0">Element type</span>
        {(['horizontal', 'upward', 'downward'] as HeatFlow[]).map(hf => (
          <button
            key={hf}
            onClick={() => setHeatFlow(hf)}
            className={`px-2.5 py-1 rounded-lg border text-xs font-medium transition-colors ${heatFlow === hf ? 'bg-blue-600 text-white border-blue-600' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'}`}
          >
            {hf === 'horizontal' ? 'Wall' : hf === 'upward' ? 'Floor / Ground' : 'Roof / Ceiling'}
          </button>
        ))}
      </div>

      {/* ── Layer table ── */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-3 py-2 border-b border-gray-100 text-xs text-gray-400 font-medium grid grid-cols-[1fr_52px_72px_72px_20px_20px] gap-1.5 items-center">
          <span>Layer (outside → inside)</span>
          <span className="text-center">mm</span>
          <span className="text-center">λ W/mK</span>
          <span className="text-center">R m²K/W</span>
          <span />
          <span />
        </div>

        {/* Rse row */}
        <div className="px-3 py-1.5 border-b border-gray-100 bg-slate-50 grid grid-cols-[1fr_52px_72px_72px_20px_20px] gap-1.5 items-center text-xs text-gray-400 italic">
          <span>External surface resistance (Rse)</span>
          <span />
          <span />
          <span className="text-center">{rse.toFixed(2)}</span>
          <span /><span />
        </div>

        {layers.map((layer, idx) => {
          const r = calcR(layer)
          return (
            <div key={layer.id} className="px-3 py-1.5 border-b border-gray-100 grid grid-cols-[1fr_52px_72px_72px_20px_20px] gap-1.5 items-center hover:bg-gray-50 group">
              <input
                value={layer.description}
                onChange={e => updateLayer(layer.id, { description: e.target.value })}
                placeholder="Layer description"
                className="bg-transparent focus:outline-none text-xs text-gray-700 w-full"
              />
              <input
                type="number" step="1" min="0"
                value={layer.thickness_mm ?? ''}
                onChange={e => updateLayer(layer.id, { thickness_mm: e.target.value ? parseFloat(e.target.value) : null, resistance: null })}
                placeholder="—"
                className="w-full bg-white border border-gray-200 rounded px-1.5 py-0.5 text-xs text-center focus:outline-none focus:border-blue-400"
              />
              <input
                type="number" step="0.001" min="0"
                value={layer.lambda ?? ''}
                onChange={e => updateLayer(layer.id, { lambda: e.target.value ? parseFloat(e.target.value) : null, resistance: null })}
                placeholder="—"
                className="w-full bg-white border border-gray-200 rounded px-1.5 py-0.5 text-xs text-center focus:outline-none focus:border-blue-400"
              />
              <input
                type="number" step="0.01" min="0"
                value={layer.resistance ?? (layer.lambda === null && layer.thickness_mm === null ? '' : '')}
                placeholder={r !== null ? r.toFixed(3) : '—'}
                onChange={e => updateLayer(layer.id, { resistance: e.target.value ? parseFloat(e.target.value) : null, lambda: null, thickness_mm: null })}
                className="w-full bg-white border border-gray-200 rounded px-1.5 py-0.5 text-xs text-center focus:outline-none focus:border-blue-400"
              />
              <button onClick={() => moveLayer(layer.id, idx === 0 ? 1 : -1)} className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-gray-600 text-xs">
                {idx === 0 ? '↓' : '↑'}
              </button>
              <button onClick={() => removeLayer(layer.id)} className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500">
                <Trash2 size={11} />
              </button>
            </div>
          )
        })}

        {/* Rsi row */}
        <div className="px-3 py-1.5 border-b border-gray-100 bg-slate-50 grid grid-cols-[1fr_52px_72px_72px_20px_20px] gap-1.5 items-center text-xs text-gray-400 italic">
          <span>Internal surface resistance (Rsi)</span>
          <span />
          <span />
          <span className="text-center">{rsi.toFixed(2)}</span>
          <span /><span />
        </div>

        <div className="px-3 py-2 flex items-center gap-3">
          <button
            onClick={addLayer}
            className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
          >
            <PlusCircle size={12} /> Add layer
          </button>
          <button
            onClick={() => setLayers(defaultLayers())}
            className="text-xs text-gray-400 hover:text-gray-600"
          >
            Reset example
          </button>
          <button
            onClick={() => setLayers([emptyLayer()])}
            className="text-xs text-gray-400 hover:text-gray-600"
          >
            Clear all
          </button>
        </div>
      </div>

      {/* ── Result ── */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm px-4 py-3 flex flex-col gap-2">
        {result.unknowns.length > 0 && (
          <div className="flex items-start gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
            <AlertTriangle size={12} className="mt-0.5 shrink-0" />
            <span>Missing values in: {result.unknowns.join(', ')} — result is approximate.</span>
          </div>
        )}

        <div className="flex items-end gap-4">
          <div>
            <div className="text-xs text-gray-400 mb-0.5">U-value</div>
            <div className={`text-3xl font-bold font-mono ${uColor}`}>{result.u.toFixed(3)}</div>
            <div className="text-xs text-gray-400">W/m²K</div>
          </div>
          <div className="flex flex-col gap-1 text-xs pb-1">
            <span className={`font-semibold ${uColor}`}>{uLabel}</span>
            <span className="text-gray-400">Total R = {result.rtotal.toFixed(3)} m²K/W</span>
            <span className="text-gray-400">Thickness = {layers.reduce((s, l) => s + (l.thickness_mm ?? 0), 0)} mm</span>
          </div>
        </div>

        {/* Benchmark bars */}
        <div className="flex flex-col gap-1 mt-1">
          {[
            { label: 'Passivhaus ≤0.10', limit: 0.10 },
            { label: 'Part L ≤0.18', limit: 0.18 },
            { label: 'Part L max 0.30', limit: 0.30 },
          ].map(({ label, limit }) => (
            <div key={label} className="flex items-center gap-2 text-xs">
              <span className="w-28 text-gray-400 shrink-0">{label}</span>
              <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                <div
                  className={`h-full rounded-full ${result.u <= limit ? 'bg-emerald-500' : 'bg-red-400'}`}
                  style={{ width: `${Math.min(100, (result.u / limit) * 100)}%` }}
                />
              </div>
              <span className={`text-[10px] font-medium ${result.u <= limit ? 'text-emerald-600' : 'text-red-500'}`}>
                {result.u <= limit ? '✓' : '✗'}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
