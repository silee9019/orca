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
import { selfScopedList } from './automations-page-runtime-fixtures'
import { makeAutomation } from './automations-page-fixtures'
import type { applyAutomationViewerAction } from '../../runtime/automation-viewer-controller'
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

async function recoverHost(action: 'retry' | 'reconnect') {
  const snapshot = await apply({ kind: 'get' })
  const host = snapshot.hosts.find(
    (host) => host.recovery.authority === action || host.recovery.execution === action
  )
  if (!host) {
    throw new Error(`missing offered host recovery: ${JSON.stringify(snapshot.hosts)}`)
  }
  return {
    host,
    action: {
      kind: 'host-recover',
      stableKey: host.stableKey,
      reviewedOwner: host.reviewedOwner,
      action
    } as const
  }
}

it('waits for a targeted retry and page refresh without claiming successful host reads', async () => {
  api.automations.listScoped.mockRejectedValue(new Error('host read unavailable'))
  await mountPage()
  await settleHostQueries()
  const { action } = await recoverHost('retry')
  let finish!: (value: ReturnType<typeof selfScopedList>) => void
  api.automations.listScoped.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve
    })
  )
  api.automations.list.mockRejectedValue(new Error('page read unavailable'))
  let pending: ReturnType<typeof apply> | undefined
  let settled = false
  await act(async () => {
    pending = apply(action)
    void pending.then(() => {
      settled = true
    })
  })
  expect(settled).toBe(false)
  await expect(apply({ kind: 'refresh' })).rejects.toThrow('viewer_busy')
  await act(async () => {
    finish(selfScopedList([makeAutomation()]))
  })
  await expect(pending).resolves.toMatchObject({
    recovery: { action: 'retry', operation: 'settled', page: 'failed' }
  })
  expect(api.automations.update).not.toHaveBeenCalled()
})

it('waits for runtime reconnect settlement while leaving health visibly unavailable', async () => {
  runtimeHost([], [])
  mocks.state.runtimeStatusByEnvironmentId = new Map([[RUNTIME_ID, { status: null }]])
  mocks.state.automationHostFilter = RUNTIME_SELF_FILTER
  await mountPage()
  await settleHostQueries()
  const { host, action } = await recoverHost('reconnect')
  let finish!: (value: unknown) => void
  api.runtimeEnvironments.connect.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve
    })
  )
  let pending: ReturnType<typeof apply> | undefined
  let settled = false
  await act(async () => {
    pending = apply(action)
    void pending.then(() => {
      settled = true
    })
  })
  expect(settled).toBe(false)
  expect(api.runtimeEnvironments.connect).toHaveBeenCalledExactlyOnceWith({ selector: RUNTIME_ID })
  await act(async () => {
    finish({ ok: false, error: { code: 'unavailable' } })
  })
  const result = await pending
  expect(result?.recovery).toEqual({ action: 'reconnect', operation: 'settled', page: 'skipped' })
  expect(result?.hosts.find((entry) => entry.stableKey === host.stableKey)?.authorityHealth).toBe(
    'unavailable'
  )
})

it('compares the actual Reconnect button with the CLI transport target', async () => {
  runtimeHost([], [])
  mocks.state.runtimeStatusByEnvironmentId = new Map([[RUNTIME_ID, { status: null }]])
  mocks.state.automationHostFilter = RUNTIME_SELF_FILTER
  mocks.renderRealList = true
  api.runtimeEnvironments.connect.mockResolvedValue({ ok: false })
  await mountPage()
  await settleHostQueries()
  fireEvent.click(screen.getAllByRole('button', { name: 'Reconnect' })[0]!)
  await waitFor(() => expect(api.runtimeEnvironments.connect).toHaveBeenCalledTimes(1))
  const { action } = await recoverHost('reconnect')
  let pending: ReturnType<typeof apply> | undefined
  await act(async () => {
    pending = apply(action)
  })
  await pending
  expect(api.runtimeEnvironments.connect).toHaveBeenCalledTimes(2)
  expect(api.runtimeEnvironments.connect.mock.calls[1]).toEqual(
    api.runtimeEnvironments.connect.mock.calls[0]
  )
  expect(api.ssh.connect).not.toHaveBeenCalled()
})

it('rejects unloaded hosts, stale owner reviews and recovery not offered by current health', async () => {
  await mountPage()
  await settleHostQueries()
  const host = (await apply({ kind: 'get' })).hosts[0]
  if (!host) {
    throw new Error('missing host')
  }
  await expect(
    apply({
      kind: 'host-recover',
      stableKey: 'missing',
      reviewedOwner: host.reviewedOwner,
      action: 'retry'
    })
  ).rejects.toThrow('automation_host_not_loaded')
  await expect(
    apply({
      kind: 'host-recover',
      stableKey: host.stableKey,
      reviewedOwner: 'old-owner',
      action: 'retry'
    })
  ).rejects.toThrow('viewer_target_changed')
  await expect(
    apply({
      kind: 'host-recover',
      stableKey: host.stableKey,
      reviewedOwner: host.reviewedOwner,
      action: 'reconnect'
    })
  ).rejects.toThrow('automation_host_recovery_unavailable')
  expect(api.runtimeEnvironments.connect).not.toHaveBeenCalled()
  expect(api.ssh.connect).not.toHaveBeenCalled()
})

it('reports a rejected connection request without a successful operation', async () => {
  runtimeHost([], [])
  mocks.state.runtimeStatusByEnvironmentId = new Map([[RUNTIME_ID, { status: null }]])
  await mountPage()
  await settleHostQueries()
  api.runtimeEnvironments.connect.mockRejectedValue(new Error('transport unavailable'))
  const { action } = await recoverHost('reconnect')
  let pending: ReturnType<typeof apply> | undefined
  await act(async () => {
    pending = apply(action)
  })
  await expect(pending).resolves.toMatchObject({
    recovery: { operation: 'failed', page: 'skipped' }
  })
})

it('keeps a captured reconnect busy until settlement and rejects a re-paired owner', async () => {
  runtimeHost([], [])
  mocks.state.runtimeStatusByEnvironmentId = new Map([[RUNTIME_ID, { status: null }]])
  const { rerender } = await mountPage()
  await settleHostQueries()
  let finish!: (value: unknown) => void
  api.runtimeEnvironments.connect.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve
    })
  )
  const { action } = await recoverHost('reconnect')
  let pending: ReturnType<typeof apply> | undefined
  await act(async () => {
    pending = apply(action)
    void pending.catch(() => undefined)
  })
  mocks.state.runtimeEnvironments = [
    { id: RUNTIME_ID, name: 'GPU box', createdAt: 1, pairingRevision: 9 }
  ]
  rerender()
  await expect(apply({ kind: 'refresh' })).rejects.toThrow('viewer_busy')
  await act(async () => {
    finish({ ok: true })
  })
  await expect(pending).rejects.toThrow('viewer_target_changed')
  await expect(apply(action)).rejects.toThrow('viewer_target_changed')
})

it('rejects unmounted recovery and ignores late connection settlement', async () => {
  runtimeHost([], [])
  mocks.state.runtimeStatusByEnvironmentId = new Map([[RUNTIME_ID, { status: null }]])
  const { view } = await mountPage()
  await settleHostQueries()
  let finish!: (value: unknown) => void
  api.runtimeEnvironments.connect.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve
    })
  )
  const { action } = await recoverHost('reconnect')
  let pending: ReturnType<typeof apply> | undefined
  await act(async () => {
    pending = apply(action)
    void pending.catch(() => undefined)
  })
  view.unmount()
  await expect(pending).rejects.toThrow('viewer_unmounted')
  await act(async () => {
    finish({ ok: true })
  })
  await expect(apply({ kind: 'get' })).rejects.toThrow('viewer_unavailable')
})
