import { MACRO } from './constants'
import type { Params } from './types'

export function normalizeVentilers(params: Params): {
  p: Params
  normalized: boolean
} {
  let { taxRate, mpc, saveRate, importPropensity } = params
  const sum = taxRate + mpc + saveRate + importPropensity
  const normalized = sum > 1.001
  if (normalized) {
    const k = 1 / sum
    taxRate *= k
    mpc *= k
    saveRate *= k
    importPropensity *= k
  }
  return {
    p: { ...params, taxRate, mpc, saveRate, importPropensity },
    normalized,
  }
}

export function exportFromPump(pumpRate: number): number {
  return MACRO.X_BASE + pumpRate * MACRO.X_RATE_SCALE
}

export function investmentRate(params: Params): number {
  const rateGap = Math.max(0, params.pumpRate - MACRO.R_NEUTRAL)
  return (
    MACRO.I_BASE *
    Math.max(MACRO.I_FLOOR, 1 - params.interestSensitivity * rateGap)
  )
}
