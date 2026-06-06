import type { MoniacFlows } from '../moniac/types'
import { SvgPipe } from './SvgPipe'

/** Tank-noder i viewBox 0 0 400 280 */
const NODES = {
  Y: { x: 200, y: 130, label: 'Y' },
  Y_d: { x: 72, y: 130, label: 'Y_d' },
  Govt: { x: 200, y: 44, label: 'Govt' },
  Credit: { x: 328, y: 130, label: 'Credit' },
  Foreign: { x: 200, y: 228, label: 'Foreign' },
  PUMP: { x: 48, y: 44, label: 'P' },
} as const

type FlowKey = keyof Pick<
  MoniacFlows,
  | 'tax'
  | 'disposable'
  | 'consumption'
  | 'saving'
  | 'investment'
  | 'government'
  | 'import'
  | 'export'
>

const PIPES: { id: FlowKey; d: string; label: string; stroke?: string }[] = [
  {
    id: 'export',
    d: 'M 48 44 L 120 44 L 120 130 L 200 130',
    label: 'X eksport',
    stroke: '#CBB293',
  },
  { id: 'tax', d: 'M 200 130 L 200 72', label: 'T skatt' },
  { id: 'disposable', d: 'M 168 130 L 104 130', label: 'Disponibel' },
  { id: 'consumption', d: 'M 104 130 L 168 130', label: 'C forbruk', stroke: '#9aab6e' },
  { id: 'saving', d: 'M 88 130 L 88 168 L 296 168 L 296 130', label: 'S sparing' },
  { id: 'investment', d: 'M 304 130 L 232 130', label: 'I invest' },
  { id: 'government', d: 'M 200 56 L 200 118', label: 'G ut' },
  { id: 'import', d: 'M 200 142 L 200 212', label: 'M import', stroke: '#8A251A' },
]

interface MoniacCircuitProps {
  flows: MoniacFlows
}

export function MoniacCircuit({ flows }: MoniacCircuitProps) {
  return (
    <section className="border-industrial panel-chamfer bg-dune-panel p-4">
      <h3 className="mb-3 text-sm tracking-[0.2em] text-dune-sand">
        SIRKULASJON
      </h3>
      <div className="relative aspect-[400/280] w-full max-h-72 border border-dune-sand/20 bg-dune-bg">
        <svg
          viewBox="0 0 400 280"
          className="absolute inset-0 h-full w-full pointer-events-none"
          role="img"
          aria-label="MONIAC hydraulisk krets"
        >
          {PIPES.map(({ id, d, label, stroke }) => (
            <SvgPipe
              key={id}
              d={d}
              flowRate={flows[id]}
              stroke={stroke}
              label={label}
            />
          ))}
          {Object.values(NODES).map(({ x, y, label }) => (
            <g key={label}>
              <rect
                x={x - 28}
                y={y - 18}
                width={56}
                height={36}
                fill="#161513"
                stroke="#DE9B43"
                strokeWidth={2}
              />
              <text
                x={x}
                y={y + 5}
                textAnchor="middle"
                fill="#CBB293"
                fontSize={12}
                fontFamily="IBM Plex Mono, monospace"
              >
                {label}
              </text>
            </g>
          ))}
        </svg>
      </div>
    </section>
  )
}
