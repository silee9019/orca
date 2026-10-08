import { defineMethod } from '../core'
import type { OrcaRuntimeService } from '../../orca-runtime'
import { resolveLiveTerminalDetailsTarget } from './terminal-host-details'
import {
  CodexPaneSharedServerMutationParams,
  CodexPaneSharedServerStatusParams
} from '../../../../shared/rpc-contract/codex-pane-shared-server-params'

async function resolvePane(
  runtime: OrcaRuntimeService,
  params: { terminal: string; expectedIncarnationId?: string }
) {
  const target = await resolveLiveTerminalDetailsTarget(
    runtime,
    params.terminal,
    params.expectedIncarnationId
  )
  const commands = runtime.getCodexPaneSharedServerCommands()
  if (!commands) {
    throw new Error('codex_shared_server_unavailable')
  }
  return { ...target, commands }
}

async function assertCurrentPane(
  runtime: OrcaRuntimeService,
  params: { terminal: string; expectedIncarnationId?: string },
  target: { ptyId: string; incarnationId: string | null | undefined }
) {
  const current = await resolveLiveTerminalDetailsTarget(
    runtime,
    params.terminal,
    params.expectedIncarnationId
  )
  if (current.ptyId !== target.ptyId || current.incarnationId !== target.incarnationId) {
    throw new Error('terminal_gone')
  }
}

export const CODEX_PANE_SHARED_SERVER_METHODS = [
  defineMethod({
    name: 'terminal.codexSharedServerStatus',
    params: CodexPaneSharedServerStatusParams,
    handler: async (params, { runtime }) => {
      const target = await resolvePane(runtime, params)
      const status = await target.commands.readStatus(target.ptyId)
      await assertCurrentPane(runtime, params, target)
      return { status }
    }
  }),
  defineMethod({
    name: 'terminal.disableCodexSharedServerAutoStart',
    params: CodexPaneSharedServerMutationParams,
    handler: async (params, { runtime }) => {
      const target = await resolvePane(runtime, params)
      const applied = await target.commands.disableAutoStart(target.ptyId)
      await assertCurrentPane(runtime, params, target)
      if (!applied) {
        throw new Error('codex_shared_server_change_unconfirmed')
      }
      return { applied }
    }
  }),
  defineMethod({
    name: 'terminal.stopCodexSharedServer',
    params: CodexPaneSharedServerMutationParams,
    handler: async (params, { runtime }) => {
      const target = await resolvePane(runtime, params)
      const stopped = await target.commands.stop(target.ptyId)
      await assertCurrentPane(runtime, params, target)
      if (!stopped) {
        throw new Error('codex_shared_server_stop_unconfirmed')
      }
      return { stopped }
    }
  })
]
