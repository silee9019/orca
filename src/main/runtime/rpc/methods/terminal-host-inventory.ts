import { defineMethod } from '../core'
import { TerminalHostInventoryParams } from '../../../../shared/rpc-contract/terminal-host-inventory-params'

export const TERMINAL_HOST_INVENTORY_METHODS = [
  defineMethod({
    name: 'terminal.fitOverrides',
    params: TerminalHostInventoryParams,
    handler: (_params, { runtime }) => ({
      overrides: Array.from(runtime.getAllTerminalFitOverrides(), ([ptyId, override]) => ({
        ptyId,
        ...override
      }))
    })
  }),
  defineMethod({
    name: 'terminal.drivers',
    params: TerminalHostInventoryParams,
    handler: (_params, { runtime }) => ({
      drivers: Array.from(runtime.getAllTerminalDrivers(), ([ptyId, driver]) => ({ ptyId, driver }))
    })
  })
]
