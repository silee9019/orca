// @vitest-environment happy-dom
import { act } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { TooltipProvider } from '../ui/tooltip'
import {
  installAutomationsPageHarness,
  api,
  mocks,
  settleHostQueries
} from './automations-page-test-harness'
import { makeExternalManager } from './automations-page-fixtures'
import type { applyAutomationViewerAction } from '../../runtime/automation-viewer-controller'
installAutomationsPageHarness()
afterEach(cleanup)
let apply: typeof applyAutomationViewerAction
async function request(action: Parameters<typeof apply>[0]) {
  let promise: ReturnType<typeof apply> | undefined
  await act(async () => {
    promise = apply(action)
    void promise.catch(() => undefined)
  })
  if (!promise) {
    throw new Error('missing request')
  }
  return promise
}
async function mount(enabled: boolean) {
  vi.resetModules()
  mocks.renderRealList = true
  mocks.state.sshTargetLabels = new Map([['ssh-test', 'SSH test']])
  mocks.state.sshTargetGenerations = new Map([['ssh-test', 1]])
  mocks.state.sshConnectionStates = new Map([['ssh-test', { status: 'connected' }]])
  mocks.state.automationHostFilter = {
    kind: 'host',
    host: { authority: { kind: 'desktop' }, selector: { kind: 'ssh', targetId: 'ssh-test' } }
  }
  const manager = makeExternalManager()
  manager.jobs = manager.jobs.map((job) => ({ ...job, enabled }))
  api.automations.listExternalManagerForOwner.mockImplementation(async ({ provider }) => ({
    manager: provider === 'hermes' ? manager : null,
    error: null,
    updatedAt: 1
  }))
  api.automations.runExternalActionForOwner.mockResolvedValue(undefined)
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
  await settleHostQueries()
  const rowKey = (await apply({ kind: 'get' })).visibleRowKeys.find((key) => key.includes('job-1'))
  const job = manager.jobs[0]
  if (!rowKey || !job) {
    throw new Error('missing external row')
  }
  return { view, rowKey, name: job.name }
}
it.each([
  ['dropdown', 'Edit'],
  ['context', 'Edit'],
  ['dropdown', 'Delete'],
  ['context', 'Delete'],
  ['dropdown', 'Run Now'],
  ['context', 'Run Now'],
  ['dropdown', 'Pause'],
  ['context', 'Pause'],
  ['dropdown', 'Resume'],
  ['context', 'Resume']
] as const)('shares the external %s %s target with the public root action', async (menu, label) => {
  const native = await mount(label !== 'Resume')
  if (menu === 'dropdown') {
    fireEvent.keyDown(screen.getByRole('button', { name: 'Automation actions' }), { key: 'Enter' })
  } else {
    const row = screen.getByText(native.name).closest('[role="button"]')
    if (!row) {
      throw new Error('missing actual external row')
    }
    fireEvent.contextMenu(row, { clientX: 20, clientY: 20 })
  }
  fireEvent.click(screen.getByRole('menuitem', { name: label }))
  await settleHostQueries()
  if (label === 'Edit' || label === 'Delete') {
    const before = await apply({ kind: 'get' })
    const target =
      label === 'Edit'
        ? before.editor
        : {
            rowKey: before.deletion?.rowKey,
            definitionId: before.deletion?.definitionId,
            open: before.deletion?.open
          }
    expect(target.open).toBe(true)
    native.view.unmount()
    await mount(true)
    const result = await request(
      label === 'Edit'
        ? { kind: 'editor-edit', source: 'external', rowKey: native.rowKey }
        : {
            kind: 'delete-form',
            action: { kind: 'request', source: 'external', rowKey: native.rowKey }
          }
    )
    expect(
      label === 'Edit'
        ? result.editor
        : {
            rowKey: result.deletion?.rowKey,
            definitionId: result.deletion?.definitionId,
            open: result.deletion?.open
          }
    ).toEqual(target)
    expect(api.automations.runExternalActionForOwner).not.toHaveBeenCalled()
  } else {
    await waitFor(() => expect(api.automations.runExternalActionForOwner).toHaveBeenCalledTimes(1))
    const nativeArgs = api.automations.runExternalActionForOwner.mock.calls[0]?.[0]
    expect(nativeArgs).toMatchObject({
      action: label === 'Run Now' ? 'run' : label === 'Pause' ? 'pause' : 'resume',
      owner: { selector: { kind: 'ssh', targetId: 'ssh-test', targetGeneration: 1 } }
    })
    native.view.unmount()
    await mount(label !== 'Resume')
    api.automations.runExternalActionForOwner.mockClear()
    const review = (await apply({ kind: 'row-form', action: { kind: 'get' } })).rowForm
    if (!review) {
      throw new Error('missing review')
    }
    const result = await request({
      kind: 'row-form',
      action: {
        kind: label === 'Run Now' ? 'run' : 'toggle',
        rowKey: native.rowKey,
        reviewedTarget: review.reviewedTarget
      }
    })
    expect(result.rowForm?.outcome?.mutation).toBe('acknowledged')
    expect(api.automations.runExternalActionForOwner).toHaveBeenCalledExactlyOnceWith(nativeArgs)
  }
  expect(api.automations.delete).not.toHaveBeenCalled()
})
