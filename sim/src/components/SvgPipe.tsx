export interface SvgPipeProps {
  /** SVG path `d` attribute */
  d: string
  flowRate: number
  stroke?: string
  className?: string
  label?: string
}

const MIN_DURATION = 0.35
const MAX_DURATION = 10

function flowDuration(flowRate: number): number {
  if (flowRate <= 0) return 0
  return Math.min(MAX_DURATION, Math.max(MIN_DURATION, 50 / flowRate))
}

function flowStrokeWidth(flowRate: number): number {
  return Math.min(6, Math.max(1, Math.log(flowRate + 1) * 2))
}

export function SvgPipe({
  d,
  flowRate,
  stroke = '#DE9B43',
  className = '',
  label,
}: SvgPipeProps) {
  const duration = flowDuration(flowRate)
  const active = flowRate > 0.001

  return (
    <g className={className} aria-label={label}>
      <path
        d={d}
        fill="none"
        stroke={active ? stroke : '#6e6558'}
        strokeWidth={flowStrokeWidth(flowRate)}
        strokeOpacity={active ? 1 : 0.35}
        strokeLinecap="square"
        strokeDasharray="4 8"
        style={
          active
            ? {
                animation: `moniac-dash ${duration}s linear infinite`,
              }
            : undefined
        }
      />
    </g>
  )
}
