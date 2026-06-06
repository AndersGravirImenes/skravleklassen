import { MoniacPanel } from './components/MoniacPanel'
import { CrtOverlay } from './components/CrtOverlay'

export default function App() {
  return (
    <div className="dune-screen min-h-dvh">
      <CrtOverlay />
      <main className="relative z-10 mx-auto max-w-5xl px-4 py-8 md:px-8 min-h-dvh">
        <header className="mb-8 border-industrial panel-chamfer bg-dune-panel px-6 py-5">
          <p className="text-xs tracking-[0.35em] text-mono-dim">
            IMPERIAL ECONOMIC MONITOR · SKRAVLEKLASSEN
          </p>
          <h1 className="mt-1 font-[family-name:var(--font-display)] text-5xl leading-none tracking-[0.12em] text-dune-amber md:text-6xl">
            MONIAC SIM
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-mono-green">
            Hydraulisk Phillips-modell med{' '}
            <span className="text-mono-accent">Tank</span> /{' '}
            <span className="text-mono-accent">Pipe</span>-ventiler,{' '}
            <span className="text-mono-accent">requestAnimationFrame</span> og
            fast <span className="text-mono-accent">60 Hz</span> integrasjon (
            <code className="text-mono-accent">volume += flow × dt</code>).
          </p>
        </header>

        <MoniacPanel />

        <footer className="mt-8 text-center text-[10px] tracking-[0.25em] text-mono-dim">
          OBSIDIAN INTERFACE · S+T+M = I+G+X · DUNE PROTOCOL
        </footer>
      </main>
    </div>
  )
}
