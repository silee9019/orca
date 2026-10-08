import { externalAutomationJobKey } from './external-automation-scope-keys'
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
import { makeExternalManager, makeExternalAutomationScope } from './automations-page-fixtures'
import type { ExternalAutomationRun } from '../../../../shared/automations-types'
import type { applyAutomationViewerAction } from '../../runtime/automation-viewer-controller'
installAutomationsPageHarness()
afterEach(cleanup)
let apply: typeof applyAutomationViewerAction
const run: ExternalAutomationRun = {
  id: 'external-run',
  managerId: 'hermes:local',
  provider: 'hermes',
  jobId: 'job-1',
  runAt: '2026-10-08T10:00:00.000Z',
  status: 'completed',
  outputPreview: 'External run preview',
  outputContent: 'External result',
  error: null,
  outputPath: null
}
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
async function mountExternalRun(sshTargetId?: string, openRun = true, runCount = 1) {
  if (sshTargetId) {
    mocks.state.sshTargetLabels = new Map([[sshTargetId, sshTargetId]])
    mocks.state.sshTargetGenerations = new Map([[sshTargetId, 1]])
    mocks.state.sshConnectionStates = new Map([[sshTargetId, { status: 'connected' }]])
    mocks.state.automationHostFilter = {
      kind: 'host',
      host: { authority: { kind: 'desktop' }, selector: { kind: 'ssh', targetId: sshTargetId } }
    }
  }
  vi.resetModules()
  vi.doUnmock('./AutomationsDetailPane')
  const manager = makeExternalManager()
  const job = manager.jobs[0]
  if (!job) {
    throw new Error('missing job')
  }
  job.runs = Array.from({ length: runCount }, (_value, index) =>
    index === 0
      ? run
      : { ...run, id: `external-run-${index}`, outputPreview: `External ${index} preview` }
  )
  job.runCount = runCount
  api.automations.listExternalManagerForOwner.mockImplementation(async ({ provider }) => ({
    manager: provider === 'hermes' ? manager : null,
    error: null,
    updatedAt: 1
  }))
  api.automations.listExternalRunsForOwner.mockImplementation(async ({ page, pageSize }) => ({
    runs: job.runs.slice((page - 1) * pageSize, page * pageSize),
    total: runCount
  }))
  const [{ default: Page }, controller] = await Promise.all([
    import('./AutomationsPage'),
    import('../../runtime/automation-viewer-controller')
  ])
  apply = controller.applyAutomationViewerAction
  const markup = () => (
    <TooltipProvider>
      <Page />
    </TooltipProvider>
  )
  const view = render(markup())
  await settleHostQueries()
  const state = await apply({ kind: 'get' })
  const rowKey = state.visibleRowKeys.find((key) => key.includes('job-1'))
  if (!rowKey) {
    throw new Error('missing external row')
  }
  await request({ kind: 'select', source: 'external', rowKey })
  await settleHostQueries()
  await waitFor(() =>
    expect(screen.getByRole('button', { name: /External run preview/ })).toBeTruthy()
  )
  if (openRun) {
    fireEvent.click(screen.getByRole('button', { name: /External run preview/ }))
    await settleHostQueries()
    await waitFor(async () =>
      expect((await apply({ kind: 'get' })).runPage?.source).toBe('external')
    )
  }
  return { ...view, redraw: () => view.rerender(markup()) }
}
it('clears the same scoped external run through native Frame back and public root back', async () => {
  await mountExternalRun()
  const before = (await request({ kind: 'run-page-form', action: { kind: 'get' } })).runPageForm
  expect(before).toMatchObject({
    source: 'external',
    runId: 'external-run',
    canRerun: false,
    canOpenWorkspace: false
  })
  fireEvent.click(screen.getByRole('button', { name: 'Back to runs' }))
  await settleHostQueries()
  expect((await apply({ kind: 'get' })).runPage).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: /External run preview/ }))
  await settleHostQueries()
  const current = (await request({ kind: 'run-page-form', action: { kind: 'get' } })).runPageForm
  if (!before || !current) {
    throw new Error('missing review')
  }
  await expect(
    request({
      kind: 'run-page-form',
      action: { kind: 'back', reviewedTarget: before.reviewedTarget }
    })
  ).rejects.toThrow('viewer_target_changed')
  await expect(
    request({
      kind: 'run-page-form',
      action: { kind: 'rerun', reviewedTarget: current.reviewedTarget }
    })
  ).rejects.toThrow('automation_run_action_unavailable')
  const result = await request({
    kind: 'run-page-form',
    action: { kind: 'back', reviewedTarget: current.reviewedTarget }
  })
  expect(result.runPageForm).toMatchObject({
    source: 'external',
    closed: true,
    completed: { action: 'back' }
  })
  expect(result.runPage).toBeNull()
  expect(screen.getByRole('button', { name: /External run preview/ })).toBeTruthy()
})
it('rejects a held review across profile changes and a fresh review while a modal is open', async () => {
  const view = await mountExternalRun()
  const before = (await request({ kind: 'run-page-form', action: { kind: 'get' } })).runPageForm
  if (!before) {
    throw new Error('missing review')
  }
  await act(async () => {
    mocks.state.activeOrcaProfileId = 'changed'
    view.redraw()
  })
  await expect(
    request({
      kind: 'run-page-form',
      action: { kind: 'back', reviewedTarget: before.reviewedTarget }
    })
  ).rejects.toThrow('viewer_target_changed')
  await act(async () => {
    mocks.state.activeModal = 'worktree-palette'
    view.redraw()
  })
  const current = (await request({ kind: 'run-page-form', action: { kind: 'get' } })).runPageForm
  if (!current) {
    throw new Error('missing review')
  }
  await expect(
    request({
      kind: 'run-page-form',
      action: { kind: 'back', reviewedTarget: current.reviewedTarget }
    })
  ).rejects.toThrow('viewer_modal_open')
})
it('preserves the captured SSH scope when manager and run IDs match local IDs', async () => {
  await mountExternalRun('ssh-test')
  const current = (await request({ kind: 'run-page-form', action: { kind: 'get' } })).runPageForm
  if (!current) {
    throw new Error('missing review')
  }
  const scope = makeExternalAutomationScope({
    owner: {
      authority: { kind: 'desktop' },
      selector: { kind: 'ssh', targetId: 'ssh-test', targetGeneration: 1 }
    }
  })
  expect(current.rowKey).toBe(externalAutomationJobKey(scope, 'job-1'))
  await expect(
    request({
      kind: 'run-page-form',
      action: { kind: 'back', reviewedTarget: current.reviewedTarget }
    })
  ).resolves.toMatchObject({
    runPageForm: { source: 'external', closed: true, completed: { action: 'back' } }
  })
})

it('opens the scoped external detail page from a reviewed public root table selection', async () => {
  await mountExternalRun('ssh-test', false)
  const table = (await apply({ kind: 'get' })).externalRunTables[0]
  if (!table) {
    throw new Error('missing external table')
  }
  const result = await request({
    kind: 'external-runs-form',
    tableKey: table.tableKey,
    action: { kind: 'select', runId: run.id, reviewedTarget: table.reviewedTarget }
  })
  expect(result.externalRunsForm).toMatchObject({
    closed: true,
    selectedRunId: run.id,
    completed: { kind: 'select', openRequested: true }
  })
  expect(result.runPage).toMatchObject({
    source: 'external',
    runId: run.id,
    rowKey: table.tableKey
  })
  expect(screen.getByText('External result')).toBeTruthy()
  expect(api.automations.listExternalRunsForOwner).toHaveBeenCalledWith(
    expect.objectContaining({
      owner: expect.objectContaining({
        selector: expect.objectContaining({ kind: 'ssh', targetId: 'ssh-test' })
      })
    })
  )
})

it('pages the mounted external table through the public root with the captured SSH owner', async () => {
  await mountExternalRun('ssh-test', false, 16)
  const table = (await apply({ kind: 'get' })).externalRunTables[0]
  if (!table) {
    throw new Error('missing external table')
  }
  const result = await request({
    kind: 'external-runs-form',
    tableKey: table.tableKey,
    action: { kind: 'page', direction: 'next', reviewedTarget: table.reviewedTarget }
  })
  expect(result.externalRunsForm).toMatchObject({
    page: 1,
    loading: false,
    readStatus: 'loaded',
    visibleRunIds: Array.from({ length: 8 }, (_, i) => `external-run-${i + 8}`)
  })
  expect(api.automations.listExternalRunsForOwner).toHaveBeenLastCalledWith(
    expect.objectContaining({
      page: 2,
      pageSize: 8,
      owner: expect.objectContaining({
        selector: expect.objectContaining({ kind: 'ssh', targetId: 'ssh-test' })
      })
    })
  )
  expect(screen.getByRole('button', { name: /External 8 preview/ })).toBeTruthy()
  expect(screen.queryByRole('button', { name: /External run preview/ })).toBeNull()
})
