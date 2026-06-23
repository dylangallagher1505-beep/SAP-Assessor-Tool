'use client'
import { useRef, useEffect, useCallback, useState } from 'react'
import { useModelerStore, Point2D, Wall } from '@/lib/modelerStore'

const CANVAS_PX = 600      // canvas display pixels (square)
const WORLD_M = 20         // world metres shown across canvas

function worldToCanvas(p: Point2D, offset: Point2D, scale: number) {
  return {
    x: (p.x - offset.x) * scale,
    y: CANVAS_PX - (p.y - offset.y) * scale,
  }
}

function canvasToWorld(cx: number, cy: number, offset: Point2D, scale: number): Point2D {
  return {
    x: cx / scale + offset.x,
    y: (CANVAS_PX - cy) / scale + offset.y,
  }
}

function snapToGrid(p: Point2D, gridSize: number): Point2D {
  return {
    x: Math.round(p.x / gridSize) * gridSize,
    y: Math.round(p.y / gridSize) * gridSize,
  }
}

function snapToAngle(start: Point2D, end: Point2D): Point2D {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const len = Math.sqrt(dx * dx + dy * dy)
  if (len < 0.001) return end
  const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI
  const snapped = Math.round(angleDeg / 45) * 45
  const rad = (snapped * Math.PI) / 180
  return {
    x: start.x + len * Math.cos(rad),
    y: start.y + len * Math.sin(rad),
  }
}

interface Props {
  className?: string
}

export default function DrawingCanvas({ className }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const { stories, activeStoryId, drawingTool, gridSizeM, addWall, clearWalls, setFootprint } =
    useModelerStore()

  const activeStory = stories.find((s) => s.id === activeStoryId)

  // View transform: pan offset in world metres
  const [offset] = useState<Point2D>({ x: 0, y: 0 })
  const scale = CANVAS_PX / WORLD_M // px per metre

  // In-progress drawing state
  const [pendingStart, setPendingStart] = useState<Point2D | null>(null)
  const [mouseWorld, setMouseWorld] = useState<Point2D>({ x: 0, y: 0 })
  // Polygon mode accumulated points
  const [polyPoints, setPolyPoints] = useState<Point2D[]>([])

  const getWorldPos = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const rect = canvasRef.current!.getBoundingClientRect()
      const cx = (e.clientX - rect.left) * (CANVAS_PX / rect.width)
      const cy = (e.clientY - rect.top) * (CANVAS_PX / rect.height)
      const raw = canvasToWorld(cx, cy, offset, scale)
      return snapToGrid(raw, gridSizeM)
    },
    [offset, scale, gridSizeM]
  )

  // ── Draw ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, CANVAS_PX, CANVAS_PX)

    // Background
    ctx.fillStyle = '#1a1a2e'
    ctx.fillRect(0, 0, CANVAS_PX, CANVAS_PX)

    // Grid
    ctx.strokeStyle = '#2a2a4a'
    ctx.lineWidth = 0.5
    const step = gridSizeM * scale
    for (let x = 0; x <= CANVAS_PX; x += step) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, CANVAS_PX); ctx.stroke()
    }
    for (let y = 0; y <= CANVAS_PX; y += step) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(CANVAS_PX, y); ctx.stroke()
    }

    // Major grid lines every 5 cells
    ctx.strokeStyle = '#3a3a5a'
    ctx.lineWidth = 1
    const majorStep = step * (1 / gridSizeM) // every 1 metre
    for (let x = 0; x <= CANVAS_PX; x += majorStep) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, CANVAS_PX); ctx.stroke()
    }
    for (let y = 0; y <= CANVAS_PX; y += majorStep) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(CANVAS_PX, y); ctx.stroke()
    }

    // Draw all story walls (inactive = dim)
    for (const story of stories) {
      const isActive = story.id === activeStoryId
      ctx.strokeStyle = isActive ? '#60a5fa' : '#374151'
      ctx.lineWidth = isActive ? 2.5 : 1
      for (const w of story.walls) {
        const a = worldToCanvas(w.start, offset, scale)
        const b = worldToCanvas(w.end, offset, scale)
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke()
        // Endpoints
        if (isActive) {
          ctx.fillStyle = '#93c5fd'
          ctx.beginPath(); ctx.arc(a.x, a.y, 3, 0, Math.PI * 2); ctx.fill()
          ctx.beginPath(); ctx.arc(b.x, b.y, 3, 0, Math.PI * 2); ctx.fill()
        }
      }

      // Draw footprint polygon
      if (isActive && story.footprintPolygon.length >= 2) {
        ctx.strokeStyle = '#34d399'
        ctx.lineWidth = 1.5
        ctx.setLineDash([4, 4])
        ctx.beginPath()
        const first = worldToCanvas(story.footprintPolygon[0], offset, scale)
        ctx.moveTo(first.x, first.y)
        for (let i = 1; i < story.footprintPolygon.length; i++) {
          const pt = worldToCanvas(story.footprintPolygon[i], offset, scale)
          ctx.lineTo(pt.x, pt.y)
        }
        ctx.closePath()
        ctx.stroke()
        ctx.setLineDash([])
      }
    }

    // Polygon in-progress points
    if (drawingTool === 'polygon' && polyPoints.length > 0) {
      ctx.strokeStyle = '#f59e0b'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      const fp = worldToCanvas(polyPoints[0], offset, scale)
      ctx.moveTo(fp.x, fp.y)
      for (let i = 1; i < polyPoints.length; i++) {
        const pp = worldToCanvas(polyPoints[i], offset, scale)
        ctx.lineTo(pp.x, pp.y)
      }
      // Rubber-band to mouse
      const mp = worldToCanvas(mouseWorld, offset, scale)
      ctx.lineTo(mp.x, mp.y)
      ctx.stroke()
      // Dots
      for (const pt of polyPoints) {
        const pp = worldToCanvas(pt, offset, scale)
        ctx.fillStyle = '#fbbf24'
        ctx.beginPath(); ctx.arc(pp.x, pp.y, 4, 0, Math.PI * 2); ctx.fill()
      }
    }

    // Wall rubber-band line
    if (drawingTool === 'wall' && pendingStart) {
      const snappedEnd = snapToAngle(pendingStart, mouseWorld)
      const a = worldToCanvas(pendingStart, offset, scale)
      const b = worldToCanvas(snappedEnd, offset, scale)
      ctx.strokeStyle = '#f59e0b'
      ctx.lineWidth = 1.5
      ctx.setLineDash([6, 3])
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke()
      ctx.setLineDash([])

      // Length label
      const dx = snappedEnd.x - pendingStart.x
      const dy = snappedEnd.y - pendingStart.y
      const len = Math.sqrt(dx * dx + dy * dy).toFixed(2)
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      ctx.fillStyle = '#fbbf24'
      ctx.font = '11px monospace'
      ctx.fillText(`${len}m`, mid.x + 4, mid.y - 4)
    }

    // Cursor crosshair
    const mp = worldToCanvas(mouseWorld, offset, scale)
    ctx.strokeStyle = 'rgba(255,255,255,0.3)'
    ctx.lineWidth = 0.5
    ctx.beginPath(); ctx.moveTo(mp.x, 0); ctx.lineTo(mp.x, CANVAS_PX); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(0, mp.y); ctx.lineTo(CANVAS_PX, mp.y); ctx.stroke()

    // Coordinate label
    ctx.fillStyle = 'rgba(255,255,255,0.5)'
    ctx.font = '10px monospace'
    ctx.fillText(`(${mouseWorld.x.toFixed(1)}, ${mouseWorld.y.toFixed(1)})`, 6, CANVAS_PX - 6)
  }, [stories, activeStoryId, pendingStart, mouseWorld, polyPoints, offset, scale, gridSizeM, drawingTool])

  // ── Input handlers ────────────────────────────────────────────────────────
  function handleMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    setMouseWorld(getWorldPos(e))
  }

  function handleClick(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!activeStoryId) return
    const pt = getWorldPos(e)

    if (drawingTool === 'wall') {
      if (!pendingStart) {
        setPendingStart(pt)
      } else {
        const end = snapToAngle(pendingStart, pt)
        addWall(activeStoryId, { start: pendingStart, end })
        // Chain: new wall starts from this end
        setPendingStart(end)
      }
    }

    if (drawingTool === 'polygon') {
      // Close polygon if clicking near first point
      if (polyPoints.length >= 3) {
        const fp = polyPoints[0]
        const dist = Math.sqrt((pt.x - fp.x) ** 2 + (pt.y - fp.y) ** 2)
        if (dist < gridSizeM * 1.5) {
          setFootprint(activeStoryId, polyPoints)
          setPolyPoints([])
          return
        }
      }
      setPolyPoints((prev) => [...prev, pt])
    }
  }

  function handleRightClick(e: React.MouseEvent<HTMLCanvasElement>) {
    e.preventDefault()
    // Right-click cancels current operation
    setPendingStart(null)
    setPolyPoints([])
  }

  function handleDoubleClick() {
    if (drawingTool === 'wall') {
      setPendingStart(null)
    }
    if (drawingTool === 'polygon' && polyPoints.length >= 3 && activeStoryId) {
      setFootprint(activeStoryId, polyPoints)
      setPolyPoints([])
    }
  }

  return (
    <div className={`flex flex-col gap-2 ${className ?? ''}`}>
      <div className="flex items-center gap-2 text-xs text-slate-400">
        <span>Active: <span className="text-blue-400 font-medium">{activeStory?.name ?? '—'}</span></span>
        <span className="ml-auto">
          {drawingTool === 'wall' && (pendingStart ? 'Click to place end point • Right-click to cancel' : 'Click to start wall')}
          {drawingTool === 'polygon' && (polyPoints.length === 0 ? 'Click to place polygon points' : `${polyPoints.length} pts — click near start or double-click to close`)}
          {drawingTool === 'select' && 'Select mode'}
        </span>
      </div>
      <canvas
        ref={canvasRef}
        width={CANVAS_PX}
        height={CANVAS_PX}
        className="rounded-lg border border-slate-700 cursor-crosshair"
        style={{ width: '100%', aspectRatio: '1 / 1' }}
        onMouseMove={handleMouseMove}
        onClick={handleClick}
        onContextMenu={handleRightClick}
        onDoubleClick={handleDoubleClick}
      />
      <div className="flex gap-2 mt-1">
        <button
          onClick={() => activeStoryId && clearWalls(activeStoryId)}
          className="text-xs px-3 py-1 rounded bg-red-900/40 text-red-300 hover:bg-red-800/60 border border-red-800/40"
        >
          Clear Layer
        </button>
        <span className="text-xs text-slate-500 self-center">Grid: {gridSizeM}m</span>
      </div>
    </div>
  )
}
