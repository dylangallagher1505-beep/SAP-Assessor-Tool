'use client'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Grid, Edges } from '@react-three/drei'
import * as THREE from 'three'
import { useMemo, useState } from 'react'
import { useModelerStore, Story, Wall, Point2D, RoofConfig, Opening, SelectedFace } from '@/lib/modelerStore'

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
        color={isActive ? '#2563eb' : '#64748b'}
        opacity={isActive ? 0.3 : 0.15}
        transparent
        side={THREE.DoubleSide}
      />
      <Edges color={isActive ? '#3b82f6' : '#94a3b8'} lineWidth={isActive ? 1.5 : 1} />
    </mesh>
  )
}

// ─── Tapered wall quad geometry ───────────────────────────────────────────────

function taperedWallGeometry(
  startX: number, startZ: number,
  endX: number, endZ: number,
  baseY: number, hleft: number, hright: number
): THREE.BufferGeometry {
  // Four corners: bl, br, tr, tl (world XYZ)
  const bl: [number, number, number] = [startX, baseY, startZ]
  const br: [number, number, number] = [endX, baseY, endZ]
  const tr: [number, number, number] = [endX, baseY + hright, endZ]
  const tl: [number, number, number] = [startX, baseY + hleft, startZ]
  // Two triangles: bl-br-tr, bl-tr-tl
  const pos = new Float32Array([
    ...bl, ...br, ...tr,
    ...bl, ...tr, ...tl,
  ])
  const geom = new THREE.BufferGeometry()
  geom.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  geom.computeVertexNormals()
  return geom
}

// ─── Clickable wall face quad (tapered) ──────────────────────────────────────

function WallFaceQuad({ wall, storyId, storyHeight, startHeight, selectedFace, onSelect }: {
  wall: Wall; storyId: string; storyHeight: number; startHeight: number
  selectedFace: SelectedFace; onSelect: (f: SelectedFace) => void
}) {
  const geom = useMemo(() => {
    const dx = wall.end.x - wall.start.x, dy = wall.end.y - wall.start.y
    if (Math.sqrt(dx * dx + dy * dy) < 0.01) return null
    const hl = wall.heightLeft ?? storyHeight
    const hr = wall.heightRight ?? storyHeight
    return taperedWallGeometry(wall.start.x, wall.start.y, wall.end.x, wall.end.y, startHeight, hl, hr)
  }, [wall, storyHeight, startHeight])

  if (!geom) return null
  const isSelected = selectedFace?.type === 'wall' && selectedFace.wallId === wall.id && selectedFace.storyId === storyId

  return (
    <mesh
      geometry={geom}
      onClick={(e) => { e.stopPropagation(); onSelect(isSelected ? null : { type: 'wall', storyId, wallId: wall.id }) }}
    >
      <meshStandardMaterial
        color={isSelected ? '#f59e0b' : '#3b82f6'}
        opacity={isSelected ? 0.35 : 0.0}
        transparent
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </mesh>
  )
}

// ─── Wall solid mesh (tapered) ────────────────────────────────────────────────

function WallMesh({ wall, storyHeight, startHeight, isActive }: {
  wall: Wall; storyHeight: number; startHeight: number; isActive: boolean
}) {
  const geom = useMemo(() => {
    const dx = wall.end.x - wall.start.x, dy = wall.end.y - wall.start.y
    if (Math.sqrt(dx * dx + dy * dy) < 0.01) return null
    const hl = wall.heightLeft ?? storyHeight
    const hr = wall.heightRight ?? storyHeight
    return taperedWallGeometry(wall.start.x, wall.start.y, wall.end.x, wall.end.y, startHeight, hl, hr)
  }, [wall, storyHeight, startHeight])

  if (!geom) return null

  return (
    <mesh geometry={geom}>
      <meshStandardMaterial
        color={isActive ? '#3b82f6' : '#94a3b8'}
        opacity={isActive ? 0.8 : 0.4}
        transparent={!isActive}
        side={THREE.DoubleSide}
      />
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
      <meshStandardMaterial color="#e2e8f0" opacity={0.9} transparent side={THREE.DoubleSide} />
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

function RoofMesh({ pts, eaveY, cfg, selectedFace, onSelect }: {
  pts: Point2D[]; eaveY: number; cfg: RoofConfig
  selectedFace: SelectedFace; onSelect: (f: SelectedFace) => void
}) {
  const faces = useMemo(() => buildRoofFaces(pts, eaveY, cfg), [pts, eaveY, cfg])

  return (
    <>
      {faces.map((face, i) => {
        const geom = faceToGeometry(face.verts)
        const isSelected = selectedFace?.type === 'roof' && selectedFace.faceIndex === i
        return (
          <mesh
            key={i}
            geometry={geom}
            onClick={(e) => { e.stopPropagation(); onSelect(isSelected ? null : { type: 'roof', faceIndex: i, faceLabel: face.label }) }}
          >
            <meshStandardMaterial
              color={isSelected ? '#f59e0b' : '#475569'}
              opacity={isSelected ? 0.65 : 0.5}
              transparent
              side={THREE.DoubleSide}
            />
            <Edges color={isSelected ? '#d97706' : '#94a3b8'} lineWidth={isSelected ? 2 : 1} />
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

// ─── Opening planes on wall faces ────────────────────────────────────────────

function OpeningMeshes({ story }: { story: Story }) {
  const meshes = useMemo(() => {
    return story.openings.flatMap((op) => {
      const wall = story.walls.find((w) => w.id === op.wallId)
      if (!wall) return []
      const dx = wall.end.x - wall.start.x
      const dz = wall.end.y - wall.start.y
      const wallLen = Math.sqrt(dx * dx + dz * dz)
      if (wallLen < 0.01) return []

      const dirX = dx / wallLen, dirZ = dz / wallLen
      // Outward normal (perpendicular to wall direction in XZ plane)
      const normX = dirZ, normZ = -dirX
      const OFFSET = 0.08  // push plane slightly outward to avoid z-fighting

      const uCentre = op.uOffset * wallLen + op.width / 2
      const vCentre = story.startHeight + (op.type === 'door' ? op.height / 2 : op.sillHeight + op.height / 2)

      const cx = wall.start.x + dirX * uCentre + normX * OFFSET
      const cz = wall.start.y + dirZ * uCentre + normZ * OFFSET
      const angle = Math.atan2(dz, dx)

      return [{
        key: op.id,
        position: [cx, vCentre, cz] as [number, number, number],
        rotation: [0, -angle, 0] as [number, number, number],
        width: op.width,
        height: op.height,
        color: op.type === 'window' ? '#38bdf8' : '#f59e0b',
      }]
    })
  }, [story])

  return (
    <>
      {meshes.map((m) => (
        <mesh key={m.key} position={m.position} rotation={m.rotation}>
          <planeGeometry args={[m.width, m.height]} />
          <meshStandardMaterial color={m.color} opacity={0.55} transparent side={THREE.DoubleSide} />
        </mesh>
      ))}
    </>
  )
}

// ─── Scene ────────────────────────────────────────────────────────────────────

function Scene() {
  const { stories, activeStoryId, roofConfig, showRoof, selectedFace, setSelectedFace } = useModelerStore()

  const topStory = stories.length > 0 ? stories[stories.length - 1] : null
  const roofEaveY = topStory ? topStory.startHeight + topStory.storyHeight : 0
  const roofFootprint = topStory?.footprintPolygon.length ?? 0 >= 3
    ? topStory!.footprintPolygon
    : topStory ? wallsToConvexHull(topStory.walls) : []

  return (
    <>
      <ambientLight intensity={0.8} />
      <directionalLight position={[10, 20, 10]} intensity={1.0} castShadow />
      <directionalLight position={[-8, 10, -8]} intensity={0.3} />
      <Grid
        args={[40, 40]}
        cellSize={1}
        cellThickness={0.5}
        cellColor="#cbd5e1"
        sectionSize={5}
        sectionThickness={1}
        sectionColor="#94a3b8"
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
                {story.openings.length > 0 && <OpeningMeshes story={story} />}
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
            {/* Clickable face quads overlaid on every wall (closed or open) */}
            {story.walls.map((wall) => (
              <WallFaceQuad
                key={`fq-${wall.id}`}
                wall={wall}
                storyId={story.id}
                storyHeight={story.storyHeight}
                startHeight={story.startHeight}
                selectedFace={selectedFace}
                onSelect={setSelectedFace}
              />
            ))}
          </group>
        )
      })}

      {showRoof && roofFootprint.length >= 3 && (
        <RoofMesh
          pts={roofFootprint}
          eaveY={roofEaveY}
          cfg={roofConfig}
          selectedFace={selectedFace}
          onSelect={setSelectedFace}
        />
      )}
    </>
  )
}

// ─── Export ───────────────────────────────────────────────────────────────────

export default function ThreeDPreview({ className }: { className?: string }) {
  const [dragging, setDragging] = useState(false)
  return (
    <div
      className={`rounded-xl border border-gray-200 overflow-hidden shadow-sm ${className ?? ''}`}
      style={{ background: '#f1f5f9', cursor: dragging ? 'grabbing' : 'grab' }}
      onMouseDown={() => setDragging(true)}
      onMouseUp={() => setDragging(false)}
      onMouseLeave={() => setDragging(false)}
    >
      <Canvas camera={{ position: [12, 10, 12], fov: 50 }} shadows style={{ height: '100%', background: '#f1f5f9' }}>
        <Scene />
        <OrbitControls makeDefault />
      </Canvas>
    </div>
  )
}
