import { defineMethod } from '../core'
import { TerminalPrivateSpawnParams } from '../../../../shared/rpc-contract/terminal-private-spawn-params'
export const TERMINAL_PRIVATE_SPAWN_METHODS = [
  defineMethod({
    name: 'terminal.spawnPrivate',
    params: TerminalPrivateSpawnParams,
    handler: async (params, { runtime, pairedDeviceId, clientId, signal }) => {
      const matches = () => !signal?.aborted && runtime.getRuntimeId() === params.expectedRuntimeId
      if (!matches()) {
        throw new Error('terminal_spawn_runtime_changed_or_cancelled')
      }
      const {
        expectedRuntimeId,
        expectedExecutionHostId,
        clientMutationId,
        worktreeId,
        cols,
        rows,
        confirm: _confirm,
        shell,
        ...options
      } = params
      const terminal = await runtime.dedupeTerminalCreate(
        pairedDeviceId ?? clientId ?? 'local',
        `id:${worktreeId}`,
        clientMutationId,
        false,
        (selector, preAllocatedHandle) =>
          runtime.createTerminal(selector, {
            ...options,
            ...(shell ? { shellOverride: shell } : {}),
            initialSize: { cols, rows },
            launchScopePin: { worktreeId, executionHostId: expectedExecutionHostId },
            presentation: 'background',
            surfaceOwner: false,
            ...(preAllocatedHandle ? { preAllocatedHandle } : {}),
            ...(signal ? { signal } : {}),
            onPtySpawnDispatched: () => {
              if (!matches()) {
                throw new Error('terminal_spawn_runtime_changed_or_cancelled')
              }
            }
          })
      )
      if (
        !matches() ||
        terminal.worktreeId !== worktreeId ||
        terminal.executionHostId !== expectedExecutionHostId ||
        terminal.surface !== 'background' ||
        !terminal.ptyId
      ) {
        throw new Error('terminal_spawn_result_scope_unconfirmed')
      }
      return {
        expectedRuntimeId,
        clientMutationId,
        terminal: {
          handle: terminal.handle,
          ptyId: terminal.ptyId,
          worktreeId,
          executionHostId: expectedExecutionHostId,
          surface: 'background',
          isReattach: terminal.isReattach === true
        },
        requested: { cols, rows },
        rendererApplied: false,
        providerGeometryVerified: false
      }
    }
  })
]
