import { useCallback, useState } from 'react'
import { TANK_IDS } from '../moniac/constants'
import type { Params } from '../moniac/types'
import { useMoniac } from '../moniac/useMoniac'
import { DEFAULT_PARAMS } from '../moniac/updateSimulation'
import { MoniacCircuit } from './MoniacCircuit'
import { ParameterValve } from './ParameterValve'

const VALVES: {
  key: keyof Params
  label: string
  min: number
  max: number
  step?: number
  formatDisplay?: (value: number) => string
}[] = [
  { key: 'autonomousGov', label: 'G — Offentlig', min: 0.05, max: 0.8 },
  {
    key: 'pumpRate',
    label: 'P — Harvester',
    min: 0,
    max: 0.09,
    step: 0.005,
    formatDisplay: (v) => `${(v * 100).toFixed(1)}%`,
  },
  { key: 'taxRate', label: 't — Skatt', min: 0.1, max: 0.55 },
  { key: 'mpc', label: 'c — MPC', min: 0.2, max: 0.85 },
  { key: 'saveRate', label: 's — Spar', min: 0, max: 0.4 },
  { key: 'importPropensity', label: 'm — Import', min: 0.05, max: 0.45 },
]

function isAlertStatus(status: string): boolean {
  return /TØRKE|TSUNAMI|TØMT|LEKKASJE|FYLLER|SINKER|STIGER|NORMALISERT/.test(status)
}

export function MoniacPanel() {
  const [params, setParamsState] = useState<Params>(DEFAULT_PARAMS)
  const { tanks, flows, time, tick, fps, multiplier, status, setParams, reset } =
    useMoniac(params)

  const applyParams = useCallback(
    (next: Params) => {
      setParamsState(next)
      setParams(next)
    },
    [setParams],
  )

  return (
    <article className="space-y-6">
      <section className="border-industrial panel-chamfer bg-dune-panel p-4">
        <header className="mb-3 flex flex-wrap items-baseline justify-between gap-2 border-b-2 border-dune-amber pb-2">
          <h2 className="font-[family-name:var(--font-display)] text-2xl tracking-[0.2em] text-dune-amber">
            MONIAC MK.II
          </h2>
          <span className="text-xs text-mono-dim">
            T={time.toFixed(2)}s · #{tick} · {fps.toFixed(0)} FPS · ×
            {multiplier.toFixed(2)}
          </span>
        </header>
        <p
          className={`text-xs uppercase tracking-widest ${isAlertStatus(status) ? 'text-status-alert' : 'text-mono-accent'}`}
          role="status"
        >
          {status}
        </p>
      </section>

      <MoniacCircuit flows={flows} />

      <section className="grid gap-6 lg:grid-cols-2">
        <section className="border-industrial panel-chamfer bg-dune-panel p-4">
          <h3 className="mb-3 text-sm tracking-[0.2em] text-dune-sand">TANKER</h3>
          <ul className="space-y-2 font-mono text-sm">
            {TANK_IDS.map((id) => {
              const tank = tanks[id]
              if (!tank) return null
              const pct = Math.round((tank.volume / tank.capacity) * 100)
              return (
                <li
                  key={id}
                  className="grid grid-cols-[4rem_1fr_3.5rem] items-center gap-2"
                >
                  <span className="text-mono-dim">{id}</span>
                  <meter
                    className="h-3 w-full border border-dune-amber/60 bg-dune-bg accent-dune-amber"
                    min={0}
                    max={100}
                    value={pct}
                  />
                  <span className="text-right text-mono-accent tabular-nums">
                    {tank.volume.toFixed(3)}
                  </span>
                </li>
              )
            })}
          </ul>
        </section>

        <section className="border-industrial panel-chamfer bg-dune-panel p-4">
          <h3 className="mb-3 text-sm tracking-[0.2em] text-dune-sand">STRØMMER</h3>
          <ul className="space-y-1 font-mono text-xs">
            {(
              [
                ['tax', 'T skatt'],
                ['disposable', 'Y→Y_d'],
                ['consumption', 'C forbruk'],
                ['saving', 'S sparing'],
                ['investment', 'I invest'],
                ['government', 'G ut'],
                ['import', 'M import'],
                ['export', 'X eksport'],
              ] as const
            ).map(([key, label]) => (
              <li key={key} className="flex justify-between gap-4">
                <span className="text-mono-dim">{label}</span>
                <span className="text-mono-accent tabular-nums">
                  {flows[key].toFixed(4)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </section>

      <section className="border-industrial panel-chamfer bg-dune-panel p-4">
        <h3 className="mb-4 text-sm tracking-[0.2em] text-dune-sand">VENTILER</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          {VALVES.map(({ key, label, min, max, step, formatDisplay }) => (
            <ParameterValve
              key={key}
              label={label}
              value={params[key] as number}
              min={min}
              max={max}
              step={step}
              formatDisplay={formatDisplay}
              onChange={(value) => applyParams({ ...params, [key]: value })}
            />
          ))}
        </div>
        <button
          type="button"
          className="mt-4 border-2 border-dune-sand bg-dune-bg px-4 py-2 text-xs tracking-widest text-mono-accent hover:bg-dune-amber/20"
          onClick={() => {
            setParamsState(DEFAULT_PARAMS)
            reset(DEFAULT_PARAMS)
          }}
        >
          › NULLSTILL MODELL
        </button>
      </section>
    </article>
  )
}
