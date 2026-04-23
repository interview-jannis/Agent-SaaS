'use client'

import { useEffect, useRef, useState } from 'react'

type Props = {
  onChange: (dataUrl: string | null) => void
  height?: number
}

export default function SignaturePad({ onChange, height = 160 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawingRef = useRef(false)
  const lastRef = useRef<{ x: number; y: number } | null>(null)
  const [empty, setEmpty] = useState(true)

  // Set up canvas at device pixel ratio for crisp strokes.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ratio = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * ratio
    canvas.height = rect.height * ratio
    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.scale(ratio, ratio)
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.lineWidth = 2
      ctx.strokeStyle = '#0f172a'
    }
  }, [])

  function coords(e: React.MouseEvent | React.TouchEvent): { x: number; y: number } | null {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    if ('touches' in e) {
      const t = e.touches[0] ?? e.changedTouches[0]
      return { x: t.clientX - rect.left, y: t.clientY - rect.top }
    }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  function start(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault()
    drawingRef.current = true
    lastRef.current = coords(e)
  }

  function move(e: React.MouseEvent | React.TouchEvent) {
    if (!drawingRef.current) return
    e.preventDefault()
    const ctx = canvasRef.current?.getContext('2d')
    const p = coords(e)
    if (!ctx || !p || !lastRef.current) return
    ctx.beginPath()
    ctx.moveTo(lastRef.current.x, lastRef.current.y)
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
    lastRef.current = p
    if (empty) setEmpty(false)
  }

  function end() {
    if (!drawingRef.current) return
    drawingRef.current = false
    lastRef.current = null
    const url = canvasRef.current?.toDataURL('image/png') ?? null
    onChange(url)
  }

  function clear() {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height)
    setEmpty(true)
    onChange(null)
  }

  return (
    <div className="space-y-2">
      <div className="relative border border-gray-300 rounded-xl bg-white overflow-hidden">
        <canvas
          ref={canvasRef}
          style={{ width: '100%', height: `${height}px` }}
          onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
          onTouchStart={start} onTouchMove={move} onTouchEnd={end}
          className="touch-none cursor-crosshair"
        />
        {empty && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <p className="text-xs text-gray-300">Sign here</p>
          </div>
        )}
      </div>
      <div className="flex items-center justify-end">
        <button type="button" onClick={clear}
          className="text-xs text-gray-500 hover:text-gray-800 transition-colors">
          Clear signature
        </button>
      </div>
    </div>
  )
}
