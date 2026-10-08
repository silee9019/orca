import { defineMethod } from '../core'
import { AgentPermissionModeParams } from '../../../../shared/rpc-contract/agent-permission-mode-params'
import { manageAgentPermissionMode } from '../../agent-permission-mode-access'

export const AGENT_PERMISSION_MODE_METHODS = [
  defineMethod({
    name: 'agentPermissionMode.control',
    params: AgentPermissionModeParams,
    handler: (params, { clientKind }) => {
      if (clientKind !== undefined) {
        throw new Error('Agent permission preferences are only available on the Orca host runtime.')
      }
      return manageAgentPermissionMode(params)
    }
  })
]
