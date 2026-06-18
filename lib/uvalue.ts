// BR443:2019 combined method U-value calculation

export type ElementType =
  | 'wall'
  | 'flat-roof'
  | 'pitched-roof-ceiling'
  | 'pitched-roof-rafter'
  | 'ground-floor'
  | 'intermediate-floor';

export const SURFACE_RESISTANCES: Record<ElementType, { Rsi: number; Rso: number }> = {
  'wall': { Rsi: 0.13, Rso: 0.04 },
  'flat-roof': { Rsi: 0.10, Rso: 0.04 },
  'pitched-roof-ceiling': { Rsi: 0.10, Rso: 0.04 },
  'pitched-roof-rafter': { Rsi: 0.10, Rso: 0.04 },
  'ground-floor': { Rsi: 0.17, Rso: 0.04 },
  'intermediate-floor': { Rsi: 0.17, Rso: 0.17 },
};

export const ELEMENT_TYPE_LABELS: Record<ElementType, string> = {
  'wall': 'Wall',
  'flat-roof': 'Flat Roof',
  'pitched-roof-ceiling': 'Pitched Roof (insulation at ceiling)',
  'pitched-roof-rafter': 'Pitched Roof (insulation at rafter)',
  'ground-floor': 'Ground Floor',
  'intermediate-floor': 'Intermediate Floor',
};

export interface LayerInput {
  id: string;
  name: string;
  thicknessMm: number;
  lambda?: number;
  fixedR?: number;
  bridged: boolean;
  bridgingMaterial?: { name: string; lambda: number };
  bridgingFraction?: number;
}

export interface LayerResult {
  id: string;
  name: string;
  thicknessMm: number;
  lambda?: number;
  R: number;
  isBridged: boolean;
  bridgingDetails?: string;
}

export interface UValueResult {
  uValue: number;
  totalR: number;
  Rsi: number;
  Rso: number;
  layers: LayerResult[];
  elementType: ElementType;
  valid: boolean;
  error?: string;
}

function calcLayerR(layer: LayerInput): { R: number; bridgingDetails?: string } {
  if (layer.fixedR !== undefined) return { R: layer.fixedR };
  const thicknessM = layer.thicknessMm / 1000;
  if (!layer.lambda || thicknessM <= 0) return { R: 0 };
  if (!layer.bridged || !layer.bridgingMaterial || layer.bridgingFraction === undefined) {
    return { R: thicknessM / layer.lambda };
  }
  const f1 = 1 - layer.bridgingFraction;
  const f2 = layer.bridgingFraction;
  const lambda1 = layer.lambda;
  const lambda2 = layer.bridgingMaterial.lambda;
  const R1 = thicknessM / lambda1;
  const R2 = thicknessM / lambda2;
  const R_upper = 1 / (f1 / R1 + f2 / R2);
  const R_lower = thicknessM / (f1 * lambda1 + f2 * lambda2);
  return {
    R: (R_upper + R_lower) / 2,
    bridgingDetails: `${(f2 * 100).toFixed(0)}% ${layer.bridgingMaterial.name} (λ=${lambda2})`,
  };
}

export function calculateUValue(elementType: ElementType, layers: LayerInput[]): UValueResult {
  const { Rsi, Rso } = SURFACE_RESISTANCES[elementType];
  const layerResults: LayerResult[] = [];
  let totalLayerR = 0;
  for (const layer of layers) {
    const { R, bridgingDetails } = calcLayerR(layer);
    totalLayerR += R;
    layerResults.push({ id: layer.id, name: layer.name, thicknessMm: layer.thicknessMm, lambda: layer.lambda, R, isBridged: layer.bridged && !!layer.bridgingMaterial, bridgingDetails });
  }
  const totalR = Rsi + totalLayerR + Rso;
  const uValue = totalR > 0 ? 1 / totalR : 0;
  return { uValue: Math.round(uValue * 1000) / 1000, totalR: Math.round(totalR * 1000) / 1000, Rsi, Rso, layers: layerResults, elementType, valid: totalR > 0 };
}

export function uValueColour(uValue: number, elementType: ElementType): 'green' | 'amber' | 'red' {
  const thresholds: Record<ElementType, { good: number; ok: number }> = {
    'wall': { good: 0.18, ok: 0.26 },
    'flat-roof': { good: 0.13, ok: 0.20 },
    'pitched-roof-ceiling': { good: 0.13, ok: 0.20 },
    'pitched-roof-rafter': { good: 0.13, ok: 0.20 },
    'ground-floor': { good: 0.13, ok: 0.22 },
    'intermediate-floor': { good: 0.20, ok: 0.30 },
  };
  const t = thresholds[elementType];
  if (uValue <= t.good) return 'green';
  if (uValue <= t.ok) return 'amber';
  return 'red';
}
