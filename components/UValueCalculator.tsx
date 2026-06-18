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
function newId() {
  return `layer-${++idCounter}`;
}

function defaultLayer(): LayerInput {
  return {
    id: newId(),
    name: '',
    thicknessMm: 100,
    lambda: undefined,
    fixedR: undefined,
    bridged: false,
  };
}

interface SavedConstruction {
  id: string;
  name: string;
  elementType: ElementType;
  layers: LayerInput[];
  uValue: number;
  totalR: number;
  savedAt: string;
}

function saveToLibrary(construction: SavedConstruction) {
  const existing = loadLibrary();
  const updated = [construction, ...existing.filter((c) => c.id !== construction.id)];
  localStorage.setItem('sap-construction-library', JSON.stringify(updated));
}

function loadLibrary(): SavedConstruction[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem('sap-construction-library') || '[]');
  } catch {
    return [];
  }
}

export default function UValueCalculator() {
  const [elementType, setElementType] = useState<ElementType>('wall');
  const [constructionName, setConstructionName] = useState('');
  const [layers, setLayers] = useState<LayerInput[]>([defaultLayer()]);
  const [savedMessage, setSavedMessage] = useState('');

  const result = calculateUValue(elementType, layers);

  const addLayer = useCallback(() => {
    setLayers((prev) => [...prev, defaultLayer()]);
  }, []);

  const removeLayer = useCallback((id: string) => {
    setLayers((prev) => prev.filter((l) => l.id !== id));
  }, []);

  const moveLayer = useCallback((id: string, dir: -1 | 1) => {
    setLayers((prev) => {
      const idx = prev.findIndex((l) => l.id === id);
      if (idx < 0) return prev;
      const next = [...prev];
      const swap = idx + dir;
      if (swap < 0 || swap >= next.length) return prev;
      [next[idx], next[swap]] = [next[swap], next[idx]];
      return next;
    });
  }, []);

  const updateLayer = useCallback((id: string, patch: Partial<LayerInput>) => {
    setLayers((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }, []);

  const selectMaterial = useCallback((id: string, mat: Material) => {
    updateLayer(id, {
      name: mat.name,
      lambda: mat.lambda,
      fixedR: mat.fixedR,
      thicknessMm: mat.fixedR ? 0 : 100,
    });
  }, [updateLayer]);

  const handleSave = () => {
    if (!constructionName.trim()) {
      alert('Please enter a construction name before saving.');
      return;
    }
    const saved: SavedConstruction = {
      id: `${Date.now()}`,
      name: constructionName.trim(),
      elementType,
      layers: JSON.parse(JSON.stringify(layers)),
      uValue: result.uValue,
      totalR: result.totalR,
      savedAt: new Date().toISOString(),
    };
    saveToLibrary(saved);
    setSavedMessage(`"${saved.name}" saved to library`);
    setTimeout(() => setSavedMessage(''), 3000);
  };

  const colourClass = {
    green: 'text-green-600 bg-green-50 border-green-200',
    amber: 'text-amber-600 bg-amber-50 border-amber-200',
    red: 'text-red-600 bg-red-50 border-red-200',
  }[uValueColour(result.uValue, elementType)];

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">U-Value Calculator</h1>
        <p className="text-sm text-slate-500 mt-1">BR443:2019 combined method · SAP 10.2</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
        <div className="flex flex-wrap gap-4 items-end">
          <div className="flex-1 min-w-48">
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Element Type</label>
            <select
              value={elementType}
              onChange={(e) => setElementType(e.target.value as ElementType)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {ELEMENT_TYPES.map((t) => (
                <option key={t} value={t}>{ELEMENT_TYPE_LABELS[t]}</option>
              ))}
            </select>
          </div>
          <div className="flex-1 min-w-48">
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Construction Name</label>
            <input
              type="text"
              value={constructionName}
              onChange={(e) => setConstructionName(e.target.value)}
              placeholder="e.g. External cavity wall — standard"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      <div className="flex gap-6 items-start">
        <div className="flex-1 space-y-3">
          <SurfaceRow label="External surface resistance (Rso)" value={result.Rso} />
          {layers.map((layer, idx) => (
            <LayerRow
              key={layer.id}
              layer={layer}
              index={idx}
              total={layers.length}
              onUpdate={(patch) => updateLayer(layer.id, patch)}
              onSelectMaterial={(mat) => selectMaterial(layer.id, mat)}
              onRemove={() => removeLayer(layer.id)}
              onMove={(dir) => moveLayer(layer.id, dir)}
            />
          ))}
          <SurfaceRow label="Internal surface resistance (Rsi)" value={result.Rsi} />
          <button
            onClick={addLayer}
            className="w-full border-2 border-dashed border-slate-300 rounded-xl py-3 text-sm text-slate-500 hover:border-blue-400 hover:text-blue-600 transition-colors font-medium"
          >
            + Add Layer
          </button>
        </div>

        <div className="w-72 shrink-0 space-y-4">
          <div className={`rounded-xl border-2 p-5 text-center ${colourClass}`}>
            <div className="text-xs font-semibold uppercase tracking-wide opacity-70 mb-1">U-Value</div>
            <div className="text-5xl font-bold">{result.uValue.toFixed(3)}</div>
            <div className="text-sm font-medium mt-1">W/m²K</div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">R Breakdown</span>
            </div>
            <div className="divide-y divide-slate-50">
              <RRow label="Rso (ext. surface)" value={result.Rso} />
              {result.layers.map((lr) => (
                <RRow key={lr.id} label={lr.name || 'Unnamed layer'} value={lr.R} sub={lr.bridgingDetails} />
              ))}
              <RRow label="Rsi (int. surface)" value={result.Rsi} />
              <RRow label="Total R" value={result.totalR} bold />
            </div>
          </div>
          <button
            onClick={handleSave}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-xl py-3 text-sm font-semibold transition-colors"
          >
            Save to Library
          </button>
          {savedMessage && (
            <p className="text-xs text-green-600 text-center font-medium">{savedMessage}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function SurfaceRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 flex items-center gap-3 opacity-70">
      <div className="w-5 h-5 rounded bg-slate-300 shrink-0" />
      <span className="flex-1 text-sm text-slate-500 font-medium">{label}</span>
      <span className="text-sm font-mono text-slate-500 w-20 text-right">{value.toFixed(2)} m²K/W</span>
    </div>
  );
}

function RRow({ label, value, sub, bold }: { label: string; value: number; sub?: string; bold?: boolean }) {
  return (
    <div className={`flex items-start px-4 py-2 gap-2 ${bold ? 'bg-slate-50 font-semibold' : ''}`}>
      <span className="flex-1 text-xs text-slate-600 leading-snug">
        {label}
        {sub && <span className="block text-slate-400 font-normal">{sub}</span>}
      </span>
      <span className="text-xs font-mono text-slate-700 shrink-0">{value.toFixed(3)}</span>
    </div>
  );
}

interface LayerRowProps {
  layer: LayerInput;
  index: number;
  total: number;
  onUpdate: (patch: Partial<LayerInput>) => void;
  onSelectMaterial: (mat: Material) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}

function LayerRow({ layer, index, total, onUpdate, onSelectMaterial, onRemove, onMove }: LayerRowProps) {
  const [matSearch, setMatSearch] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);

  const filtered = matSearch.length > 0
    ? MATERIALS.filter((m) => m.name.toLowerCase().includes(matSearch.toLowerCase()))
    : MATERIALS;

  const grouped = MATERIAL_CATEGORIES.map((cat) => ({
    category: cat,
    items: filtered.filter((m) => m.category === cat),
  })).filter((g) => g.items.length > 0);

  const hasFixed = layer.fixedR !== undefined;

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-visible">
      <div className="flex items-start gap-3 p-4">
        {/* Order controls */}
        <div className="flex flex-col gap-0.5 pt-1 shrink-0">
          <button onClick={() => onMove(-1)} disabled={index === 0}
            className="w-6 h-6 flex items-center justify-center rounded hover:bg-slate-100 disabled:opacity-20 text-slate-400 text-xs">▲</button>
          <button onClick={() => onMove(1)} disabled={index === total - 1}
            className="w-6 h-6 flex items-center justify-center rounded hover:bg-slate-100 disabled:opacity-20 text-slate-400 text-xs">▼</button>
        </div>

        {/* Colour swatch */}
        <div className="w-5 h-5 rounded bg-blue-400 shrink-0 mt-2" />

        {/* Material selector */}
        <div className="flex-1 relative min-w-0">
          <div className="text-xs font-semibold text-slate-500 mb-1">Material</div>
          <button
            type="button"
            onClick={() => { setMatSearch(''); setShowDropdown((v) => !v); }}
            onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-left flex items-center justify-between gap-2 bg-white hover:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <span className={layer.name ? 'text-slate-800' : 'text-slate-400'}>
              {layer.name || 'Select a material…'}
            </span>
            <span className="text-slate-400 text-xs shrink-0">▼</span>
          </button>

          {showDropdown && (
            <div
              className="absolute z-50 top-full left-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-2xl overflow-hidden"
              style={{ width: 'max(100%, 420px)' }}
            >
              {/* Sticky search bar */}
              <div className="p-2 border-b border-slate-100 bg-white">
                <input
                  ref={(el) => { el?.focus(); }}
                  type="text"
                  value={matSearch}
                  onChange={(e) => setMatSearch(e.target.value)}
                  onBlur={() => {}}
                  placeholder="Search materials…"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  autoFocus
                />
              </div>
              <div className="max-h-72 overflow-y-auto">
                <div
                  className="px-4 py-2.5 text-sm text-blue-600 font-medium cursor-pointer hover:bg-blue-50 border-b border-slate-100 flex items-center gap-2"
                  onMouseDown={() => {
                    onUpdate({ name: 'Custom', lambda: 0.04, fixedR: undefined });
                    setShowDropdown(false);
                    setMatSearch('');
                  }}
                >
                  ✏️ Custom — enter lambda manually
                </div>
                {grouped.length === 0 && (
                  <div className="px-4 py-6 text-sm text-slate-400 text-center">No materials match "{matSearch}"</div>
                )}
                {grouped.map((group) => (
                  <div key={group.category}>
                    <div className="px-4 py-2 text-xs font-bold text-slate-500 uppercase tracking-wider bg-slate-50 border-y border-slate-100">
                      {group.category}
                    </div>
                    {group.items.map((mat) => (
                      <div
                        key={mat.id}
                        className="px-4 py-2.5 text-sm hover:bg-blue-50 cursor-pointer flex items-center justify-between gap-4"
                        onMouseDown={() => {
                          onSelectMaterial(mat);
                          setShowDropdown(false);
                          setMatSearch('');
                        }}
                      >
                        <span className="text-slate-700">{mat.name}</span>
                        <span className="text-xs text-slate-400 font-mono shrink-0 bg-slate-100 px-2 py-0.5 rounded">
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

        {/* Lambda */}
        <div className="w-28 shrink-0">
          <div className="text-xs font-semibold text-slate-500 mb-1">λ (W/mK)</div>
          <input
            type="number" step="0.001" min="0.001"
            value={hasFixed ? '' : (layer.lambda ?? '')}
            disabled={hasFixed}
            onChange={(e) => onUpdate({ lambda: parseFloat(e.target.value) || undefined })}
            placeholder={hasFixed ? 'Fixed R' : '0.000'}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50 disabled:text-slate-400"
          />
        </div>

        {/* Thickness */}
        <div className="w-24 shrink-0">
          <div className="text-xs font-semibold text-slate-500 mb-1">Thickness (mm)</div>
          <input
            type="number" min="0"
            value={hasFixed ? '' : layer.thicknessMm}
            disabled={hasFixed}
            onChange={(e) => onUpdate({ thicknessMm: parseInt(e.target.value) || 0 })}
            placeholder={hasFixed ? '—' : 'mm'}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50 disabled:text-slate-400"
          />
        </div>

        {/* R value */}
        <div className="w-24 shrink-0">
          <div className="text-xs font-semibold text-slate-500 mb-1">R (m²K/W)</div>
          <div className="border border-slate-100 bg-slate-50 rounded-lg px-3 py-2 text-sm font-mono text-slate-600">
            {hasFixed
              ? (layer.fixedR ?? 0).toFixed(3)
              : layer.lambda && layer.thicknessMm
              ? ((layer.thicknessMm / 1000) / layer.lambda).toFixed(3)
              : '—'}
          </div>
        </div>

        {/* Remove */}
        <button
          onClick={onRemove}
          className="mt-5 text-slate-300 hover:text-red-500 transition-colors text-lg leading-none shrink-0"
          title="Remove layer"
        >✕</button>
      </div>

      {/* Bridged layer toggle */}
      <div className="px-4 pb-4 flex items-start gap-4">
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={layer.bridged}
            disabled={hasFixed}
            onChange={(e) => onUpdate({ bridged: e.target.checked })}
            className="rounded"
          />
          <span className="text-xs text-slate-500">Bridged layer (e.g. insulation between studs)</span>
        </label>
        {layer.bridged && !hasFixed && (
          <div className="flex gap-3 flex-wrap">
            <div>
              <div className="text-xs text-slate-500 mb-1">Bridging material</div>
              <input type="text" value={layer.bridgingMaterial?.name ?? ''}
                onChange={(e) => onUpdate({ bridgingMaterial: { name: e.target.value, lambda: layer.bridgingMaterial?.lambda ?? 0.13 } })}
                placeholder="e.g. Softwood studs"
                className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs w-36 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <div className="text-xs text-slate-500 mb-1">λ (W/mK)</div>
              <input type="number" step="0.001" value={layer.bridgingMaterial?.lambda ?? ''}
                onChange={(e) => onUpdate({ bridgingMaterial: { name: layer.bridgingMaterial?.name ?? '', lambda: parseFloat(e.target.value) || 0 } })}
                placeholder="0.130"
                className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs w-20 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <div className="text-xs text-slate-500 mb-1">Bridging fraction %</div>
              <input type="number" min="1" max="99"
                value={layer.bridgingFraction !== undefined ? Math.round(layer.bridgingFraction * 100) : ''}
                onChange={(e) => onUpdate({ bridgingFraction: (parseInt(e.target.value) || 0) / 100 })}
                placeholder="e.g. 15"
                className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs w-20 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
