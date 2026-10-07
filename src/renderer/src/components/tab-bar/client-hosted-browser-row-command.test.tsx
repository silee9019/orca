// @vitest-environment happy-dom
import { act, cleanup, render, fireEvent, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import { TooltipProvider } from '@/components/ui/tooltip'
import {
  applyClientHostedBrowserRows,
  hydrateClientHostedBrowserRows,
  getClientHostedBrowserRowSelection
} from '@/lib/pane-manager/client-hosted-browser-row-state'
import { requestClientHostedBrowserRow } from '@/runtime/client-hosted-browser-row-request'
import ClientHostedBrowserTabRows from './ClientHostedBrowserTabRows'
import { installClientHostedPaneApi } from '../browser-pane/client-hosted-browser-pane-test-rig'
import { getDefaultSettings } from '../../../../shared/constants'
const originalApi = Object.getOwnPropertyDescriptor(window, 'api')
const initial = useAppStore.getInitialState()
const row = {
  browserPageId: 'page',
  worktreeId: 'folder:fixture',
  url: 'https://example.test',
  title: 'Fixture',
  loading: false,
  browserHostClientId: 'fixture-client',
  hostDeviceName: null,
  hostAbsent: false
}
const command = {
  action: 'activate' as const,
  page: 'page',
  worktreeId: 'folder:fixture',
  groupId: 'group',
  expectedHostClientId: 'fixture-client'
}
afterEach(() => {
  cleanup()
  useAppStore.setState(initial, true)
  hydrateClientHostedBrowserRows([])
  vi.restoreAllMocks()
  vi.useRealTimers()
  if (originalApi) {
    Object.defineProperty(window, 'api', originalApi)
  } else {
    Reflect.deleteProperty(window, 'api')
  }
})
it('reuses the actual row activation and existing selection store without persisting a browser tab', async () => {
  useAppStore.setState({
    activeWorktreeId: row.worktreeId,
    persistedUIReady: true,
    settings: getDefaultSettings('/fixture'),
    activeModal: 'none',
    groupsByWorktree: {
      [row.worktreeId]: [
        { id: 'group', worktreeId: row.worktreeId, activeTabId: null, tabOrder: [] }
      ]
    }
  })
  applyClientHostedBrowserRows({ worktreeId: row.worktreeId, rows: [row] })
  render(
    <TooltipProvider>
      <ClientHostedBrowserTabRows
        rows={[row]}
        worktreeId={row.worktreeId}
        groupId="group"
        groupActiveTabId={null}
        includeTopTabBorder
      />
    </TooltipProvider>
  )
  await act(async () => {
    await expect(requestClientHostedBrowserRow(command, Date.now() + 1000)).resolves.toMatchObject({
      applied: true
    })
  })
  expect(getClientHostedBrowserRowSelection()).toMatchObject({
    browserPageId: 'page',
    groupId: 'group'
  })
  expect(useAppStore.getState().browserTabsByWorktree[row.worktreeId] ?? []).toHaveLength(0)
})

function mount() {
  installClientHostedPaneApi()
  useAppStore.setState({
    activeWorktreeId: row.worktreeId,
    persistedUIReady: true,
    settings: getDefaultSettings('/fixture'),
    activeModal: 'none',
    groupsByWorktree: {
      [row.worktreeId]: [
        { id: 'group', worktreeId: row.worktreeId, activeTabId: null, tabOrder: [] }
      ]
    }
  })
  applyClientHostedBrowserRows({ worktreeId: row.worktreeId, rows: [row] })
  return render(
    <TooltipProvider>
      <ClientHostedBrowserTabRows
        rows={[row]}
        worktreeId={row.worktreeId}
        groupId="group"
        groupActiveTabId={null}
        includeTopTabBorder
      />
    </TooltipProvider>
  )
}
it('closes through the existing runtime call and requires removal from its existing rows store', async () => {
  mount()
  const call = vi.fn(async () => {
    applyClientHostedBrowserRows({ worktreeId: row.worktreeId, rows: [] })
    return { ok: true, result: { closed: true } }
  })
  Reflect.set(window.api, 'runtime', { call })
  await act(async () => {
    await expect(
      requestClientHostedBrowserRow({ ...command, action: 'close' }, Date.now() + 1000)
    ).resolves.toMatchObject({ applied: true, action: 'close' })
  })
  expect(call).toHaveBeenCalledWith({
    method: 'browser.tabClose',
    params: { worktree: 'id:folder:fixture', page: 'page' }
  })
})
it('refuses stale host, modal busy and expired requests before invoking the existing service', async () => {
  mount()
  const call = vi.fn()
  Reflect.set(window.api, 'runtime', { call })
  await expect(
    requestClientHostedBrowserRow(
      { ...command, action: 'close', expectedHostClientId: 'other' },
      Date.now() + 1000
    )
  ).rejects.toThrow('host_changed')
  useAppStore.setState({ activeModal: 'add-repo' })
  await expect(
    requestClientHostedBrowserRow({ ...command, action: 'close' }, Date.now() + 1000)
  ).rejects.toThrow('busy')
  useAppStore.setState({ activeModal: 'none' })
  await expect(
    requestClientHostedBrowserRow({ ...command, action: 'close' }, Date.now() - 1)
  ).rejects.toThrow('expired')
  expect(call).not.toHaveBeenCalled()
})
it('rejects scope replacement between owner offer and the asynchronous provider effect', async () => {
  mount()
  const call = vi.fn()
  Reflect.set(window.api, 'runtime', { call })
  const pending = requestClientHostedBrowserRow({ ...command, action: 'close' }, Date.now() + 1000)
  useAppStore.setState({ activeWorktreeId: 'folder:other' })
  await expect(pending).rejects.toThrow('target_changed')
  expect(call).not.toHaveBeenCalled()
})
it('rejects a provider refusal and a successful provider without row removal after deadline', async () => {
  mount()
  const call = vi.fn<() => Promise<unknown>>(async () => ({
    ok: false,
    error: { code: 'browser_error', message: 'fixture refusal' }
  }))
  Reflect.set(window.api, 'runtime', { call })
  await expect(
    requestClientHostedBrowserRow({ ...command, action: 'close' }, Date.now() + 1000)
  ).rejects.toThrow('fixture refusal')
  vi.useFakeTimers()
  call.mockImplementation(async () => ({ ok: true, result: { closed: true } }))
  const pending = requestClientHostedBrowserRow({ ...command, action: 'close' }, Date.now() + 20)
  const rejected = expect(pending).rejects.toThrow('expired')
  await vi.advanceTimersByTimeAsync(25)
  await rejected
})
it('rejects duplicate pending close and disposal without acknowledging a late provider', async () => {
  const view = mount()
  let finish = () => {}
  const gate = new Promise<void>((resolve) => {
    finish = resolve
  })
  const call = vi.fn(async () => {
    await gate
    return { ok: true, result: { closed: true } }
  })
  Reflect.set(window.api, 'runtime', { call })
  const pending = requestClientHostedBrowserRow({ ...command, action: 'close' }, Date.now() + 1000)
  await expect(
    requestClientHostedBrowserRow({ ...command, action: 'close' }, Date.now() + 1000)
  ).rejects.toThrow('busy')
  const rejected = expect(pending).rejects.toThrow('disposed')
  view.unmount()
  await rejected
  finish()
  await gate
  expect(call).toHaveBeenCalledTimes(1)
})

it('shares one pending close between the actual UI button and CLI owner', async () => {
  const view = mount()
  let finish = () => {}
  const gate = new Promise<void>((resolve) => {
    finish = resolve
  })
  const call = vi.fn(async () => {
    await gate
    applyClientHostedBrowserRows({ worktreeId: row.worktreeId, rows: [] })
    return { ok: true, result: { closed: true } }
  })
  Reflect.set(window.api, 'runtime', { call })
  const pending = requestClientHostedBrowserRow({ ...command, action: 'close' }, Date.now() + 1000)
  await Promise.resolve()
  fireEvent.click(screen.getByRole('button', { name: 'Close hosted page' }))
  const observed = call.mock.calls.length
  await act(async () => {
    finish()
    await pending
  })
  view.unmount()
  expect(observed).toBe(1)
})
