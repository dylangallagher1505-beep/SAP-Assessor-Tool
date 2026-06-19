'use client';

import { useState, useCallback } from 'react';
import { MATERIALS, MATERIAL_CATEGORIES, type Material } from '@/lib/materials';
import {
  calculateUValue,
  uValueColour,
  ELEMENT_TYPE_LABELS,
  type ElementType,
  type LayerInput,
} from '@/lib/uvalue';

const ELEMENT_TYPES = Object.keys(ELEMENT_TYPE_LABELS) as ElementType[];

let idCounter = 0;
function newId() { return `layer-${++idCounter}`; }

function defaultLayer(): LayerInput {
  return { id: newId(), name: '', thicknessMm: 100, lambda: undefined, fixedR: undefined, bridged: false };
}

interface SavedConstruction {
  id: string; name: string; elementType: ElementType; layers: LayerInput[]; uValue: number; totalR: number; savedAt: string;
}

function saveToLibrary(construction: SavedConstruction) {
  const existing = loadLibrary();
  localStorage.setItem('sap-construction-library', JSON.stringify([construction, ...existing.filter((c) => c.id !== construction.id)]));
}

function loadLibrary(): SavedConstruction[] {
  if (typeof window === 'undefined') return [];
  try { return JSON.parse(localStorage.getItem('sap-construction-library') || '[]'); } catch { return []; }
}

const RAG_PANEL: Record<'green' | 'amber' | 'red', React.CSSProperties> = {
  green: { background: '#f0fdf4', color: '#16a34a', border: '4px solid #16a34a' },
  amber: { background: '#fffbeb', color: '#d97706', border: '4px solid #d97706' },
  red:   { background: '#fef2f2', color: '#dc2626', border: '4px solid #dc2626' },
};

export default function UValueCalculator() {
  const [elementType, setElementType] = useState<ElementType>('wall');
  const [constructionName, setConstructionName] = useState('');
  const [layers, setLayers] = useState<LayerInput[]>([defaultLayer()]);
  const [savedMessage, setSavedMessage] = useState('');

  const result = calculateUValue(elementType, layers);
  const addLayer = useCallback(() => setLayers((p) => [...p, defaultLayer()]), []);
  const removeLayer = useCallback((id: string) => setLayers((p) => p.filter((l) => l.id !== id)), []);
  const moveLayer = useCallback((id: string, dir: -1 | 1) => {
    setLayers((p) => {
      const idx = p.findIndex((l) => l.id === id); if (idx < 0) return p;
      const n = [...p]; const swap = idx + dir;
      if (swap < 0 || swap >= n.length) return p;
      [n[idx], n[swap]] = [n[swap], n[idx]]; return n;
    });
  }, []);
  const updateLayer = useCallback((id: string, patch: Partial<LayerInput>) =>
    setLayers((p) => p.map((l) => (l.id === id ? { ...l, ...patch } : l))), []);
  const selectMaterial = useCallback((id: string, mat: Material) =>
    updateLayer(id, { name: mat.name, lambda: mat.lambda, fixedR: mat.fixedR, thicknessMm: mat.fixedR ? 0 : 100 }), [updateLayer]);

  const handleSave = () => {
    if (!constructionName.trim()) { alert('Please enter a construction name before saving.'); return; }
    const saved: SavedConstruction = { id: `${Date.now()}`, name: constructionName.trim(), elementType, layers: JSON.parse(JSON.stringify(layers)), uValue: result.uValue, totalR: result.totalR, savedAt: new Date().toISOString() };
    saveToLibrary(saved);
    setSavedMessage(`"${saved.name}" saved to library`);
    setTimeout(() => setSavedMessage(''), 3000);
  };

  const colour = uValueColour(result.uValue, elementType);
  const panelStyle = RAG_PANEL[colour];

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div style={{ borderTop: '4px solid #FFD700', paddingTop: '1rem' }}>
        <h1 className="text-3xl font-black" style={{ color: '#0f1729' }}>U-Value Calculator</h1>
        <p className="text-sm mt-1 font-medium" style={{ color: '#64748b' }}>BR443:2019 combined method · SAP 10.2</p>
      </div>

      <div className="rounded-2xl p-5" style={{ background: 'white', border: '2px solid #1e293b' }}>
        <div className="flex flex-wrap gap-4 items-end">
          <div className="flex-1 min-w-48">
            <label className="block text-xs font-black uppercase tracking-widest mb-1.5" style={{ color: '#64748b' }}>Element Type</label>
            <select value={elementType} onChange={(e) => setElementType(e.target.value as ElementType)}
              className="w-full rounded-xl px-3 py-2.5 text-sm font-semibold focus:outline-none"
              style={{ border: '2px solid #e2e8f0', background: 'white', color: '#0f1729' }}>
              {ELEMENT_TYPES.map((t) => <option key={t} value={t}>{ELEMENT_TYPE_LABELS[t]}</option>)}
            </select>
          </div>
          <div className="flex-1 min-w-48">
            <label className="block text-xs font-black uppercase tracking-widest mb-1.5" style={{ color: '#64748b' }}>Construction Name</label>
            <input type="text" value={constructionName} onChange={(e) => setConstructionName(e.target.value)}
              placeholder="e.g. External cavity wall — standard"
              className="w-full rounded-xl px-3 py-2.5 text-sm font-medium focus:outline-none"
              style={{ border: '2px solid #e2e8f0', color: '#0f1729' }} />
          </div>
        </div>
      </div>

      <div className="flex gap-6 items-start">
        <div className="flex-1 space-y-3">
          <SurfaceRow label="External surface resistance (Rso)" value={result.Rso} />
          {layers.map((layer, idx) => (
            <LayerRow key={layer.id} layer={layer} index={idx} total={layers.length}
              onUpdate={(patch) => updateLayer(layer.id, patch)}
              onSelectMaterial={(mat) => selectMaterial(layer.id, mat)}
              onRemove={() => removeLayer(layer.id)}
              onMove={(dir) => moveLayer(layer.id, dir)} />
          ))}
          <SurfaceRow label="Internal surface resistance (Rsi)" value={result.Rsi} />
          <button onClick={addLayer}
            className="w-full rounded-2xl py-4 text-sm font-black transition-all"
            style={{ border: '2px dashed #94a3b8', color: '#64748b', background: 'transparent' }}
            onMouseEnter={(e) => { const b = e.currentTarget; b.style.background = '#1e293b'; b.style.color = 'white'; b.style.borderColor = '#1e293b'; }}
            onMouseLeave={(e) => { const b = e.currentTarget; b.style.background = 'transparent'; b.style.color = '#64748b'; b.style.borderColor = '#94a3b8'; }}>
            + Add Layer
          </button>
        </div>

        <div className="w-72 shrink-0 space-y-4">
          <div className="rounded-2xl p-6 text-center" style={panelStyle}>
            <div className="text-xs font-black uppercase tracking-widest opacity-70 mb-1">U-Value</div>
            <div className="text-6xl font-black leading-none">{result.uValue.toFixed(3)}</div>
            <div className="text-sm font-bold mt-2 opacity-80">W/m²K</div>
          </div>

          <div className="rounded-2xl overflow-hidden" style={{ background: 'white', border: '2px solid #e2e8f0' }}>
            <div className="px-4 py-3" style={{ borderBottom: '2px solid #f1f5f9' }}>
              <span className="text-xs font-black uppercase tracking-widest" style={{ color: '#64748b' }}>R Breakdown</span>
            </div>
            <div>
              <RRow label="Rso (ext. surface)" value={result.Rso} />
              {result.layers.map((lr) => <RRow key={lr.id} label={lr.name || 'Unnamed layer'} value={lr.R} sub={lr.bridgingDetails} />)}
              <RRow label="Rsi (int. surface)" value={result.Rsi} />
              <RRow label="Total R" value={result.totalR} bold />
            </div>
          </div>

          <button onClick={handleSave}
            className="w-full rounded-xl py-3 text-sm font-black transition-all"
            style={{ background: '#0f1729', color: 'white', border: '2px solid #0f1729' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#1e293b'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = '#0f1729'; }}>
            Save to Library
          </button>
          {savedMessage && <p className="text-xs text-center font-bold" style={{ color: '#16a34a' }}>{savedMessage}</p>}
        </div>
      </div>
    </div>
  );
}

function SurfaceRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl px-4 py-3 flex items-center gap-3" style={{ background: '#FFF8F0', border: '2px dashed #e2e8f0', opacity: 0.85 }}>
      <div className="w-5 h-5 rounded" style={{ background: '#cbd5e1' }} />
      <span className="flex-1 text-sm font-semibold" style={{ color: '#64748b' }}>{label}</span>
      <span className="text-sm font-mono font-semibold w-24 text-right" style={{ color: '#94a3b8' }}>{value.toFixed(2)} m²K/W</span>
    </div>
  );
}

function RRow({ label, value, sub, bold }: { label: string; value: number; sub?: string; bold?: boolean }) {
  return (
    <div className="flex items-start px-4 py-2 gap-2" style={bold ? { background: '#f8fafc', fontWeight: 700, borderTop: '1px solid #f1f5f9' } : { borderTop: '1px solid #f8fafc' }}>
      <span className="flex-1 text-xs leading-snug" style={{ color: '#475569' }}>
        {label}{sub && <span className="block font-normal" style={{ color: '#94a3b8' }}>{sub}</span>}
      </span>
      <span className="text-xs font-mono shrink-0" style={{ color: '#334155' }}>{value.toFixed(3)}</span>
    </div>
  );
}

interface LayerRowProps {
  layer: LayerInput; index: number; total: number;
  onUpdate: (patch: Partial<LayerInput>) => void;
  onSelectMaterial: (mat: Material) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}

function LayerRow({ layer, index, total, onUpdate, onSelectMaterial, onRemove, onMove }: LayerRowProps) {
  const [matSearch, setMatSearch] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);

  const filtered = matSearch.length > 0 ? MATERIALS.filter((m) => m.name.toLowerCase().includes(matSearch.toLowerCase())) : MATERIALS;
  const grouped = MATERIAL_CATEGORIES.map((cat) => ({ category: cat, items: filtered.filter((m) => m.category === cat) })).filter((g) => g.items.length > 0);
  const hasFixed = layer.fixedR !== undefined;

  return (
    <div className="rounded-2xl overflow-visible transition-all" style={{ background: 'white', border: '2px solid #e2e8f0' }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = '#94a3b8'; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = '#e2e8f0'; }}>
      <div className="flex items-start gap-3 p-4">
        <div className="flex flex-col gap-0.5 pt-1 shrink-0">
          <button onClick={() => onMove(-1)} disabled={index === 0}
            className="w-6 h-6 flex items-center justify-center rounded hover:bg-slate-100 disabled:opacity-20 text-xs" style={{ color: '#94a3b8' }}>▲</button>
          <button onClick={() => onMove(1)} disabled={index === total - 1}
            className="w-6 h-6 flex items-center justify-center rounded hover:bg-slate-100 disabled:opacity-20 text-xs" style={{ color: '#94a3b8' }}>▼</button>
        </div>
        <div className="w-5 h-5 rounded shrink-0 mt-2" style={{ background: '#60a5fa' }} />
        <div className="flex-1 relative min-w-0">
          <div className="text-xs font-black uppercase tracking-widest mb-1" style={{ color: '#94a3b8' }}>Material</div>
          <button type="button" onClick={() => { setMatSearch(''); setShowDropdown((v) => !v); }}
            onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
            className="w-full rounded-xl px-3 py-2 text-sm text-left flex items-center justify-between gap-2 font-semibold transition-all focus:outline-none"
            style={{ border: '2px solid #e2e8f0', background: 'white', color: layer.name ? '#0f1729' : '#94a3b8' }}>
            <span>{layer.name || 'Select a material…'}</span>
            <span className="text-xs shrink-0" style={{ color: '#94a3b8' }}>▼</span>
          </button>
          {showDropdown && (
            <div className="absolute z-50 top-full left-0 mt-1 rounded-2xl shadow-2xl overflow-hidden"
              style={{ width: 'max(100%, 420px)', background: 'white', border: '2px solid #e2e8f0' }}>
              <div className="p-2" style={{ borderBottom: '1px solid #f1f5f9', background: 'white' }}>
                <input ref={(el) => { el?.focus(); }} type="text" value={matSearch} onChange={(e) => setMatSearch(e.target.value)} onBlur={() => {}}
                  placeholder="Search materials…" autoFocus
                  className="w-full rounded-xl px-3 py-2 text-sm font-medium focus:outline-none"
                  style={{ border: '2px solid #e2e8f0' }} />
              </div>
              <div className="max-h-72 overflow-y-auto">
                <div className="px-4 py-2.5 text-sm font-bold cursor-pointer flex items-center gap-2"
                  style={{ color: '#2563eb', borderBottom: '1px solid #f1f5f9' }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = '#eff6ff'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = ''; }}
                  onMouseDown={() => { onUpdate({ name: 'Custom', lambda: 0.04, fixedR: undefined }); setShowDropdown(false); setMatSearch(''); }}>
                  ✏️ Custom — enter lambda manually
                </div>
                {grouped.length === 0 && (
                  <div className="px-4 py-6 text-sm text-center font-medium" style={{ color: '#94a3b8' }}>No materials match &quot;{matSearch}&quot;</div>
                )}
                {grouped.map((group) => (
                  <div key={group.category}>
                    <div className="px-4 py-2 text-xs font-black uppercase tracking-widest" style={{ color: '#64748b', background: '#f8fafc', borderTop: '1px solid #f1f5f9', borderBottom: '1px solid #f1f5f9' }}>
                      {group.category}
                    </div>
                    {group.items.map((mat) => (
                      <div key={mat.id} className="px-4 py-2.5 text-sm cursor-pointer flex items-center justify-between gap-4" style={{ color: '#334155' }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = '#eff6ff'; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = ''; }}
                        onMouseDown={() => { onSelectMaterial(mat); setShowDropdown(false); setMatSearch(''); }}>
                        <span className="font-medium">{mat.name}</span>
                        <span className="text-xs font-mono shrink-0 px-2 py-0.5 rounded" style={{ background: '#f1f5f9', color: '#64748b' }}>
                          {mat.fixedR !== undefined ? `R = ${mat.fixedR}` : `λ = ${mat.lambda}`}
                        </span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="w-28 shrink-0">
          <div className="text-xs font-black uppercase tracking-widest mb-1" style={{ color: '#94a3b8' }}>λ (W/mK)</div>
          <input type="number" step="0.001" min="0.001" value={hasFixed ? '' : (layer.lambda ?? '')} disabled={hasFixed}
            onChange={(e) => onUpdate({ lambda: parseFloat(e.target.value) || undefined })}
            placeholder={hasFixed ? 'Fixed R' : '0.000'}
            className="w-full rounded-xl px-3 py-2 text-sm font-mono font-semibold focus:outline-none disabled:opacity-40"
            style={{ border: '2px solid #e2e8f0', background: hasFixed ? '#f8fafc' : 'white' }} />
        </div>
        <div className="w-24 shrink-0">
          <div className="text-xs font-black uppercase tracking-widest mb-1" style={{ color: '#94a3b8' }}>Thickness (mm)</div>
          <input type="number" min="0" value={hasFixed ? '' : layer.thicknessMm} disabled={hasFixed}
            onChange={(e) => onUpdate({ thicknessMm: parseInt(e.target.value) || 0 })}
            placeholder={hasFixed ? '—' : 'mm'}
            className="w-full rounded-xl px-3 py-2 text-sm font-mono font-semibold focus:outline-none disabled:opacity-40"
            style={{ border: '2px solid #e2e8f0', background: hasFixed ? '#f8fafc' : 'white' }} />
        </div>
        <div className="w-24 shrink-0">
          <div className="text-xs font-black uppercase tracking-widest mb-1" style={{ color: '#94a3b8' }}>R (m²K/W)</div>
          <div className="rounded-xl px-3 py-2 text-sm font-mono font-semibold" style={{ border: '1px solid #f1f5f9', background: '#f8fafc', color: '#475569' }}>
            {hasFixed ? (layer.fixedR ?? 0).toFixed(3) : layer.lambda && layer.thicknessMm ? ((layer.thicknessMm / 1000) / layer.lambda).toFixed(3) : '—'}
          </div>
        </div>
        <button onClick={onRemove} className="mt-5 text-lg leading-none shrink-0 transition-colors" style={{ color: '#cbd5e1' }} title="Remove layer"
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#ef4444'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#cbd5e1'; }}>✕</button>
      </div>
      <div className="px-4 pb-4 flex items-start gap-4">
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input type="checkbox" checked={layer.bridged} disabled={hasFixed} onChange={(e) => onUpdate({ bridged: e.target.checked })} className="rounded" />
          <span className="text-xs font-medium" style={{ color: '#64748b' }}>Bridged layer (e.g. insulation between studs)</span>
        </label>
        {layer.bridged && !hasFixed && (
          <div className="flex gap-3 flex-wrap">
            <div>
              <div className="text-xs font-semibold mb-1" style={{ color: '#64748b' }}>Bridging material</div>
              <input type="text" value={layer.bridgingMaterial?.name ?? ''}
                onChange={(e) => onUpdate({ bridgingMaterial: { name: e.target.value, lambda: layer.bridgingMaterial?.lambda ?? 0.13 } })}
                placeholder="e.g. Softwood studs"
                className="rounded-lg px-2 py-1.5 text-xs w-36 font-medium focus:outline-none" style={{ border: '2px solid #e2e8f0' }} />
            </div>
            <div>
              <div className="text-xs font-semibold mb-1" style={{ color: '#64748b' }}>λ (W/mK)</div>
              <input type="number" step="0.001" value={layer.bridgingMaterial?.lambda ?? ''}
                onChange={(e) => onUpdate({ bridgingMaterial: { name: layer.bridgingMaterial?.name ?? '', lambda: parseFloat(e.target.value) || 0 } })}
                placeholder="0.130" className="rounded-lg px-2 py-1.5 text-xs w-20 font-mono focus:outline-none" style={{ border: '2px solid #e2e8f0' }} />
            </div>
            <div>
              <div className="text-xs font-semibold mb-1" style={{ color: '#64748b' }}>Bridging fraction %</div>
              <input type="number" min="1" max="99" value={layer.bridgingFraction !== undefined ? Math.round(layer.bridgingFraction * 100) : ''}
                onChange={(e) => onUpdate({ bridgingFraction: (parseInt(e.target.value) || 0) / 100 })}
                placeholder="e.g. 15" className="rounded-lg px-2 py-1.5 text-xs w-20 font-mono focus:outline-none" style={{ border: '2px solid #e2e8f0' }} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
