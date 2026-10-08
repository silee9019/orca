import { AccountMountedActionError } from '../../../shared/account-mounted-viewer-command'
import type {
  ClaudeStatusSwitchGroup,
  CodexStatusSwitchGroup
} from '../components/status-bar/status-bar-runtime-targets'
import { useLayoutEffect } from 'react'
import type { AccountMountedViewerAction } from '../../../shared/account-mounted-viewer-command'
import { requireSingleMountedAccountControls } from './account-mounted-draft-controls'

type AccountSwitcherControls = {
  toggleAccounts: () => void
  selectRuntime: (key: string) => Promise<void>
}
const claude = new Set<AccountSwitcherControls>()
const codex = new Set<AccountSwitcherControls>()

export function useMountedAccountSwitcherControls(
  provider: 'claude' | 'codex',
  controls: AccountSwitcherControls
) {
  useLayoutEffect(() => {
    const entries = provider === 'claude' ? claude : codex
    entries.add(controls)
    return () => {
      entries.delete(controls)
    }
  }, [provider, controls])
}
export async function applyMountedAccountSwitcher(action: AccountMountedViewerAction) {
  if (action.type !== 'account-switcher-toggle' && action.type !== 'account-switcher-runtime') {
    throw new AccountMountedActionError('invalid_argument')
  }
  const controls = requireSingleMountedAccountControls(
    action.provider === 'claude' ? claude : codex
  )
  if (action.type === 'account-switcher-toggle') {
    controls.toggleAccounts()
  } else {
    await controls.selectRuntime(action.groupKey)
  }
  return { status: 'accepted' }
}

export function useMountedClaudeSwitcherControls(
  groups: ClaudeStatusSwitchGroup[],
  toggleAccounts: () => void,
  selectGroup: (group: ClaudeStatusSwitchGroup) => Promise<void>
) {
  useMountedAccountSwitcherControls('claude', {
    toggleAccounts,
    selectRuntime: async (key) => {
      const group = groups.find((entry) => entry.key === key)
      if (!group) {
        throw new AccountMountedActionError('unavailable')
      }
      await selectGroup(group)
    }
  })
}
export function useMountedCodexSwitcherControls(
  groups: CodexStatusSwitchGroup[],
  toggleAccounts: () => void,
  selectGroup: (group: CodexStatusSwitchGroup) => Promise<void>
) {
  useMountedAccountSwitcherControls('codex', {
    toggleAccounts,
    selectRuntime: async (key) => {
      const group = groups.find((entry) => entry.key === key)
      if (!group) {
        throw new AccountMountedActionError('unavailable')
      }
      await selectGroup(group)
    }
  })
}
