import { isDeepStrictEqual } from 'node:util'
import { randomUUID } from 'node:crypto'
import { defineMethod } from '../core'
import type { OrcaRuntimeService } from '../../orca-runtime'
import { agentHookServer } from '../../../agent-hooks/server'
import { clearMigrationUnsupportedPtysForPaneKey } from '../../../agent-hooks/migration-unsupported-pty-state'
import {
  AgentPaneRetireParams,
  AgentPaneRestoreParams
} from '../../../../shared/rpc-contract/agent-pane-authority-params'
import { makePaneKey } from '../../../../shared/stable-pane-id'
import { parseExecutionHostId } from '../../../../shared/execution-host'
import { resolveLiveTerminalDetailsTarget } from './terminal-host-details'
import type { z } from 'zod'

type TargetRequest = z.output<typeof AgentPaneRestoreParams>
async function resolveTarget(
  runtime: OrcaRuntimeService,
  params: Omit<TargetRequest, 'retirementId'>
) {
  const target = await resolveLiveTerminalDetailsTarget(
    runtime,
    params.terminal,
    params.expectedIncarnationId
  )
  const current = await resolveLiveTerminalDetailsTarget(
    runtime,
    params.terminal,
    params.expectedIncarnationId
  )
  if (!isDeepStrictEqual(current, target)) {
    throw new Error('agent_status_pane_owner_changed')
  }
  const host = parseExecutionHostId(target.executionHostId)
  if (
    !host ||
    host.kind === 'runtime' ||
    target.executionHostId !== params.expectedExecutionHostId ||
    makePaneKey(target.tabId, target.leafId) !== params.paneKey
  ) {
    throw new Error('agent_status_pane_owner_changed')
  }
  return { ...target, connectionId: host.kind === 'ssh' ? host.targetId : null }
}
export const AGENT_PANE_AUTHORITY_METHODS = [
  defineMethod({
    name: 'agentStatus.retirePaneAuthority',
    params: AgentPaneRetireParams,
    handler: async (params, { runtime }) => {
      const target = await resolveTarget(runtime, params)
      const row = agentHookServer
        .getStatusSnapshot()
        .find((entry) => entry.paneKey === params.paneKey)
      if (
        !row ||
        row.structuredHost ||
        row.providerSessionOnly ||
        row.worktreeId !== target.worktreeId ||
        row.connectionId !== target.connectionId ||
        row.receivedAt !== params.receivedAt ||
        row.stateStartedAt !== params.stateStartedAt ||
        row.observation?.authorityId !== params.expectedObservation.authorityId ||
        row.observation.incarnation !== params.expectedObservation.incarnation ||
        row.observation.revision !== params.expectedObservation.revision
      ) {
        throw new Error('agent_status_changed')
      }
      const retirementId = randomUUID()
      agentHookServer.retirePaneAuthority(params.paneKey, retirementId)
      clearMigrationUnsupportedPtysForPaneKey(params.paneKey)
      return { retired: true, retirementId }
    }
  }),
  defineMethod({
    name: 'agentStatus.restorePaneAuthority',
    params: AgentPaneRestoreParams,
    handler: async (params, { runtime }) => {
      await resolveTarget(runtime, params)
      if (
        !agentHookServer.restorePaneAuthorityIfRetirementMatches(
          params.paneKey,
          params.retirementId
        )
      ) {
        throw new Error('agent_status_retirement_changed_or_closed')
      }
      return { restored: true }
    }
  })
]
