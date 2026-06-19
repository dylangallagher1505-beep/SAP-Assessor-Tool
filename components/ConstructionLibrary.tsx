'use client';

import { useState, useEffect } from 'react';
import { ELEMENT_TYPE_LABELS, uValueColour, type ElementType } from '@/lib/uvalue';

interface SavedConstruction {
  id: string;
  name: string;
  elementType: ElementType;
  layers: { name: string; thicknessMm: number; lambda?: number; fixedR?: number; bridged: boolean; bridgingDetails?: string }[];
  uValue: number;
  totalR: number;
  savedAt: string;
}

const RAG_BADGE: Record<'green' | 'amber' | 'red', React.CSSProperties> = {
  green: { background: '#dcfce7', color: '#15803d', border: '2px solid #16a34a' },
  amber: { background: '#fef3c7', color: '#b45309', border: '2px solid #d97706' },
  red:   { background: '#fee2e2', color: '#b91c1c', border: '2px solid #dc2626' },
};

export default function ConstructionLibrary() {
  const [constructions, setConstructions] = useState<SavedConstruction[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    try {
      setConstructions(JSON.parse(localStorage.getItem('sap-construction-library') || '[]'));
    } catch {
      setConstructions([]);
    }
  }, []);

  const remove = (id: string) => {
    const updated = constructions.filter((c) => c.id !== id);
    setConstructions(updated);
    localStorage.setItem('sap-construction-library', JSON.stringify(updated));
  };

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div style={{ borderTop: '4px solid #16a34a', paddingTop: '1rem' }}>
        <h1 className="text-3xl font-black" style={{ color: '#14532d' }}>CONSTRUCTION LIBRARY</h1>
        <p className="text-sm mt-1 font-medium" style={{ color: '#64748b' }}>
          Saved constructions from the U-Value Calculator
        </p>
      </div>

      {constructions.length === 0 && (
        <div
          className="rounded-2xl p-12 text-center"
          style={{ background: 'white', border: '2px solid #e2e8f0' }}
        >
          <div className="text-5xl mb-4">📐</div>
          <div className="text-lg font-black mb-1" style={{ color: '#14532d' }}>No constructions saved yet</div>
          <div className="text-sm font-medium" style={{ color: '#94a3b8' }}>
            Head to the U-Value Calculator, build a construction, and hit{' '}
            <strong style={{ color: '#64748b' }}>Save to Library</strong>.
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {constructions.map((c) => {
          const colour = uValueColour(c.uValue, c.elementType);
          const badgeStyle = RAG_BADGE[colour];
          const isExpanded = expanded === c.id;

          return (
            <div
              key={c.id}
              className="rounded-2xl overflow-hidden flex flex-col"
              style={{ background: 'white', border: '2px solid #e2e8f0', transition: 'border-color 0.15s' }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = '#94a3b8'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = '#e2e8f0'; }}
            >
              <div className="p-5 flex-1">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h3 className="font-black text-base leading-snug" style={{ color: '#14532d' }}>
                    {c.name}
                  </h3>
                  <span
                    className="text-xs font-black px-2.5 py-1 rounded-full shrink-0"
                    style={badgeStyle}
                  >
                    {c.uValue.toFixed(3)}
                  </span>
                </div>
                <div className="text-xs font-semibold mb-3" style={{ color: '#64748b' }}>
                  {ELEMENT_TYPE_LABELS[c.elementType]}
                </div>
                <div className="text-xs font-medium" style={{ color: '#94a3b8' }}>
                  {c.layers.length} layer{c.layers.length !== 1 ? 's' : ''} · R = {c.totalR.toFixed(3)} m²K/W
                </div>

                {isExpanded && (
                  <div
                    className="mt-3 pt-3 space-y-1.5"
                    style={{ borderTop: '1px solid #f1f5f9' }}
                  >
                    {c.layers.map((l, i) => (
                      <div key={i} className="flex justify-between text-xs gap-2">
                        <span className="flex-1 truncate font-medium" style={{ color: '#475569' }}>
                          {l.name}
                        </span>
                        <span className="font-mono shrink-0" style={{ color: '#94a3b8' }}>
                          {l.fixedR !== undefined
                            ? `R=${l.fixedR}`
                            : `${l.thicknessMm}mm / λ${l.lambda?.toFixed(3)}`}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="px-5 pb-5 flex gap-2">
                <button
                  onClick={() => setExpanded(isExpanded ? null : c.id)}
                  className="flex-1 text-xs rounded-xl py-2 font-bold transition-all"
                  style={{ border: '2px solid #e2e8f0', color: '#475569', background: 'white' }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background = '#f8fafc';
                    (e.currentTarget as HTMLButtonElement).style.borderColor = '#94a3b8';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background = 'white';
                    (e.currentTarget as HTMLButtonElement).style.borderColor = '#e2e8f0';
                  }}
                >
                  {isExpanded ? 'Collapse' : 'View layers'}
                </button>
                <button
                  onClick={() => remove(c.id)}
                  className="text-xs rounded-xl px-4 py-2 font-bold transition-all"
                  style={{ border: '2px solid #fecaca', color: '#ef4444', background: 'white' }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background = '#fee2e2';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background = 'white';
                  }}
                >
                  Delete
                </button>
              </div>

              <div className="px-5 pb-3 text-xs font-medium" style={{ color: '#cbd5e1' }}>
                Saved {new Date(c.savedAt).toLocaleDateString('en-GB')}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
