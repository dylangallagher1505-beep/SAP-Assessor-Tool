export type MaterialCategory =
  | 'Masonry & Concrete'
  | 'Insulation — Rigid Board'
  | 'Insulation — Mineral Wool'
  | 'Insulation — Loose Fill'
  | 'Insulation — Natural & Bio-based'
  | 'Insulation — Specialist'
  | 'Timber & Wood Products'
  | 'Finishes & Boards'
  | 'Renders & Cladding'
  | 'Roofing'
  | 'Flooring'
  | 'Metals & Structural'
  | 'Air Gaps & Cavities';

export interface Material {
  id: string;
  name: string;
  category: MaterialCategory;
  lambda?: number;  // W/mK — thermal conductivity
  fixedR?: number;  // m²K/W — for cavities where R is fixed regardless of thickness
  notes?: string;   // source or usage note
}

export const MATERIALS: Material[] = [

  // ─── MASONRY & CONCRETE ───────────────────────────────────────────────────
  { id: 'brick-outer',             name: 'Brick — outer leaf (clay facing)',          category: 'Masonry & Concrete', lambda: 0.77,  notes: 'BR443:2019 Annex A' },
  { id: 'brick-inner',             name: 'Brick — inner leaf (clay common)',          category: 'Masonry & Concrete', lambda: 0.56,  notes: 'BR443:2019 Annex A' },
  { id: 'brick-engineering',       name: 'Brick — engineering (dense)',               category: 'Masonry & Concrete', lambda: 1.15,  notes: 'BR443:2019 / ISO 10456' },
  { id: 'brick-calcium-silicate',  name: 'Brick — calcium silicate',                 category: 'Masonry & Concrete', lambda: 0.75,  notes: 'BR443:2019 Annex A' },
  { id: 'dense-block-solid',       name: 'Dense aggregate block — solid',             category: 'Masonry & Concrete', lambda: 1.13,  notes: 'BR443:2019 Annex A' },
  { id: 'dense-block-perforated',  name: 'Dense aggregate block — perforated',        category: 'Masonry & Concrete', lambda: 0.98,  notes: 'BR443:2019 Annex A' },
  { id: 'medium-density-block',    name: 'Medium density aggregate block',            category: 'Masonry & Concrete', lambda: 0.57,  notes: 'BR443:2019 Annex A' },
  { id: 'lightweight-block',       name: 'Lightweight aggregate block',               category: 'Masonry & Concrete', lambda: 0.46,  notes: 'BR443:2019 Annex A' },
  { id: 'aac-block-600',           name: 'Aircrete / AAC block — 600 kg/m³ (e.g. Toplite)',  category: 'Masonry & Concrete', lambda: 0.15,  notes: 'BR443:2019 Annex A' },
  { id: 'aac-block-500',           name: 'Aircrete / AAC block — 500 kg/m³',         category: 'Masonry & Concrete', lambda: 0.12,  notes: 'BR443:2019 Annex A' },
  { id: 'aac-block-450',           name: 'Aircrete / AAC block — 450 kg/m³ (e.g. H+H Celcon)',  category: 'Masonry & Concrete', lambda: 0.11,  notes: 'BR443:2019 Annex A' },
  { id: 'aac-block-400',           name: 'Aircrete / AAC block — 400 kg/m³',         category: 'Masonry & Concrete', lambda: 0.10,  notes: 'BR443:2019 Annex A' },
  { id: 'cast-concrete',           name: 'Concrete — cast in-situ (unreinforced)',    category: 'Masonry & Concrete', lambda: 1.35,  notes: 'BR443:2019 Annex A' },
  { id: 'reinforced-concrete',     name: 'Concrete — reinforced',                    category: 'Masonry & Concrete', lambda: 1.35,  notes: 'BR443:2019 Annex A' },
  { id: 'precast-concrete',        name: 'Concrete — precast',                       category: 'Masonry & Concrete', lambda: 1.40,  notes: 'BR443:2019 Annex A' },
  { id: 'lightweight-concrete-1200', name: 'Concrete — lightweight 1200 kg/m³',      category: 'Masonry & Concrete', lambda: 0.50,  notes: 'ISO 10456:2007' },
  { id: 'lightweight-concrete-800',  name: 'Concrete — lightweight 800 kg/m³',       category: 'Masonry & Concrete', lambda: 0.28,  notes: 'ISO 10456:2007' },
  { id: 'screed-sand-cement',      name: 'Screed — sand/cement',                     category: 'Masonry & Concrete', lambda: 0.41,  notes: 'BR443:2019 Annex A' },
  { id: 'screed-anhydrite',        name: 'Screed — anhydrite / calcium sulphate',     category: 'Masonry & Concrete', lambda: 0.35,  notes: 'ISO 10456:2007' },
  { id: 'screed-polymer',          name: 'Screed — polymer modified / UFH screed',   category: 'Masonry & Concrete', lambda: 0.45,  notes: 'ISO 10456:2007' },

  // ─── INSULATION — RIGID BOARD ─────────────────────────────────────────────
  { id: 'pir-standard',            name: 'PIR board — standard (e.g. Celotex GA4000, Kingspan TP10)',  category: 'Insulation — Rigid Board', lambda: 0.022, notes: 'Manufacturer declared; BR443:2019' },
  { id: 'pir-premium',             name: 'PIR board — premium (e.g. Celotex XR4000, Kingspan K103)',  category: 'Insulation — Rigid Board', lambda: 0.019, notes: 'Manufacturer declared' },
  { id: 'pir-floor',               name: 'PIR board — floor grade (e.g. Celotex PL4000, Kingspan TF70)',  category: 'Insulation — Rigid Board', lambda: 0.022, notes: 'Manufacturer declared' },
  { id: 'phenolic-standard',       name: 'Phenolic foam board — standard (e.g. Kingspan Kooltherm)',  category: 'Insulation — Rigid Board', lambda: 0.020, notes: 'Manufacturer declared; BR443:2019' },
  { id: 'phenolic-premium',        name: 'Phenolic foam board — premium',             category: 'Insulation — Rigid Board', lambda: 0.018, notes: 'Manufacturer declared' },
  { id: 'pur-rigid',               name: 'Rigid PUR board',                          category: 'Insulation — Rigid Board', lambda: 0.025, notes: 'BR443:2019 Annex A' },
  { id: 'xps-standard',            name: 'XPS board — standard (e.g. Styrofoam, Jackodur)',           category: 'Insulation — Rigid Board', lambda: 0.033, notes: 'BR443:2019 Annex A' },
  { id: 'xps-premium',             name: 'XPS board — premium / high compression',   category: 'Insulation — Rigid Board', lambda: 0.029, notes: 'Manufacturer declared' },
  { id: 'eps-standard',            name: 'EPS board — standard (e.g. EPS70)',        category: 'Insulation — Rigid Board', lambda: 0.038, notes: 'BR443:2019 Annex A' },
  { id: 'eps-enhanced',            name: 'EPS board — enhanced / graphite (e.g. EPS100, Neopor)',    category: 'Insulation — Rigid Board', lambda: 0.031, notes: 'Manufacturer declared' },
  { id: 'mineral-wool-board',      name: 'Mineral wool board — rigid slab',          category: 'Insulation — Rigid Board', lambda: 0.036, notes: 'BR443:2019 Annex A' },
  { id: 'mineral-wool-board-rock', name: 'Rockwool / stone wool board — rigid',      category: 'Insulation — Rigid Board', lambda: 0.033, notes: 'Manufacturer declared (Rockwool Hardrock)' },
  { id: 'wood-fibre-board',        name: 'Wood fibre board — rigid (e.g. Steico, Pavatex)',           category: 'Insulation — Rigid Board', lambda: 0.038, notes: 'BR443:2019 Annex A' },
  { id: 'spray-puf',               name: 'Spray polyurethane foam (in-situ)',        category: 'Insulation — Rigid Board', lambda: 0.040, notes: 'BR443:2019 Annex A' },

  // ─── INSULATION — MINERAL WOOL ────────────────────────────────────────────
  { id: 'glass-wool-batt',         name: 'Glass wool batts / rolls (e.g. Knauf, Isover)',             category: 'Insulation — Mineral Wool', lambda: 0.034, notes: 'BR443:2019 Annex A' },
  { id: 'glass-wool-premium',      name: 'Glass wool — premium / low-lambda (e.g. Isover Spacesaver)', category: 'Insulation — Mineral Wool', lambda: 0.031, notes: 'Manufacturer declared' },
  { id: 'rock-wool-batt',          name: 'Rock / stone wool batts (e.g. Rockwool, Supafil)',          category: 'Insulation — Mineral Wool', lambda: 0.038, notes: 'BR443:2019 Annex A' },
  { id: 'rock-wool-cavity',        name: 'Rock wool — partial/full fill cavity slab (e.g. Rockwool Cavity Slab)', category: 'Insulation — Mineral Wool', lambda: 0.034, notes: 'Manufacturer declared' },
  { id: 'mineral-wool-loose',      name: 'Mineral wool — loose fill / blown loft',  category: 'Insulation — Mineral Wool', lambda: 0.044, notes: 'BR443:2019 Annex A' },

  // ─── INSULATION — LOOSE FILL ──────────────────────────────────────────────
  { id: 'blown-fibre',             name: 'Blown fibre — mineral (loose)',            category: 'Insulation — Loose Fill', lambda: 0.044, notes: 'BR443:2019 Annex A' },
  { id: 'cellulose-blown',         name: 'Cellulose — blown (recycled paper)',       category: 'Insulation — Loose Fill', lambda: 0.040, notes: 'BR443:2019 Annex A' },
  { id: 'perlite-loose',           name: 'Expanded perlite — loose fill',           category: 'Insulation — Loose Fill', lambda: 0.050, notes: 'ISO 10456:2007' },
  { id: 'vermiculite-loose',       name: 'Expanded vermiculite — loose fill',       category: 'Insulation — Loose Fill', lambda: 0.070, notes: 'ISO 10456:2007' },

  // ─── INSULATION — NATURAL & BIO-BASED ─────────────────────────────────────
  { id: 'wood-fibre-batts',        name: 'Wood fibre batts / rolls (flexible)',      category: 'Insulation — Natural & Bio-based', lambda: 0.040, notes: 'Manufacturer declared' },
  { id: 'hemp-batts',              name: 'Hemp fibre batts',                        category: 'Insulation — Natural & Bio-based', lambda: 0.040, notes: 'Manufacturer declared' },
  { id: 'sheeps-wool',             name: "Sheep's wool batts",                     category: 'Insulation — Natural & Bio-based', lambda: 0.040, notes: 'Manufacturer declared' },
  { id: 'flax-batts',              name: 'Flax fibre batts',                        category: 'Insulation — Natural & Bio-based', lambda: 0.039, notes: 'Manufacturer declared' },
  { id: 'cork-board',              name: 'Cork board (expanded)',                   category: 'Insulation — Natural & Bio-based', lambda: 0.040, notes: 'ISO 10456:2007' },

  // ─── INSULATION — SPECIALIST ──────────────────────────────────────────────
  { id: 'aerogel-blanket',         name: 'Aerogel blanket / board (e.g. Spacetherm)',  category: 'Insulation — Specialist', lambda: 0.015, notes: 'Manufacturer declared; use for slim-line retrofits' },
  { id: 'vip',                     name: 'Vacuum insulation panel (VIP)',           category: 'Insulation — Specialist', lambda: 0.007, notes: 'Manufacturer declared; overall system λ ~0.008–0.012 inc. edges' },

  // ─── TIMBER & WOOD PRODUCTS ───────────────────────────────────────────────
  { id: 'softwood',                name: 'Softwood — joists / studs / rafters (Pine, Spruce)',   category: 'Timber & Wood Products', lambda: 0.13,  notes: 'BR443:2019 Annex A' },
  { id: 'hardwood',                name: 'Hardwood — Oak, Ash etc.',               category: 'Timber & Wood Products', lambda: 0.18,  notes: 'BR443:2019 Annex A' },
  { id: 'plywood',                 name: 'Plywood (all grades)',                   category: 'Timber & Wood Products', lambda: 0.13,  notes: 'BR443:2019 Annex A' },
  { id: 'osb',                     name: 'OSB — oriented strand board',            category: 'Timber & Wood Products', lambda: 0.13,  notes: 'BR443:2019 Annex A' },
  { id: 'mdf',                     name: 'MDF — medium density fibreboard',        category: 'Timber & Wood Products', lambda: 0.13,  notes: 'BR443:2019 Annex A' },
  { id: 'chipboard',               name: 'Chipboard / particleboard',              category: 'Timber & Wood Products', lambda: 0.13,  notes: 'BR443:2019 Annex A' },
  { id: 'lvl',                     name: 'LVL — laminated veneer lumber',          category: 'Timber & Wood Products', lambda: 0.13,  notes: 'ISO 10456:2007' },
  { id: 'clt',                     name: 'CLT — cross-laminated timber',           category: 'Timber & Wood Products', lambda: 0.13,  notes: 'ISO 10456:2007; varies by panel grade' },
  { id: 'glulam',                  name: 'Glulam — glued-laminated timber',        category: 'Timber & Wood Products', lambda: 0.13,  notes: 'ISO 10456:2007' },

  // ─── FINISHES & BOARDS ────────────────────────────────────────────────────
  { id: 'plasterboard-standard',   name: 'Plasterboard — standard (12.5mm)',       category: 'Finishes & Boards', lambda: 0.21,  notes: 'BR443:2019 Annex A' },
  { id: 'plasterboard-15mm',       name: 'Plasterboard — 15mm (acoustic/fire)',    category: 'Finishes & Boards', lambda: 0.21,  notes: 'BR443:2019 Annex A' },
  { id: 'plasterboard-moisture',   name: 'Plasterboard — moisture-resistant (green board)',  category: 'Finishes & Boards', lambda: 0.21,  notes: 'BR443:2019 Annex A' },
  { id: 'plasterboard-fire',       name: 'Plasterboard — fire-rated (Type F / Fireline)',    category: 'Finishes & Boards', lambda: 0.23,  notes: 'BR443:2019 Annex A' },
  { id: 'dense-plaster',           name: 'Plaster — dense / hard (sand:cement or gypsum)',   category: 'Finishes & Boards', lambda: 0.57,  notes: 'BR443:2019 Annex A' },
  { id: 'lightweight-plaster',     name: 'Plaster — lightweight finish coat',      category: 'Finishes & Boards', lambda: 0.18,  notes: 'BR443:2019 Annex A' },
  { id: 'gypsum-plaster',          name: 'Plaster — gypsum base coat (browning)',  category: 'Finishes & Boards', lambda: 0.45,  notes: 'ISO 10456:2007' },
  { id: 'lime-plaster',            name: 'Plaster — lime',                         category: 'Finishes & Boards', lambda: 0.40,  notes: 'ISO 10456:2007' },
  { id: 'tile-ceramic',            name: 'Tile — ceramic (glazed)',               category: 'Finishes & Boards', lambda: 1.30,  notes: 'BR443:2019 Annex A' },
  { id: 'tile-porcelain',          name: 'Tile — porcelain',                      category: 'Finishes & Boards', lambda: 1.50,  notes: 'ISO 10456:2007' },
  { id: 'tile-natural-stone',      name: 'Tile — natural stone (slate/granite)',  category: 'Finishes & Boards', lambda: 2.50,  notes: 'ISO 10456:2007; varies 2.0–3.5' },
  { id: 'carpet-underlay',         name: 'Carpet + underlay',                     category: 'Finishes & Boards', lambda: 0.06,  notes: 'BR443:2019 Annex A' },
  { id: 'linoleum',                name: 'Linoleum / vinyl flooring',             category: 'Finishes & Boards', lambda: 0.19,  notes: 'ISO 10456:2007' },
  { id: 'laminate-floor',          name: 'Laminate flooring + underlay',          category: 'Finishes & Boards', lambda: 0.10,  notes: 'ISO 10456:2007' },
  { id: 'timber-floor-boards',     name: 'Timber flooring boards (hardwood/softwood)',  category: 'Finishes & Boards', lambda: 0.14,  notes: 'BR443:2019 Annex A' },
  { id: 'engineered-timber-floor', name: 'Engineered timber flooring',            category: 'Finishes & Boards', lambda: 0.14,  notes: 'BR443:2019 Annex A' },

  // ─── RENDERS & CLADDING ───────────────────────────────────────────────────
  { id: 'render-sand-cement',      name: 'Render — sand/cement',                  category: 'Renders & Cladding', lambda: 0.57,  notes: 'BR443:2019 Annex A' },
  { id: 'render-lime',             name: 'Render — lime',                         category: 'Renders & Cladding', lambda: 0.40,  notes: 'ISO 10456:2007' },
  { id: 'render-acrylic',          name: 'Render — acrylic / thin coat EWI finish',  category: 'Renders & Cladding', lambda: 0.25,  notes: 'ISO 10456:2007' },
  { id: 'render-silicone',         name: 'Render — silicone',                     category: 'Renders & Cladding', lambda: 0.30,  notes: 'ISO 10456:2007' },
  { id: 'cladding-timber',         name: 'Cladding — timber boards (feather-edge / shiplap)',  category: 'Renders & Cladding', lambda: 0.13,  notes: 'BR443:2019 Annex A' },
  { id: 'cladding-fibre-cement',   name: 'Cladding — fibre cement board (e.g. Hardieplank)',   category: 'Renders & Cladding', lambda: 0.22,  notes: 'Manufacturer declared' },
  { id: 'cladding-pvc',            name: 'Cladding — uPVC / PVC',                 category: 'Renders & Cladding', lambda: 0.17,  notes: 'ISO 10456:2007' },

  // ─── ROOFING ──────────────────────────────────────────────────────────────
  { id: 'roof-tile-clay',          name: 'Roof tile — clay (plain/interlocking)',  category: 'Roofing', lambda: 1.00,  notes: 'BR443:2019 Annex A' },
  { id: 'roof-tile-concrete',      name: 'Roof tile — concrete',                  category: 'Roofing', lambda: 1.50,  notes: 'BR443:2019 Annex A' },
  { id: 'roof-slate-natural',      name: 'Slate — natural (Welsh/Spanish)',        category: 'Roofing', lambda: 2.00,  notes: 'BR443:2019 Annex A' },
  { id: 'roof-slate-fibre-cement', name: 'Slate — fibre cement (artificial)',      category: 'Roofing', lambda: 0.70,  notes: 'Manufacturer declared' },
  { id: 'roof-felt-bitumen',       name: 'Roofing felt — traditional bituminous',  category: 'Roofing', lambda: 0.19,  notes: 'BR443:2019 Annex A; R negligible <0.005' },
  { id: 'roof-membrane-breather',  name: 'Breather membrane / vapour-permeable underlay',  category: 'Roofing', lambda: 0.19,  notes: 'BR443:2019 Annex A; R negligible' },
  { id: 'sarking-board-softwood',  name: 'Sarking board — softwood',              category: 'Roofing', lambda: 0.13,  notes: 'BR443:2019 Annex A' },
  { id: 'sarking-board-osb',       name: 'Sarking board — OSB',                   category: 'Roofing', lambda: 0.13,  notes: 'BR443:2019 Annex A' },

  // ─── FLOORING ─────────────────────────────────────────────────────────────
  { id: 'concrete-ground-slab',    name: 'Concrete ground slab (unreinforced)',    category: 'Flooring', lambda: 1.35,  notes: 'BR443:2019 Annex A' },
  { id: 'insulated-concrete-slab', name: 'Lightweight insulating concrete slab',  category: 'Flooring', lambda: 0.35,  notes: 'ISO 10456:2007; product-specific' },

  // ─── METALS & STRUCTURAL ──────────────────────────────────────────────────
  { id: 'steel',                   name: 'Steel (mild / structural)',              category: 'Metals & Structural', lambda: 50.0,  notes: 'ISO 10456:2007; use for thermal bridging fraction in combined method' },
  { id: 'stainless-steel',         name: 'Stainless steel',                       category: 'Metals & Structural', lambda: 16.0,  notes: 'ISO 10456:2007' },
  { id: 'aluminium',               name: 'Aluminium',                             category: 'Metals & Structural', lambda: 160.0, notes: 'ISO 10456:2007; avoid in thermal layers' },
  { id: 'galvanised-steel',        name: 'Galvanised steel (wall ties / Z-spacers)',  category: 'Metals & Structural', lambda: 50.0,  notes: 'ISO 10456:2007' },

  // ─── AIR GAPS & CAVITIES ──────────────────────────────────────────────────
  { id: 'unventilated-cavity',         name: 'Unventilated air cavity (≥25mm)',         category: 'Air Gaps & Cavities', fixedR: 0.18, notes: 'BR443:2019 Table 7; fixed R regardless of width' },
  { id: 'slightly-ventilated-cavity',  name: 'Slightly ventilated cavity (<500mm²/m²)', category: 'Air Gaps & Cavities', fixedR: 0.09, notes: 'BR443:2019 Table 7' },
  { id: 'ventilated-cavity',           name: 'Well-ventilated cavity (>500mm²/m²)',     category: 'Air Gaps & Cavities', fixedR: 0.00, notes: 'BR443:2019 Table 7; no thermal resistance — Rso applies to inner surface' },
];

export const MATERIAL_CATEGORIES: MaterialCategory[] = [
  'Masonry & Concrete',
  'Insulation — Rigid Board',
  'Insulation — Mineral Wool',
  'Insulation — Loose Fill',
  'Insulation — Natural & Bio-based',
  'Insulation — Specialist',
  'Timber & Wood Products',
  'Finishes & Boards',
  'Renders & Cladding',
  'Roofing',
  'Flooring',
  'Metals & Structural',
  'Air Gaps & Cavities',
];

export function getMaterialById(id: string): Material | undefined {
  return MATERIALS.find((m) => m.id === id);
}
