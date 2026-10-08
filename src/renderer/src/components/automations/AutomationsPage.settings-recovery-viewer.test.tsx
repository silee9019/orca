// @vitest-environment happy-dom
import { TooltipProvider } from '../ui/tooltip'
import { act } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import {
  installAutomationsPageHarness,
  api,
  mocks,
  runtimeHost,
  RUNTIME_ID,
  RUNTIME_SELF_FILTER,
  settleHostQueries
} from './automations-page-test-harness'
import type { applyAutomationViewerAction } from '../../runtime/automation-viewer-controller'
import type { SettingsNavigationTarget } from '@/lib/settings-navigation-types'
import type { AutomationHostFilter } from '../../../../shared/automation-host-filter'

installAutomationsPageHarness()
afterEach(cleanup)
let apply: typeof applyAutomationViewerAction
async function mountPage() {
  vi.resetModules()
  const [{ default: Page }, controller] = await Promise.all([
    import('./AutomationsPage'),
    import('../../runtime/automation-viewer-controller')
  ])
  apply = controller.applyAutomationViewerAction
  mocks.setAutomationHostFilter.mockImplementation((filter: AutomationHostFilter) => {
    mocks.state.automationHostFilter = filter
  })
  const renderPage = () => (
    <TooltipProvider>
      <Page />
    </TooltipProvider>
  )
  const view = render(renderPage())
  return { view, rerender: () => view.rerender(renderPage()) }
}

function oldRuntime() {
  runtimeHost([], [])
  mocks.state.runtimeStatusByEnvironmentId = new Map([
    [RUNTIME_ID, { status: { capabilities: [] } }]
  ])
  mocks.state.automationHostFilter = RUNTIME_SELF_FILTER
  mocks.getRuntimeEnvironmentStatus.mockResolvedValue({ capabilities: [] })
  const original = mocks.callRuntimeRpc.getMockImplementation()
  mocks.callRuntimeRpc.mockImplementation((...args) =>
    args[1] === 'automation.list'
      ? Promise.reject(new Error('legacy host read unavailable'))
      : original?.(...args)
  )
}
async function reviewedUpdate() {
  const host = (await apply({ kind: 'get' })).hosts.find(
    (host) => host.recovery.authority === 'update-server'
  )
  if (!host) {
    throw new Error('missing incompatible host')
  }
  return {
    kind: 'host-recover',
    stableKey: host.stableKey,
    reviewedOwner: host.reviewedOwner,
    action: 'update-server'
  } as const
}

it('recovers the settings handoff after the originating Page unmounts', async () => {
  oldRuntime()
  let removePage: () => void = () => undefined
  mocks.state.openSettingsTarget = (target: SettingsNavigationTarget) => {
    mocks.state.settingsNavigationTarget = target
  }
  mocks.state.openSettingsPage = () => {
    mocks.state.activeView = 'settings'
    removePage()
  }
  const { view } = await mountPage()
  removePage = () => view.unmount()
  await settleHostQueries()
  const action = await reviewedUpdate()
  let pending: ReturnType<typeof apply> | undefined
  await act(async () => {
    pending = apply(action)
  })
  await expect(pending).resolves.toMatchObject({
    committed: false,
    recovery: {
      action: 'update-server',
      operation: 'navigation-requested',
      page: 'skipped',
      navigationTarget: { pane: 'servers', repoId: null, sectionId: RUNTIME_ID }
    }
  })
  expect(mocks.state.settingsNavigationTarget).toEqual({
    pane: 'servers',
    repoId: null,
    sectionId: RUNTIME_ID
  })
  await expect(apply({ kind: 'get' })).rejects.toThrow('viewer_unavailable')
  expect(api.runtimeEnvironments.connect).not.toHaveBeenCalled()
})

it('matches the actual Update server button target and the CLI handoff', async () => {
  oldRuntime()
  mocks.renderRealList = true
  mocks.state.openSettingsTarget = (target: SettingsNavigationTarget) => {
    mocks.state.settingsNavigationTarget = target
  }
  mocks.state.openSettingsPage = () => {
    mocks.state.activeView = 'settings'
  }
  await mountPage()
  await settleHostQueries()
  fireEvent.click((await screen.findAllByRole('button', { name: 'Update server' }))[0]!)
  await waitFor(() => expect(mocks.state.activeView).toBe('settings'))
  const uiTarget = mocks.state.settingsNavigationTarget
  mocks.state.activeView = 'automations'
  mocks.state.settingsNavigationTarget = null
  const action = await reviewedUpdate()
  let pending: ReturnType<typeof apply> | undefined
  await act(async () => {
    pending = apply(action)
  })
  await expect(pending).resolves.toMatchObject({
    committed: false,
    recovery: { operation: 'navigation-requested', navigationTarget: uiTarget }
  })
  expect(mocks.state.settingsNavigationTarget).toEqual(uiTarget)
})

it('reports a failed handoff if the settings store did not accept the target', async () => {
  oldRuntime()
  mocks.state.openSettingsTarget = () => undefined
  mocks.state.openSettingsPage = () => undefined
  await mountPage()
  await settleHostQueries()
  const action = await reviewedUpdate()
  let pending: ReturnType<typeof apply> | undefined
  await act(async () => {
    pending = apply(action)
  })
  await expect(pending).resolves.toMatchObject({
    committed: false,
    recovery: { operation: 'failed' }
  })
})
