import type { StatusBarItem } from '../../../shared/ui-chrome-types'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const fixture = vi.hoisted(() => {
  const settings: { activeRuntimeEnvironmentId: string | null } = {
    activeRuntimeEnvironmentId: null
  }
  const detectedAgentIds: string[] = []
  const statusBarItems: StatusBarItem[] = ['ports']
  const featureInteractions: Record<
    string,
    { firstInteractedAt: number; interactionCount: number }
  > = {}
  return {
    state: {
      settings,
      persistedUIReady: true,
      detectedAgentIds,
      statusBarVisible: true,
      statusBarItems,
      usagePercentageDisplay: 'used',
      usagePercentageDisplayChangeNoticeDismissed: false,
      featureInteractions,
      setStatusBarVisible: vi.fn(),
      toggleStatusBarItem: vi.fn(),
      setUsagePercentageDisplay: vi.fn(),
      recordFeatureInteraction: vi.fn()
    },
    rendered: true,
    mounted: true,
    meters: true,
    committedDisplay: 'used'
  }
})
vi.mock('@/store', () => ({ useAppStore: { getState: () => fixture.state } }))
vi.mock('../components/settings/appearance-status-bar-search', () => ({
  getStatusBarToggles: () => [{ id: 'ports' }, { id: 'codex' }, { id: 'zcode' }]
}))
vi.mock('./status-bar-viewer-view', () => ({
  isStatusBarViewerMounted: () => fixture.mounted,
  readStatusBarViewerView: () =>
    fixture.rendered
      ? {
          items: fixture.state.statusBarItems,
          percentageDisplay: fixture.committedDisplay,
          providers: [],
          meters: fixture.meters
            ? [{ provider: 'gemini', display: fixture.committedDisplay, value: 25 }]
            : [],
          compact: false,
          runtimeContextKey: 'local#0'
        }
      : null
}))
import { applyStatusBarViewerRequest } from './status-bar-viewer-bridge'
import { makePersistedUI } from '@/store/slices/ui-slice-test-harness'
import type { StatusBarViewerCommand } from '../../../shared/rpc-contract/status-bar-viewer-params'
const request = (command: StatusBarViewerCommand) => ({
  id: 'request',
  expiresAt: Date.now() + 200,
  command
})
afterEach(() => vi.unstubAllGlobals())
beforeEach(() => {
  fixture.state.settings = { activeRuntimeEnvironmentId: null }
  fixture.state.statusBarVisible = true
  fixture.state.statusBarItems = ['ports']
  fixture.state.usagePercentageDisplay = 'used'
  fixture.committedDisplay = 'used'
  fixture.state.usagePercentageDisplayChangeNoticeDismissed = false
  fixture.state.featureInteractions = {}
  fixture.rendered = true
  fixture.mounted = true
  fixture.meters = true
  vi.clearAllMocks()
  fixture.state.setStatusBarVisible.mockImplementation(async (visible) => {
    fixture.state.statusBarVisible = visible
    fixture.rendered = visible
    fixture.mounted = visible
  })
  fixture.state.toggleStatusBarItem.mockImplementation(async (item) => {
    fixture.state.statusBarItems = fixture.state.statusBarItems.includes(item) ? [] : [item]
  })
  fixture.state.recordFeatureInteraction.mockImplementation(async (id) => {
    fixture.state.featureInteractions[id] = { firstInteractedAt: 1, interactionCount: 1 }
  })
  fixture.state.setUsagePercentageDisplay.mockImplementation(async (display) => {
    fixture.state.usagePercentageDisplay = display
    fixture.committedDisplay = display
    fixture.state.usagePercentageDisplayChangeNoticeDismissed = true
  })
  vi.stubGlobal('window', {
    api: {
      ui: {
        setWithAck: vi.fn(),
        recordFeatureInteraction: vi.fn(),
        get: vi.fn(async () =>
          makePersistedUI({
            statusBarVisible: fixture.state.statusBarVisible,
            statusBarItems: fixture.state.statusBarItems,
            usagePercentageDisplay:
              fixture.state.usagePercentageDisplay === 'used' ? 'used' : 'remaining',
            usagePercentageDisplayChangeNoticeDismissed:
              fixture.state.usagePercentageDisplayChangeNoticeDismissed,
            featureInteractions: fixture.state.featureInteractions
          })
        )
      }
    }
  })
})
it('toggles visibility once and confirms actual root removal', async () => {
  expect(
    await applyStatusBarViewerRequest(request({ viewer: 'host', operation: 'toggle' }))
  ).toMatchObject({ applied: true, persisted: true, visible: false, rendered: null })
  expect(fixture.state.setStatusBarVisible).toHaveBeenCalledWith(false)
})
it('records the existing checkbox parent once and keeps repeated desired state a no-op', async () => {
  const command = { viewer: 'host', operation: 'item', item: 'ports', enabled: false } as const
  expect(await applyStatusBarViewerRequest(request(command))).toMatchObject({
    applied: true,
    persisted: true,
    interactionRecorded: true
  })
  expect(await applyStatusBarViewerRequest(request(command))).toMatchObject({
    dispatched: false,
    interactionRecorded: false
  })
  expect(fixture.state.recordFeatureInteraction).toHaveBeenCalledTimes(1)
  expect(fixture.state.recordFeatureInteraction).toHaveBeenCalledWith('ports')
  expect(fixture.state.toggleStatusBarItem).toHaveBeenCalledTimes(1)
})
it('preserves the installed-agent gate and the parent zcode telemetry omission', async () => {
  await expect(
    applyStatusBarViewerRequest(
      request({ viewer: 'host', operation: 'item', item: 'codex', enabled: true })
    )
  ).rejects.toThrow('status_bar_item_unavailable')
  fixture.state.detectedAgentIds = ['zcode']
  await applyStatusBarViewerRequest(
    request({ viewer: 'host', operation: 'item', item: 'zcode', enabled: true })
  )
  expect(fixture.state.recordFeatureInteraction).not.toHaveBeenCalled()
  fixture.state.detectedAgentIds = []
})
it('does not call partial parent writes persisted success', async () => {
  fixture.state.recordFeatureInteraction.mockRejectedValueOnce(new Error('interaction_rejected'))
  expect(
    await applyStatusBarViewerRequest(
      request({ viewer: 'host', operation: 'item', item: 'ports', enabled: false })
    )
  ).toMatchObject({
    persisted: false,
    reason: 'persistence_failed',
    writes: { preference: 'accepted', interaction: 'rejected' }
  })
  expect(fixture.state.toggleStatusBarItem).toHaveBeenCalledTimes(1)
})
it('requires the percentage notice dismissal and actual committed display', async () => {
  expect(
    await applyStatusBarViewerRequest(
      request({ viewer: 'host', operation: 'percentage', display: 'remaining' })
    )
  ).toMatchObject({ applied: true, persisted: true, percentageNoticeDismissed: true })
  fixture.state.setUsagePercentageDisplay.mockImplementationOnce(async (display) => {
    fixture.state.usagePercentageDisplay = display
  })
  expect(
    await applyStatusBarViewerRequest(
      request({ viewer: 'host', operation: 'percentage', display: 'used' })
    )
  ).toMatchObject({ applied: false, persisted: true })
})
it('does not read another runtime after a write', async () => {
  fixture.state.setStatusBarVisible.mockImplementationOnce(async () => {
    fixture.state.settings.activeRuntimeEnvironmentId = 'other'
  })
  expect(
    await applyStatusBarViewerRequest(request({ viewer: 'host', operation: 'toggle' }))
  ).toMatchObject({ applied: false, persisted: null, reason: 'viewer_runtime_changed' })
  expect(window.api.ui.get).not.toHaveBeenCalled()
})

it('does not treat a zero-size mounted root as an acknowledged hide', async () => {
  fixture.state.setStatusBarVisible.mockImplementationOnce(async (visible) => {
    fixture.state.statusBarVisible = visible
    fixture.rendered = false
  })
  expect(
    await applyStatusBarViewerRequest(request({ viewer: 'host', operation: 'toggle' }))
  ).toMatchObject({ applied: false, persisted: true, reason: 'viewer_not_applied' })
})
it('reports absent numeric meters separately from accepted percentage preferences', async () => {
  fixture.meters = false
  expect(
    await applyStatusBarViewerRequest(
      request({ viewer: 'host', operation: 'percentage', display: 'remaining' })
    )
  ).toMatchObject({ applied: false, persisted: true, reason: 'status_bar_meter_unavailable' })
})

it('reports accepted writes with failed readback as persistence-unverifiable', async () => {
  vi.spyOn(window.api.ui, 'get').mockRejectedValueOnce(new Error('read_failed'))
  expect(
    await applyStatusBarViewerRequest(request({ viewer: 'host', operation: 'toggle' }))
  ).toMatchObject({
    persisted: null,
    reason: 'persistence_unverifiable',
    writes: { preference: 'accepted' }
  })
})
it('does not acknowledge interaction persistence when the host omits its optional records', async () => {
  vi.spyOn(window.api.ui, 'get').mockResolvedValueOnce(
    makePersistedUI({ statusBarItems: [], featureInteractions: undefined })
  )
  expect(
    await applyStatusBarViewerRequest(
      request({ viewer: 'host', operation: 'item', item: 'ports', enabled: false })
    )
  ).toMatchObject({ persisted: false, interactionRecorded: false })
})
