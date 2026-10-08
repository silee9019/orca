import { beforeEach, expect, it, vi } from 'vitest'
const fixture = vi.hoisted(() => {
  const settings: {
    activeRuntimeEnvironmentId: string | null
    compactWorktreeCards: boolean
    experimentalNewWorktreeCardStyle?: boolean
  } = {
    activeRuntimeEnvironmentId: null,
    compactWorktreeCards: false
  }
  return {
    state: {
      settings,
      persistedUIReady: true,
      worktreeCardProperties: ['status', 'unread'],
      _worktreeCardModeDefaulted: true,
      agentActivityDisplayMode: 'compact',
      setWorktreeCardMode: vi.fn(),
      setAgentActivityDisplayMode: vi.fn()
    },
    cards: [
      {
        id: 'workspace',
        repoId: 'project',
        hostId: null,
        compact: false,
        newStyle: false,
        properties: ['status', 'unread'],
        activityMode: 'compact',
        runtimeContextKey: 'local#0'
      }
    ]
  }
})
vi.mock('@/store', () => ({ useAppStore: { getState: () => fixture.state } }))
vi.mock('./card-viewer-view', () => ({ readCardViewerView: () => fixture.cards }))
import { applyCardViewerRequest } from './card-viewer-bridge'
import { makePersistedUI } from '@/store/slices/ui-slice-test-harness'

beforeEach(() => {
  fixture.state.settings = { activeRuntimeEnvironmentId: null, compactWorktreeCards: false }
  fixture.state.worktreeCardProperties = ['status', 'unread']
  fixture.state._worktreeCardModeDefaulted = true
  fixture.state.agentActivityDisplayMode = 'compact'
  fixture.cards = [
    {
      id: 'workspace',
      repoId: 'project',
      hostId: null,
      compact: false,
      newStyle: false,
      properties: ['status', 'unread'],
      activityMode: 'compact',
      runtimeContextKey: 'local#0'
    }
  ]
  vi.stubGlobal('window', {
    api: {
      ui: {
        setWithAck: vi.fn(),
        get: async () => ({
          worktreeCardProperties: fixture.state.worktreeCardProperties,
          _worktreeCardModeDefaulted: true,
          agentActivityDisplayMode: fixture.state.agentActivityDisplayMode
        })
      },
      settings: { get: async () => fixture.state.settings }
    }
  })
  fixture.state.setWorktreeCardMode.mockImplementation(async (mode) => {
    fixture.state.settings.compactWorktreeCards = mode === 'Compact'
    fixture.state.worktreeCardProperties = ['status']
    fixture.cards[0] = { ...fixture.cards[0], compact: true, properties: ['status', 'unread'] }
  })
  fixture.state.setAgentActivityDisplayMode.mockImplementation(async (mode) => {
    fixture.state.agentActivityDisplayMode = mode
    fixture.cards[0] = { ...fixture.cards[0], activityMode: mode }
  })
})
const request = () => ({
  id: 'test',
  expiresAt: Date.now() + 500,
  command: { viewer: 'host' as const, operation: 'mode' as const, mode: 'Compact' as const }
})

it('awaits the existing preset and accepts normalized compact properties', async () => {
  const result = await applyCardViewerRequest(request())
  expect(fixture.state.setWorktreeCardMode).toHaveBeenCalledWith('Compact')
  expect(result).toMatchObject({ applied: true, persisted: true, compact: true })
})
it('does not acknowledge a rejected or partially saved preset', async () => {
  fixture.state.setWorktreeCardMode.mockRejectedValueOnce(new Error('write_rejected'))
  await expect(applyCardViewerRequest(request())).rejects.toThrow('write_rejected')
})
it('does not read a different runtime after the write', async () => {
  fixture.state.setWorktreeCardMode.mockImplementationOnce(async () => {
    fixture.state.settings.activeRuntimeEnvironmentId = 'other'
  })
  const read = vi.spyOn(window.api.ui, 'get')
  expect(await applyCardViewerRequest(request())).toMatchObject({
    applied: false,
    persisted: null,
    reason: 'viewer_runtime_changed'
  })
  expect(read).not.toHaveBeenCalled()
})
it('reports unavailable cards separately from accepted preferences', async () => {
  fixture.cards = []
  fixture.state.setWorktreeCardMode.mockImplementationOnce(async () => {
    fixture.state.settings.compactWorktreeCards = true
    fixture.state.worktreeCardProperties = ['status']
  })
  expect(await applyCardViewerRequest(request())).toMatchObject({
    applied: false,
    persisted: true,
    reason: 'card_surface_unavailable'
  })
})
it('uses the existing activity action and observes the committed card configuration', async () => {
  expect(
    await applyCardViewerRequest({
      ...request(),
      command: { viewer: 'host', operation: 'activity', mode: 'full' }
    })
  ).toMatchObject({ applied: true, persisted: true, activityMode: 'full' })
  expect(fixture.state.setAgentActivityDisplayMode).toHaveBeenCalledWith('full')
})
it('respects new card style density while applying the preset properties', async () => {
  fixture.state.setWorktreeCardMode.mockImplementationOnce(async () => {
    fixture.state.settings.compactWorktreeCards = true
    fixture.state.worktreeCardProperties = ['status']
    fixture.cards[0] = { ...fixture.cards[0], newStyle: true, compact: false }
  })
  expect(await applyCardViewerRequest(request())).toMatchObject({
    applied: true,
    compact: true,
    rendered: [{ compact: false, newStyle: true }]
  })
})
it('rejects a user edit made during authoritative readback', async () => {
  vi.spyOn(window.api.ui, 'get').mockImplementationOnce(async () => {
    fixture.state.settings.compactWorktreeCards = false
    return makePersistedUI({ worktreeCardProperties: ['status'], _worktreeCardModeDefaulted: true })
  })
  expect(await applyCardViewerRequest(request())).toMatchObject({
    applied: false,
    reason: 'viewer_surface_superseded'
  })
})
it('preserves the new-style menu gate for legacy agent activity layout', async () => {
  fixture.state.settings.experimentalNewWorktreeCardStyle = true
  fixture.state.setAgentActivityDisplayMode.mockClear()
  await expect(
    applyCardViewerRequest({
      ...request(),
      command: { viewer: 'host', operation: 'activity', mode: 'full' }
    })
  ).rejects.toThrow('card_activity_unavailable')
  expect(fixture.state.setAgentActivityDisplayMode).not.toHaveBeenCalled()
})
