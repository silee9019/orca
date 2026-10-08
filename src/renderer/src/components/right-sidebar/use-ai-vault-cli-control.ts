import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import { enableAiVaultSearchFromPanel } from './AiVaultPanelSearch'
import { useAppSurfaceControl } from '../../hooks/ipc-events/app-surface-ipc-bridge'
import type { AiVaultSession, AiVaultScope } from '../../../../shared/ai-vault-types'
import type { ExecutionHostScope } from '../../../../shared/execution-host'
import type { usePersistedAiVaultViewOptions } from './use-persisted-ai-vault-view-options'
import type { useAiVaultPanelSearch } from './use-ai-vault-search'
import type { useAiVaultSessionLaunchActions } from './ai-vault-session-launch-actions'
import type { useAiVaultOriginalPaneActions } from './ai-vault-original-pane-actions'
import {
  aiVaultSessionRowResumeGating,
  type AiVaultSessionResumeState
} from './ai-vault-session-resume'
import type { AiVaultResumeInChatEligibility } from './ai-vault-session-resume-in-chat'
import { openAiVaultSessionLogInOrca } from './ai-vault-session-log-open'

export function useAiVaultCliControl(args: {
  options: ReturnType<typeof usePersistedAiVaultViewOptions>
  sessions: readonly AiVaultSession[]
  scope: AiVaultScope
  setScope: (scope: AiVaultScope) => void
  host: ExecutionHostScope
  hosts: readonly { id: ExecutionHostScope }[]
  setHost: (host: ExecutionHostScope) => void
  setQuery: (query: string) => void
  refresh: (options: { force: boolean }) => Promise<void>
  search: Pick<ReturnType<typeof useAiVaultPanelSearch>, 'loading' | 'retry' | 'loadMore'>
  launch: Pick<
    ReturnType<typeof useAiVaultSessionLaunchActions>,
    'handleResume' | 'handleResumeInNewChat' | 'copyResumeCommand'
  >
  panes: Pick<
    ReturnType<typeof useAiVaultOriginalPaneActions>,
    'getOriginalPaneTarget' | 'isStructuredSessionOpen' | 'jumpToOriginalPane'
  >
  resumeState: (session: AiVaultSession) => AiVaultSessionResumeState
  resumeInChat: (session: AiVaultSession) => AiVaultResumeInChatEligibility
  requestDelete: (session: AiVaultSession, confirmedSessionId?: string) => Promise<void>
}): void {
  useAppSurfaceControl('vault', async (input) => {
    if (input.kind !== 'vault') {
      return
    }
    const options = args.options
    switch (input.action) {
      case 'status':
        return {
          scope: args.scope,
          host: args.host,
          hosts: args.hosts,
          agents: options.agents,
          group: options.group,
          hideEmpty: options.hideEmptySessions,
          limit: options.sessionLimit,
          loading: args.search.loading,
          sessionCount: args.sessions.length,
          truncated: args.sessions.length > 500,
          sessions: args.sessions.slice(0, 500).map(({ sessionId, executionHostId, agent }) => ({
            sessionId,
            executionHostId,
            agent
          }))
        }
      case 'search-enabled':
        if (args.host !== 'local') {
          throw new Error(
            'Change indexing consent on the selected execution host through its settings command'
          )
        }
        if (input.enabled === undefined) {
          throw new Error('Specify enabled')
        }
        await enableAiVaultSearchFromPanel(args.search.retry, input.enabled)
        break
      case 'enable-search':
        if (args.host !== 'local') {
          throw new Error('Local indexing consent requires the local host scope')
        }
        await enableAiVaultSearchFromPanel(args.search.retry)
        break
      case 'query':
        if (input.query === undefined) {
          throw new Error('Specify query')
        }
        args.setQuery(input.query)
        break
      case 'scope':
        if (!input.scope) {
          throw new Error('Specify scope')
        }
        args.setScope(input.scope)
        break
      case 'host': {
        const host = args.hosts.find((entry) => entry.id === input.host)
        if (!host) {
          throw new Error('Specify an available host from vault status')
        }
        args.setHost(host.id)
        break
      }
      case 'group':
        if (!input.group) {
          throw new Error('Specify group')
        }
        options.setGroup(input.group)
        break
      case 'agent':
        if (!input.agent || input.enabled === undefined) {
          throw new Error('Specify agent and enabled')
        }
        options.setAgentEnabled(input.agent, input.enabled)
        break
      case 'all-agents':
        if (input.enabled === undefined) {
          throw new Error('Specify enabled')
        }
        options.setAllAgentsEnabled(input.enabled)
        break
      case 'hide-empty':
        if (input.enabled === undefined) {
          throw new Error('Specify enabled')
        }
        options.setHideEmptySessions(input.enabled)
        break
      case 'limit':
        if (input.limit === undefined) {
          throw new Error('Specify limit')
        }
        options.setSessionLimit(input.limit)
        break
      case 'reset':
        options.resetViewOptions()
        break
      case 'refresh':
        await args.refresh({ force: true })
        break
      case 'retry':
        args.search.retry()
        break
      case 'load-more':
        args.search.loadMore()
        break
      case 'resume':
      case 'new-chat':
      case 'delete':
      case 'copy-id':
      case 'copy-path':
      case 'copy-resume':
      case 'open-log':
      case 'reveal-log':
      case 'open-cwd':
      case 'original-pane': {
        if (!input.sessionId || !input.host || !input.agent) {
          throw new Error('Specify exact sessionId, host and agent from vault status')
        }
        const matches = args.sessions.filter(
          (session) =>
            session.sessionId === input.sessionId &&
            session.executionHostId === input.host &&
            session.agent === input.agent
        )
        if (matches.length !== 1) {
          throw new Error('The exact session is unavailable or ambiguous; refresh the vault')
        }
        const session = matches[0]
        switch (input.action) {
          case 'resume':
            if (aiVaultSessionRowResumeGating(session, args.resumeState(session)).resumeDisabled) {
              throw new Error('Resume is unavailable for this session and workspace')
            }
            args.launch.handleResume(session)
            break
          case 'new-chat':
            if (!args.resumeInChat(session).available) {
              throw new Error('Resume in chat is unavailable for this session and workspace')
            }
            args.launch.handleResumeInNewChat(session)
            break
          case 'delete':
            if (input.confirmSessionId !== session.sessionId) {
              throw new Error('Confirm the exact sessionId before deleting')
            }
            await args.requestDelete(session, input.confirmSessionId)
            break
          case 'copy-id':
            await copyAiVaultSessionId(session)
            break
          case 'copy-path':
            await copyAiVaultSessionPath(session)
            break
          case 'copy-resume':
            if (
              !aiVaultSessionRowResumeGating(session, args.resumeState(session))
                .canCopyResumeCommand
            ) {
              throw new Error('No resumable CLI command for this session')
            }
            await args.launch.copyResumeCommand(session)
            break
          case 'open-log':
            await openAiVaultSessionLogInOrca(session)
            break
          case 'reveal-log':
            await window.api.shell.openPath(session.filePath)
            break
          case 'open-cwd':
            if (!session.cwd) {
              throw new Error('Session has no working directory')
            }
            await window.api.shell.openPath(session.cwd)
            break
          case 'original-pane':
            if (
              !args.panes.isStructuredSessionOpen(session) &&
              !args.panes.getOriginalPaneTarget(session)
            ) {
              throw new Error('Original pane is unavailable')
            }
            args.panes.jumpToOriginalPane(session)
            break
        }
      }
    }
    return { state: 'requested' }
  })
}

export async function copyAiVaultText(text: string, label: string): Promise<void> {
  await window.api.ui.writeClipboardText(text)
  toast.success(
    translate('auto.components.right.sidebar.AiVaultPanel.valueCopied', '{{value0}} copied', {
      value0: label
    })
  )
}

export function copyAiVaultSessionId(session: AiVaultSession): Promise<void> {
  return copyAiVaultText(
    session.sessionId,
    translate('auto.components.right.sidebar.AiVaultPanel.sessionId', 'Session ID')
  )
}
export function copyAiVaultSessionPath(session: AiVaultSession): Promise<void> {
  return copyAiVaultText(
    session.filePath,
    translate('auto.components.right.sidebar.AiVaultPanel.logPath', 'Log path')
  )
}
