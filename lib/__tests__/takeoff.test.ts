import { describe, it, expect } from 'vitest'
import { calcStoryTakeoff } from '../takeoffCalc'
import {
  rectWalls, rectPolygon, makeStory,
  translate, rotate, mirrorX, xfStory,
} from './helpers'

// ─── Golden dwelling A: single 5×4 m rectangular room, 2.4 m high ────────────
describe('golden: single rectangular room (bungalow)', () => {
  const story = makeStory({
    storyHeight: 2.4,
    walls: rectWalls(0, 0, 5, 4, 'r'),
    rooms: [{ id: 'R', name: 'Room', polygon: rectPolygon(0, 0, 5, 4) }],
    footprintPolygon: rectPolygon(0, 0, 5, 4),
  })
  const t = calcStoryTakeoff(story)

  it('floor area = 20 m²', () => expect(t.floorArea).toBeCloseTo(20, 6))
  it('gross wall = perimeter 18 m × 2.4 = 43.2 m²', () => expect(t.wallSurfaceArea).toBeCloseTo(43.2, 6))
  it('no internal walls; all wall area is external', () => {
    expect(t.internalWallArea).toBeCloseTo(0, 6)
    expect(t.externalWallArea).toBeCloseTo(43.2, 6)
  })
})

// ─── Golden dwelling B: two 4×3 m rooms sharing a 3 m partition, 2.5 m high ──
describe('golden: two adjacent rooms sharing a partition', () => {
  const story = makeStory({
    storyHeight: 2.5,
    walls: [...rectWalls(0, 0, 4, 3, 'a'), ...rectWalls(4, 0, 4, 3, 'b')],
    rooms: [
      { id: 'A', name: 'A', polygon: rectPolygon(0, 0, 4, 3) },
      { id: 'B', name: 'B', polygon: rectPolygon(4, 0, 4, 3) },
    ],
    footprintPolygon: rectPolygon(0, 0, 4, 3),
  })
  const t = calcStoryTakeoff(story)

  it('floor area = 24 m² (both rooms)', () => expect(t.floorArea).toBeCloseTo(24, 6))
  it('gross wall = 70 m² (every wall, both faces of the shared one)', () =>
    expect(t.wallSurfaceArea).toBeCloseTo(70, 6))
  it('external wall = 55 m² (shared partition excluded)', () =>
    expect(t.externalWallArea).toBeCloseTo(55, 6))
  it('internal wall = 15 m² (the two 3 m shared faces × 2.5)', () =>
    expect(t.internalWallArea).toBeCloseTo(15, 6))

  it('INVARIANT: gross = external + internal', () =>
    expect(t.externalWallArea + t.internalWallArea).toBeCloseTo(t.wallSurfaceArea, 6))
})

// ─── Transform invariance: areas must not change under rigid motion or mirror ─
describe('INVARIANT: takeoff areas are transform-invariant', () => {
  const base = makeStory({
    storyHeight: 2.5,
    walls: [...rectWalls(0, 0, 4, 3, 'a'), ...rectWalls(4, 0, 4, 3, 'b')],
    rooms: [
      { id: 'A', name: 'A', polygon: rectPolygon(0, 0, 4, 3) },
      { id: 'B', name: 'B', polygon: rectPolygon(4, 0, 4, 3) },
    ],
    footprintPolygon: rectPolygon(0, 0, 4, 3),
  })
  const ref = calcStoryTakeoff(base)

  const cases: [string, ReturnType<typeof calcStoryTakeoff>][] = [
    ['translate', calcStoryTakeoff(xfStory(base, translate(13.5, -7.2)))],
    ['rotate 37°', calcStoryTakeoff(xfStory(base, rotate(37)))],
    ['mirror X (flips winding)', calcStoryTakeoff(xfStory(base, mirrorX))],
  ]

  for (const [name, t] of cases) {
    it(`${name}: floor/gross/external/internal unchanged`, () => {
      expect(t.floorArea).toBeCloseTo(ref.floorArea, 5)
      expect(t.wallSurfaceArea).toBeCloseTo(ref.wallSurfaceArea, 5)
      expect(t.externalWallArea).toBeCloseTo(ref.externalWallArea, 5)
      expect(t.internalWallArea).toBeCloseTo(ref.internalWallArea, 5)
    })
  }
})
