import type { OdeSystem, StateVector } from './types'

/**
 * Arrakis spice-ecology toy model (dimensionless units).
 * State: [spice, moisture, sandworm_pressure, harvester_load]
 */
export const ARRAKIS_LABELS = [
  'SPICE',
  'MOISTURE',
  'WORM.P',
  'HARVEST',
] as const

export interface ArrakisParams {
  spiceGrowth: number
  carryingCapacity: number
  evaporation: number
  moistureInflow: number
  wormSensitivity: number
  harvestCoupling: number
  targetHarvest: number
}

export const DEFAULT_ARRAKIS_PARAMS: ArrakisParams = {
  spiceGrowth: 0.42,
  carryingCapacity: 1.0,
  evaporation: 0.28,
  moistureInflow: 0.35,
  wormSensitivity: 1.1,
  harvestCoupling: 0.55,
  targetHarvest: 0.4,
}

export function createArrakisSystem(params: ArrakisParams = DEFAULT_ARRAKIS_PARAMS): OdeSystem {
  return {
    dimension: 4,
    derivatives(state: StateVector, _time: number): StateVector {
      const [spice, moisture, worm, harvest] = state
      const logistic = 1 - spice / params.carryingCapacity
      const wormDrive = Math.max(0, spice - 0.35)

      const dSpice =
        params.spiceGrowth * moisture * spice * logistic -
        params.harvestCoupling * harvest * spice -
        0.15 * worm * spice

      const dMoisture =
        params.moistureInflow -
        params.evaporation * moisture -
        0.2 * spice * moisture

      const dWorm =
        params.wormSensitivity * wormDrive * (1 - worm) -
        0.12 * worm

      const dHarvest = 0.8 * (params.targetHarvest - harvest)

      return [dSpice, dMoisture, dWorm, dHarvest]
    },
  }
}

export const INITIAL_ARRAKIS_STATE: StateVector = [0.55, 0.48, 0.12, 0.38]
