import { useEffect, useMemo, useState } from 'react'
import { MoniacEngine } from './MoniacEngine'
import { DEFAULT_PARAMS } from './updateSimulation'
import type { MoniacSnapshot, Params } from './types'

export function useMoniac(initialParams: Params = DEFAULT_PARAMS) {
  const engine = useMemo(
    () => new MoniacEngine(initialParams),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- engine singleton per mount
    [],
  )

  const [snapshot, setSnapshot] = useState<MoniacSnapshot>(() =>
    engine.getSnapshot(),
  )

  useEffect(() => {
    const unsub = engine.subscribe(setSnapshot)
    engine.start()
    return () => {
      unsub()
      engine.stop()
    }
  }, [engine])

  return {
    ...snapshot,
    setParams: (p: Params) => engine.setParams(p),
    reset: (p?: Params) => engine.reset(p),
  }
}
