'use client';

import { useState, useEffect } from 'react';
import { ELEMENT_TYPE_LABELS, uValueColour, type ElementType } from '@/lib/uvalue';

interface SavedConstruction {
  id: string; name: string; elementType: ElementType;
  layers: { name: string; thicknessMm: number; lambda?: number; fixedR?: number; bridged: boolean }[];
  uValue: number; totalR: number; savedAt: string;
}

export default function ConstructionLibrary() {
  const [constructions, setConstructions] = useState<SavedConstruction[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    try { setConstructions(JSON.parse(localStorage.getItem('sap-construction-library') || '[]')); }
    catch { setConstructions([]); }
  }, []);

  const remove = (id: string) => {
    const updated = constructions.filter((c) => c.id !== id);
    setConstructions(updated);
    localStorage.setItem('sap-construction-library', JSON.stringify(updated));
  };

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Construction Library</h1>
        <p className="text-sm text-slate-500 mt-1">Saved constructions from the U-Value Calculator</p>
      </div>
      {constructions.length === 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <div className="text-4xl mb-3">📚</div>
          <div className="text-slate-500 text-sm">No constructions saved yet.</div>
          <div className="text-slate-400 text-xs mt-1">Save a construction from the U-Value Calculator to see it here.</div>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {constructions.map((c) => {
          const colour = uValueColour(c.uValue, c.elementType);
          const badge = { green: 'bg-green-100 text-green-700', amber: 'bg-amber-100 text-amber-700', red: 'bg-red-100 text-red-700' }[colour];
          const isExpanded = expanded === c.id;
          return (
            <div key={c.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
              <div className="p-4 flex-1">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h3 className="font-semibold text-slate-800 text-sm leading-snug">{c.name}</h3>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full shrink-0 ${badge}`}>{c.uValue.toFixed(3)}</span>
                </div>
                <div className="text-xs text-slate-400 mb-3">{ELEMENT_TYPE_LABELS[c.elementType]}</div>
                <div className="text-xs text-slate-500">{c.layers.length} layer{c.layers.length !== 1 ? 's' : ''} · R = {c.totalR.toFixed(3)} m²K/W</div>
                {isExpanded && (
                  <div className="mt-3 border-t border-slate-100 pt-3 space-y-1">
                    {c.layers.map((l, i) => (
                      <div key={i} className="flex justify-between text-xs text-slate-600">
                        <span className="flex-1 truncate">{l.name}</span>
                        <span className="text-slate-400 font-mono ml-2 shrink-0">{l.fixedR !== undefined ? `R=${l.fixedR}` : `${l.thicknessMm}mm / λ${l.lambda?.toFixed(3)}`}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="px-4 pb-4 flex gap-2">
                <button onClick={() => setExpanded(isExpanded ? null : c.id)} className="flex-1 text-xs border border-slate-200 rounded-lg py-1.5 text-slate-600 hover:bg-slate-50 transition-colors">{isExpanded ? 'Collapse' : 'View layers'}</button>
                <button onClick={() => remove(c.id)} className="text-xs border border-red-100 text-red-400 rounded-lg px-3 py-1.5 hover:bg-red-50 transition-colors">Delete</button>
              </div>
              <div className="px-4 pb-3 text-xs text-slate-300">Saved {new Date(c.savedAt).toLocaleDateString('en-GB')}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
