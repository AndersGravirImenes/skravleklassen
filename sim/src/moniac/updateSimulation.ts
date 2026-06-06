import { MACRO } from './constants'
import { computeFlows } from './computeFlows'
import { normalizeVentilers } from './normalizeParams'
import type { MoniacFlows, MoniacStepResult, Params, Tank } from './types'

function clampTank(tank: Tank): Tank {
  return {
    ...tank,
    volume: Math.max(0, Math.min(tank.capacity, tank.volume)),
  }
}

function cloneTanks(tanks: Record<string, Tank>): Record<string, Tank> {
  return Object.fromEntries(
    Object.entries(tanks).map(([id, t]) => [id, { ...t }]),
  )
}

/**
 * Ett MONIAC-tidssteg.
 * Volum = volum + (inflow − outflow) × dt, deretter 0 ≤ volum ≤ kapasitet.
 */
export function updateSimulation(
  tanks: Record<string, Tank>,
  params: Params,
  dt: number,
): MoniacStepResult {
  const { p, normalized } = normalizeVentilers(params)

  // 1. Beregn nye flowRates basert på parameter-ventiler
  const flows = computeFlows(tanks, p)

  // 2. Oppdater tankvolumer
  const nextTanks = cloneTanks(tanks)

  nextTanks.Y_d.volume +=
    (flows.disposable - flows.consumption - flows.saving) * dt
  nextTanks.Credit.volume += (flows.saving - flows.investment) * dt
  nextTanks.Govt.volume += (flows.tax - flows.government) * dt
  nextTanks.Foreign.volume += (flows.import - flows.export) * dt
  nextTanks.Y.volume += (flows.inject - flows.leak) * dt

  // Fysiske begrensninger
  nextTanks.Y.volume = Math.max(
    MACRO.Y_MIN,
    Math.min(MACRO.Y_MAX, nextTanks.Y.volume),
  )
  for (const id of Object.keys(nextTanks)) {
    nextTanks[id] = clampTank(nextTanks[id])
  }

  return { nextTanks, flows, normalized }
}

export function createInitialTanks(params: Params): Record<string, Tank> {
  const { p } = normalizeVentilers(params)
  const Y = 0.52
  return {
    Y: { id: 'Y', volume: Y, capacity: 1 },
    Y_d: { id: 'Y_d', volume: Y * (1 - p.taxRate), capacity: 1 },
    Govt: { id: 'Govt', volume: p.taxRate * Y * 0.55, capacity: 0.5 },
    Credit: { id: 'Credit', volume: p.saveRate * Y * 0.5, capacity: 0.5 },
    Foreign: { id: 'Foreign', volume: 0.04, capacity: 0.25 },
  }
}

export const DEFAULT_PARAMS: Params = {
  mpc: 0.48,
  taxRate: 0.28,
  interestSensitivity: 1.4,
  importPropensity: 0.22,
  autonomousGov: 0.35,
  saveRate: 0.12,
  pumpRate: 0.045,
}

export function moniacStatus(
  tanks: Record<string, Tank>,
  flows: MoniacFlows,
  normalized: boolean,
): string {
  const Y = tanks.Y.volume
  const gap = (Y - MACRO.Y_POT) / MACRO.Y_POT
  if (Math.abs(flows.equilGap) < 0.015 && tanks.Govt.volume > 0.02) {
    return 'LIKEVEKT — S+T+M ≈ I+G+X'
  }
  if (gap > 0.06) return 'SPICE-TSUNAMI — ØKOLOGISK GRENS'
  if (Y < 0.2) return 'TØRKE — HARVESTER STANSET'
  if (tanks.Govt.volume < 0.02 && flows.equilGap > 0.02) {
    return 'STATSAPPARAT TØMT — G BREMSER'
  }
  if (tanks.Credit.volume < 0.02 && flows.equilGap > 0.02) {
    return 'SIETCH-TØMT — I BREMSER'
  }
  if (tanks.Foreign.volume > 0.12) return 'IMPORTLEKKASJE — UTLAND FYLLER'
  if (normalized) return 'VENTILER > 100% — NORMALISERT'
  if (flows.equilGap > 0.03) return 'LEKKASJE > INJEKSJON — Y SINKER'
  if (flows.equilGap < -0.03) return 'INJEKSJON > LEKKASJE — Y STIGER'
  return 'SIRKULASJON I BEVEGELSE'
}
