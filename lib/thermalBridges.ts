import type { Story, RoofConfig } from './modelerStore'
import { computeAdjacencies } from './adjacency'
import { wallLength, calcRoofTakeoff, polygonArea } from './takeoffCalc'

/**
 * Thermal bridging — SAP 10.2 Appendix K linear-transmittance method.
 *
 *   HTB = Σ (Lⱼ × ψⱼ)      [W/K]
 *
 * where Lⱼ is the length of junction j and ψⱼ its linear thermal
 * transmittance. This module DERIVES the junction lengths from the building
 * geometry; ψ values are assessor inputs (confirmed against the actual
 * construction / Accredited Construction Details), so the defaults here are
 * indicative starting points only and every row is editable in the UI.
 *
 * A simplified alternative SAP allows is the flat y-value method:
 *   HTB = y × Σ A_exposed
 * with y = 0.15 (default), 0.08, or 0.05 (Accredited Construction Details).
 */

export interface JunctionDef {
  key: string
  ref: string          // SAP Appendix K reference
  label: string
  defaultPsi: number   // W/m·K — indicative SAP default, ALWAYS editable
}

/** The junction types this tool derives lengths for. ψ defaults are indicative. */
export const JUNCTION_DEFS: JunctionDef[] = [
  { key: 'openingLintel', ref: 'E2',  label: 'Window/door head (lintel)', defaultPsi: 0.30 },
  { key: 'openingSill',   ref: 'E3',  label: 'Window sill',               defaultPsi: 0.04 },
  { key: 'openingJamb',   ref: 'E4',  label: 'Window/door jamb',          defaultPsi: 0.05 },
  { key: 'groundFloor',   ref: 'E5',  label: 'Ground floor / wall',       defaultPsi: 0.16 },
  { key: 'intermediate',  ref: 'E6',  label: 'Intermediate floor / wall', defaultPsi: 0.07 },
  { key: 'eaves',         ref: 'E10', label: 'Eaves (roof / wall)',       defaultPsi: 0.06 },
  { key: 'gable',         ref: 'E12', label: 'Gable (roof / wall)',       defaultPsi: 0.24 },
  { key: 'corner',        ref: 'E16', label: 'External corner',           defaultPsi: 0.09 },
]

export interface JunctionRow {
  key: string
  ref: string
  label: string
  length: number   // m — derived from geometry, user-editable
  psi: number      // W/m·K — user-editable
  derived: boolean // true if length came from the model (vs user-added)
}

const isExternal = (wallType: string) => wallType !== 'party' && wallType !== 'internal'

/** Exposed external-wall perimeter of a storey (heat-loss walls only). */
function exposedPerimeter(story: Story): number {
  const adj = computeAdjacencies(story.walls)
  let p = 0
  for (const w of story.walls) {
    if (!isExternal(w.wallType)) continue
    p += adj.get(w.id)?.exposedLength ?? wallLength(w)
  }
  return p
}

/** Count of external corners on a storey — a robust heuristic: each mostly-exposed
 *  external wall contributes one corner (a closed external loop has #corners = #edges). */
function externalCornerCount(story: Story): number {
  const adj = computeAdjacencies(story.walls)
  let n = 0
  for (const w of story.walls) {
    if (!isExternal(w.wallType)) continue
    const l = wallLength(w)
    const exposed = adj.get(w.id)?.exposedLength ?? l
    if (l > 0.1 && exposed >= l / 2) n++
  }
  return n
}

/** Derive junction lengths (metres) for the whole building from its geometry. */
export function deriveJunctionLengths(stories: Story[], roofConfig: RoofConfig): Record<string, number> {
  const out: Record<string, number> = {
    openingLintel: 0, openingSill: 0, openingJamb: 0,
    groundFloor: 0, intermediate: 0, eaves: 0, gable: 0, corner: 0,
  }
  if (stories.length === 0) return out

  // Openings — head (width), sill (windows only, width), jambs (2 × height)
  for (const st of stories) {
    for (const op of st.openings) {
      out.openingLintel += op.width
      out.openingJamb += 2 * op.height
      if (op.type === 'window') out.openingSill += op.width
    }
  }

  // Ground floor / wall — exposed perimeter of the lowest storey
  out.groundFloor = exposedPerimeter(stories[0])

  // Intermediate floor / wall — exposed perimeter of every storey above ground
  for (let i = 1; i < stories.length; i++) out.intermediate += exposedPerimeter(stories[i])

  // Corners — summed over every storey, one corner runs the full storey height
  for (const st of stories) out.corner += externalCornerCount(st) * st.storyHeight

  // Roof junctions — top storey: eaves = exposed perimeter; gable from roof faces
  const top = stories[stories.length - 1]
  out.eaves = exposedPerimeter(top)
  if (top.footprintPolygon.length >= 3) {
    const rt = calcRoofTakeoff(top, roofConfig)
    // Approximate gable junction length from the gable-end triangle base widths:
    // each gable end contributes roughly its base = footprint edge it sits on.
    // Use the count of gable-end faces × the footprint's shorter span as an estimate.
    const nGable = rt.planes.filter((p) => p.isWall).length
    if (nGable > 0) {
      const xs = top.footprintPolygon.map((p) => p.x)
      const ys = top.footprintPolygon.map((p) => p.y)
      const span = Math.min(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys))
      out.gable = nGable * span
    }
  }

  return out
}

/** Build editable rows from derived lengths + default ψ. */
export function buildJunctionRows(lengths: Record<string, number>): JunctionRow[] {
  return JUNCTION_DEFS.map((d) => ({
    key: d.key, ref: d.ref, label: d.label,
    length: Math.round((lengths[d.key] ?? 0) * 100) / 100,
    psi: d.defaultPsi,
    derived: true,
  }))
}

/** HTB via the linear method: Σ L×ψ  [W/K]. */
export function calcHTB(rows: JunctionRow[]): number {
  return rows.reduce((s, r) => s + r.length * r.psi, 0)
}

/** HTB via the simplified flat y-value method: y × exposed area  [W/K]. */
export function yValueHTB(exposedArea: number, y: number): number {
  return exposedArea * y
}

export const Y_VALUE_OPTIONS = [
  { y: 0.15, label: 'Default (0.15)' },
  { y: 0.08, label: 'Some detailing (0.08)' },
  { y: 0.05, label: 'ACD (0.05)' },
]
