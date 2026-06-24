'use client'
import { useRef, useEffect, useCallback, useState } from 'react'
import { useModelerStore, Wall } from '@/lib/modelerStore'

const W = 480
const H = 200
const PAD = 32

interface Props {
  wall: Wall
  storyId: string
  storyHeight: number
}

export default function WallFaceEditor({ wall, storyId, storyHeight }: Props) {
  const { updateWall } = useModelerStore()
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const hl = wall.heightLeft ?? storyHeight
  const hr = wall.heightRight ?? storyHeight
  const dx = wall.end.x - wall.start.x
  const dy = wall.end.y - wall.start.y
  const wallLen = Math.sqrt(dx * dx + dy * dy)

  // max visible height for scaling
  const maxH = Math.max(hl, hr, storyHeight) * 1.15

  // Convert world heights to canvas Y (bottom-anchored)
  const toCanvasY = (h: number) => PAD + (H - PAD * 2) * (1 - h / maxH)
  const fromCanvasY = (cy: number) => {
    const frac = 1 - (cy - PAD) / (H - PAD * 2)
    return Math.max(0.1, Math.round(frac * maxH * 20) / 20) // snap to 0.05m
  }

  const leftX = PAD
  const rightX = W - PAD
  const baseY = toCanvasY(0)

  const dragging = useRef<'left' | 'right' | null>(null)

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, W, H)

    ctx.fillStyle = '#f8fafc'
    ctx.fillRect(0, 0, W, H)

    // Grid lines
    const gridH = 0.5
    for (let h = 0; h <= maxH + gridH; h += gridH) {
      const y = toCanvasY(h)
      if (y < PAD || y > H - PAD) continue
      ctx.strokeStyle = h % 1 === 0 ? '#cbd5e1' : '#e2e8f0'
      ctx.lineWidth = h % 1 === 0 ? 1 : 0.5
      ctx.beginPath(); ctx.moveTo(PAD, y); ctx.lineTo(W - PAD, y); ctx.stroke()
      if (h % 1 === 0) {
        ctx.fillStyle = '#94a3b8'
        ctx.font = '9px monospace'
        ctx.textAlign = 'right'
        ctx.fillText(`${h.toFixed(0)}m`, PAD - 4, y + 3)
        ctx.textAlign = 'left'
      }
    }

    // Wall face trapezoid
    const tlY = toCanvasY(hl)
    const trY = toCanvasY(hr)
    ctx.fillStyle = 'rgba(59,130,246,0.10)'
    ctx.strokeStyle = '#2563eb'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(leftX, baseY)
    ctx.lineTo(leftX, tlY)
    ctx.lineTo(rightX, trY)
    ctx.lineTo(rightX, baseY)
    ctx.closePath()
    ctx.fill(); ctx.stroke()

    // Story height reference line (dashed)
    const shY = toCanvasY(storyHeight)
    ctx.strokeStyle = 'rgba(100,116,139,0.4)'
    ctx.lineWidth = 1
    ctx.setLineDash([4, 3])
    ctx.beginPath(); ctx.moveTo(PAD, shY); ctx.lineTo(W - PAD, shY); ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = 'rgba(100,116,139,0.5)'
    ctx.font = '9px sans-serif'
    ctx.fillText(`story ht ${storyHeight}m`, W - PAD + 3, shY + 3)

    // Drag handles
    for (const [cx2, cy2, label] of [[leftX, tlY, `${hl.toFixed(2)}m`], [rightX, trY, `${hr.toFixed(2)}m`]] as [number, number, string][]) {
      ctx.fillStyle = '#2563eb'
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 2
      ctx.beginPath(); ctx.arc(cx2, cy2, 7, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
      ctx.fillStyle = '#1e40af'
      ctx.font = 'bold 10px monospace'
      ctx.textAlign = 'center'
      ctx.fillText(label, cx2, cy2 - 11)
      ctx.textAlign = 'left'
    }

    // Wall length label at bottom
    ctx.fillStyle = '#64748b'
    ctx.font = '10px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(`${wallLen.toFixed(2)} m`, W / 2, baseY + 14)
    ctx.textAlign = 'left'

    // Trapezoidal area
    const area = ((hl + hr) / 2) * wallLen
    ctx.fillStyle = '#1d4ed8'
    ctx.font = 'bold 10px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(`Face area: ${area.toFixed(2)} m²`, W / 2, PAD - 10)
    ctx.textAlign = 'left'
  }, [hl, hr, storyHeight, wallLen, maxH, baseY, leftX, rightX])

  useEffect(() => { draw() }, [draw])

  function hitTest(cx: number, cy: number): 'left' | 'right' | null {
    const tlY = toCanvasY(hl)
    const trY = toCanvasY(hr)
    if (Math.sqrt((cx - leftX) ** 2 + (cy - tlY) ** 2) < 12) return 'left'
    if (Math.sqrt((cx - rightX) ** 2 + (cy - trY) ** 2) < 12) return 'right'
    return null
  }

  function getCanvasPos(e: React.MouseEvent<HTMLCanvasElement>) {
    const rect = canvasRef.current!.getBoundingClientRect()
    return {
      cx: (e.clientX - rect.left) * (W / rect.width),
      cy: (e.clientY - rect.top) * (H / rect.height),
    }
  }

  function onMouseDown(e: React.MouseEvent<HTMLCanvasElement>) {
    const { cx, cy } = getCanvasPos(e)
    dragging.current = hitTest(cx, cy)
  }

  function onMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!dragging.current) return
    const { cy } = getCanvasPos(e)
    const newH = fromCanvasY(cy)
    if (dragging.current === 'left') updateWall(storyId, wall.id, { heightLeft: newH })
    else updateWall(storyId, wall.id, { heightRight: newH })
  }

  function onMouseUp() { dragging.current = null }

  return (
    <div className="flex flex-col gap-1">
      <canvas
        ref={canvasRef}
        width={W}
        height={H}
        className="w-full rounded-lg border border-blue-200 cursor-ns-resize"
        style={{ maxHeight: 160 }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
      />
      <div className="flex gap-3 items-center text-xs">
        <label className="text-gray-500 shrink-0">Left&nbsp;ht</label>
        <input
          type="number" step={0.05} min={0.1} max={20}
          value={hl}
          onChange={e => updateWall(storyId, wall.id, { heightLeft: parseFloat(e.target.value) || storyHeight })}
          className="w-20 border border-gray-200 rounded px-2 py-0.5 text-gray-700 bg-white focus:outline-none focus:border-blue-400"
        />
        <span className="text-gray-400">m</span>
        <label className="text-gray-500 shrink-0 ml-2">Right&nbsp;ht</label>
        <input
          type="number" step={0.05} min={0.1} max={20}
          value={hr}
          onChange={e => updateWall(storyId, wall.id, { heightRight: parseFloat(e.target.value) || storyHeight })}
          className="w-20 border border-gray-200 rounded px-2 py-0.5 text-gray-700 bg-white focus:outline-none focus:border-blue-400"
        />
        <span className="text-gray-400">m</span>
        <button
          onClick={() => updateWall(storyId, wall.id, { heightLeft: storyHeight, heightRight: storyHeight })}
          className="ml-auto text-xs text-gray-400 hover:text-blue-600"
        >↺ Reset</button>
      </div>
    </div>
  )
}
