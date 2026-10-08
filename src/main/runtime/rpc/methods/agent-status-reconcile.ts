import { defineMethod } from '../core'
import { AgentStatusReconcileParams } from '../../../../shared/rpc-contract/agent-status-reconcile-params'
import { agentHookServer } from '../../../agent-hooks/server'
import { clearMigrationUnsupportedPtysForPaneKey } from '../../../agent-hooks/migration-unsupported-pty-state'
import { makePaneKey } from '../../../../shared/stable-pane-id'
import { isShellProcess } from '../../../../shared/shell-process-detection'
import { resolveLiveTerminalDetailsTarget } from './terminal-host-details'

export const AGENT_STATUS_RECONCILE_METHODS = [
  defineMethod({
    name: 'agentStatus.reconcileEndedProcess',
    params: AgentStatusReconcileParams,
    handler: async (params, { runtime }) => {
      const target = await resolveLiveTerminalDetailsTarget(
        runtime,
        params.terminal,
        params.expectedIncarnationId
      )
      if (makePaneKey(target.tabId, target.leafId) !== params.paneKey) {
        throw new Error('agent_status_pane_mismatch')
      }
      const assertObservedRow = () => {
        const row = agentHookServer
          .getStatusSnapshot()
          .find((entry) => entry.paneKey === params.paneKey)
        if (
          !row ||
          row.providerSessionOnly ||
          row.structuredHost ||
          row.worktreeId !== target.worktreeId ||
          row.receivedAt !== params.receivedAt ||
          row.stateStartedAt !== params.stateStartedAt ||
          row.observation?.authorityId !== params.expectedObservation.authorityId ||
          row.observation.incarnation !== params.expectedObservation.incarnation ||
          row.observation.revision !== params.expectedObservation.revision
        ) {
          throw new Error('agent_status_changed')
        }
      }
      assertObservedRow()
      const foregroundProcess = await runtime.getConfirmedTerminalForegroundProcess(target.ptyId)
      const current = await resolveLiveTerminalDetailsTarget(
        runtime,
        params.terminal,
        params.expectedIncarnationId
      )
      if (
        current.ptyId !== target.ptyId ||
        current.incarnationId !== target.incarnationId ||
        current.tabId !== target.tabId ||
        current.leafId !== target.leafId ||
        current.worktreeId !== target.worktreeId
      ) {
        throw new Error('terminal_gone')
      }
      assertObservedRow()
      if (!foregroundProcess?.trim() || !isShellProcess(foregroundProcess)) {
        throw new Error('agent_status_shell_unconfirmed')
      }
      const cleared = agentHookServer.reconcileEndedProcessForPaneKeys([params.paneKey], {
        preserveResumeIdentity: true
      })
      if (cleared !== 1) {
        throw new Error('agent_status_no_live_claims')
      }
      clearMigrationUnsupportedPtysForPaneKey(params.paneKey)
      return { reconciled: true }
    }
  })
]
