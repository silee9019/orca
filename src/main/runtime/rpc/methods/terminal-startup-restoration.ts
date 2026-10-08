import { defineMethod } from '../core'
import { TerminalStartupRestorationParams } from '../../../../shared/rpc-contract/terminal-startup-restoration-params'
import { prepareTerminalStartupRestoration } from '../../../startup/terminal-startup-restoration'

export const TERMINAL_STARTUP_RESTORATION_METHODS = [
  defineMethod({
    name: 'session.prepareTerminalStartupRestoration',
    params: TerminalStartupRestorationParams,
    handler: async (_params, { runtime }) => {
      await prepareTerminalStartupRestoration(runtime)
      return { preparationCompleted: true }
    }
  })
]
