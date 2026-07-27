import { describe, it, expect } from 'vitest'
import { deriveJunctionLengths, buildJunctionRows, calcHTB, yValueHTB } from '../thermalBridges'
import { rectWalls, rectPolygon, makeStory } from './helpers'
import type { RoofConfig } from '../modelerStore'

const flatRoof: RoofConfig = { type: 'flat', pitchDegrees: 0, ridgeOffsetFraction: 0.5 }

describe('deriveJunctionLengths — single 5×4 room', () => {
  const story = makeStory({
    storyHeight: 2.4,
    walls: rectWalls(0, 0, 5, 4, 'r'),
    rooms: [{ id: 'R', name: 'R', polygon: rectPolygon(0, 0, 5, 4) }],
    footprintPolygon: rectPolygon(0, 0, 5, 4),
    openings: [
      { id: 'w1', wallId: 'r0', type: 'window', uOffset: 0.2, width: 1.5, height: 1.2, sillHeight: 0.9, uValue: 1.4, gValue: 0.63 },
      { id: 'd1', wallId: 'r1', type: 'door', uOffset: 0.2, width: 0.9, height: 2.0, sillHeight: 0, uValue: 1.4, gValue: 0.63 },
    ],
  })
  const L = deriveJunctionLengths([story], flatRoof)

  it('ground-floor/wall perimeter = 18 m', () => expect(L.groundFloor).toBeCloseTo(18, 6))
  it('lintel length = sum of opening widths (1.5 + 0.9)', () => expect(L.openingLintel).toBeCloseTo(2.4, 6))
  it('sill length = windows only (1.5)', () => expect(L.openingSill).toBeCloseTo(1.5, 6))
  it('jamb length = 2×height each (2×1.2 + 2×2.0)', () => expect(L.openingJamb).toBeCloseTo(6.4, 6))
  it('4 external corners × 2.4 m height = 9.6 m', () => expect(L.corner).toBeCloseTo(9.6, 6))
  it('no intermediate floors', () => expect(L.intermediate).toBe(0))
  it('flat roof → no gable junctions', () => expect(L.gable).toBe(0))
})

describe('deriveJunctionLengths — two adjacent rooms exclude the shared partition', () => {
  const story = makeStory({
    storyHeight: 2.5,
    walls: [...rectWalls(0, 0, 4, 3, 'a'), ...rectWalls(4, 0, 4, 3, 'b')],
    rooms: [
      { id: 'A', name: 'A', polygon: rectPolygon(0, 0, 4, 3) },
      { id: 'B', name: 'B', polygon: rectPolygon(4, 0, 4, 3) },
    ],
    footprintPolygon: rectPolygon(0, 0, 4, 3),
  })
  const L = deriveJunctionLengths([story], flatRoof)
  // Exposed outline perimeter of the 8×3 combined block = 2×(8+3) = 22 m
  it('ground-floor perimeter counts only exposed walls (22 m, not 28)', () =>
    expect(L.groundFloor).toBeCloseTo(22, 6))
})

describe('calcHTB / yValueHTB', () => {
  it('linear HTB sums length×psi', () => {
    const rows = buildJunctionRows({ groundFloor: 18, corner: 9.6 })
      .filter((r) => r.length > 0)
    // groundFloor 18×0.16 + corner 9.6×0.09 = 2.88 + 0.864 = 3.744
    expect(calcHTB(rows)).toBeCloseTo(3.744, 3)
  })
  it('y-value method = y × exposed area', () => {
    expect(yValueHTB(120, 0.15)).toBeCloseTo(18, 6)
  })
})
