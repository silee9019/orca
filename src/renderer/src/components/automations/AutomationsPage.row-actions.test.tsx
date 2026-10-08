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
  addRuntimeProject,
  RUNTIME_ID,
  RUNTIME_REPO_ID,
  RUNTIME_SELF_FILTER,
  settleHostQueries
} from './automations-page-test-harness'
import { makeAutomation, makeRun } from './automations-page-fixtures'
import { selfScopedList } from './automations-page-runtime-fixtures'
import type { applyAutomationViewerAction } from '../../runtime/automation-viewer-controller'

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
  const view = render(
    <TooltipProvider>
      <Page />
    </TooltipProvider>
  )
  return { view, Page }
}

async function reviewed() {
  const state = (await apply({ kind: 'row-form', action: { kind: 'get' } })).rowForm
  if (!state?.rows[0]) {
    throw new Error('missing displayed row')
  }
  return { state, row: state.rows[0] }
}
it('waits for the native dispatch acknowledgement and blocks competing viewer mutations', async () => {
  let finish!: (value: ReturnType<typeof makeRun>) => void
  api.automations.runNow.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve
    })
  )
  await mountPage()
  await settleHostQueries()
  const { state, row } = await reviewed()
  let pending: ReturnType<typeof apply> | undefined
  let settled = false
  await act(async () => {
    pending = apply({
      kind: 'row-form',
      action: { kind: 'run', reviewedTarget: state.reviewedTarget, rowKey: row.rowKey }
    })
    void pending.then(() => {
      settled = true
    })
  })
  expect(settled).toBe(false)
  expect((await apply({ kind: 'get' })).rowActions).toMatchObject({ busy: true, outcome: null })
  for (const action of [
    { kind: 'query', value: 'competing' },
    { kind: 'delete-form', action: { kind: 'request', source: 'local', rowKey: row.rowKey } }
  ] as const) {
    await expect(apply(action)).rejects.toThrow('viewer_busy')
  }
  await act(async () => {
    finish(makeRun())
  })
  await expect(pending).resolves.toMatchObject({
    rowForm: {
      busy: false,
      lastRowKey: row.rowKey,
      outcome: { mutation: 'acknowledged', refresh: 'completed', notice: null }
    }
  })
  expect(api.automations.runNow).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ id: row.definition.id })
  )
})
it('uses the real row menu Pause and CLI Resume against the same definition', async () => {
  const original = makeAutomation()
  const paused = { ...original, enabled: false }
  mocks.renderRealList = true
  api.automations.update
    .mockImplementationOnce(async () => {
      api.automations.list.mockResolvedValue([paused])
      api.automations.listScoped.mockResolvedValue(selfScopedList([paused]))
      return paused
    })
    .mockImplementationOnce(async () => {
      api.automations.list.mockResolvedValue([original])
      api.automations.listScoped.mockResolvedValue(selfScopedList([original]))
      return original
    })
  await mountPage()
  await settleHostQueries()
  const before = await reviewed()
  fireEvent.keyDown(screen.getByRole('button', { name: 'Automation actions' }), { key: 'Enter' })
  fireEvent.click(screen.getByRole('menuitem', { name: 'Pause' }))
  await waitFor(async () => {
    expect((await reviewed()).row.definition.enabled).toBe(false)
  })
  await expect(
    apply({
      kind: 'row-form',
      action: {
        kind: 'toggle',
        reviewedTarget: before.state.reviewedTarget,
        rowKey: before.row.rowKey
      }
    })
  ).rejects.toThrow('viewer_target_changed')
  const { state, row } = await reviewed()
  let pending: ReturnType<typeof apply> | undefined
  await act(async () => {
    pending = apply({
      kind: 'row-form',
      action: { kind: 'toggle', reviewedTarget: state.reviewedTarget, rowKey: row.rowKey }
    })
  })
  await expect(pending).resolves.toMatchObject({
    rowForm: {
      rows: [{ definition: { enabled: true } }],
      outcome: { mutation: 'acknowledged', refresh: 'completed' }
    }
  })
  expect(api.automations.update).toHaveBeenNthCalledWith(
    1,
    expect.objectContaining({ id: original.id, updates: { enabled: false } })
  )
  expect(api.automations.update).toHaveBeenNthCalledWith(
    2,
    expect.objectContaining({ id: original.id, updates: { enabled: true } })
  )
})
it('rejects an in-flight runtime result after pairing changes and keeps it busy until transport settles', async () => {
  runtimeHost([makeAutomation({ projectId: RUNTIME_REPO_ID, workspaceMode: 'new_per_run' })], [])
  addRuntimeProject()
  mocks.state.automationHostFilter = RUNTIME_SELF_FILTER
  let finish!: (value: { run: ReturnType<typeof makeRun> }) => void
  const transport = new Promise<{ run: ReturnType<typeof makeRun> }>((resolve) => {
    finish = resolve
  })
  const original = mocks.callRuntimeRpc.getMockImplementation()
  mocks.callRuntimeRpc.mockImplementation((...args) =>
    args[1] === 'automation.runNow' ? transport : original?.(...args)
  )
  const { view, Page } = await mountPage()
  await settleHostQueries()
  const { state, row } = await reviewed()
  let pending: ReturnType<typeof apply> | undefined
  await act(async () => {
    pending = apply({
      kind: 'row-form',
      action: { kind: 'run', reviewedTarget: state.reviewedTarget, rowKey: row.rowKey }
    })
    void pending.catch(() => undefined)
  })
  expect(
    mocks.callRuntimeRpc.mock.calls.filter((call) => call[1] === 'automation.runNow')
  ).toHaveLength(1)
  mocks.state.runtimeEnvironments = [
    { id: RUNTIME_ID, name: 'GPU box', createdAt: 1, pairingRevision: 9 }
  ]
  view.rerender(
    <TooltipProvider>
      <Page />
    </TooltipProvider>
  )
  await expect(pending).rejects.toThrow('viewer_target_changed')
  expect((await apply({ kind: 'get' })).rowActions).toMatchObject({ busy: true, outcome: null })
  await act(async () => {
    finish({ run: makeRun() })
  })
  expect((await apply({ kind: 'get' })).rowActions).toMatchObject({
    busy: false,
    outcome: null,
    lastRowKey: null
  })
  expect(
    mocks.callRuntimeRpc.mock.calls.find((call) => call[1] === 'automation.runNow')?.[3]
  ).toMatchObject({ expectedEnvironmentPairingRevision: 4 })
})
it('rejects unmounted requests immediately and never exposes their late acknowledgement', async () => {
  let finish!: (value: ReturnType<typeof makeRun>) => void
  api.automations.runNow.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve
    })
  )
  const { view } = await mountPage()
  await settleHostQueries()
  const { state, row } = await reviewed()
  let pending: ReturnType<typeof apply> | undefined
  await act(async () => {
    pending = apply({
      kind: 'row-form',
      action: { kind: 'run', reviewedTarget: state.reviewedTarget, rowKey: row.rowKey }
    })
    void pending.catch(() => undefined)
  })
  view.unmount()
  await expect(pending).rejects.toThrow('viewer_unmounted')
  await act(async () => {
    finish(makeRun())
  })
  await expect(apply({ kind: 'get' })).rejects.toThrow('viewer_unavailable')
})

it('keeps an acknowledged toggle separate from a failed page refresh', async () => {
  await mountPage()
  await settleHostQueries()
  const { state, row } = await reviewed()
  api.automations.list.mockRejectedValue(new Error('read unavailable'))
  let pending: ReturnType<typeof apply> | undefined
  await act(async () => {
    pending = apply({
      kind: 'row-form',
      action: { kind: 'toggle', reviewedTarget: state.reviewedTarget, rowKey: row.rowKey }
    })
  })
  await expect(pending).resolves.toMatchObject({
    rowForm: { outcome: { mutation: 'acknowledged', refresh: 'failed', notice: null } }
  })
  expect(api.automations.update).toHaveBeenCalledTimes(1)
})
it.each([
  ['owner', 'This automation changed hosts: automation_owner_changed', 'refused'],
  ['transport', 'network unavailable', 'unconfirmed']
] as const)(
  'reports %s dispatch refusal separately without a success acknowledgement',
  async (_kind, message, mutation) => {
    await mountPage()
    await settleHostQueries()
    const { state, row } = await reviewed()
    api.automations.runNow.mockRejectedValue(new Error(message))
    let pending: ReturnType<typeof apply> | undefined
    await act(async () => {
      pending = apply({
        kind: 'row-form',
        action: { kind: 'run', reviewedTarget: state.reviewedTarget, rowKey: row.rowKey }
      })
    })
    await expect(pending).resolves.toMatchObject({
      rowForm: {
        outcome: { mutation, refresh: 'skipped', notice: { message: expect.any(String) } }
      }
    })
    expect(api.ui.get).not.toHaveBeenCalled()
  }
)
it('refuses unavailable execution before dispatching a run', async () => {
  const automation = makeAutomation({ projectId: 'missing-project', workspaceMode: 'new_per_run' })
  api.automations.list.mockResolvedValue([automation])
  api.automations.listScoped.mockResolvedValue(selfScopedList([automation]))
  await mountPage()
  await settleHostQueries()
  const { state, row } = await reviewed()
  let pending: ReturnType<typeof apply> | undefined
  await act(async () => {
    pending = apply({
      kind: 'row-form',
      action: { kind: 'run', reviewedTarget: state.reviewedTarget, rowKey: row.rowKey }
    })
  })
  await expect(pending).resolves.toMatchObject({
    rowForm: { outcome: { mutation: 'refused', refresh: 'skipped' } }
  })
  expect(api.automations.runNow).not.toHaveBeenCalled()
})
it('rejects hidden rows, stale visible-list reviews and editor modal conflicts', async () => {
  await mountPage()
  await settleHostQueries()
  const { state, row } = await reviewed()
  await expect(
    apply({
      kind: 'row-form',
      action: { kind: 'toggle', reviewedTarget: state.reviewedTarget, rowKey: 'unlisted-key' }
    })
  ).rejects.toThrow('automation_row_not_visible')
  let pending: ReturnType<typeof apply> | undefined
  await act(async () => {
    pending = apply({ kind: 'query', value: 'no-matching-automation-fixture' })
  })
  await pending
  await expect(
    apply({
      kind: 'row-form',
      action: { kind: 'run', reviewedTarget: state.reviewedTarget, rowKey: row.rowKey }
    })
  ).rejects.toThrow('viewer_target_changed')
  const hidden = (await apply({ kind: 'row-form', action: { kind: 'get' } })).rowForm
  if (!hidden) {
    throw new Error('missing row viewer')
  }
  expect(hidden.rows).toEqual([])
  await expect(
    apply({
      kind: 'row-form',
      action: { kind: 'toggle', reviewedTarget: hidden.reviewedTarget, rowKey: row.rowKey }
    })
  ).rejects.toThrow('automation_row_not_visible')
  await act(async () => {
    pending = apply({ kind: 'editor-create' })
  })
  await pending
  const modal = (await apply({ kind: 'row-form', action: { kind: 'get' } })).rowForm
  if (!modal) {
    throw new Error('missing modal row viewer')
  }
  expect(modal.modalOpen).toBe(true)
  await expect(
    apply({
      kind: 'row-form',
      action: { kind: 'toggle', reviewedTarget: modal.reviewedTarget, rowKey: row.rowKey }
    })
  ).rejects.toThrow('viewer_modal_open')
  expect(api.automations.update).not.toHaveBeenCalled()
  expect(api.automations.runNow).not.toHaveBeenCalled()
})
