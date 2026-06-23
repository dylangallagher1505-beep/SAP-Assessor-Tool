'use client'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Grid, Edges } from '@react-three/drei'
import * as THREE from 'three'
import { useMemo } from 'react'
import { useModelerStore, Story, Wall, Point2D, RoofConfig } from '@/lib/modelerStore'

// ─── Extruded Room ────────────────────────────────────────────────────────────

function ExtrudedRoom({ story, isActive }: { story: Story; isActive: boolean }) {
  const geom = useMemo(() => {
    const pts = story.footprintPolygon
    if (pts.length < 3) return null
    const shape = new THREE.Shape()
    shape.moveTo(pts[0].x, pts[0].y)
    for (let i = 1; i < pts.length; i++) shape.lineTo(pts[i].x, pts[i].y)
    shape.closePath()
    return new THREE.ExtrudeGeometry(shape, { depth: story.storyHeight, bevelEnabled: false })
  }, [story.footprintPolygon, story.storyHeight])

  if (!geom) return null

  return (
    <mesh geometry={geom} rotation={[-Math.PI / 2, 0, 0]} position={[0, story.startHeight, 0]}>
      <meshStandardMaterial
        color={isActive ? '#1e40af' : '#334155'}
        opacity={isActive ? 0.55 : 0.35}
        transparent
        side={THREE.DoubleSide}
      />
      <Edges color={isActive ? '#60a5fa' : '#475569'} lineWidth={isActive ? 1.5 : 1} />
    </mesh>
  )
}

// ─── In-progress wall sticks ──────────────────────────────────────────────────

function WallMesh({ wall, storyHeight, startHeight, isActive }: {
  wall: Wall; storyHeight: number; startHeight: number; isActive: boolean
}) {
  const { position, rotation, length } = useMemo(() => {
    const dx = wall.end.x - wall.start.x
    const dy = wall.end.y - wall.start.y
    const length = Math.sqrt(dx * dx + dy * dy)
    const angle = Math.atan2(dy, dx)
    return {
      length,
      rotation: angle,
      position: [(wall.start.x + wall.end.x) / 2, startHeight + storyHeight / 2, (wall.start.y + wall.end.y) / 2] as [number, number, number],
    }
  }, [wall, startHeight, storyHeight])

  if (length < 0.01) return null

  return (
    <mesh position={position} rotation={[0, -rotation, 0]}>
      <boxGeometry args={[length, storyHeight, 0.15]} />
      <meshStandardMaterial color={isActive ? '#3b82f6' : '#475569'} opacity={isActive ? 0.8 : 0.4} transparent={!isActive} />
    </mesh>
  )
}

// ─── Floor slab ───────────────────────────────────────────────────────────────

function FloorSlab({ story }: { story: Story }) {
  const pts = story.footprintPolygon.length >= 3 ? story.footprintPolygon : wallsToConvexHull(story.walls)
  const shape = useMemo(() => {
    if (pts.length < 3) return null
    const s = new THREE.Shape()
    s.moveTo(pts[0].x, pts[0].y)
    for (let i = 1; i < pts.length; i++) s.lineTo(pts[i].x, pts[i].y)
    s.closePath()
    return s
  }, [pts])

  if (!shape) return null

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, story.startHeight + 0.01, 0]}>
      <shapeGeometry args={[shape]} />
      <meshStandardMaterial color="#0f172a" opacity={0.9} transparent side={THREE.DoubleSide} />
    </mesh>
  )
}

// ─── Roof generator ───────────────────────────────────────────────────────────

/** Each plane = array of coplanar [x,y,z] vertices (triangle-fan from v[0]) */
type RoofFace = { verts: [number, number, number][]; label: string }

function buildRoofFaces(pts: Point2D[], eaveY: number, cfg: RoofConfig): RoofFace[] {
  if (pts.length < 3) return []

  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y)
  const minX = Math.min(...xs), maxX = Math.max(...xs)
  const minY = Math.min(...ys), maxY = Math.max(...ys)
  const w = maxX - minX   // east-west span
  const d = maxY - minY   // north-south span
  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2
  const pitchRad = (cfg.pitchDegrees * Math.PI) / 180
  const rise = (Math.min(w, d) / 2) * Math.tan(pitchRad)

  if (cfg.type === 'flat') {
    const verts = pts.map((p) => [p.x, eaveY + 0.05, p.y] as [number, number, number])
    return [{ verts, label: 'Flat Roof' }]
  }

  if (cfg.type === 'shed') {
    // Single slope: low eave at minY, high at maxY
    const highY = eaveY + d * Math.tan(pitchRad)
    return [{
      label: 'Shed',
      verts: [
        [minX, eaveY, minY],
        [maxX, eaveY, minY],
        [maxX, highY,  maxY],
        [minX, highY,  maxY],
      ],
    }]
  }

  if (cfg.type === 'gable') {
    const ridgeY = eaveY + rise
    // Ridge runs east-west at centre (N-S midpoint)
    return [
      {
        label: 'Front Slope',
        verts: [
          [minX, eaveY, minY],
          [maxX, eaveY, minY],
          [maxX, ridgeY, cy],
          [minX, ridgeY, cy],
        ],
      },
      {
        label: 'Rear Slope',
        verts: [
          [maxX, eaveY, maxY],
          [minX, eaveY, maxY],
          [minX, ridgeY, cy],
          [maxX, ridgeY, cy],
        ],
      },
      {
        label: 'Gable West',
        verts: [
          [minX, eaveY, minY],
          [minX, ridgeY, cy],
          [minX, eaveY, maxY],
        ],
      },
      {
        label: 'Gable East',
        verts: [
          [maxX, eaveY, maxY],
          [maxX, ridgeY, cy],
          [maxX, eaveY, minY],
        ],
      },
    ]
  }

  if (cfg.type === 'hip') {
    const ridgeY = eaveY + rise
    // Ridge runs E-W; hip ends taper to a point
    const hipOffsetX = (d / 2) // how far ridge is inset from E/W ends
    const ridgeMinX = minX + hipOffsetX
    const ridgeMaxX = maxX - hipOffsetX
    if (ridgeMinX >= ridgeMaxX) {
      // Square plan — hip meets at a point (pyramid)
      return [
        { label: 'Hip South', verts: [[minX, eaveY, minY], [maxX, eaveY, minY], [cx, ridgeY, cy]] },
        { label: 'Hip North', verts: [[maxX, eaveY, maxY], [minX, eaveY, maxY], [cx, ridgeY, cy]] },
        { label: 'Hip East',  verts: [[maxX, eaveY, minY], [maxX, eaveY, maxY], [cx, ridgeY, cy]] },
        { label: 'Hip West',  verts: [[minX, eaveY, maxY], [minX, eaveY, minY], [cx, ridgeY, cy]] },
      ]
    }
    return [
      {
        label: 'Hip Front',
        verts: [
          [minX, eaveY, minY],
          [maxX, eaveY, minY],
          [ridgeMaxX, ridgeY, cy],
          [ridgeMinX, ridgeY, cy],
        ],
      },
      {
        label: 'Hip Rear',
        verts: [
          [maxX, eaveY, maxY],
          [minX, eaveY, maxY],
          [ridgeMinX, ridgeY, cy],
          [ridgeMaxX, ridgeY, cy],
        ],
      },
      { label: 'Hip End W', verts: [[minX, eaveY, maxY], [minX, eaveY, minY], [ridgeMinX, ridgeY, cy]] },
      { label: 'Hip End E', verts: [[maxX, eaveY, minY], [maxX, eaveY, maxY], [ridgeMaxX, ridgeY, cy]] },
    ]
  }

  return []
}

function faceToGeometry(verts: [number, number, number][]): THREE.BufferGeometry {
  const geom = new THREE.BufferGeometry()
  // Fan triangulation from verts[0]
  const positions: number[] = []
  for (let i = 1; i < verts.length - 1; i++) {
    positions.push(...verts[0], ...verts[i], ...verts[i + 1])
  }
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geom.computeVertexNormals()
  return geom
}

function RoofMesh({ pts, eaveY, cfg }: { pts: Point2D[]; eaveY: number; cfg: RoofConfig }) {
  const faces = useMemo(() => buildRoofFaces(pts, eaveY, cfg), [pts, eaveY, cfg])

  return (
    <>
      {faces.map((face, i) => {
        const geom = faceToGeometry(face.verts)
        return (
          <mesh key={i} geometry={geom}>
            <meshStandardMaterial color="#7c3aed" opacity={0.7} transparent side={THREE.DoubleSide} />
            <Edges color="#a78bfa" lineWidth={1} />
          </mesh>
        )
      })}
    </>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function wallsToConvexHull(walls: Wall[]): Point2D[] {
  if (walls.length === 0) return []
  const pts = walls.flatMap((w) => [w.start, w.end])
  return pts.filter((p, i) =>
    pts.findIndex((q) => Math.abs(q.x - p.x) < 0.01 && Math.abs(q.y - p.y) < 0.01) === i
  )
}

// ─── Scene ────────────────────────────────────────────────────────────────────

function Scene() {
  const { stories, activeStoryId, roofConfig, showRoof } = useModelerStore()

  // Roof sits on top of the highest storey
  const topStory = stories.length > 0 ? stories[stories.length - 1] : null
  const roofEaveY = topStory ? topStory.startHeight + topStory.storyHeight : 0
  const roofFootprint = topStory?.footprintPolygon.length ?? 0 >= 3
    ? topStory!.footprintPolygon
    : topStory ? wallsToConvexHull(topStory.walls) : []

  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[10, 20, 10]} intensity={1.2} castShadow />
      <directionalLight position={[-8, 10, -8]} intensity={0.4} />
      <Grid
        args={[40, 40]}
        cellSize={1}
        cellThickness={0.5}
        cellColor="#1e293b"
        sectionSize={5}
        sectionThickness={1}
        sectionColor="#334155"
        fadeDistance={60}
        position={[0, -0.01, 0]}
      />

      {stories.map((story) => {
        const isActive = story.id === activeStoryId
        const hasClosedRoom = story.footprintPolygon.length >= 3

        return (
          <group key={story.id}>
            {hasClosedRoom ? (
              <>
                <ExtrudedRoom story={story} isActive={isActive} />
                <FloorSlab story={story} />
              </>
            ) : (
              <>
                <FloorSlab story={story} />
                {story.walls.map((wall) => (
                  <WallMesh
                    key={wall.id}
                    wall={wall}
                    storyHeight={story.storyHeight}
                    startHeight={story.startHeight}
                    isActive={isActive}
                  />
                ))}
              </>
            )}
          </group>
        )
      })}

      {showRoof && roofFootprint.length >= 3 && (
        <RoofMesh pts={roofFootprint} eaveY={roofEaveY} cfg={roofConfig} />
      )}
    </>
  )
}

// ─── Export ───────────────────────────────────────────────────────────────────

export default function ThreeDPreview({ className }: { className?: string }) {
  return (
    <div
      className={`rounded-lg border border-slate-700 overflow-hidden ${className ?? ''}`}
      style={{ background: '#0f172a' }}
    >
      <Canvas camera={{ position: [12, 10, 12], fov: 50 }} shadows style={{ height: '100%' }}>
        <Scene />
        <OrbitControls makeDefault />
      </Canvas>
    </div>
  )
}
