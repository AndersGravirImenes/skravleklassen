import { useEffect, useState } from 'react'
import type { StateVector } from '../sim/types'

const MAX_POINTS = 240

export function useStateHistory(
  state: Readonly<StateVector>,
  tick: number,
): StateVector[] {
  const [history, setHistory] = useState<StateVector[]>([])

  useEffect(() => {
    setHistory((prev) => {
      const next = [...prev, [...state]]
      if (next.length > MAX_POINTS) next.shift()
      return next
    })
  }, [tick, state[0], state[1], state[2], state[3]])

  return history
}
