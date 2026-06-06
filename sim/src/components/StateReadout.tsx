import type { StateVector } from '../sim/types'

interface StateReadoutProps {
  labels: readonly string[]
  state: Readonly<StateVector>
  time: number
  tick: number
  fps: number
}

export function StateReadout({ labels, state, time, tick, fps }: StateReadoutProps) {
  return (
    <section className="border-industrial panel-chamfer bg-dune-panel p-4">
      <header className="mb-3 flex items-baseline justify-between border-b-2 border-dune-amber pb-2">
        <h2 className="font-[family-name:var(--font-display)] text-2xl tracking-[0.2em] text-dune-amber">
          STATE.VECTOR
        </h2>
        <span className="text-xs text-mono-dim">
          T={time.toFixed(2)}s · #{tick}
        </span>
      </header>
      <ul className="space-y-2 font-mono text-sm">
        {labels.map((label, i) => (
          <li key={label} className="grid grid-cols-[7rem_1fr_4rem] items-center gap-2">
            <span className="text-mono-dim">{label}</span>
            <Meter value={clamp01(state[i])} />
            <span className="text-right text-mono-accent tabular-nums">
              {state[i].toFixed(4)}
            </span>
          </li>
        ))}
      </ul>
      <footer className="mt-3 border-t border-dune-amber/40 pt-2 text-xs text-mono-green">
        LOOP: <span className="text-mono-accent">{fps.toFixed(1)}</span> FPS ·
        PHYS: <span className="text-mono-accent">60</span> Hz RK4
      </footer>
    </section>
  )
}

function Meter({ value }: { value: number }) {
  const pct = Math.round(value * 100)
  return (
    <div
      className="relative h-3 border border-dune-amber/60 bg-dune-bg"
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full bg-gradient-to-r from-dune-amber to-dune-sand transition-[width] duration-75"
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n))
}
