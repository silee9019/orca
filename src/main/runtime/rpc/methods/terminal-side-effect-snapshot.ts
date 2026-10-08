import { defineMethod } from '../core'
import { TerminalSideEffectSnapshotParams } from '../../../../shared/rpc-contract/terminal-side-effect-snapshot-params'

export const TERMINAL_SIDE_EFFECT_SNAPSHOT_METHODS = [
  defineMethod({
    name: 'terminal.sideEffectSnapshot',
    params: TerminalSideEffectSnapshotParams,
    handler: async (params, { runtime }) => {
      const target = await runtime.showTerminal(params.terminal)
      if (!target.ptyId || runtime.getPtyLivenessVerdict(target.ptyId)?.status === 'exited') {
        throw new Error('terminal_gone')
      }
      return { snapshot: runtime.getTerminalSideEffectSnapshot(target.ptyId) }
    }
  })
]
