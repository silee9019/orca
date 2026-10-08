import { defineMethod } from '../core'
import type { OrcaRuntimeService } from '../../orca-runtime'
import { TerminalHostDetailsParams } from '../../../../shared/rpc-contract/terminal-host-details-params'

async function resolveLiveTerminalDetailsTarget(
  runtime: OrcaRuntimeService,
  handle: string,
  expectedIncarnationId?: string
) {
  const target = await runtime.showTerminal(handle)
  if (
    !target.ptyId ||
    runtime.getPtyLivenessVerdict(target.ptyId)?.status === 'exited' ||
    (expectedIncarnationId !== undefined && target.incarnationId !== expectedIncarnationId)
  ) {
    throw new Error('terminal_gone')
  }
  return { ptyId: target.ptyId, incarnationId: target.incarnationId }
}

export const TERMINAL_HOST_DETAILS_METHODS = [
  defineMethod({
    name: 'terminal.confirmForegroundProcess',
    params: TerminalHostDetailsParams,
    handler: async (params, { runtime }) => {
      const target = await resolveLiveTerminalDetailsTarget(
        runtime,
        params.terminal,
        params.expectedIncarnationId
      )
      const foregroundProcess = await runtime.getConfirmedTerminalForegroundProcess(target.ptyId)
      const current = await resolveLiveTerminalDetailsTarget(
        runtime,
        params.terminal,
        params.expectedIncarnationId
      )
      if (current.ptyId !== target.ptyId || current.incarnationId !== target.incarnationId) {
        throw new Error('terminal_gone')
      }
      return { foregroundProcess }
    }
  }),
  defineMethod({
    name: 'terminal.presence',
    params: TerminalHostDetailsParams,
    handler: async (params, { runtime }) => {
      const target = await runtime.showTerminal(params.terminal)
      if (
        !target.ptyId ||
        (params.expectedIncarnationId !== undefined &&
          params.expectedIncarnationId !== target.incarnationId)
      ) {
        throw new Error('terminal_gone')
      }
      return {
        presence:
          runtime.getPtyLivenessVerdict(target.ptyId)?.status === 'exited'
            ? false
            : runtime.getTerminalPresence(target.ptyId)
      }
    }
  }),
  defineMethod({
    name: 'terminal.size',
    params: TerminalHostDetailsParams,
    handler: async (params, { runtime }) => {
      const target = await resolveLiveTerminalDetailsTarget(
        runtime,
        params.terminal,
        params.expectedIncarnationId
      )
      const size = await runtime.getAppliedTerminalSize(target.ptyId)
      const current = await resolveLiveTerminalDetailsTarget(
        runtime,
        params.terminal,
        params.expectedIncarnationId
      )
      if (current.ptyId !== target.ptyId || current.incarnationId !== target.incarnationId) {
        throw new Error('terminal_gone')
      }
      return { size }
    }
  }),
  defineMethod({
    name: 'terminal.cwd',
    params: TerminalHostDetailsParams,
    handler: async (params, { runtime }) => {
      const target = await resolveLiveTerminalDetailsTarget(
        runtime,
        params.terminal,
        params.expectedIncarnationId
      )
      const cwd = await runtime.getTerminalCwd(target.ptyId)
      const current = await resolveLiveTerminalDetailsTarget(
        runtime,
        params.terminal,
        params.expectedIncarnationId
      )
      if (current.ptyId !== target.ptyId || current.incarnationId !== target.incarnationId) {
        throw new Error('terminal_gone')
      }
      return { cwd }
    }
  })
]
