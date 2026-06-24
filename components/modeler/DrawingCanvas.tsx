'use client'
import { useRef, useEffect, useCallback, useState } from 'react'
import { useModelerStore, Point2D, Wall } from '@/lib/modelerStore'
import { ZoomIn, ZoomOut, Maximize2, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Trash2 } from 'lucide-react'

const CANVAS_PX = 800

// ─── View helpers ─────────────────────────────────────────────────────────────

function worldToCanvas(p: Point2D, pan: Point2D, zoom: number): { x: number; y: number } {
  return {
    x: (p.x - pan.x) * zoom,
    y: CANVAS_PX - (p.y - pan.y) * zoom,
  }
}

function canvasToWorld(cx: number, cy: number, pan: Point2D, zoom: number): Point2D {
  return {
    x: cx / zoom + pan.x,
    y: (CANVAS_PX - cy) / zoom + pan.y,
  }
}

function snapToGrid(p: Point2D, gridSize: number): Point2D {
  return {
    x: Math.round(p.x / gridSize) * gridSize,
    y: Math.round(p.y / gridSize) * gridSize,
  }
}

function snapToVertex(p: Point2D, walls: Wall[], gridSize: number): Point2D {
  const snapRadiusM = gridSize * 0.8
  let best: Point2D | null = null
  let bestDist = snapRadiusM
  for (const w of walls) {
    for (const v of [w.start, w.end]) {
      const d = Math.sqrt((v.x - p.x) ** 2 + (v.y - p.y) ** 2)
      if (d < bestDist) { bestDist = d; best = v }
    }
  }
  return best ?? p
}

function snapToAngle(start: Point2D, end: Point2D): Point2D {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const len = Math.sqrt(dx * dx + dy * dy)
  if (len < 0.001) return end
  const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI
  const snapped = Math.round(angleDeg / 45) * 45
  const rad = (snapped * Math.PI) / 180
  return { x: start.x + len * Math.cos(rad), y: start.y + len * Math.sin(rad) }
}

// Arrow key → direction vector (in world space, Y-up)
const ARROW_DIR: Record<string, Point2D> = {
  ArrowRight: { x: 1, y: 0 },
  ArrowLeft:  { x: -1, y: 0 },
  ArrowUp:    { x: 0, y: 1 },
  ArrowDown:  { x: 0, y: -1 },
}

interface Props { className?: string }

export default function DrawingCanvas({ className }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const lengthInputRef = useRef<HTMLInputElement>(null)

  const { stories, activeStoryId, drawingTool, gridSizeM, addWall, clearWalls, setFootprint, closePolygon, registerRoom, selectedWallId, setSelectedWallId, removeWall, undoWall, wallHistory } =
    useModelerStore()
  const activeStory = stories.find((s) => s.id === activeStoryId)


  // ── View state ──────────────────────────────────────────────────────────────
  const BASE_ZOOM = CANVAS_PX / 20           // 20m default view
  const [zoom, setZoom] = useState(BASE_ZOOM)
  const [pan, setPan] = useState<Point2D>({ x: 0, y: 0 })

  // Middle-mouse / space+drag panning
  const isPanning = useRef(false)
  const [cursorPanning, setCursorPanning] = useState(false)
  const panStart = useRef<{ mx: number; my: number; pan: Point2D }>({ mx: 0, my: 0, pan: { x: 0, y: 0 } })

  // ── Drawing state ───────────────────────────────────────────────────────────
  const [pendingStart, setPendingStart] = useState<Point2D | null>(null)
  const [mouseWorld, setMouseWorld] = useState<Point2D>({ x: 0, y: 0 })
  const [polyPoints, setPolyPoints] = useState<Point2D[]>([])

  // Keyboard measurement input
  const [kbLength, setKbLength] = useState('')
  const [kbDir, setKbDir] = useState<Point2D | null>(null)
  const [wallName, setWallName] = useState('')
  const wallNameInputRef = useRef<HTMLInputElement>(null)

  // Track the chain of placed vertices so we can undo and close shape
  const [wallChain, setWallChain] = useState<Point2D[]>([])

  // Hovered wall (local only — no need for store)
  const [hoveredWallId, setHoveredWallId] = useState<string | null>(null)

  // Clear selection on storey switch
  useEffect(() => {
    setSelectedWallId(null)
    setHoveredWallId(null)
  }, [activeStoryId])

  // ── Helpers ──────────────────────────────────────────────────────────────────

  // Returns distance in canvas pixels from point (cx,cy) to line segment a→b
  function distToSegmentPx(
    cx: number, cy: number,
    ax: number, ay: number,
    bx: number, by: number
  ): number {
    const dx = bx - ax, dy = by - ay
    const lenSq = dx * dx + dy * dy
    if (lenSq < 1) return Math.sqrt((cx - ax) ** 2 + (cy - ay) ** 2)
    const t = Math.max(0, Math.min(1, ((cx - ax) * dx + (cy - ay) * dy) / lenSq))
    return Math.sqrt((cx - (ax + t * dx)) ** 2 + (cy - (ay + t * dy)) ** 2)
  }

  function wallNearPoint(cx: number, cy: number, threshold = 8): string | null {
    const story = stories.find(s => s.id === activeStoryId)
    if (!story) return null
    for (const w of story.walls) {
      const a = worldToCanvas(w.start, pan, zoom)
      const b = worldToCanvas(w.end, pan, zoom)
      if (distToSegmentPx(cx, cy, a.x, a.y, b.x, b.y) < threshold) return w.id
    }
    return null
  }

  const getCanvasPos = useCallback((e: MouseEvent | React.MouseEvent): { cx: number; cy: number } => {
    const rect = canvasRef.current!.getBoundingClientRect()
    return {
      cx: (e.clientX - rect.left) * (CANVAS_PX / rect.width),
      cy: (e.clientY - rect.top) * (CANVAS_PX / rect.height),
    }
  }, [])

  const getWorldPos = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const { cx, cy } = getCanvasPos(e)
    const gridPt = snapToGrid(canvasToWorld(cx, cy, pan, zoom), gridSizeM)
    const story = stories.find(s => s.id === activeStoryId)
    return story ? snapToVertex(gridPt, story.walls, gridSizeM) : gridPt
  }, [pan, zoom, gridSizeM, getCanvasPos, stories, activeStoryId])

  // Compute the live preview end point (keyboard overrides mouse)
  const previewEnd = useCallback((start: Point2D): Point2D => {
    const len = parseFloat(kbLength)
    if (kbDir && !isNaN(len) && len > 0) {
      return { x: start.x + kbDir.x * len, y: start.y + kbDir.y * len }
    }
    if (kbDir && isNaN(len)) {
      // direction locked, no length yet — extend to mouse
      const proj = (mouseWorld.x - start.x) * kbDir.x + (mouseWorld.y - start.y) * kbDir.y
      const projLen = Math.max(0, proj)
      return { x: start.x + kbDir.x * projLen, y: start.y + kbDir.y * projLen }
    }
    return snapToAngle(start, mouseWorld)
  }, [kbLength, kbDir, mouseWorld])

  function nextWallName(): string {
    const count = (activeStory?.walls.length ?? 0) + 1
    return `Wall ${count}`
  }

  function commitWall(overrideEnd?: Point2D) {
    if (!pendingStart || !activeStoryId) return
    const end = overrideEnd ?? previewEnd(pendingStart)
    const dx = end.x - pendingStart.x
    const dy = end.y - pendingStart.y
    if (Math.sqrt(dx * dx + dy * dy) < 0.05) return
    const name = wallName.trim() || nextWallName()

    // Auto-close if endpoint snaps back to the first chain point
    if (wallChain.length >= 2) {
      const first = wallChain[0]
      const snapDist = Math.sqrt((end.x - first.x) ** 2 + (end.y - first.y) ** 2)
      if (snapDist <= gridSizeM * 0.6) {
        addWall(activeStoryId, { start: pendingStart, end: first }, name)
        registerRoom(activeStoryId, [...wallChain, pendingStart])
        setPendingStart(null)
        setWallChain([])
        setKbLength(''); setKbDir(null); setWallName('')
        return
      }
    }

    addWall(activeStoryId, { start: pendingStart, end }, name)
    setWallChain(prev => [...prev, pendingStart])
    setPendingStart(end)
    setKbLength('')
    setKbDir(null)
    setWallName('')
    lengthInputRef.current?.focus()
  }

  function closeShape() {
    if (!pendingStart || !activeStoryId || wallChain.length < 2) return
    const firstPoint = wallChain[0]
    const closingName = wallName.trim() || nextWallName()
    addWall(activeStoryId, { start: pendingStart, end: firstPoint }, closingName)
    registerRoom(activeStoryId, [...wallChain, pendingStart])
    setPendingStart(null)
    setWallChain([])
    setKbLength('')
    setKbDir(null)
    setWallName('')
  }

  // ── Keyboard shortcuts (Ctrl+Z undo, Delete key) ─────────────────────────

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // Don't intercept when typing in inputs
      if ((e.target as HTMLElement).tagName === 'INPUT') return

      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault()
        if (pendingStart && wallChain.length > 0) {
          // While drawing: undo last placed segment (same as right-click)
          const prevPoint = wallChain[wallChain.length - 1]
          const lastWall = activeStory?.walls.at(-1)
          if (lastWall && activeStoryId) removeWall(activeStoryId, lastWall.id)
          setWallChain(prev => prev.slice(0, -1))
          setPendingStart(prevPoint)
          setKbLength(''); setKbDir(null)
        } else if (activeStoryId) {
          // Outside drawing: undo last committed wall batch
          undoWall(activeStoryId)
        }
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedWallId && activeStoryId && !pendingStart) {
          e.preventDefault()
          removeWall(activeStoryId, selectedWallId)
          setSelectedWallId(null)
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [pendingStart, wallChain, activeStory, activeStoryId, selectedWallId, removeWall, undoWall, setSelectedWallId])

  // ── Zoom / Pan ────────────────────────────────────────────────────────────

  function applyZoom(factor: number, cx = CANVAS_PX / 2, cy = CANVAS_PX / 2) {
    setZoom((z) => {
      const next = Math.min(Math.max(z * factor, BASE_ZOOM * 0.2), BASE_ZOOM * 20)
      // Zoom toward canvas point (cx,cy)
      const worldPt = canvasToWorld(cx, cy, pan, z)
      setPan({
        x: worldPt.x - cx / next,
        y: worldPt.y - (CANVAS_PX - cy) / next,
      })
      return next
    })
  }

  function resetView() {
    setZoom(BASE_ZOOM)
    setPan({ x: 0, y: 0 })
  }

  // Wheel zoom
  useEffect(() => {
    const el = canvasRef.current
    if (!el) return
    const handler = (e: WheelEvent) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const cx = (e.clientX - rect.left) * (CANVAS_PX / rect.width)
      const cy = (e.clientY - rect.top) * (CANVAS_PX / rect.height)
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1
      setZoom((z) => {
        const next = Math.min(Math.max(z * factor, BASE_ZOOM * 0.2), BASE_ZOOM * 20)
        const worldPt = canvasToWorld(cx, cy, pan, z)
        setPan({ x: worldPt.x - cx / next, y: worldPt.y - (CANVAS_PX - cy) / next })
        return next
      })
    }
    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, [pan, BASE_ZOOM])

  // Middle-mouse pan
  function handleMouseDown(e: React.MouseEvent<HTMLCanvasElement>) {
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      e.preventDefault()
      isPanning.current = true
      setCursorPanning(true)
      panStart.current = { mx: e.clientX, my: e.clientY, pan: { ...pan } }
    }
  }

  function handleMouseMovePan(e: React.MouseEvent<HTMLCanvasElement>) {
    if (isPanning.current) {
      const dx = (e.clientX - panStart.current.mx) * (CANVAS_PX / canvasRef.current!.getBoundingClientRect().width)
      const dy = (e.clientY - panStart.current.my) * (CANVAS_PX / canvasRef.current!.getBoundingClientRect().height)
      setPan({
        x: panStart.current.pan.x - dx / zoom,
        y: panStart.current.pan.y + dy / zoom,
      })
      return
    }
    setMouseWorld(getWorldPos(e))
    // Hover detection — only when not actively drawing
    if (!pendingStart && polyPoints.length === 0) {
      const { cx, cy } = getCanvasPos(e)
      setHoveredWallId(wallNearPoint(cx, cy, 10))
    }
  }

  function handleMouseUp(e: React.MouseEvent<HTMLCanvasElement>) {
    if (isPanning.current) { isPanning.current = false; setCursorPanning(false); return }
  }

  // ── Canvas drawing ─────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, CANVAS_PX, CANVAS_PX)

    // Light canvas background
    ctx.fillStyle = '#f8fafc'
    ctx.fillRect(0, 0, CANVAS_PX, CANVAS_PX)

    // Minor grid
    const step = gridSizeM * zoom
    if (step > 4) {
      ctx.strokeStyle = '#e2e8f0'
      ctx.lineWidth = 0.5
      const startX = ((-pan.x % gridSizeM) + gridSizeM) % gridSizeM * zoom
      const startY = CANVAS_PX - (((-pan.y % gridSizeM) + gridSizeM) % gridSizeM * zoom)
      for (let x = startX; x <= CANVAS_PX; x += step) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, CANVAS_PX); ctx.stroke()
      }
      for (let y = startY; y >= 0; y -= step) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(CANVAS_PX, y); ctx.stroke()
      }
    }

    // Major grid (1m)
    const majorStep = zoom
    ctx.strokeStyle = '#cbd5e1'
    ctx.lineWidth = 1
    const mStartX = ((-pan.x % 1) + 1) % 1 * zoom
    const mStartY = CANVAS_PX - (((-pan.y % 1) + 1) % 1 * zoom)
    for (let x = mStartX; x <= CANVAS_PX; x += majorStep) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, CANVAS_PX); ctx.stroke()
    }
    for (let y = mStartY; y >= 0; y -= majorStep) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(CANVAS_PX, y); ctx.stroke()
    }

    // Origin axes
    const originCanvas = worldToCanvas({ x: 0, y: 0 }, pan, zoom)
    ctx.strokeStyle = 'rgba(59,130,246,0.3)'
    ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(originCanvas.x, 0); ctx.lineTo(originCanvas.x, CANVAS_PX); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(0, originCanvas.y); ctx.lineTo(CANVAS_PX, originCanvas.y); ctx.stroke()

    // Stories
    for (const story of stories) {
      const isActive = story.id === activeStoryId
      for (const w of story.walls) {
        const isSelected = w.id === selectedWallId
        const isHovered = w.id === hoveredWallId && !pendingStart && polyPoints.length === 0
        const a = worldToCanvas(w.start, pan, zoom)
        const b = worldToCanvas(w.end, pan, zoom)

        // Wall stroke
        ctx.strokeStyle = isSelected ? '#f59e0b' : isHovered ? '#fb923c' : (isActive ? '#1e40af' : '#94a3b8')
        ctx.lineWidth = isSelected ? 3.5 : isHovered ? 3 : (isActive ? 2.5 : 1)
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke()

        if (isActive) {
          ctx.fillStyle = isSelected ? '#f59e0b' : '#3b82f6'
          ctx.beginPath(); ctx.arc(a.x, a.y, 3, 0, Math.PI * 2); ctx.fill()
          ctx.beginPath(); ctx.arc(b.x, b.y, 3, 0, Math.PI * 2); ctx.fill()

          // Dimension + name labels on active storey walls
          const dx = w.end.x - w.start.x, dy = w.end.y - w.start.y
          const len = Math.sqrt(dx * dx + dy * dy)
          if (len > 0.1) {
            const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
            const nx = -dy / len, ny = dx / len
            const offsetPx = 12
            const lx = mid.x + nx * offsetPx, ly = mid.y + ny * offsetPx
            ctx.textAlign = 'center'
            // Wall name (above)
            ctx.font = `${isSelected ? 'bold ' : ''}${Math.min(10, zoom * 0.35 + 6)}px sans-serif`
            ctx.fillStyle = isSelected ? '#92400e' : 'rgba(71,85,105,0.8)'
            ctx.fillText(w.name, lx, ly - 7)
            // Length (below name)
            ctx.font = `${Math.min(10, zoom * 0.35 + 5)}px monospace`
            ctx.fillStyle = isSelected ? '#b45309' : 'rgba(30,64,175,0.7)'
            ctx.fillText(`${len.toFixed(2)}m`, lx, ly + 4)
            ctx.textAlign = 'left'
          }

          // Openings tick marks
          if (len > 0.01) {
            const wallOpenings = story.openings.filter(o => o.wallId === w.id)
            for (const op of wallOpenings) {
              const u0 = op.uOffset
              const u1 = Math.min(1, op.uOffset + op.width / len)
              const pa = { x: a.x + (b.x - a.x) * u0, y: a.y + (b.y - a.y) * u0 }
              const pb = { x: a.x + (b.x - a.x) * u1, y: a.y + (b.y - a.y) * u1 }
              ctx.strokeStyle = op.type === 'window' ? '#0ea5e9' : '#f59e0b'
              ctx.lineWidth = 4
              ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke()
            }
          }
        }
      }

      // Render room polygons (use rooms[] if present, fall back to footprintPolygon)
      const roomPolygons = story.rooms.length > 0
        ? story.rooms.map(r => ({ polygon: r.polygon, label: r.name }))
        : story.footprintPolygon.length >= 3
          ? [{ polygon: story.footprintPolygon, label: story.name }]
          : []

      if (roomPolygons.length > 0) {
        for (const { polygon, label } of roomPolygons) {
          ctx.strokeStyle = isActive ? '#3b82f6' : '#93c5fd'
          ctx.fillStyle = isActive ? 'rgba(59,130,246,0.06)' : 'rgba(59,130,246,0.03)'
          ctx.lineWidth = isActive ? 1.5 : 1
          ctx.setLineDash(isActive ? [] : [4, 4])
          ctx.beginPath()
          const first = worldToCanvas(polygon[0], pan, zoom)
          ctx.moveTo(first.x, first.y)
          for (let i = 1; i < polygon.length; i++) {
            const pt = worldToCanvas(polygon[i], pan, zoom)
            ctx.lineTo(pt.x, pt.y)
          }
          ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.setLineDash([])

          // Room label at centroid
          const cxW = polygon.reduce((s, p) => s + p.x, 0) / polygon.length
          const cyW = polygon.reduce((s, p) => s + p.y, 0) / polygon.length
          const cc = worldToCanvas({ x: cxW, y: cyW }, pan, zoom)
          ctx.font = `bold ${Math.min(14, zoom * 0.5)}px sans-serif`
          ctx.textAlign = 'center'
          ctx.fillStyle = isActive ? '#1d4ed8' : '#93c5fd'
          ctx.fillText(label, cc.x, cc.y)
          ctx.textAlign = 'left'
        }
      } else if (isActive && story.footprintPolygon.length >= 2) {
        ctx.strokeStyle = '#3b82f6'
        ctx.lineWidth = 1.5
        ctx.setLineDash([4, 4])
        ctx.beginPath()
        const first = worldToCanvas(story.footprintPolygon[0], pan, zoom)
        ctx.moveTo(first.x, first.y)
        for (let i = 1; i < story.footprintPolygon.length; i++) {
          const pt = worldToCanvas(story.footprintPolygon[i], pan, zoom)
          ctx.lineTo(pt.x, pt.y)
        }
        ctx.closePath(); ctx.stroke(); ctx.setLineDash([])
      }
    }

    // Polygon in-progress
    if (drawingTool === 'polygon' && polyPoints.length > 0) {
      ctx.strokeStyle = '#f59e0b'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      const fp = worldToCanvas(polyPoints[0], pan, zoom)
      ctx.moveTo(fp.x, fp.y)
      for (let i = 1; i < polyPoints.length; i++) {
        const pp = worldToCanvas(polyPoints[i], pan, zoom)
        ctx.lineTo(pp.x, pp.y)
      }
      const mp = worldToCanvas(mouseWorld, pan, zoom)
      ctx.lineTo(mp.x, mp.y); ctx.stroke()
      for (const pt of polyPoints) {
        const pp = worldToCanvas(pt, pan, zoom)
        ctx.fillStyle = '#f59e0b'
        ctx.beginPath(); ctx.arc(pp.x, pp.y, 4, 0, Math.PI * 2); ctx.fill()
      }
    }

    // Wall rubber-band
    if (drawingTool === 'wall' && pendingStart) {
      const end = previewEnd(pendingStart)
      const a = worldToCanvas(pendingStart, pan, zoom)
      const b = worldToCanvas(end, pan, zoom)
      ctx.strokeStyle = kbDir ? '#16a34a' : '#f59e0b'
      ctx.lineWidth = 2
      ctx.setLineDash([6, 3])
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke()
      ctx.setLineDash([])

      // Direction arrow at end
      const dx = b.x - a.x, dy = b.y - a.y
      const ang = Math.atan2(dy, dx)
      const aw = 8
      ctx.fillStyle = kbDir ? '#16a34a' : '#f59e0b'
      ctx.beginPath()
      ctx.moveTo(b.x, b.y)
      ctx.lineTo(b.x - aw * Math.cos(ang - 0.4), b.y - aw * Math.sin(ang - 0.4))
      ctx.lineTo(b.x - aw * Math.cos(ang + 0.4), b.y - aw * Math.sin(ang + 0.4))
      ctx.closePath(); ctx.fill()

      // Wall name + length label on rubber-band
      const wdx = end.x - pendingStart.x, wdy = end.y - pendingStart.y
      const wLen = Math.sqrt(wdx * wdx + wdy * wdy)
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      const nx = -wdy / (wLen || 1), ny = wdx / (wLen || 1)
      ctx.textAlign = 'center'
      const liveWallName = wallName.trim() || nextWallName()
      ctx.fillStyle = '#1e40af'
      ctx.font = 'bold 11px sans-serif'
      ctx.fillText(liveWallName, mid.x + nx * 14, mid.y + ny * 14 - 7)
      ctx.fillStyle = '#92400e'
      ctx.font = 'bold 11px monospace'
      ctx.fillText(`${wLen.toFixed(2)}m`, mid.x + nx * 14, mid.y + ny * 14 + 5)
      ctx.textAlign = 'left'

      // Start dot
      ctx.fillStyle = '#2563eb'
      ctx.beginPath(); ctx.arc(a.x, a.y, 5, 0, Math.PI * 2); ctx.fill()

      // Close-shape snap ring: highlight first point when mouse is near it
      if (wallChain.length >= 2) {
        const firstPt = worldToCanvas(wallChain[0], pan, zoom)
        const distToFirst = Math.sqrt((b.x - firstPt.x) ** 2 + (b.y - firstPt.y) ** 2)
        const snapRing = distToFirst < 14
        ctx.strokeStyle = snapRing ? '#16a34a' : 'rgba(22,163,74,0.4)'
        ctx.lineWidth = snapRing ? 2.5 : 1.5
        ctx.beginPath(); ctx.arc(firstPt.x, firstPt.y, 9, 0, Math.PI * 2); ctx.stroke()
        if (snapRing) {
          ctx.fillStyle = 'rgba(22,163,74,0.15)'
          ctx.beginPath(); ctx.arc(firstPt.x, firstPt.y, 9, 0, Math.PI * 2); ctx.fill()
        }
      }
    }

    // Crosshair
    const mp = worldToCanvas(mouseWorld, pan, zoom)
    ctx.strokeStyle = 'rgba(100,116,139,0.25)'
    ctx.lineWidth = 0.5
    ctx.beginPath(); ctx.moveTo(mp.x, 0); ctx.lineTo(mp.x, CANVAS_PX); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(0, mp.y); ctx.lineTo(CANVAS_PX, mp.y); ctx.stroke()

    // Coords + zoom
    ctx.fillStyle = 'rgba(71,85,105,0.6)'
    ctx.font = '10px monospace'
    ctx.fillText(`(${mouseWorld.x.toFixed(2)}, ${mouseWorld.y.toFixed(2)})  ×${(zoom / BASE_ZOOM).toFixed(1)}`, 6, CANVAS_PX - 6)
  }, [stories, activeStoryId, pendingStart, mouseWorld, polyPoints, pan, zoom, gridSizeM, drawingTool, previewEnd, kbDir, BASE_ZOOM, wallChain, selectedWallId, hoveredWallId])

  // ── Click ─────────────────────────────────────────────────────────────────
  function handleClick(e: React.MouseEvent<HTMLCanvasElement>) {
    if (isPanning.current) return
    if (!activeStoryId) return
    const pt = getWorldPos(e)
    const { cx, cy } = getCanvasPos(e)

    // Wall selection — available in select mode OR when room is closed (wall mode, no pending)
    const canSelect = drawingTool === 'select' || (drawingTool === 'wall' && !pendingStart)
    if (canSelect) {
      const hit = wallNearPoint(cx, cy, 10)
      if (hit) { setSelectedWallId(hit === selectedWallId ? null : hit); return }
      else setSelectedWallId(null)
    }

    // When starting a new wall, pre-fill wall name
    if (drawingTool === 'wall' && !pendingStart) {
      setWallName(nextWallName())
    }

    if (drawingTool === 'wall') {
      // Block starting a new wall if this storey already has a closed room
      if (!pendingStart && (activeStory?.footprintPolygon.length ?? 0) >= 3) return
      if (!pendingStart) {
        setPendingStart(pt)
        setKbLength('')
        setKbDir(null)
        setTimeout(() => lengthInputRef.current?.focus(), 50)
      } else {
        // Auto-close if clicking near the first point and we have 2+ segments
        if (wallChain.length >= 2) {
          const first = wallChain[0]
          const firstCanvas = worldToCanvas(first, pan, zoom)
          const endCanvas = worldToCanvas(previewEnd(pendingStart), pan, zoom)
          const distPx = Math.sqrt((endCanvas.x - firstCanvas.x) ** 2 + (endCanvas.y - firstCanvas.y) ** 2)
          if (distPx < 14) { closeShape(); return }
        }
        commitWall()
      }
    }

    if (drawingTool === 'polygon') {
      if (polyPoints.length >= 3) {
        const fp = polyPoints[0]
        if (Math.sqrt((pt.x - fp.x) ** 2 + (pt.y - fp.y) ** 2) < gridSizeM * 1.5) {
          closePolygon(activeStoryId, polyPoints)
          setPolyPoints([])
          return
        }
      }
      setPolyPoints((prev) => [...prev, pt])
    }
  }

  function handleRightClick(e: React.MouseEvent<HTMLCanvasElement>) {
    e.preventDefault()
    if (drawingTool === 'wall') {
      if (wallChain.length > 0) {
        // Undo last segment: go back to previous point, remove last placed wall
        const prevPoint = wallChain[wallChain.length - 1]
        const lastWall = activeStory?.walls.at(-1)
        if (lastWall && activeStoryId) {
          useModelerStore.getState().removeWall(activeStoryId, lastWall.id)
        }
        setWallChain(prev => prev.slice(0, -1))
        setPendingStart(prevPoint)
        setKbLength('')
        setKbDir(null)
      } else {
        // Nothing in chain — cancel entirely
        setPendingStart(null)
        setKbLength('')
        setKbDir(null)
      }
    }
    if (drawingTool === 'polygon') {
      if (polyPoints.length > 0) {
        setPolyPoints(prev => prev.slice(0, -1))
      }
    }
  }

  function handleDoubleClick() {
    if (drawingTool === 'wall' && pendingStart) {
      // Commit the current segment (if long enough) then end drawing
      commitWall()
      setPendingStart(null)
      setWallChain([])
      setKbLength('')
      setKbDir(null)
      setWallName('')
    }
    if (drawingTool === 'polygon' && polyPoints.length >= 3 && activeStoryId) {
      closePolygon(activeStoryId, polyPoints)
      setPolyPoints([])
    }
  }

  // ── Keyboard input panel handlers ─────────────────────────────────────────
  function handleLengthKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      e.preventDefault()
      setPendingStart(null); setWallChain([]); setKbLength(''); setKbDir(null)
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      // If direction + length are both set, commit the wall
      if (kbDir && parseFloat(kbLength) > 0) {
        handleDirButton(kbDir)
      }
      return
    }
    const dir = ARROW_DIR[e.key]
    if (dir) {
      e.preventDefault()
      handleDirButton(dir)
    }
  }

  function handleDirButton(dir: Point2D) {
    if (!pendingStart || !activeStoryId) return
    const len = parseFloat(kbLength)
    if (isNaN(len) || len <= 0) {
      setKbDir(dir)
      return
    }
    const end = { x: pendingStart.x + dir.x * len, y: pendingStart.y + dir.y * len }
    addWall(activeStoryId, { start: pendingStart, end })
    setWallChain(prev => [...prev, pendingStart])
    setPendingStart(end)
    setKbLength('')
    setKbDir(null)
    lengthInputRef.current?.focus()
  }

  const zoomPct = Math.round((zoom / BASE_ZOOM) * 100)

  // Measurement data for selected wall (uses store selectedWallId)
  const selectedWall = activeStory?.walls.find(w => w.id === selectedWallId) ?? null
  const selectedWallMeasure = selectedWall ? (() => {
    const dx = selectedWall.end.x - selectedWall.start.x
    const dy = selectedWall.end.y - selectedWall.start.y
    const len = Math.sqrt(dx * dx + dy * dy)
    const area = len * (activeStory?.storyHeight ?? 2.5)
    // Bearing: angle from north (Y+), clockwise
    const bearingRad = Math.atan2(dx, dy)
    const bearingDeg = ((bearingRad * 180 / Math.PI) + 360) % 360
    const cardinals = ['N','NE','E','SE','S','SW','W','NW']
    const cardinal = cardinals[Math.round(bearingDeg / 45) % 8]
    return { len, area, bearingDeg, cardinal }
  })() : null

  return (
    <div className={`flex flex-col gap-2 ${className ?? ''}`} ref={containerRef}>
      {/* Status bar */}
      <div className="flex items-center gap-2 text-xs text-gray-500">
        <span>Active: <span className="text-blue-600 font-medium">{activeStory?.name ?? '—'}</span></span>
        {activeStory && (activeStory.rooms.length > 0 || activeStory.footprintPolygon.length >= 3) && !pendingStart && (
          <button
            onClick={() => { if (activeStoryId) clearWalls(activeStoryId) }}
            className="px-2 py-0.5 rounded bg-white hover:bg-red-50 text-gray-500 hover:text-red-600 border border-gray-200 text-xs"
          >↺ Clear floor</button>
        )}
        <span className="ml-auto text-gray-400">
          {drawingTool === 'wall' && !pendingStart && (activeStory?.rooms.length ?? 0) > 0 && `${activeStory?.rooms.length} room${activeStory?.rooms.length !== 1 ? 's' : ''} — draw to add another`}
          {drawingTool === 'wall' && !pendingStart && (activeStory?.rooms.length ?? 0) === 0 && (activeStory?.footprintPolygon.length ?? 0) < 3 && 'Click canvas to start wall'}
          {drawingTool === 'wall' && pendingStart && (wallChain.length >= 2
            ? `${wallChain.length + 1} pts — type length + direction • Enter to commit • Right-click to undo • Close Shape to finish`
            : 'Type length → pick direction or click canvas • Right-click to undo')}
          {drawingTool === 'polygon' && (polyPoints.length === 0 ? 'Click to place polygon points' : `${polyPoints.length} pts — click near start or double-click to close`)}
          {drawingTool === 'select' && (selectedWallId ? 'Wall selected — click another wall or empty space to deselect' : 'Click a wall to measure it • Alt+drag or middle-mouse to pan')}
        </span>
      </div>

      {/* Selected wall measurement panel */}
      {selectedWallMeasure && selectedWall && (
        <div className="flex items-center gap-4 px-3 py-2 bg-amber-50 border border-amber-200 rounded-xl text-xs shadow-sm">
          <span className="font-semibold text-amber-800">{selectedWall.name}</span>
          <span className="text-amber-700">Length: <span className="font-mono font-bold">{selectedWallMeasure.len.toFixed(2)} m</span></span>
          <span className="text-amber-700">Area: <span className="font-mono font-bold">{selectedWallMeasure.area.toFixed(2)} m²</span></span>
          <span className="text-amber-700">Bearing: <span className="font-mono font-bold">{selectedWallMeasure.cardinal} ({selectedWallMeasure.bearingDeg.toFixed(0)}°)</span></span>
          <button
            onClick={() => { if (activeStoryId) { removeWall(activeStoryId, selectedWall.id); setSelectedWallId(null) } }}
            className="ml-auto flex items-center gap-1 px-2 py-0.5 rounded bg-red-50 border border-red-200 text-red-500 hover:bg-red-100 transition-colors"
            title="Delete wall (Del)"
          >
            <Trash2 size={11} /> Delete
          </button>
          <button onClick={() => setSelectedWallId(null)} className="text-amber-400 hover:text-amber-700">✕</button>
        </div>
      )}

      {/* Keyboard measurement panel — shown when a wall is in progress */}
      {drawingTool === 'wall' && pendingStart && (
        <div className="flex items-center gap-3 px-3 py-2 bg-white border border-gray-200 rounded-xl shadow-sm">
          {/* Wall name */}
          <span className="text-xs text-gray-500 shrink-0">Name</span>
          <input
            ref={wallNameInputRef}
            type="text"
            placeholder={nextWallName()}
            value={wallName}
            onChange={(e) => setWallName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Tab') { e.preventDefault(); lengthInputRef.current?.focus() } }}
            className="w-24 bg-white border border-gray-200 rounded-lg px-2 py-1 text-gray-800 text-sm focus:outline-none focus:border-blue-400"
          />
          <div className="h-4 w-px bg-gray-200" />
          {/* Step 1 */}
          <span className="text-xs text-gray-500 shrink-0">① Length&nbsp;(m)</span>
          <input
            ref={lengthInputRef}
            type="text"
            inputMode="decimal"
            placeholder="e.g. 3.5"
            value={kbLength}
            onChange={(e) => setKbLength(e.target.value)}
            onKeyDown={handleLengthKeyDown}
            className="w-24 bg-white border border-gray-200 rounded-lg px-2 py-1 text-gray-800 text-sm focus:outline-none focus:border-blue-400"
            autoFocus
          />

          {/* Step 2 */}
          <span className="text-xs text-gray-500 shrink-0">② Direction</span>
          <div className="grid grid-cols-3 gap-0.5">
            <div />
            <button onClick={() => handleDirButton({ x: 0, y: 1 })} title="North"
              className={`p-1.5 rounded ${kbDir?.y === 1 && kbDir?.x === 0 ? 'bg-green-600 text-white' : 'bg-white border border-gray-200 hover:bg-gray-50'}`}>
              <ArrowUp size={13} className={kbDir?.y === 1 && kbDir?.x === 0 ? 'text-white' : 'text-gray-600'} />
            </button>
            <div />
            <button onClick={() => handleDirButton({ x: -1, y: 0 })} title="West"
              className={`p-1.5 rounded ${kbDir?.x === -1 ? 'bg-green-600 text-white' : 'bg-white border border-gray-200 hover:bg-gray-50'}`}>
              <ArrowLeft size={13} className={kbDir?.x === -1 ? 'text-white' : 'text-gray-600'} />
            </button>
            <button onClick={() => handleDirButton({ x: 0, y: -1 })} title="South"
              className={`p-1.5 rounded ${kbDir?.y === -1 && kbDir?.x === 0 ? 'bg-green-600 text-white' : 'bg-white border border-gray-200 hover:bg-gray-50'}`}>
              <ArrowDown size={13} className={kbDir?.y === -1 && kbDir?.x === 0 ? 'text-white' : 'text-gray-600'} />
            </button>
            <button onClick={() => handleDirButton({ x: 1, y: 0 })} title="East"
              className={`p-1.5 rounded ${kbDir?.x === 1 ? 'bg-green-600 text-white' : 'bg-white border border-gray-200 hover:bg-gray-50'}`}>
              <ArrowRight size={13} className={kbDir?.x === 1 ? 'text-white' : 'text-gray-600'} />
            </button>
          </div>

          <span className="text-xs text-gray-400">
            {parseFloat(kbLength) > 0
              ? 'Click a direction arrow (or press ↑ ↓ ← → on keyboard)'
              : 'Type a length first, then pick direction'}
          </span>
          {wallChain.length >= 2 && (
            <button onClick={closeShape}
              className="px-3 py-1 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-medium shrink-0">
              ✓ Close Shape
            </button>
          )}
          <button onClick={() => { setPendingStart(null); setWallChain([]); setKbLength(''); setKbDir(null) }}
            className="ml-auto text-xs text-gray-400 hover:text-red-500 shrink-0">✕ Cancel</button>
        </div>
      )}

      {/* Canvas */}
      <div className="relative flex-1">
        <canvas
          ref={canvasRef}
          width={CANVAS_PX}
          height={CANVAS_PX}
          className="rounded-xl border border-gray-200 w-full shadow-sm"
          style={{ aspectRatio: '1 / 1', cursor: cursorPanning ? 'grabbing' : (drawingTool === 'select' ? 'grab' : 'crosshair') }}
          onMouseMove={handleMouseMovePan}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onMouseLeave={() => { isPanning.current = false; setCursorPanning(false) }}
          onClick={handleClick}
          onContextMenu={handleRightClick}
          onDoubleClick={handleDoubleClick}
        />

        {/* Zoom controls overlay */}
        <div className="absolute bottom-3 right-3 flex flex-col gap-1">
          <button onClick={() => applyZoom(1.25)} title="Zoom in"
            className="w-7 h-7 flex items-center justify-center bg-white/90 border border-gray-200 rounded shadow-sm text-gray-600 hover:bg-gray-50">
            <ZoomIn size={13} />
          </button>
          <button onClick={resetView} title="Reset view"
            className="w-7 h-7 flex items-center justify-center bg-white/90 border border-gray-200 rounded shadow-sm text-gray-500 hover:bg-gray-50 text-xs font-mono">
            {zoomPct}%
          </button>
          <button onClick={() => applyZoom(0.8)} title="Zoom out"
            className="w-7 h-7 flex items-center justify-center bg-white/90 border border-gray-200 rounded shadow-sm text-gray-600 hover:bg-gray-50">
            <ZoomOut size={13} />
          </button>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="flex gap-2 items-center">
        <button
          onClick={() => {
            if (activeStoryId && window.confirm('Clear this storey and start over? This will remove all walls and openings.')) {
              clearWalls(activeStoryId)
              setPendingStart(null)
              setWallChain([])
              setKbLength('')
              setKbDir(null)
            }
          }}
          className="text-xs px-3 py-1 rounded-lg bg-white text-red-500 hover:bg-red-50 border border-gray-200"
        >
          ↺ Clear storey
        </button>
        <span className="text-xs text-gray-400">
          Scroll to zoom • Alt+drag or middle-mouse to pan • Right-click to undo
        </span>
      </div>
    </div>
  )
}
