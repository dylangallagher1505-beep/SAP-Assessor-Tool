import { describe, it, expect } from 'vitest'
import { buildRoofFaces } from '../roofGeometry'
import { rectPolygon } from './helpers'
import type { RoofConfig } from '../modelerStore'

const cfg = (over: Partial<RoofConfig> = {}): RoofConfig => ({
  type: 'gable', pitchDegrees: 30, ridgeOffsetFraction: 0.5, ...over,
})

const footprint = rectPolygon(0, 0, 8, 5)
const footprintArea = 40

function roofArea(faces: ReturnType<typeof buildRoofFaces>) {
  return faces.filter((f) => !f.isGableEnd).reduce((s, f) => s + f.area, 0)
}
function gableArea(faces: ReturnType<typeof buildRoofFaces>) {
  return faces.filter((f) => f.isGableEnd).reduce((s, f) => s + f.area, 0)
}

describe('buildRoofFaces', () => {
  it('flat roof area equals footprint area', () => {
    const faces = buildRoofFaces(footprint, 0, cfg({ type: 'flat' }))
    expect(roofArea(faces)).toBeCloseTo(footprintArea, 4)
    expect(gableArea(faces)).toBe(0)
  })

  it('pitched roof surface area is greater than footprint', () => {
    const faces = buildRoofFaces(footprint, 0, cfg({ type: 'gable' }))
    expect(roofArea(faces)).toBeGreaterThan(footprintArea)
  })

  it('gable roof: two roof planes + two vertical gable ends', () => {
    const faces = buildRoofFaces(footprint, 0, cfg({ type: 'gable' }))
    expect(faces.filter((f) => !f.isGableEnd).length).toBe(2)
    expect(faces.filter((f) => f.isGableEnd).length).toBe(2)
    // Known value: 8×5 @30° → each plane 23.09 m², each gable 3.61 m²
    expect(roofArea(faces)).toBeCloseTo(46.19, 1)
    expect(gableArea(faces)).toBeCloseTo(7.22, 1)
  })

  it('hip roof has no gable ends (all slopes)', () => {
    const faces = buildRoofFaces(footprint, 0, cfg({ type: 'hip' }))
    expect(gableArea(faces)).toBeCloseTo(0, 2)
    expect(roofArea(faces)).toBeGreaterThan(footprintArea)
  })

  it('INVARIANT: total roof area is unchanged by translating the footprint', () => {
    const moved = footprint.map((p) => ({ x: p.x + 13.5, y: p.y - 7.2 }))
    const a = roofArea(buildRoofFaces(footprint, 0, cfg()))
    const b = roofArea(buildRoofFaces(moved, 0, cfg()))
    expect(b).toBeCloseTo(a, 4)
  })
})
