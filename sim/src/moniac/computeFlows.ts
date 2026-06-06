import { MACRO } from './constants'
import { exportFromPump, investmentRate } from './normalizeParams'
import type { MoniacFlows, Params, Tank } from './types'

const g = MACRO.FLOW_GAIN

/**
 * 1. Beregn flowRates fra parameter-ventiler (Phillips / MONIAC).
 * Samsvarer med js/moniac.js stepTanks().
 */
export function computeFlows(
  tanks: Record<string, Tank>,
  params: Params,
): MoniacFlows {
  const Y = tanks.Y.volume
  const Yd = tanks.Y_d.volume

  const tax = Y * params.taxRate * g
  const disposable = (Y - Y * params.taxRate) * g
  const consumption = (params.autonomousGov + Yd * params.mpc) * g
  const saving = Y * params.saveRate * g
  const investment = investmentRate(params) * tanks.Credit.volume * g
  const government = params.autonomousGov * tanks.Govt.volume * g
  const importFlow = Y * params.importPropensity * g
  const exportFlow = exportFromPump(params.pumpRate) * g

  const leak = tax + consumption + saving + importFlow
  const inject = consumption + government + investment + exportFlow
  const leakSide = saving + tax + importFlow
  const injectSide = investment + government + exportFlow
  const equilGap = leakSide - injectSide

  return {
    tax,
    disposable,
    consumption,
    saving,
    investment,
    government,
    import: importFlow,
    export: exportFlow,
    leak,
    inject,
    equilGap,
  }
}
