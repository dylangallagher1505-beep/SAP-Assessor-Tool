import { describe, it, expect } from 'vitest'
import { overlapLength, computeAdjacencies } from '../adjacency'
import { W, rectWalls } from './helpers'
import { wallLength } from '../takeoffCalc'

describe('overlapLength', () => {
  it('full coincident (reversed winding) = full length', () => {
    expect(overlapLength(W(4, 0, 4, 3), W(4, 3, 4, 0))).toBeCloseTo(3, 6)
  })
  it('partial collinear overlap', () => {
    expect(overlapLength(W(0, 0, 8, 0), W(2, 0, 6, 0))).toBeCloseTo(4, 6)
  })
  it('parallel but offset beyond tolerance = 0', () => {
    expect(overlapLength(W(0, 0, 4, 0), W(0, 0.5, 4, 0.5))).toBe(0)
  })
  it('perpendicular = 0', () => {
    expect(overlapLength(W(0, 0, 4, 0), W(4, 0, 4, 3))).toBe(0)
  })
  it('collinear but disjoint (end to end, no overlap) = 0', () => {
    expect(overlapLength(W(0, 0, 4, 0), W(4, 0, 8, 0))).toBeCloseTo(0, 6)
  })
})

describe('computeAdjacencies — two rooms sharing one wall', () => {
  const walls = [...rectWalls(0, 0, 4, 3, 'a'), ...rectWalls(4, 0, 4, 3, 'b')]
  const adj = computeAdjacencies(walls)

  it('the shared partition is fully internal on both sides', () => {
    expect(adj.get('a2')!.sharedLength).toBeCloseTo(3, 6) // a right wall
    expect(adj.get('b4')!.sharedLength).toBeCloseTo(3, 6) // b left wall
    expect(adj.get('a2')!.exposedLength).toBeCloseTo(0, 6)
  })
  it('outer walls are fully exposed', () => {
    expect(adj.get('a1')!.sharedLength).toBe(0)
    expect(adj.get('a1')!.exposedLength).toBeCloseTo(4, 6)
  })

  it('INVARIANT: shared + exposed = length, and shared <= length, for every wall', () => {
    for (const w of walls) {
      const a = adj.get(w.id)!
      const l = wallLength(w)
      expect(a.sharedLength + a.exposedLength).toBeCloseTo(l, 6)
      expect(a.sharedLength).toBeLessThanOrEqual(l + 1e-9)
      expect(a.sharedLength).toBeGreaterThanOrEqual(0)
    }
  })
})

describe('computeAdjacencies — isolated rectangle has no internal walls', () => {
  it('all four walls fully exposed', () => {
    const walls = rectWalls(0, 0, 5, 4, 'r')
    const adj = computeAdjacencies(walls)
    for (const w of walls) expect(adj.get(w.id)!.sharedLength).toBe(0)
  })
})
