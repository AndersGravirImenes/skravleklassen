export interface ParameterValveProps {
  label: string
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number
  formatDisplay?: (value: number) => string
}

const defaultFormat = (value: number) => `${(value * 100).toFixed(0)}%`

export function ParameterValve({
  label,
  value,
  onChange,
  min = 0,
  max = 1,
  step = 0.01,
  formatDisplay = defaultFormat,
}: ParameterValveProps) {
  return (
    <article className="border border-dune-sand/30 bg-dune-panel p-4 font-mono uppercase tracking-wider">
      <header className="mb-2 flex justify-between text-xs text-dune-sand">
        <span>{label}</span>
        <span className="text-dune-amber">{formatDisplay(value)}</span>
      </header>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="h-1 w-full cursor-pointer appearance-none border border-dune-sand/20 bg-dune-bg accent-dune-amber"
        aria-label={label}
      />
      <footer className="mt-1 flex justify-between text-[9px] text-dune-sand/40">
        <span>MIN</span>
        <span>MAX</span>
      </footer>
    </article>
  )
}
