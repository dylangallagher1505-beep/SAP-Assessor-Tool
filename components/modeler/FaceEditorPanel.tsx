'use client'
import { useMemo } from 'react'
import { X, Move } from 'lucide-react'
import { useModelerStore } from '@/lib/modelerStore'
import type { Point2D, RoofConfig } from '@/lib/modelerStore'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function wallLen(sx: number, sy: number, ex: number, ey: number) {
  return Math.sqrt((ex - sx) ** 2 + (ey - sy) ** 2)
}

function shoelace2D(pts: { u: number; v: number }[]) {
  let a = 0
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length
    a += pts[i].u * pts[j].v - pts[j].u * pts[i].v
  }
  return Math.abs(a) / 2
}

/** Cardinal compass direction from a bearing in degrees (0 = N, clockwise) */
function cardinal(deg: number) {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
  return dirs[Math.round(((deg % 360) + 360) % 360 / 45) % 8]
}

/** Bearing 0–360° from a wall's dx/dy (north = positive Y in world) */
function bearing(dx: number, dy: number) {
  return (((Math.atan2(dx, dy) * 180) / Math.PI) + 360) % 360
}

// ─── Unroll a 3D planar polygon into 2D local coordinates ────────────────────

function unrollFace(verts: [number, number, number][]): { u: number; v: number }[] {
  if (verts.length < 2) return []
  const [x0, y0, z0] = verts[0]
  const [x1, y1, z1] = verts[1]
  const ux = x1 - x0, uy = y1 - y0, uz = z1 - z0
  const uLen = Math.sqrt(ux * ux + uy * uy + uz * uz)
  if (uLen < 1e-6) return []
  const uAxis = [ux / uLen, uy / uLen, uz / uLen]

  // cross product for normal (using third vertex for stability)
  const [x2, y2, z2] = verts[verts.length > 2 ? 2 : 1]
  const ax = x2 - x0, ay = y2 - y0, az = z2 - z0
  const nx = uy * az - uz * ay, ny = uz * ax - ux * az, nz = ux * ay - uy * ax
  const nLen = Math.sqrt(nx * nx + ny * ny + nz * nz)
  const nAxis = nLen > 1e-6 ? [nx / nLen, ny / nLen, nz / nLen] : [0, 1, 0]

  // v-axis = normal × u-axis
  const vx = nAxis[1] * uAxis[2] - nAxis[2] * uAxis[1]
  const vy = nAxis[2] * uAxis[0] - nAxis[0] * uAxis[2]
  const vz = nAxis[0] * uAxis[1] - nAxis[1] * uAxis[0]

  return verts.map(([x, y, z]) => {
    const dx = x - x0, dy = y - y0, dz = z - z0
    return {
      u: dx * uAxis[0] + dy * uAxis[1] + dz * uAxis[2],
      v: dx * vx + dy * vy + dz * vz,
    }
  })
}

// ─── Roof face info ───────────────────────────────────────────────────────────

type RoofFace = { verts: [number, number, number][]; label: string }

function buildRoofFaces(pts: Point2D[], eaveY: number, cfg: RoofConfig): RoofFace[] {
  if (pts.length < 3) return []
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y)
  const minX = Math.min(...xs), maxX = Math.max(...xs)
  const minY = Math.min(...ys), maxY = Math.max(...ys)
  const w = maxX - minX, d = maxY - minY
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2
  const pitchRad = (cfg.pitchDegrees * Math.PI) / 180
  const rise = (Math.min(w, d) / 2) * Math.tan(pitchRad)

  if (cfg.type === 'flat') {
    return [{ verts: pts.map(p => [p.x, eaveY + 0.05, p.y]), label: 'Flat Roof' }]
  }
  if (cfg.type === 'shed') {
    const highY = eaveY + d * Math.tan(pitchRad)
    return [{ label: 'Shed', verts: [[minX, eaveY, minY], [maxX, eaveY, minY], [maxX, highY, maxY], [minX, highY, maxY]] }]
  }
  if (cfg.type === 'gable') {
    const ridgeY = eaveY + rise
    return [
      { label: 'Front Slope', verts: [[minX, eaveY, minY], [maxX, eaveY, minY], [maxX, ridgeY, cy], [minX, ridgeY, cy]] },
      { label: 'Rear Slope', verts: [[maxX, eaveY, maxY], [minX, eaveY, maxY], [minX, ridgeY, cy], [maxX, ridgeY, cy]] },
      { label: 'Gable West', verts: [[minX, eaveY, minY], [minX, ridgeY, cy], [minX, eaveY, maxY]] },
      { label: 'Gable East', verts: [[maxX, eaveY, maxY], [maxX, ridgeY, cy], [maxX, eaveY, minY]] },
    ]
  }
  if (cfg.type === 'hip') {
    const ridgeY = eaveY + rise
    const hipOffsetX = d / 2
    const ridgeMinX = minX + hipOffsetX, ridgeMaxX = maxX - hipOffsetX
    if (ridgeMinX >= ridgeMaxX) {
      return [
        { label: 'Hip South', verts: [[minX, eaveY, minY], [maxX, eaveY, minY], [cx, ridgeY, cy]] },
        { label: 'Hip North', verts: [[maxX, eaveY, maxY], [minX, eaveY, maxY], [cx, ridgeY, cy]] },
        { label: 'Hip East', verts: [[maxX, eaveY, minY], [maxX, eaveY, maxY], [cx, ridgeY, cy]] },
        { label: 'Hip West', verts: [[minX, eaveY, maxY], [minX, eaveY, minY], [cx, ridgeY, cy]] },
      ]
    }
    return [
      { label: 'Hip Front', verts: [[minX, eaveY, minY], [maxX, eaveY, minY], [ridgeMaxX, ridgeY, cy], [ridgeMinX, ridgeY, cy]] },
      { label: 'Hip Rear', verts: [[maxX, eaveY, maxY], [minX, eaveY, maxY], [ridgeMinX, ridgeY, cy], [ridgeMaxX, ridgeY, cy]] },
      { label: 'Hip End W', verts: [[minX, eaveY, maxY], [minX, eaveY, minY], [ridgeMinX, ridgeY, cy]] },
      { label: 'Hip End E', verts: [[maxX, eaveY, minY], [maxX, eaveY, maxY], [ridgeMaxX, ridgeY, cy]] },
    ]
  }
  return []
}

// ─── SVG Wall Face View ───────────────────────────────────────────────────────

function WallFaceView({ wallLen, wallH, openings }: {
  wallLen: number; wallH: number
  openings: { id: string; x: number; y: number; w: number; h: number; type: 'window' | 'door' }[]
}) {
  const PAD = 24
  const svgW = 340, svgH = 200
  const scaleX = (svgW - PAD * 2) / wallLen
  const scaleY = (svgH - PAD * 2) / wallH
  const scale = Math.min(scaleX, scaleY)
  const drawW = wallLen * scale, drawH = wallH * scale
  const ox = (svgW - drawW) / 2, oy = (svgH - drawH) / 2

  function wx(u: number) { return ox + u * scale }
  function wy(v: number) { return oy + drawH - v * scale }

  return (
    <svg width={svgW} height={svgH} className="border border-gray-200 rounded-lg bg-gray-50 w-full">
      {/* Wall outline */}
      <rect x={ox} y={oy} width={drawW} height={drawH}
        fill="none" stroke="#64748b" strokeWidth={1.5} />
      {/* Dimension annotations */}
      <text x={ox + drawW / 2} y={oy + drawH + 14} textAnchor="middle" fontSize={9} fill="#94a3b8">
        {wallLen.toFixed(2)} m
      </text>
      <text x={ox - 6} y={oy + drawH / 2} textAnchor="middle" fontSize={9} fill="#94a3b8"
        transform={`rotate(-90 ${ox - 6} ${oy + drawH / 2})`}>
        {wallH.toFixed(2)} m
      </text>
      {/* Openings */}
      {openings.map(op => (
        <g key={op.id}>
          <rect
            x={wx(op.x)} y={wy(op.y + op.h)}
            width={op.w * scale} height={op.h * scale}
            fill={op.type === 'window' ? '#bae6fd' : '#fde68a'}
            stroke={op.type === 'window' ? '#0284c7' : '#d97706'}
            strokeWidth={1}
            rx={1}
          />
          <text
            x={wx(op.x) + (op.w * scale) / 2}
            y={wy(op.y + op.h / 2) + 3}
            textAnchor="middle"
            fontSize={8}
            fill={op.type === 'window' ? '#0369a1' : '#92400e'}
          >
            {op.type === 'window' ? 'W' : 'D'}
          </text>
        </g>
      ))}
    </svg>
  )
}

// ─── SVG Roof Face View ───────────────────────────────────────────────────────

function RoofFaceView({ local, label }: {
  local: { u: number; v: number }[]; label: string
}) {
  if (local.length < 2) return null
  const PAD = 24
  const svgW = 340, svgH = 200
  const us = local.map(p => p.u), vs = local.map(p => p.v)
  const minU = Math.min(...us), maxU = Math.max(...us)
  const minV = Math.min(...vs), maxV = Math.max(...vs)
  const rangeU = maxU - minU || 1, rangeV = maxV - minV || 1
  const scaleU = (svgW - PAD * 2) / rangeU
  const scaleV = (svgH - PAD * 2) / rangeV
  const scale = Math.min(scaleU, scaleV)
  const drawU = rangeU * scale, drawV = rangeV * scale
  const ox = (svgW - drawU) / 2, oy = (svgH - drawV) / 2

  function px(u: number) { return ox + (u - minU) * scale }
  function py(v: number) { return oy + drawV - (v - minV) * scale }

  const poly = local.map(p => `${px(p.u)},${py(p.v)}`).join(' ')
  const area = shoelace2D(local)

  return (
    <svg width={svgW} height={svgH} className="border border-gray-200 rounded-lg bg-gray-50 w-full">
      <polygon points={poly} fill="#e0f2fe" stroke="#0284c7" strokeWidth={1.5} />
      {/* Vertex dots */}
      {local.map((p, i) => (
        <circle key={i} cx={px(p.u)} cy={py(p.v)} r={3} fill="#0284c7" />
      ))}
      {/* Label & area */}
      <text x={svgW / 2} y={svgH - 6} textAnchor="middle" fontSize={9} fill="#94a3b8">
        {label} · {area.toFixed(2)} m²
      </text>
    </svg>
  )
}

// ─── Panel ────────────────────────────────────────────────────────────────────

export default function FaceEditorPanel() {
  const {
    selectedFace, setSelectedFace,
    stories, roofConfig,
    updateRoof,
  } = useModelerStore()

  const topStory = stories.length > 0 ? stories[stories.length - 1] : null
  const roofEaveY = topStory ? topStory.startHeight + topStory.storyHeight : 0
  const roofFootprint = topStory?.footprintPolygon ?? []

  const faceData = useMemo(() => {
    if (!selectedFace) return null

    if (selectedFace.type === 'wall') {
      const story = stories.find(s => s.id === selectedFace.storyId)
      const wall = story?.walls.find(w => w.id === selectedFace.wallId)
      if (!story || !wall) return null
      const len = wallLen(wall.start.x, wall.start.y, wall.end.x, wall.end.y)
      const dx = wall.end.x - wall.start.x, dy = wall.end.y - wall.start.y
      const b = bearing(dx, dy)
      const openings = story.openings
        .filter(o => o.wallId === wall.id)
        .map(o => ({
          id: o.id,
          x: o.uOffset * len,
          y: o.type === 'door' ? 0 : o.sillHeight,
          w: o.width,
          h: o.height,
          type: o.type,
        }))
      return {
        kind: 'wall' as const,
        name: wall.name,
        len,
        h: story.storyHeight,
        area: len * story.storyHeight,
        bearingDeg: b,
        cardinal: cardinal(b),
        openings,
      }
    }

    if (selectedFace.type === 'roof') {
      const faces = buildRoofFaces(roofFootprint, roofEaveY, roofConfig)
      const face = faces[selectedFace.faceIndex]
      if (!face) return null
      const local = unrollFace(face.verts)
      const area = shoelace2D(local)
      // Pitch from first edge rising vertically
      const dY = face.verts[2][1] - face.verts[0][1]
      const dH = Math.sqrt(
        (face.verts[2][0] - face.verts[0][0]) ** 2 +
        (face.verts[2][2] - face.verts[0][2]) ** 2
      )
      const pitchActual = dH > 0.01 ? Math.round(Math.atan(dY / dH) * 180 / Math.PI) : 0
      return { kind: 'roof' as const, label: face.label, area, local, pitchActual }
    }

    return null
  }, [selectedFace, stories, roofConfig, roofFootprint, roofEaveY])

  if (!selectedFace || !faceData) return null

  return (
    <div className="absolute right-0 top-0 h-full w-72 bg-white border-l border-gray-200 shadow-xl flex flex-col z-30 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 shrink-0">
        <div>
          <span className="font-semibold text-gray-800 text-sm">
            {faceData.kind === 'wall' ? faceData.name : faceData.label}
          </span>
          <span className="ml-2 text-xs text-gray-400 uppercase tracking-wide">
            {faceData.kind === 'wall' ? 'Wall Face' : 'Roof Face'}
          </span>
        </div>
        <button onClick={() => setSelectedFace(null)} className="text-gray-400 hover:text-gray-700">
          <X size={14} />
        </button>
      </div>

      <div className="flex flex-col gap-4 p-4">
        {/* 2D face view */}
        {faceData.kind === 'wall' ? (
          <WallFaceView
            wallLen={faceData.len}
            wallH={faceData.h}
            openings={faceData.openings}
          />
        ) : (
          <RoofFaceView local={faceData.local} label={faceData.label} />
        )}

        {/* Dimension table */}
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs bg-gray-50 rounded-lg p-3">
          {faceData.kind === 'wall' ? (
            <>
              <span className="text-gray-500">Width</span><span className="font-mono text-gray-800">{faceData.len.toFixed(2)} m</span>
              <span className="text-gray-500">Height</span><span className="font-mono text-gray-800">{faceData.h.toFixed(2)} m</span>
              <span className="text-gray-500">Gross area</span><span className="font-mono text-gray-800">{faceData.area.toFixed(2)} m²</span>
              <span className="text-gray-500">Openings area</span>
              <span className="font-mono text-gray-800">
                {faceData.openings.reduce((s, o) => s + o.w * o.h, 0).toFixed(2)} m²
              </span>
              <span className="text-gray-500">Net wall area</span>
              <span className="font-mono font-semibold text-blue-700">
                {Math.max(0, faceData.area - faceData.openings.reduce((s, o) => s + o.w * o.h, 0)).toFixed(2)} m²
              </span>
              <span className="text-gray-500">Orientation</span>
              <span className="font-mono text-gray-800">{faceData.cardinal} ({faceData.bearingDeg.toFixed(0)}°)</span>
            </>
          ) : (
            <>
              <span className="text-gray-500">Face</span><span className="font-mono text-gray-800">{faceData.label}</span>
              <span className="text-gray-500">Area</span><span className="font-mono text-gray-800">{faceData.area.toFixed(2)} m²</span>
              <span className="text-gray-500">Pitch</span><span className="font-mono text-gray-800">{faceData.pitchActual}°</span>
            </>
          )}
        </div>

        {/* Roof pitch adjustment */}
        {faceData.kind === 'roof' && (
          <div className="flex flex-col gap-1 text-xs">
            <label className="text-gray-500 font-medium">Adjust pitch: {roofConfig.pitchDegrees}°</label>
            <input
              type="range" min={5} max={60} step={1}
              value={roofConfig.pitchDegrees}
              onChange={e => updateRoof({ pitchDegrees: parseInt(e.target.value) })}
              className="w-full accent-blue-500"
            />
            <p className="text-gray-400 text-[10px]">Adjusts pitch for all {roofConfig.type} roof faces</p>
          </div>
        )}

        {/* Hint */}
        <p className="text-[10px] text-gray-400 flex items-center gap-1">
          <Move size={10} />
          Click another surface in the 3D view to switch · Click selected face to deselect
        </p>
      </div>
    </div>
  )
}
