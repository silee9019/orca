import { isDeepStrictEqual } from 'node:util'
import { randomUUID } from 'node:crypto'
import { defineMethod } from '../core'
import type { OrcaRuntimeService } from '../../orca-runtime'
import { agentHookServer } from '../../../agent-hooks/server'
import { clearMigrationUnsupportedPtysForPaneKey } from '../../../agent-hooks/migration-unsupported-pty-state'
import {
  AgentPaneRetireParams,
  AgentPaneRestoreParams,
  AgentPaneTransferParams
} from '../../../../shared/rpc-contract/agent-pane-authority-params'
import { createAgentPaneAuthorityOwnership } from '../../../ipc/agent-pane-authority-ownership'
import { getPtyIdForPaneKey } from '../../../ipc/pty/pane/key-state'
import { makePaneKey } from '../../../../shared/stable-pane-id'
import { parseExecutionHostId } from '../../../../shared/execution-host'
import { resolveLiveTerminalDetailsTarget } from './terminal-host-details'
import type { z } from 'zod'

type TargetRequest = Pick<
  z.output<typeof AgentPaneRestoreParams>,
  'terminal' | 'expectedIncarnationId' | 'expectedExecutionHostId'
>
type ObservedRowRequest = Pick<
  z.output<typeof AgentPaneRetireParams>,
  'receivedAt' | 'stateStartedAt' | 'expectedObservation'
>
async function resolveTarget(
  runtime: OrcaRuntimeService,
  params: TargetRequest,
  boundPaneKey: string
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
    makePaneKey(target.tabId, target.leafId) !== boundPaneKey
  ) {
    throw new Error('agent_status_pane_owner_changed')
  }
  return { ...target, connectionId: host.kind === 'ssh' ? host.targetId : null }
}
function findObservedRow(
  paneKey: string,
  params: ObservedRowRequest,
  target: Awaited<ReturnType<typeof resolveTarget>>
) {
  const row = agentHookServer.getStatusSnapshot().find((entry) => entry.paneKey === paneKey)
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
}
export const AGENT_PANE_AUTHORITY_METHODS = [
  defineMethod({
    name: 'agentStatus.retirePaneAuthority',
    params: AgentPaneRetireParams,
    handler: async (params, { runtime }) => {
      const target = await resolveTarget(runtime, params, params.paneKey)
      findObservedRow(params.paneKey, params, target)
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
      await resolveTarget(runtime, params, params.paneKey)
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
  }),
  defineMethod({
    name: 'agentStatus.transferPaneAuthority',
    params: AgentPaneTransferParams,
    handler: async (params, { runtime }) => {
      const target = await resolveTarget(runtime, params, params.toPaneKey)
      findObservedRow(params.fromPaneKey, params, target)
      const snapshot = () => agentHookServer.getStatusSnapshot()
      if (snapshot().some((entry) => entry.paneKey === params.toPaneKey)) {
        throw new Error('agent_status_destination_occupied')
      }
      const ownsPty = createAgentPaneAuthorityOwnership({
        getPtyIdForPaneKey,
        getRuntimeTerminalHandleForPaneKey: (paneKey) =>
          runtime.getAgentStatusTerminalHandleForPaneKey(paneKey)
      })
      if (!agentHookServer.canTransferPaneAuthority(params.fromPaneKey, target.ptyId, ownsPty)) {
        throw new Error('agent_status_transfer_not_owned')
      }
      agentHookServer.transferPaneAuthority(params.fromPaneKey, params.toPaneKey, target.ptyId)
      const keys = snapshot().map((entry) => entry.paneKey)
      if (keys.includes(params.fromPaneKey) || !keys.includes(params.toPaneKey)) {
        throw new Error('agent_status_transfer_unconfirmed')
      }
      return { transferred: true, rendererApplied: false }
    }
  })
]
