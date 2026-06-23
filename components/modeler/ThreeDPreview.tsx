'use client'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Grid, Edges } from '@react-three/drei'
import * as THREE from 'three'
import { useMemo } from 'react'
import { useModelerStore, Story, Wall, Point2D } from '@/lib/modelerStore'

// ─── Extruded Room (solid box from footprint polygon) ─────────────────────────

function ExtrudedRoom({ story, isActive }: { story: Story; isActive: boolean }) {
  const geom = useMemo(() => {
    const pts = story.footprintPolygon
    if (pts.length < 3) return null
    const shape = new THREE.Shape()
    shape.moveTo(pts[0].x, pts[0].y)
    for (let i = 1; i < pts.length; i++) shape.lineTo(pts[i].x, pts[i].y)
    shape.closePath()
    return new THREE.ExtrudeGeometry(shape, {
      depth: story.storyHeight,
      bevelEnabled: false,
    })
  }, [story.footprintPolygon, story.storyHeight])

  if (!geom) return null

  return (
    // ExtrudeGeometry extrudes along Z; rotate -90° around X so it extrudes upward (Y)
    <mesh
      geometry={geom}
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, story.startHeight, 0]}
    >
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

// ─── In-progress wall sticks (shown while drawing before shape is closed) ─────

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
      <meshStandardMaterial
        color={isActive ? '#3b82f6' : '#475569'}
        opacity={isActive ? 0.8 : 0.4}
        transparent={!isActive}
      />
    </mesh>
  )
}

// ─── Floor slab label ─────────────────────────────────────────────────────────

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
  const { stories, activeStoryId } = useModelerStore()

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
              // Closed room: show solid extruded volume
              <>
                <ExtrudedRoom story={story} isActive={isActive} />
                <FloorSlab story={story} />
              </>
            ) : (
              // In-progress: show individual wall sticks
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
