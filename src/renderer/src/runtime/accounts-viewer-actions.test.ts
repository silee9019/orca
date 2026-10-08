import { beforeEach, expect, it, vi } from 'vitest'
import { applyAccountsViewerAction } from './accounts-viewer-actions'
import { useAppStore } from '../store'

beforeEach(() => {
  useAppStore.setState({
    activeView: 'terminal',
    settingsNavigationTarget: null,
    settingsSearchQuery: 'old search',
    pendingCodexPaneRestartIds: {},
    codexRestartNoticeByPtyId: {
      'fixture-pane': { previousAccountLabel: 'old', nextAccountLabel: 'new', dismissed: true }
    }
  })
})

it('opens the account settings using the existing navigation actions', async () => {
  await applyAccountsViewerAction({ type: 'open-settings', pane: 'orca-account' })
  expect(useAppStore.getState().activeView).toBe('settings')
  expect(useAppStore.getState().settingsNavigationTarget).toEqual({
    pane: 'orca-account',
    repoId: null
  })
  expect(useAppStore.getState().settingsSearchQuery).toBe('')
})

it('queues only exact existing Codex restart notices and restores the input block', async () => {
  await expect(
    applyAccountsViewerAction({ type: 'queue-codex-restarts', ptyIds: ['unknown'], confirm: true })
  ).rejects.toThrow('notice')
  expect(useAppStore.getState().pendingCodexPaneRestartIds).toEqual({})
  await applyAccountsViewerAction({
    type: 'queue-codex-restarts',
    ptyIds: ['fixture-pane'],
    confirm: true
  })
  expect(useAppStore.getState().pendingCodexPaneRestartIds).toEqual({ 'fixture-pane': true })
  expect(useAppStore.getState().codexRestartNoticeByPtyId['fixture-pane']).toEqual({
    previousAccountLabel: 'old',
    nextAccountLabel: 'new',
    restartRequested: true
  })
})

it('requires confirmation before changing a Codex pane', async () => {
  await expect(
    applyAccountsViewerAction({ type: 'queue-codex-restarts', ptyIds: ['fixture-pane'] })
  ).rejects.toThrow()
  expect(useAppStore.getState().pendingCodexPaneRestartIds).toEqual({})
})

it('opens a local session log only in the exact active folder workspace', async () => {
  useAppStore.setState({
    activeWorktreeId: 'folder:fixture',
    folderWorkspaces: [
      {
        id: 'fixture',
        projectGroupId: 'group',
        name: 'fixture',
        folderPath: '/fixture',
        linkedTask: null,
        comment: '',
        isArchived: false,
        isUnread: false,
        isPinned: false,
        sortOrder: 0,
        lastActivityAt: 0,
        createdAt: 0,
        updatedAt: 0
      }
    ],
    openFiles: []
  })
  await expect(
    applyAccountsViewerAction({
      type: 'open-session-log',
      workspaceId: 'wrong',
      filePath: '/fixture/session.jsonl',
      executionHostId: 'local'
    })
  ).rejects.toThrow()
  expect(useAppStore.getState().openFiles).toEqual([])
  await applyAccountsViewerAction({
    type: 'open-session-log',
    workspaceId: 'folder:fixture',
    filePath: '/fixture/session.jsonl',
    executionHostId: 'local'
  })
  expect(useAppStore.getState().openFiles).toEqual([
    expect.objectContaining({
      filePath: '/fixture/session.jsonl',
      runtimeEnvironmentId: null,
      readOnly: true,
      liveTail: true
    })
  ])
})

it('opens the existing provider account section', async () => {
  await applyAccountsViewerAction({ type: 'open-settings', pane: 'accounts', provider: 'grok' })
  expect(useAppStore.getState().settingsNavigationTarget).toEqual({
    pane: 'accounts',
    repoId: null,
    sectionId: 'accounts-grok'
  })
  await expect(
    applyAccountsViewerAction({ type: 'open-settings', pane: 'orca-account', provider: 'grok' })
  ).rejects.toThrow()
})

it('records the usage setup interaction before opening the account page', async () => {
  const original = useAppStore.getState().recordFeatureInteraction
  const record = vi.fn(async () => undefined)
  useAppStore.setState({ recordFeatureInteraction: record })
  try {
    await applyAccountsViewerAction({ type: 'configure-usage' })
    expect(record).toHaveBeenCalledWith('usage-tracking')
    expect(useAppStore.getState().settingsNavigationTarget).toEqual({
      pane: 'accounts',
      repoId: null
    })
    expect(useAppStore.getState().activeView).toBe('settings')
  } finally {
    useAppStore.setState({ recordFeatureInteraction: original })
  }
})
