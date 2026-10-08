import type { GlobalSettings } from '../../shared/global-settings-types'
import {
  applyAgentPermissionMode,
  resolveAgentPermissionModeSummary
} from '../../shared/tui-agent-permissions'
import type { AgentPermissionModeOperation } from '../../shared/rpc-contract/agent-permission-mode-params'

type AgentPermissionPreferences = Pick<GlobalSettings, 'agentDefaultArgs' | 'agentDefaultEnv'>
export type AgentPermissionModeAccess = {
  read: () => AgentPermissionPreferences
  write: (patch: AgentPermissionPreferences) => Promise<unknown>
}
let access: AgentPermissionModeAccess | null = null

export function setAgentPermissionModeAccess(next: AgentPermissionModeAccess | null): void {
  access = next
}

export async function manageAgentPermissionMode(operation: AgentPermissionModeOperation) {
  const canonical = access
  if (!canonical) {
    throw new Error(
      'Agent permission preferences require the canonical settings reader and writer on this host.'
    )
  }
  try {
    const current = canonical.read()
    if (operation.action === 'set') {
      await canonical.write(applyAgentPermissionMode({ ...current, mode: operation.mode }))
    }
    return { mode: resolveAgentPermissionModeSummary(canonical.read()) }
  } catch {
    throw new Error(
      'Could not read or apply agent permission preferences through the canonical settings service.'
    )
  }
}
