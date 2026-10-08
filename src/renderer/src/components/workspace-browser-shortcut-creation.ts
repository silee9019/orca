import { useAppStore } from '@/store'
import type { AppState } from '@/store/types'
import { getClientCreationActionPolicy } from '@/lib/client-creation-action-policy'
import { createWebRuntimeSessionBrowserTab } from '@/runtime/web-runtime-session'
import { getActiveWorktreeRuntimeEnvironmentId } from './terminal-workspace-model'
import { translate } from '@/i18n/i18n'

type WorkspaceBrowserShortcutCreation = Pick<
  AppState,
  'createBrowserTab' | 'openNewBrowserTabInActiveWorkspace'
> & { worktreeId: string }
export function createWorkspaceBrowserShortcut({
  worktreeId,
  createBrowserTab,
  openNewBrowserTabInActiveWorkspace
}: WorkspaceBrowserShortcutCreation): Promise<void | boolean> | void {
  const state = useAppStore.getState()
  const group =
    state.activeGroupIdByWorktree[worktreeId] ?? state.groupsByWorktree[worktreeId]?.[0]?.id
  if (group) {
    return openNewBrowserTabInActiveWorkspace(group)
  }
  const availability = getClientCreationActionPolicy(state, worktreeId)['managed-browser']
  if (availability.state !== 'enabled') {
    throw new Error(availability.reason)
  }
  const url = state.browserDefaultUrl ?? 'about:blank'
  const environmentId = getActiveWorktreeRuntimeEnvironmentId(worktreeId)
  if (availability.provider === 'paired-runtime' && environmentId) {
    return createWebRuntimeSessionBrowserTab({ worktreeId, environmentId, url })
  }
  createBrowserTab(worktreeId, url, {
    title: translate('auto.components.Terminal.37da0d736f', 'New Browser Tab'),
    focusAddressBar: true,
    ...(environmentId ? { browserRuntimeEnvironmentId: null } : {})
  })
}
