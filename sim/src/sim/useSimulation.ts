import { useEffect, useMemo, useState } from 'react'
import { SimulationEngine } from './SimulationEngine'
import type { OdeSystem, SimulationSnapshot, StateVector } from './types'

export function useSimulation(
  system: OdeSystem,
  initialState: StateVector,
  options?: { autoStart?: boolean },
): SimulationSnapshot & { engine: SimulationEngine } {
  const engine = useMemo(
    () => new SimulationEngine(system, initialState, { fixedDt: 1 / 60 }),
    [system, initialState],
  )

  const [snapshot, setSnapshot] = useState<SimulationSnapshot>(() =>
    engine.getSnapshot(),
  )

  useEffect(() => {
    const unsubscribe = engine.subscribe(setSnapshot)
    if (options?.autoStart !== false) {
      engine.start()
    }
    return () => {
      unsubscribe()
      engine.stop()
    }
  }, [engine, options?.autoStart])

  return { ...snapshot, engine }
}
