import {
  isAccountMountedViewerAction,
  applyMountedAccountsViewerAction
} from './account-mounted-viewer-actions'
import { BITBUCKET_API_TOKEN_DOCS_URL } from '../../../shared/account-documentation-links'
import { applyAccountLoginLinkAction } from './account-login-link-controls'
import { closeUsageMenuIfMounted } from './usage-menu-controller'
import { getUsageProviderAccountsSectionId } from '../components/status-bar/usage-provider-settings-target'
import { openAiVaultSessionLogInOrca } from '../components/right-sidebar/ai-vault-session-log-open'
import { canOpenAiVaultSessionLogInOrca } from '../components/right-sidebar/ai-vault-session-path-actions'
import { AccountsViewerActionSchema } from '../../../shared/accounts-viewer-command'
import { useAppStore } from '../store'

export async function applyAccountsViewerAction(input: unknown): Promise<unknown> {
  const action = AccountsViewerActionSchema.parse(input)
  if (isAccountMountedViewerAction(action)) {
    return applyMountedAccountsViewerAction(action)
  }
  if (action.type === 'codex-login-link') {
    return applyAccountLoginLinkAction(action.operation)
  }
  if (action.type === 'open-bitbucket-docs') {
    try {
      await window.api.shell.openUrl(BITBUCKET_API_TOKEN_DOCS_URL)
    } catch {
      throw new Error('Could not open Bitbucket documentation')
    }
    return { opened: true }
  }
  const state = useAppStore.getState()
  if (action.type === 'configure-usage') {
    await state.recordFeatureInteraction('usage-tracking')
    state.openSettingsTarget({ pane: 'accounts', repoId: null })
    state.openSettingsPage()
    return { opened: useAppStore.getState().activeView === 'settings' }
  }
  if (action.type === 'open-settings') {
    if (action.provider && action.pane !== 'accounts') {
      throw new Error('Provider sections belong to account settings')
    }
    const sectionId = action.provider ? getUsageProviderAccountsSectionId(action.provider) : null
    await closeUsageMenuIfMounted()
    state.openSettingsTarget({
      pane: action.pane,
      repoId: null,
      ...(sectionId ? { sectionId } : {})
    })
    state.openSettingsPage()
    return { pane: action.pane, opened: useAppStore.getState().activeView === 'settings' }
  }
  if (action.type === 'open-session-log') {
    if (state.activeWorktreeId !== action.workspaceId || !canOpenAiVaultSessionLogInOrca(action)) {
      throw new Error('The exact active workspace and a local single-file session log are required')
    }
    await openAiVaultSessionLogInOrca(action)
    return {
      opened: useAppStore
        .getState()
        .openFiles.some(
          (file) =>
            file.filePath === action.filePath &&
            file.worktreeId === action.workspaceId &&
            (file.runtimeEnvironmentId ?? null) === null
        )
    }
  }
  if (action.ptyIds.some((id) => !state.codexRestartNoticeByPtyId[id])) {
    throw new Error('Every pane must have a current Codex account restart notice')
  }
  state.queueCodexPaneRestarts(action.ptyIds)
  return { queued: action.ptyIds }
}
