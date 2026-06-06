import { useEffect, useRef } from 'react'
import type { StateVector } from '../sim/types'

interface PhasePlotProps {
  history: Readonly<StateVector>[]
  width?: number
  height?: number
}

const GRID = '#161513'
const TRACE = '#DE9B43'
const GLOW = '#CBB293'

export function PhasePlot({ history, width = 420, height = 220 }: PhasePlotProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || history.length < 2) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    canvas.width = width * dpr
    canvas.height = height * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    ctx.fillStyle = '#0C0C0B'
    ctx.fillRect(0, 0, width, height)

    drawGrid(ctx, width, height)

    const xs = history.map((h) => h[0])
    const ys = history.map((h) => h[1])
    const minX = Math.min(...xs, 0)
    const maxX = Math.max(...xs, 1)
    const minY = Math.min(...ys, 0)
    const maxY = Math.max(...ys, 1)
    const pad = 24

    const toX = (v: number) =>
      pad + ((v - minX) / (maxX - minX || 1)) * (width - pad * 2)
    const toY = (v: number) =>
      height - pad - ((v - minY) / (maxY - minY || 1)) * (height - pad * 2)

    ctx.strokeStyle = GLOW
    ctx.lineWidth = 1
    ctx.globalAlpha = 0.35
    ctx.beginPath()
    history.forEach((h, i) => {
      const x = toX(h[0])
      const y = toY(h[1])
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    })
    ctx.stroke()

    ctx.globalAlpha = 1
    ctx.strokeStyle = TRACE
    ctx.lineWidth = 2
    ctx.shadowColor = TRACE
    ctx.shadowBlur = 6
    ctx.beginPath()
    history.forEach((h, i) => {
      const x = toX(h[0])
      const y = toY(h[1])
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    })
    ctx.stroke()
    ctx.shadowBlur = 0

    const last = history[history.length - 1]
    ctx.fillStyle = '#DE9B43'
    ctx.beginPath()
    ctx.arc(toX(last[0]), toY(last[1]), 4, 0, Math.PI * 2)
    ctx.fill()

    ctx.fillStyle = '#CBB293'
    ctx.font = '10px monospace'
    ctx.fillText('SPICE × MOISTURE', pad, 14)
  }, [history, width, height])

  return (
    <section className="border-industrial panel-chamfer bg-dune-panel p-3">
      <h2 className="mb-2 font-[family-name:var(--font-display)] text-xl tracking-[0.15em] text-dune-amber">
        PHASE.PLANE
      </h2>
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="w-full border border-dune-amber/50 bg-dune-bg"
        aria-label="Spice versus moisture phase plot"
      />
    </section>
  )
}

function drawGrid(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
): void {
  ctx.strokeStyle = GRID
  ctx.lineWidth = 1
  for (let x = 0; x <= w; x += 40) {
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, h)
    ctx.stroke()
  }
  for (let y = 0; y <= h; y += 40) {
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(w, y)
    ctx.stroke()
  }
}
