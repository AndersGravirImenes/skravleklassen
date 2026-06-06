import { computeFlows } from './computeFlows'
import type { Params, Pipe, Tank } from './types'

/** Rør-deklarasjoner — flowRate fylles fra computeFlows ved evaluering. */
export const MONIAC_PIPES: Pipe[] = [
  { id: 'tax', from: 'Y', to: 'Govt', flowRate: 0, modifier: mod('tax') },
  { id: 'disposable', from: 'Y', to: 'Y_d', flowRate: 0, modifier: mod('disposable') },
  { id: 'consumption', from: 'Y_d', to: 'DRAIN', flowRate: 0, modifier: mod('consumption') },
  { id: 'consumption-inject', from: 'EXTERNAL', to: 'Y', flowRate: 0, modifier: mod('consumption') },
  { id: 'saving', from: 'Y_d', to: 'Credit', flowRate: 0, modifier: mod('saving') },
  { id: 'investment', from: 'Credit', to: 'Y', flowRate: 0, modifier: mod('investment') },
  { id: 'government', from: 'Govt', to: 'Y', flowRate: 0, modifier: mod('government') },
  { id: 'import', from: 'Y', to: 'Foreign', flowRate: 0, modifier: mod('import') },
  { id: 'export', from: 'PUMP', to: 'Y', flowRate: 0, modifier: mod('export') },
  { id: 'export-drain', from: 'Foreign', to: 'DRAIN', flowRate: 0, modifier: mod('export') },
]

type FlowKey = keyof ReturnType<typeof computeFlows>

function mod(key: FlowKey) {
  return (tanks: Record<string, Tank>, params: Params) =>
    computeFlows(tanks, params)[key]
}

export function evaluatePipes(
  tanks: Record<string, Tank>,
  params: Params,
): { pipes: Pipe[]; byId: Record<string, number> } {
  const flows = computeFlows(tanks, params)
  const pipes = MONIAC_PIPES.map((pipe) => ({
    ...pipe,
    flowRate: flows[pipe.id as FlowKey] ?? flows[mapId(pipe.id)],
  }))
  const byId = Object.fromEntries(pipes.map((p) => [p.id, p.flowRate]))
  return { pipes, byId }
}

function mapId(id: string): FlowKey {
  if (id === 'consumption-inject') return 'consumption'
  if (id === 'export-drain') return 'export'
  return id as FlowKey
}
