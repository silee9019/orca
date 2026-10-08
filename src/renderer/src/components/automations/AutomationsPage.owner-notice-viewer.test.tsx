// @vitest-environment happy-dom
import { act } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import {
  installAutomationsPageHarness,
  settleHostQueries,
  api
} from './automations-page-test-harness'
import type { AutomationsPageController } from './use-automations-page-controller'
import type { applyAutomationViewerAction } from '../../runtime/automation-viewer-controller'
installAutomationsPageHarness()
afterEach(cleanup)
let apply: typeof applyAutomationViewerAction
let page: AutomationsPageController | undefined
async function request(action: Parameters<typeof apply>[0]) {
  let pending: ReturnType<typeof apply> | undefined
  await act(async () => {
    pending = apply(action)
    void pending.catch(() => undefined)
  })
  if (!pending) {
    throw new Error('missing request')
  }
  return pending
}
async function mount() {
  vi.resetModules()
  const [{ useAutomationsPageController }, { AutomationsPageSurface }, controller] =
    await Promise.all([
      import('./use-automations-page-controller'),
      import('./AutomationsPageSurface'),
      import('../../runtime/automation-viewer-controller')
    ])
  apply = controller.applyAutomationViewerAction
  function Harness() {
    const current = useAutomationsPageController()
    page = current
    return <AutomationsPageSurface controller={current} />
  }
  return render(<Harness />)
}
async function notice() {
  await settleHostQueries()
  const current = page
  if (!current) {
    throw new Error('missing page')
  }
  const host = current.list.hostCatalog.entries[0]
  if (!host) {
    throw new Error('missing host')
  }
  await act(async () =>
    current.local.setOwnerAction({
      host,
      notice: { severity: 'failure', message: 'fixture host unavailable', recovery: 'retry' }
    })
  )
  const state = (await apply({ kind: 'get' })).ownerNotice
  if (!state?.notice) {
    throw new Error('missing notice')
  }
  return { state }
}
it('uses actual Page TopBar retry and dismissal callbacks through the public root', async () => {
  const view = await mount()
  await notice()
  const beforeNative = api.automations.list.mock.calls.length
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
  await settleHostQueries()
  expect((await apply({ kind: 'get' })).ownerNotice?.notice).toBeNull()
  const nativeReads = api.automations.list.mock.calls.length - beforeNative
  expect(nativeReads).toBeGreaterThan(0)
  const cli = await notice()
  const beforeCli = api.automations.list.mock.calls.length
  const result = await request({
    kind: 'owner-notice-recover',
    action: 'retry',
    reviewedTarget: cli.state.reviewedTarget
  })
  await settleHostQueries()
  expect(result.ownerNoticeResult).toMatchObject({
    notice: null,
    completed: { requested: 'retry' }
  })
  expect(api.automations.list.mock.calls.length - beforeCli).toBe(nativeReads)
  await notice()
  fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
  expect((await apply({ kind: 'get' })).ownerNotice?.notice).toBeNull()
  const dismiss = await notice()
  const beforeDismiss = api.automations.list.mock.calls.length
  expect(
    (await request({ kind: 'owner-notice-dismiss', reviewedTarget: dismiss.state.reviewedTarget }))
      .ownerNoticeResult
  ).toMatchObject({ notice: null, completed: { requested: 'dismiss' } })
  expect(api.automations.list.mock.calls.length).toBe(beforeDismiss)
  view.unmount()
})
it('rejects stale and unavailable notice actions without changing the owner state', async () => {
  await mount()
  const first = await notice()
  await expect(
    request({
      kind: 'owner-notice-recover',
      action: 'reconnect',
      reviewedTarget: first.state.reviewedTarget
    })
  ).rejects.toThrow('automation_notice_unavailable')
  const next = await notice()
  expect(next.state.reviewedTarget).not.toBe(first.state.reviewedTarget)
  await expect(
    request({ kind: 'owner-notice-dismiss', reviewedTarget: first.state.reviewedTarget })
  ).rejects.toThrow('viewer_target_changed')
  await request({ kind: 'owner-notice-dismiss', reviewedTarget: next.state.reviewedTarget })
  const cleared = (await apply({ kind: 'get' })).ownerNotice
  if (!cleared) {
    throw new Error('missing viewer')
  }
  await expect(
    request({ kind: 'owner-notice-dismiss', reviewedTarget: cleared.reviewedTarget })
  ).rejects.toThrow('automation_notice_unavailable')
})
