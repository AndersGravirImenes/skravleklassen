export const MACRO = {
  Y_MIN: 0.08,
  Y_MAX: 0.98,
  Y_POT: 0.88,
  FLOW_GAIN: 2.8,
  X_BASE: 0.06,
  X_RATE_SCALE: 0.22,
  I_BASE: 0.35,
  R_NEUTRAL: 0.045,
  I_FLOOR: 0.2,
} as const

export const TANK_IDS = ['Y', 'Y_d', 'Govt', 'Credit', 'Foreign'] as const
export type TankId = (typeof TANK_IDS)[number]
