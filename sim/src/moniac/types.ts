export type Tank = {
  id: string
  volume: number
  capacity: number
}

export type PipeEndpoint = string | 'PUMP' | 'EXTERNAL' | 'DRAIN'

export type Pipe = {
  id: string
  from: PipeEndpoint
  to: PipeEndpoint
  flowRate: number
  modifier: (tanks: Record<string, Tank>, params: Params) => number
}

/** Ventiler + styring (glidere på skravleklassen.no). */
export type Params = {
  mpc: number
  taxRate: number
  interestSensitivity: number
  importPropensity: number
  autonomousGov: number
  /** s — sparerate til sietch / Credit */
  saveRate: number
  /** P — harvester / rente (styrer eksport X og investering I) */
  pumpRate: number
}

export type MoniacFlows = {
  tax: number
  disposable: number
  consumption: number
  saving: number
  investment: number
  government: number
  import: number
  export: number
  leak: number
  inject: number
  equilGap: number
}

export type MoniacStepResult = {
  nextTanks: Record<string, Tank>
  flows: MoniacFlows
  normalized: boolean
}

export type MoniacSnapshot = {
  tanks: Record<string, Tank>
  flows: MoniacFlows
  time: number
  tick: number
  fps: number
  multiplier: number
  status: string
}
