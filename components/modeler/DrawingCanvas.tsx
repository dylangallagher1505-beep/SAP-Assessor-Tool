'use client'
import { useRef, useEffect, useCallback, useState } from 'react'
import { useModelerStore, Point2D, Wall } from '@/lib/modelerStore'
import { effectiveRidge, defaultRidge } from '@/lib/roofGeometry'
import { ZoomIn, ZoomOut, Maximize2, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Trash2, Square as SquareIcon, DoorOpen } from 'lucide-react'
import WallFaceEditor from './WallFaceEditor'

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

  const { stories, activeStoryId, drawingTool, gridSizeM, addWall, clearWalls, setFootprint, closePolygon, registerRoom, selectedWallId, setSelectedWallId, removeWall, moveVertex, moveEdge, insertVertex, deleteVertex, setWallLength, pushHistory, undo, redo, roofConfig, updateRoof, showRoof, addOpening, updateOpening, removeOpening } =
    useModelerStore()
  const activeStory = stories.find((s) => s.id === activeStoryId)

  // Ridge is editable on the top storey's plan when a pitched roof is shown
  const isTopStory = activeStory ? stories.indexOf(activeStory) === stories.length - 1 : false
  const roofRidge = (isTopStory && showRoof && activeStory && activeStory.footprintPolygon.length >= 3)
    ? effectiveRidge(activeStory.footprintPolygon, roofConfig)
    : null


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
  const [snappedToVertex, setSnappedToVertex] = useState(false)
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

  // Ortho lock (Shift key)
  const [shiftDown, setShiftDown] = useState(false)

  // Vertex drag state (select tool)
  const [dragVertex, setDragVertex] = useState<{ roomIdx: number; vertIdx: number } | null>(null)
  const isDraggingVertex = useRef(false)

  // Edge drag state (select tool) — slide a whole wall along its normal
  const dragEdge = useRef<{
    roomId: string
    edgeIdx: number
    origA: Point2D
    origB: Point2D
    normal: Point2D
    startWorld: Point2D
  } | null>(null)
  const didDrag = useRef(false)

  // Ridge endpoint drag (select tool, top storey)
  const dragRidgeEnd = useRef<'start' | 'end' | null>(null)

  // Exact-length editing of the selected wall
  const [lenEdit, setLenEdit] = useState('')
  const [lenAnchor, setLenAnchor] = useState<'start' | 'end'>('start')

  // Opening placement — arm a window/door then drop it onto a wall
  const [placingOpening, setPlacingOpening] = useState<'window' | 'door' | null>(null)
  // Drag an existing opening along its wall (select tool)
  const dragOpening = useRef<{ openingId: string } | null>(null)

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

  /** Room polygon vertex under the cursor (world pt), or null. */
  function vertexNearPoint(pt: Point2D): { roomIdx: number; vertIdx: number } | null {
    if (!activeStory) return null
    const snapR = gridSizeM * 0.8
    for (let ri = 0; ri < activeStory.rooms.length; ri++) {
      const room = activeStory.rooms[ri]
      for (let vi = 0; vi < room.polygon.length; vi++) {
        const v = room.polygon[vi]
        if (Math.sqrt((v.x - pt.x) ** 2 + (v.y - pt.y) ** 2) < snapR) return { roomIdx: ri, vertIdx: vi }
      }
    }
    return null
  }

  /** Room polygon edge near the canvas point (excluding endpoints), or null. */
  function edgeNearPoint(cx: number, cy: number, threshold = 8): { roomIdx: number; edgeIdx: number } | null {
    if (!activeStory) return null
    for (let ri = 0; ri < activeStory.rooms.length; ri++) {
      const poly = activeStory.rooms[ri].polygon
      for (let ei = 0; ei < poly.length; ei++) {
        const a = worldToCanvas(poly[ei], pan, zoom)
        const b = worldToCanvas(poly[(ei + 1) % poly.length], pan, zoom)
        // Skip if cursor is on an endpoint — vertex interactions win
        const nearEnd = Math.sqrt((cx - a.x) ** 2 + (cy - a.y) ** 2) < 12 || Math.sqrt((cx - b.x) ** 2 + (cy - b.y) ** 2) < 12
        if (!nearEnd && distToSegmentPx(cx, cy, a.x, a.y, b.x, b.y) < threshold) return { roomIdx: ri, edgeIdx: ei }
      }
    }
    return null
  }

  /** Project a world point onto the segment a→b (clamped away from the ends). */
  function projectOntoEdge(pt: Point2D, a: Point2D, b: Point2D): Point2D {
    const dx = b.x - a.x, dy = b.y - a.y
    const lenSq = dx * dx + dy * dy
    if (lenSq < 1e-6) return a
    const t = Math.max(0.05, Math.min(0.95, ((pt.x - a.x) * dx + (pt.y - a.y) * dy) / lenSq))
    return { x: a.x + t * dx, y: a.y + t * dy }
  }

  // Default dimensions for a freshly-dropped opening
  const OPENING_DEFAULTS = {
    window: { width: 1.2, height: 1.0, sillHeight: 0.9, uValue: 1.4, gValue: 0.63 },
    door: { width: 0.9, height: 2.0, sillHeight: 0, uValue: 1.4, gValue: 0.63 },
  } as const

  /** Nearest active-storey wall to a canvas point, with the projected fractional position. */
  function wallProjectionNear(cx: number, cy: number, threshold = 14):
    { wallId: string; uOffset: number; len: number; point: Point2D } | null {
    if (!activeStory) return null
    let best: { wallId: string; uOffset: number; len: number; point: Point2D } | null = null
    let bestDist = threshold
    for (const w of activeStory.walls) {
      const a = worldToCanvas(w.start, pan, zoom)
      const b = worldToCanvas(w.end, pan, zoom)
      const d = distToSegmentPx(cx, cy, a.x, a.y, b.x, b.y)
      if (d >= bestDist) continue
      const dx = w.end.x - w.start.x, dy = w.end.y - w.start.y
      const len = Math.sqrt(dx * dx + dy * dy)
      if (len < 0.1) continue
      // fractional position of the cursor projected onto the wall (world space)
      const wpt = canvasToWorld(cx, cy, pan, zoom)
      const t = Math.max(0, Math.min(1, ((wpt.x - w.start.x) * dx + (wpt.y - w.start.y) * dy) / (len * len)))
      bestDist = d
      best = { wallId: w.id, uOffset: t, len, point: { x: w.start.x + dx * t, y: w.start.y + dy * t } }
    }
    return best
  }

  /** Opening tick near a canvas point (for drag-repositioning), or null. */
  function openingNear(cx: number, cy: number, threshold = 8): { openingId: string } | null {
    if (!activeStory) return null
    for (const op of activeStory.openings) {
      const w = activeStory.walls.find(ww => ww.id === op.wallId)
      if (!w) continue
      const dx = w.end.x - w.start.x, dy = w.end.y - w.start.y
      const len = Math.sqrt(dx * dx + dy * dy)
      if (len < 0.1) continue
      const uMid = op.uOffset + (op.width / len) / 2
      const mid = { x: w.start.x + dx * uMid, y: w.start.y + dy * uMid }
      const mc = worldToCanvas(mid, pan, zoom)
      if (Math.sqrt((cx - mc.x) ** 2 + (cy - mc.y) ** 2) < threshold) return { openingId: op.id }
    }
    return null
  }

  /** Clamp a left-edge uOffset so an opening of the given width stays on the wall. */
  function clampOffset(uOffset: number, width: number, len: number): number {
    const wFrac = Math.min(0.98, width / len)
    return Math.max(0, Math.min(1 - wFrac, uOffset - wFrac / 2))
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
    if (!story) return gridPt
    const snapped = snapToVertex(gridPt, story.walls, gridSizeM)
    const isSnapped = snapped !== gridPt
    setSnappedToVertex(isSnapped)
    return snapped
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
    if (shiftDown) {
      // Ortho lock: constrain to nearest 90° axis
      const dx = mouseWorld.x - start.x
      const dy = mouseWorld.y - start.y
      return Math.abs(dx) >= Math.abs(dy)
        ? { x: mouseWorld.x, y: start.y }
        : { x: start.x, y: mouseWorld.y }
    }
    return snapToAngle(start, mouseWorld)
  }, [kbLength, kbDir, mouseWorld, shiftDown])

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
    const onShiftDown = (e: KeyboardEvent) => { if (e.key === 'Shift') setShiftDown(true) }
    const onShiftUp = (e: KeyboardEvent) => { if (e.key === 'Shift') setShiftDown(false) }
    window.addEventListener('keydown', onShiftDown)
    window.addEventListener('keyup', onShiftUp)
    return () => { window.removeEventListener('keydown', onShiftDown); window.removeEventListener('keyup', onShiftUp) }
  }, [])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // Don't intercept when typing in inputs
      if ((e.target as HTMLElement).tagName === 'INPUT') return

      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
        e.preventDefault()
        redo()
        return
      }

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
        } else {
          // Outside drawing: global undo
          undo()
        }
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedWallId && activeStoryId && !pendingStart) {
          e.preventDefault()
          removeWall(activeStoryId, selectedWallId)
          setSelectedWallId(null)
        }
      }

      if (e.key === 'Escape') {
        // Cancel opening placement
        if (placingOpening) { setPlacingOpening(null); return }
        // Cancel in-progress drawing
        if (pendingStart) {
          setPendingStart(null)
          setWallChain([])
          setKbLength(''); setKbDir(null); setWallName('')
        }
        if (polyPoints.length > 0) setPolyPoints([])
        setSelectedWallId(null)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [pendingStart, wallChain, polyPoints, activeStory, activeStoryId, selectedWallId, removeWall, undo, redo, setSelectedWallId, placingOpening])

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
      return
    }
    // Reposition an existing opening by dragging its tick (any tool, left button)
    if (e.button === 0 && !placingOpening && activeStory) {
      const { cx, cy } = getCanvasPos(e)
      const opHit = openingNear(cx, cy)
      if (opHit) {
        pushHistory()
        dragOpening.current = opHit
        didDrag.current = false
        return
      }
    }

    // Vertex / edge drag — select tool, left button
    if (e.button === 0 && drawingTool === 'select' && activeStory) {
      const pt = getWorldPos(e)
      didDrag.current = false

      // Ridge endpoints take priority — they sit inside the plan
      if (roofRidge) {
        const { cx, cy } = getCanvasPos(e)
        for (const endName of ['start', 'end'] as const) {
          const rp = worldToCanvas(roofRidge[endName], pan, zoom)
          if (Math.sqrt((cx - rp.x) ** 2 + (cy - rp.y) ** 2) < 12) {
            pushHistory()
            if (!roofConfig.ridge) updateRoof({ ridge: roofRidge }) // materialize auto ridge
            dragRidgeEnd.current = endName
            return
          }
        }
      }

      const hit = vertexNearPoint(pt)
      if (hit) {
        pushHistory()
        setDragVertex(hit)
        isDraggingVertex.current = true
        return
      }

      const { cx, cy } = getCanvasPos(e)
      const edgeHit = edgeNearPoint(cx, cy)
      if (edgeHit) {
        const room = activeStory.rooms[edgeHit.roomIdx]
        const a = room.polygon[edgeHit.edgeIdx]
        const b = room.polygon[(edgeHit.edgeIdx + 1) % room.polygon.length]
        const len = Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2)
        if (len > 0.01) {
          pushHistory()
          dragEdge.current = {
            roomId: room.id,
            edgeIdx: edgeHit.edgeIdx,
            origA: a,
            origB: b,
            normal: { x: -(b.y - a.y) / len, y: (b.x - a.x) / len },
            startWorld: pt,
          }
        }
      }
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
    const pt = getWorldPos(e)
    setMouseWorld(pt)

    // Ridge endpoint drag
    if (dragRidgeEnd.current && roofRidge) {
      didDrag.current = true
      const current = roofConfig.ridge ?? roofRidge
      updateRoof({ ridge: { ...current, [dragRidgeEnd.current]: pt } })
      return
    }

    // Reposition an opening along its wall
    if (dragOpening.current && activeStory && activeStoryId) {
      const op = activeStory.openings.find(o => o.id === dragOpening.current!.openingId)
      const w = op && activeStory.walls.find(ww => ww.id === op.wallId)
      if (op && w) {
        const dx = w.end.x - w.start.x, dy = w.end.y - w.start.y
        const len = Math.sqrt(dx * dx + dy * dy)
        if (len > 0.1) {
          const { cx, cy } = getCanvasPos(e)
          const wpt = canvasToWorld(cx, cy, pan, zoom)
          const t = ((wpt.x - w.start.x) * dx + (wpt.y - w.start.y) * dy) / (len * len)
          updateOpening(activeStoryId, op.id, { uOffset: clampOffset(t, op.width, len) })
          didDrag.current = true
        }
      }
      return
    }

    // Vertex drag
    if (isDraggingVertex.current && dragVertex && activeStory && activeStoryId) {
      const room = activeStory.rooms[dragVertex.roomIdx]
      if (room) {
        didDrag.current = true
        moveVertex(activeStoryId, room.id, dragVertex.vertIdx, pt)
      }
      return
    }

    // Edge drag — slide the wall along its normal, snapped to the grid
    if (dragEdge.current && activeStoryId) {
      const d = dragEdge.current
      const rawDelta = (pt.x - d.startWorld.x) * d.normal.x + (pt.y - d.startWorld.y) * d.normal.y
      const delta = Math.round(rawDelta / gridSizeM) * gridSizeM
      const newA = { x: d.origA.x + d.normal.x * delta, y: d.origA.y + d.normal.y * delta }
      const newB = { x: d.origB.x + d.normal.x * delta, y: d.origB.y + d.normal.y * delta }
      didDrag.current = true
      moveEdge(activeStoryId, d.roomId, d.edgeIdx, newA, newB)
      return
    }

    // Hover detection — only when not actively drawing
    if (!pendingStart && polyPoints.length === 0) {
      const { cx, cy } = getCanvasPos(e)
      setHoveredWallId(wallNearPoint(cx, cy, 10))
    }
  }

  function handleMouseUp(e: React.MouseEvent<HTMLCanvasElement>) {
    if (isPanning.current) { isPanning.current = false; setCursorPanning(false); return }
    if (isDraggingVertex.current) {
      isDraggingVertex.current = false
      setDragVertex(null)
    }
    dragEdge.current = null
    dragRidgeEnd.current = null
    dragOpening.current = null
  }

  // ── Canvas drawing ─────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, CANVAS_PX, CANVAS_PX)

    // Light canvas background
    ctx.fillStyle = '#fbfdfc'
    ctx.fillRect(0, 0, CANVAS_PX, CANVAS_PX)

    // Minor grid
    const step = gridSizeM * zoom
    if (step > 4) {
      ctx.strokeStyle = '#e4ede8'
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
    ctx.strokeStyle = '#d3e0d9'
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
    ctx.strokeStyle = 'rgba(16,185,129,0.35)'
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
        ctx.strokeStyle = isSelected ? '#f59e0b' : isHovered ? '#fb923c' : (isActive ? '#065f46' : '#94a3b8')
        ctx.lineWidth = isSelected ? 3.5 : isHovered ? 3 : (isActive ? 2.5 : 1)
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke()

        if (isActive) {
          ctx.fillStyle = isSelected ? '#f59e0b' : '#10b981'
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
            ctx.fillStyle = isSelected ? '#b45309' : 'rgba(6,95,70,0.75)'
            ctx.fillText(`${len.toFixed(2)}m`, lx, ly + 4)
            ctx.textAlign = 'left'
          }

          // Openings tick marks (+ drag handle at the midpoint)
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
              // Draggable midpoint handle
              const mid = { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 }
              ctx.fillStyle = '#fff'
              ctx.strokeStyle = op.type === 'window' ? '#0ea5e9' : '#f59e0b'
              ctx.lineWidth = 1.5
              ctx.beginPath(); ctx.arc(mid.x, mid.y, 3.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
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
          ctx.strokeStyle = isActive ? '#10b981' : '#6ee7b7'
          ctx.fillStyle = isActive ? 'rgba(16,185,129,0.07)' : 'rgba(16,185,129,0.04)'
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
          ctx.fillStyle = isActive ? '#047857' : '#6ee7b7'
          ctx.fillText(label, cc.x, cc.y)
          ctx.textAlign = 'left'

          // Vertex handles in select mode
          if (drawingTool === 'select' && isActive) {
            for (const v of polygon) {
              const vp = worldToCanvas(v, pan, zoom)
              ctx.fillStyle = '#059669'
              ctx.strokeStyle = '#fff'
              ctx.lineWidth = 1.5
              ctx.beginPath(); ctx.arc(vp.x, vp.y, 5, 0, Math.PI * 2)
              ctx.fill(); ctx.stroke()
            }
          }
        }
      } else if (isActive && story.footprintPolygon.length >= 2) {
        ctx.strokeStyle = '#10b981'
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

    // Roof ridge overlay — top storey plan, pitched roof
    if (roofRidge && activeStory) {
      const closest = (p: Point2D, a: Point2D, b: Point2D): Point2D => {
        const dx = b.x - a.x, dy = b.y - a.y
        const lenSq = dx * dx + dy * dy
        if (lenSq < 1e-9) return a
        const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq))
        return { x: a.x + t * dx, y: a.y + t * dy }
      }
      // Plane-division lines from footprint corners to the ridge
      ctx.strokeStyle = 'rgba(225,29,72,0.25)'
      ctx.lineWidth = 1
      ctx.setLineDash([3, 3])
      for (const v of activeStory.footprintPolygon) {
        const proj = closest(v, roofRidge.start, roofRidge.end)
        const a = worldToCanvas(v, pan, zoom)
        const b = worldToCanvas(proj, pan, zoom)
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke()
      }
      ctx.setLineDash([])

      // Ridge line
      const rs = worldToCanvas(roofRidge.start, pan, zoom)
      const re = worldToCanvas(roofRidge.end, pan, zoom)
      ctx.strokeStyle = '#e11d48'
      ctx.lineWidth = 2.5
      ctx.setLineDash([8, 4])
      ctx.beginPath(); ctx.moveTo(rs.x, rs.y); ctx.lineTo(re.x, re.y); ctx.stroke()
      ctx.setLineDash([])

      // Endpoint handles (diamonds) — draggable in select mode
      for (const p of [rs, re]) {
        ctx.fillStyle = drawingTool === 'select' ? '#e11d48' : 'rgba(225,29,72,0.5)'
        ctx.strokeStyle = '#fff'
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.moveTo(p.x, p.y - 6); ctx.lineTo(p.x + 6, p.y); ctx.lineTo(p.x, p.y + 6); ctx.lineTo(p.x - 6, p.y)
        ctx.closePath(); ctx.fill(); ctx.stroke()
      }

      // Label
      const mid = { x: (rs.x + re.x) / 2, y: (rs.y + re.y) / 2 }
      ctx.font = 'bold 10px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillStyle = '#be123c'
      ctx.fillText('ridge', mid.x, mid.y - 8)
      ctx.textAlign = 'left'
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

      // Filled preview with live area
      if (polyPoints.length >= 2) {
        const previewPoly = [...polyPoints, mouseWorld]
        ctx.fillStyle = 'rgba(245,158,11,0.08)'
        ctx.beginPath()
        const fp2 = worldToCanvas(previewPoly[0], pan, zoom)
        ctx.moveTo(fp2.x, fp2.y)
        for (let i = 1; i < previewPoly.length; i++) {
          const pp = worldToCanvas(previewPoly[i], pan, zoom)
          ctx.lineTo(pp.x, pp.y)
        }
        ctx.closePath(); ctx.fill()

        // Live area at centroid
        const area = Math.abs(previewPoly.reduce((s, p, i) => {
          const j = (i + 1) % previewPoly.length
          return s + p.x * previewPoly[j].y - previewPoly[j].x * p.y
        }, 0) / 2)
        const cxW = previewPoly.reduce((s, p) => s + p.x, 0) / previewPoly.length
        const cyW = previewPoly.reduce((s, p) => s + p.y, 0) / previewPoly.length
        const cc = worldToCanvas({ x: cxW, y: cyW }, pan, zoom)
        ctx.font = 'bold 12px monospace'
        ctx.textAlign = 'center'
        ctx.fillStyle = '#92400e'
        ctx.fillText(`${area.toFixed(1)} m²`, cc.x, cc.y)
        ctx.textAlign = 'left'
      }

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
      ctx.fillStyle = '#065f46'
      ctx.font = 'bold 11px sans-serif'
      ctx.fillText(liveWallName, mid.x + nx * 14, mid.y + ny * 14 - 7)
      ctx.fillStyle = '#92400e'
      ctx.font = 'bold 11px monospace'
      ctx.fillText(`${wLen.toFixed(2)}m`, mid.x + nx * 14, mid.y + ny * 14 + 5)
      ctx.textAlign = 'left'

      // Start dot
      ctx.fillStyle = '#059669'
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

    // Opening placement ghost — snaps to the nearest wall under the cursor
    if (placingOpening) {
      const mc = worldToCanvas(mouseWorld, pan, zoom)
      const proj = wallProjectionNear(mc.x, mc.y, 40)
      const color = placingOpening === 'window' ? '#0ea5e9' : '#f59e0b'
      if (proj && activeStory) {
        const w = activeStory.walls.find(ww => ww.id === proj.wallId)!
        const d = OPENING_DEFAULTS[placingOpening]
        const u0 = clampOffset(proj.uOffset, d.width, proj.len)
        const u1 = u0 + d.width / proj.len
        const a = worldToCanvas(w.start, pan, zoom)
        const b = worldToCanvas(w.end, pan, zoom)
        const pa = { x: a.x + (b.x - a.x) * u0, y: a.y + (b.y - a.y) * u0 }
        const pb = { x: a.x + (b.x - a.x) * u1, y: a.y + (b.y - a.y) * u1 }
        ctx.strokeStyle = color
        ctx.lineWidth = 5
        ctx.globalAlpha = 0.8
        ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke()
        ctx.globalAlpha = 1
      } else {
        // No wall nearby — show a floating chip at the cursor
        ctx.fillStyle = color
        ctx.globalAlpha = 0.5
        ctx.beginPath(); ctx.arc(mc.x, mc.y, 6, 0, Math.PI * 2); ctx.fill()
        ctx.globalAlpha = 1
      }
      ctx.fillStyle = color
      ctx.font = 'bold 11px sans-serif'
      ctx.fillText(`drop ${placingOpening} on a wall`, mc.x + 12, mc.y - 8)
    }

    // Crosshair
    const mp = worldToCanvas(mouseWorld, pan, zoom)
    ctx.strokeStyle = 'rgba(100,116,139,0.25)'
    ctx.lineWidth = 0.5
    ctx.beginPath(); ctx.moveTo(mp.x, 0); ctx.lineTo(mp.x, CANVAS_PX); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(0, mp.y); ctx.lineTo(CANVAS_PX, mp.y); ctx.stroke()

    // Vertex snap indicator
    if (snappedToVertex) {
      ctx.strokeStyle = '#16a34a'
      ctx.lineWidth = 2
      ctx.beginPath(); ctx.arc(mp.x, mp.y, 7, 0, Math.PI * 2); ctx.stroke()
      ctx.fillStyle = 'rgba(22,163,74,0.15)'
      ctx.beginPath(); ctx.arc(mp.x, mp.y, 7, 0, Math.PI * 2); ctx.fill()
    }

    // Coords + zoom
    ctx.fillStyle = 'rgba(71,85,105,0.6)'
    ctx.font = '10px monospace'
    ctx.fillText(`(${mouseWorld.x.toFixed(2)}, ${mouseWorld.y.toFixed(2)})  ×${(zoom / BASE_ZOOM).toFixed(1)}`, 6, CANVAS_PX - 6)
  }, [stories, activeStoryId, pendingStart, mouseWorld, polyPoints, pan, zoom, gridSizeM, drawingTool, previewEnd, kbDir, BASE_ZOOM, wallChain, selectedWallId, hoveredWallId, snappedToVertex, roofRidge, activeStory, placingOpening])

  // ── Click ─────────────────────────────────────────────────────────────────
  function handleClick(e: React.MouseEvent<HTMLCanvasElement>) {
    if (isPanning.current) return
    if (didDrag.current) { didDrag.current = false; return }  // a drag just ended — not a click
    if (!activeStoryId) return
    const pt = getWorldPos(e)
    const { cx, cy } = getCanvasPos(e)

    // Drop an armed opening onto the nearest wall
    if (placingOpening) {
      const proj = wallProjectionNear(cx, cy, 20)
      if (proj) {
        const d = OPENING_DEFAULTS[placingOpening]
        addOpening(activeStoryId, {
          wallId: proj.wallId,
          type: placingOpening,
          uOffset: clampOffset(proj.uOffset, d.width, proj.len),
          width: d.width,
          height: d.height,
          sillHeight: d.sillHeight,
          uValue: d.uValue,
          gValue: d.gValue,
        })
        setPlacingOpening(null)
      }
      return
    }

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
    if (drawingTool === 'select' && activeStory && activeStoryId) {
      // Right-click a vertex to remove it (merges the two adjoining walls)
      const pt = getWorldPos(e)
      const hit = vertexNearPoint(pt)
      if (hit) {
        const room = activeStory.rooms[hit.roomIdx]
        if (room && room.polygon.length > 3) deleteVertex(activeStoryId, room.id, hit.vertIdx)
        return
      }
    }
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

  function handleDoubleClick(e: React.MouseEvent<HTMLCanvasElement>) {
    if (drawingTool === 'select' && activeStory && activeStoryId) {
      // Double-click an edge to insert a corner there
      const { cx, cy } = getCanvasPos(e)
      const edgeHit = edgeNearPoint(cx, cy, 10)
      if (edgeHit) {
        const room = activeStory.rooms[edgeHit.roomIdx]
        const a = room.polygon[edgeHit.edgeIdx]
        const b = room.polygon[(edgeHit.edgeIdx + 1) % room.polygon.length]
        const pos = projectOntoEdge(getWorldPos(e), a, b)
        insertVertex(activeStoryId, room.id, edgeHit.edgeIdx, pos)
        return
      }
    }
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

  // Keep the length input in sync with the selected wall
  useEffect(() => {
    if (selectedWallMeasure) setLenEdit(selectedWallMeasure.len.toFixed(2))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedWallId, selectedWallMeasure?.len])

  function applyLength() {
    const v = parseFloat(lenEdit)
    if (selectedWall && activeStoryId && v > 0.05 && Math.abs(v - (selectedWallMeasure?.len ?? 0)) > 0.001) {
      setWallLength(activeStoryId, selectedWall.id, v, lenAnchor)
    }
  }

  return (
    <div className={`flex flex-col gap-2 ${className ?? ''}`} ref={containerRef}>
      {/* Status bar */}
      <div className="flex items-center gap-2 text-xs text-gray-500">
        <span>Active: <span className="text-emerald-700 font-medium">{activeStory?.name ?? '—'}</span></span>
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
          {drawingTool === 'select' && (selectedWallId ? 'Type a length to resize • drag a wall or corner to move it' : 'Click a wall to edit • drag walls/corners • double-click a wall to add a corner • right-click a corner to remove it')}
        </span>
      </div>

      {/* Selected wall measurement panel */}
      {selectedWallMeasure && selectedWall && (
        <div className="flex items-center gap-4 px-3 py-2 bg-amber-50 border border-amber-200 rounded-xl text-xs shadow-sm">
          <span className="font-semibold text-amber-800">{selectedWall.name}</span>
          <span className="text-amber-700 flex items-center gap-1">
            Length:
            <input
              type="text"
              inputMode="decimal"
              value={lenEdit}
              onChange={(e) => setLenEdit(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); applyLength() } }}
              onBlur={applyLength}
              className="w-16 font-mono font-bold bg-white border border-amber-300 rounded px-1.5 py-0.5 text-amber-900 focus:outline-none focus:border-amber-500"
            />
            m
            <span className="text-amber-500 ml-1">fix</span>
            <button
              onClick={() => setLenAnchor('start')}
              className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${lenAnchor === 'start' ? 'bg-amber-600 text-white' : 'bg-white border border-amber-300 text-amber-600'}`}
              title="Keep the start point fixed; the end point moves"
            >start</button>
            <button
              onClick={() => setLenAnchor('end')}
              className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${lenAnchor === 'end' ? 'bg-amber-600 text-white' : 'bg-white border border-amber-300 text-amber-600'}`}
              title="Keep the end point fixed; the start point moves"
            >end</button>
          </span>
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

      {/* 2D wall face editor — shown when a wall is selected */}
      {selectedWall && activeStory && activeStoryId && (
        <div className="px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-xl shadow-sm">
          <div className="text-xs font-semibold text-emerald-800 mb-2">Wall Face — {selectedWall.name}</div>
          <WallFaceEditor
            wall={selectedWall}
            storyId={activeStoryId}
            storyHeight={activeStory.storyHeight}
          />
        </div>
      )}

      {/* Keyboard measurement panel — shown when a wall is in progress */}
      {drawingTool === 'wall' && pendingStart && (
        <div className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-xl shadow-sm flex-wrap">
          {/* Wall name */}
          <input
            ref={wallNameInputRef}
            type="text"
            placeholder={nextWallName()}
            value={wallName}
            onChange={(e) => setWallName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Tab') { e.preventDefault(); lengthInputRef.current?.focus() } }}
            className="w-20 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1 text-gray-800 text-xs font-medium focus:outline-none focus:border-emerald-500 focus:bg-white"
            title="Wall name"
          />
          <div className="flex items-center gap-1">
            <input
              ref={lengthInputRef}
              type="text"
              inputMode="decimal"
              placeholder="Length"
              value={kbLength}
              onChange={(e) => setKbLength(e.target.value)}
              onKeyDown={handleLengthKeyDown}
              className="w-16 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1 text-gray-800 text-xs font-mono font-semibold focus:outline-none focus:border-emerald-500 focus:bg-white"
              autoFocus
              title="Length in metres — then pick a direction"
            />
            <span className="text-[10px] text-gray-400 font-medium">m</span>
          </div>

          {/* Direction — inline arrow row */}
          <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-emerald-950/5 border border-emerald-950/5">
            {([
              { dir: { x: -1, y: 0 }, icon: <ArrowLeft size={12} />, label: 'West' },
              { dir: { x: 0, y: 1 }, icon: <ArrowUp size={12} />, label: 'North' },
              { dir: { x: 0, y: -1 }, icon: <ArrowDown size={12} />, label: 'South' },
              { dir: { x: 1, y: 0 }, icon: <ArrowRight size={12} />, label: 'East' },
            ] as const).map(({ dir, icon, label }) => {
              const active = kbDir?.x === dir.x && kbDir?.y === dir.y
              return (
                <button key={label} onClick={() => handleDirButton(dir)} title={label}
                  className={`p-1.5 rounded-md transition-all ${active ? 'bg-emerald-700 text-white shadow-sm' : 'text-gray-500 hover:text-emerald-800 hover:bg-white'}`}>
                  {icon}
                </button>
              )
            })}
          </div>

          <span className="text-[10px] text-gray-400 hidden xl:inline">
            {parseFloat(kbLength) > 0 ? 'pick direction (or ↑↓←→)' : 'type length, then direction — or click the canvas'}
          </span>
          {wallChain.length >= 2 && (
            <button onClick={closeShape}
              className="px-2.5 py-1 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold shrink-0 shadow-sm">
              ✓ Close
            </button>
          )}
          <button onClick={() => { setPendingStart(null); setWallChain([]); setKbLength(''); setKbDir(null) }}
            className="ml-auto text-xs text-gray-400 hover:text-red-500 shrink-0" title="Cancel drawing (Esc)">✕</button>
        </div>
      )}

      {/* Canvas */}
      <div className="relative flex-1">
        <canvas
          ref={canvasRef}
          width={CANVAS_PX}
          height={CANVAS_PX}
          className="rounded-xl border border-gray-200 w-full shadow-sm"
          style={{ aspectRatio: '1 / 1', cursor: placingOpening ? 'copy' : cursorPanning ? 'grabbing' : (drawingTool === 'select' ? 'grab' : 'crosshair') }}
          onMouseMove={handleMouseMovePan}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onMouseLeave={() => { isPanning.current = false; setCursorPanning(false) }}
          onClick={handleClick}
          onContextMenu={handleRightClick}
          onDoubleClick={handleDoubleClick}
        />

        {/* Opening palette — arm a window/door, then click a wall to drop it */}
        {(activeStory?.walls.length ?? 0) > 0 && (
          <div className="absolute top-3 left-3 flex items-center gap-1 p-1 rounded-lg bg-white/90 border border-gray-200 shadow-sm backdrop-blur">
            <span className="text-[10px] font-semibold text-gray-400 px-1">Add</span>
            <button
              onClick={() => setPlacingOpening(placingOpening === 'window' ? null : 'window')}
              className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold transition-colors ${placingOpening === 'window' ? 'bg-sky-500 text-white' : 'text-sky-600 hover:bg-sky-50'}`}
            >
              <SquareIcon size={12} /> Window
            </button>
            <button
              onClick={() => setPlacingOpening(placingOpening === 'door' ? null : 'door')}
              className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold transition-colors ${placingOpening === 'door' ? 'bg-amber-500 text-white' : 'text-amber-600 hover:bg-amber-50'}`}
            >
              <DoorOpen size={12} /> Door
            </button>
            {placingOpening && (
              <button onClick={() => setPlacingOpening(null)} className="text-gray-400 hover:text-red-500 px-1 text-xs" title="Cancel (Esc)">✕</button>
            )}
          </div>
        )}

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
