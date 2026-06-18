export type MaterialCategory =
  | 'Masonry & Concrete'
  | 'Insulation'
  | 'Timber & Wood Products'
  | 'Finishes & Boards'
  | 'Air Gaps & Cavities'
  | 'Roofing'
  | 'Flooring'
  | 'Custom';

export interface Material {
  id: string;
  name: string;
  category: MaterialCategory;
  lambda?: number;
  fixedR?: number;
}

export const MATERIALS: Material[] = [
  { id: 'dense-concrete-block', name: 'Dense aggregate concrete block', category: 'Masonry & Concrete', lambda: 1.13 },
  { id: 'medium-density-block', name: 'Medium density aggregate block', category: 'Masonry & Concrete', lambda: 0.57 },
  { id: 'aac-block-600', name: 'Aircrete / AAC block (600 kg/m³)', category: 'Masonry & Concrete', lambda: 0.15 },
  { id: 'aac-block-450', name: 'Aircrete / AAC block (450 kg/m³)', category: 'Masonry & Concrete', lambda: 0.11 },
  { id: 'brick-outer', name: 'Brick (outer leaf)', category: 'Masonry & Concrete', lambda: 0.77 },
  { id: 'brick-inner', name: 'Brick (inner leaf)', category: 'Masonry & Concrete', lambda: 0.56 },
  { id: 'cast-concrete', name: 'Cast in-situ concrete', category: 'Masonry & Concrete', lambda: 1.35 },
  { id: 'screed', name: 'Screed (sand/cement)', category: 'Masonry & Concrete', lambda: 0.41 },
  { id: 'eps', name: 'EPS (expanded polystyrene)', category: 'Insulation', lambda: 0.038 },
  { id: 'xps', name: 'XPS (extruded polystyrene)', category: 'Insulation', lambda: 0.033 },
  { id: 'mineral-wool-glass', name: 'Mineral wool (glass)', category: 'Insulation', lambda: 0.034 },
  { id: 'mineral-wool-rock', name: 'Mineral wool (stone/rock)', category: 'Insulation', lambda: 0.038 },
  { id: 'pir', name: 'PIR rigid insulation (Celotex / Kingspan type)', category: 'Insulation', lambda: 0.022 },
  { id: 'phenolic', name: 'Phenolic foam board', category: 'Insulation', lambda: 0.020 },
  { id: 'wood-fibre', name: 'Wood fibre board', category: 'Insulation', lambda: 0.038 },
  { id: 'spray-puf', name: 'Spray polyurethane foam (PUF)', category: 'Insulation', lambda: 0.040 },
  { id: 'pur-rigid', name: 'Rigid polyurethane (PUR)', category: 'Insulation', lambda: 0.025 },
  { id: 'blown-fibre', name: 'Blown fibre insulation', category: 'Insulation', lambda: 0.044 },
  { id: 'loose-mineral-wool', name: 'Loose fill mineral wool', category: 'Insulation', lambda: 0.044 },
  { id: 'cellulose', name: 'Cellulose (blown)', category: 'Insulation', lambda: 0.040 },
  { id: 'softwood', name: 'Softwood (joists / studs / rafters)', category: 'Timber & Wood Products', lambda: 0.13 },
  { id: 'hardwood', name: 'Hardwood', category: 'Timber & Wood Products', lambda: 0.18 },
  { id: 'plywood', name: 'Plywood', category: 'Timber & Wood Products', lambda: 0.13 },
  { id: 'osb', name: 'OSB (oriented strand board)', category: 'Timber & Wood Products', lambda: 0.13 },
  { id: 'mdf', name: 'MDF / particle board', category: 'Timber & Wood Products', lambda: 0.13 },
  { id: 'chipboard', name: 'Chipboard', category: 'Timber & Wood Products', lambda: 0.13 },
  { id: 'plasterboard', name: 'Plasterboard', category: 'Finishes & Boards', lambda: 0.21 },
  { id: 'dense-plaster', name: 'Dense plaster', category: 'Finishes & Boards', lambda: 0.57 },
  { id: 'lightweight-plaster', name: 'Lightweight plaster', category: 'Finishes & Boards', lambda: 0.18 },
  { id: 'render', name: 'Render (sand/cement)', category: 'Finishes & Boards', lambda: 0.57 },
  { id: 'tile-ceramic', name: 'Tile (ceramic)', category: 'Finishes & Boards', lambda: 1.30 },
  { id: 'carpet', name: 'Carpet + underlay', category: 'Finishes & Boards', lambda: 0.06 },
  { id: 'roof-tile-clay', name: 'Roof tile (clay)', category: 'Roofing', lambda: 1.00 },
  { id: 'roof-tile-concrete', name: 'Roof tile (concrete)', category: 'Roofing', lambda: 1.50 },
  { id: 'slate', name: 'Slate', category: 'Roofing', lambda: 2.00 },
  { id: 'felt-membrane', name: 'Roofing felt / breather membrane', category: 'Roofing', lambda: 0.19 },
  { id: 'timber-flooring', name: 'Timber flooring (boards)', category: 'Flooring', lambda: 0.14 },
  { id: 'engineered-timber', name: 'Engineered timber flooring', category: 'Flooring', lambda: 0.14 },
  { id: 'unventilated-cavity', name: 'Unventilated air cavity (≥25mm)', category: 'Air Gaps & Cavities', fixedR: 0.18 },
  { id: 'slightly-ventilated-cavity', name: 'Slightly ventilated cavity', category: 'Air Gaps & Cavities', fixedR: 0.09 },
];

export const MATERIAL_CATEGORIES: MaterialCategory[] = [
  'Masonry & Concrete',
  'Insulation',
  'Timber & Wood Products',
  'Finishes & Boards',
  'Roofing',
  'Flooring',
  'Air Gaps & Cavities',
];

export function getMaterialById(id: string): Material | undefined {
  return MATERIALS.find((m) => m.id === id);
}
