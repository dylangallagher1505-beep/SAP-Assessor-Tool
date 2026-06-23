'use client'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Grid } from '@react-three/drei'
import * as THREE from 'three'
import { useMemo } from 'react'
import { useModelerStore, Story, Wall, Point2D } from '@/lib/modelerStore'
import { polygonBBox } from '@/lib/takeoffCalc'

// ─── Wall box ────────────────────────────────────────────────────────────────

function WallMesh({ wall, storyHeight, startHeight, isActive }: {
  wall: Wall
  storyHeight: number
  startHeight: number
  isActive: boolean
}) {
  const { position, rotation, length } = useMemo(() => {
    const dx = wall.end.x - wall.start.x
    const dy = wall.end.y - wall.start.y
    const length = Math.sqrt(dx * dx + dy * dy)
    const angle = Math.atan2(dy, dx)
    const midX = (wall.start.x + wall.end.x) / 2
    const midY = (wall.start.y + wall.end.y) / 2
    return {
      length,
      rotation: angle,
      position: [midX, startHeight + storyHeight / 2, midY] as [number, number, number],
    }
  }, [wall, startHeight, storyHeight])

  if (length < 0.01) return null
  const WALL_THICKNESS = 0.2

  return (
    <mesh position={position} rotation={[0, -rotation, 0]}>
      <boxGeometry args={[length, storyHeight, WALL_THICKNESS]} />
      <meshStandardMaterial
        color={isActive ? '#3b82f6' : '#64748b'}
        opacity={isActive ? 1 : 0.6}
        transparent={!isActive}
      />
    </mesh>
  )
}

// ─── Floor slab ───────────────────────────────────────────────────────────────

function FloorSlab({ story }: { story: Story }) {
  const shape = useMemo(() => {
    const pts = story.footprintPolygon.length >= 3
      ? story.footprintPolygon
      : wallsToConvexHull(story.walls)
    if (pts.length < 3) return null
    const shape = new THREE.Shape()
    shape.moveTo(pts[0].x, pts[0].y)
    for (let i = 1; i < pts.length; i++) shape.lineTo(pts[i].x, pts[i].y)
    shape.closePath()
    return shape
  }, [story])

  if (!shape) return null

  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, story.startHeight, 0]}
    >
      <shapeGeometry args={[shape]} />
      <meshStandardMaterial color="#1e3a5f" opacity={0.7} transparent side={THREE.DoubleSide} />
    </mesh>
  )
}

// ─── Roof ─────────────────────────────────────────────────────────────────────

function RoofMesh({ topStory }: { topStory: Story }) {
  const { roofConfig } = useModelerStore()

  const roofGeom = useMemo(() => {
    const pts = topStory.footprintPolygon.length >= 3
      ? topStory.footprintPolygon
      : wallsToConvexHull(topStory.walls)
    if (pts.length < 3) return null

    const bbox = polygonBBox(pts)
    const { minX, maxX, minY, maxY, w, d } = bbox
    const baseY = topStory.startHeight + topStory.storyHeight
    const pitchRad = (roofConfig.pitchDegrees * Math.PI) / 180
    const rise = (Math.min(w, d) / 2) * Math.tan(pitchRad)

    const geom = new THREE.BufferGeometry()

    if (roofConfig.type === 'flat') {
      const verts = new Float32Array([
        minX, baseY, minY,  maxX, baseY, minY,  maxX, baseY, maxY,
        minX, baseY, minY,  maxX, baseY, maxY,  minX, baseY, maxY,
      ])
      geom.setAttribute('position', new THREE.BufferAttribute(verts, 3))
    } else if (roofConfig.type === 'shed') {
      const highY = baseY + rise * 2
      const verts = new Float32Array([
        minX, baseY, minY,  maxX, baseY, minY,  maxX, highY, maxY,
        minX, baseY, minY,  maxX, highY, maxY,  minX, highY, maxY,
      ])
      geom.setAttribute('position', new THREE.BufferAttribute(verts, 3))
    } else if (roofConfig.type === 'gable') {
      const ridgeZ = (minY + maxY) / 2
      const ridgeY = baseY + rise
      // Front slope
      const front = new Float32Array([
        minX, baseY, minY,  maxX, baseY, minY,  maxX, ridgeY, ridgeZ,
        minX, baseY, minY,  maxX, ridgeY, ridgeZ,  minX, ridgeY, ridgeZ,
      ])
      // Back slope
      const back = new Float32Array([
        minX, ridgeY, ridgeZ,  maxX, ridgeY, ridgeZ,  maxX, baseY, maxY,
        minX, ridgeY, ridgeZ,  maxX, baseY, maxY,  minX, baseY, maxY,
      ])
      // Gable ends (triangles)
      const endA = new Float32Array([
        minX, baseY, minY,  minX, ridgeY, ridgeZ,  minX, baseY, maxY,
      ])
      const endB = new Float32Array([
        maxX, baseY, minY,  maxX, baseY, maxY,  maxX, ridgeY, ridgeZ,
      ])
      const all = new Float32Array([...front, ...back, ...endA, ...endB])
      geom.setAttribute('position', new THREE.BufferAttribute(all, 3))
    } else {
      // Hip: simplified as gable fallback
      const ridgeZ = (minY + maxY) / 2
      const ridgeY = baseY + rise
      const front = new Float32Array([
        minX, baseY, minY,  maxX, baseY, minY,  maxX, ridgeY, ridgeZ,
        minX, baseY, minY,  maxX, ridgeY, ridgeZ,  minX, ridgeY, ridgeZ,
      ])
      const back = new Float32Array([
        minX, ridgeY, ridgeZ,  maxX, ridgeY, ridgeZ,  maxX, baseY, maxY,
        minX, ridgeY, ridgeZ,  maxX, baseY, maxY,  minX, baseY, maxY,
      ])
      const all = new Float32Array([...front, ...back])
      geom.setAttribute('position', new THREE.BufferAttribute(all, 3))
    }

    geom.computeVertexNormals()
    return geom
  }, [topStory, roofConfig])

  if (!roofGeom) return null

  return (
    <mesh geometry={roofGeom}>
      <meshStandardMaterial color="#7c3aed" side={THREE.DoubleSide} />
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
  const { stories, activeStoryId, showRoof } = useModelerStore()

  const totalHeight = stories.reduce((max, s) => Math.max(max, s.startHeight + s.storyHeight), 0)
  const topStory = stories[stories.length - 1]

  return (
    <>
      <ambientLight intensity={0.5} />
      <directionalLight position={[10, 20, 10]} intensity={1} castShadow />
      <Grid
        args={[40, 40]}
        cellSize={1}
        cellThickness={0.5}
        cellColor="#334155"
        sectionSize={5}
        sectionThickness={1}
        sectionColor="#475569"
        fadeDistance={50}
        position={[0, -0.01, 0]}
      />

      {stories.map((story) => (
        <group key={story.id}>
          <FloorSlab story={story} />
          {story.walls.map((wall) => (
            <WallMesh
              key={wall.id}
              wall={wall}
              storyHeight={story.storyHeight}
              startHeight={story.startHeight}
              isActive={story.id === activeStoryId}
            />
          ))}
        </group>
      ))}

      {showRoof && topStory && <RoofMesh topStory={topStory} />}
    </>
  )
}

// ─── Export ───────────────────────────────────────────────────────────────────

export default function ThreeDPreview({ className }: { className?: string }) {
  return (
    <div className={`rounded-lg border border-slate-700 overflow-hidden ${className ?? ''}`}
         style={{ background: '#0f172a' }}>
      <Canvas
        camera={{ position: [15, 12, 15], fov: 50 }}
        shadows
        style={{ height: '100%' }}
      >
        <Scene />
        <OrbitControls makeDefault />
      </Canvas>
    </div>
  )
}
