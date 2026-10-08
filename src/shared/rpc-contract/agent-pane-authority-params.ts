import { z } from 'zod'
import { parseExecutionHostId } from '../execution-host'
import { AgentStatusReconcileParams } from './agent-status-reconcile-params'
import { AgentStatusDismissParams } from './agent-status-cli-params'

const host = z.string().refine((value) => {
  const parsed = parseExecutionHostId(value)
  return Boolean(parsed && parsed.kind !== 'runtime')
}, 'Expected a local or SSH execution host')
export const AgentPaneRetireParams = AgentStatusReconcileParams.extend({
  expectedExecutionHostId: host
}).strict()
export const AgentPaneRestoreParams = AgentPaneRetireParams.pick({
  terminal: true,
  paneKey: true,
  expectedIncarnationId: true,
  expectedExecutionHostId: true,
  confirm: true
})
  .extend({ retirementId: z.string().uuid() })
  .strict()
export const AgentPaneTransferParams = AgentPaneRetireParams.omit({ paneKey: true })
  .extend({
    fromPaneKey: AgentStatusDismissParams.shape.paneKey,
    toPaneKey: AgentStatusDismissParams.shape.paneKey
  })
  .strict()
  .refine((value) => value.fromPaneKey !== value.toPaneKey, 'Source and destination must differ')
