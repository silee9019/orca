// @vitest-environment happy-dom
import { act } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { TooltipProvider } from '../ui/tooltip'
import {
  installAutomationsPageHarness,
  api,
  mocks,
  settleHostQueries,
  scopedList
} from './automations-page-test-harness'
import { makeAutomation, makeRun } from './automations-page-fixtures'
import type { applyAutomationViewerAction } from '../../runtime/automation-viewer-controller'
import type { AppState } from '@/store'

vi.mock('@tanstack/react-virtual', async () => {
  const { createVirtualizerStub } = await import('./virtualizer-test-stub')
  return { useVirtualizer: createVirtualizerStub() }
})
installAutomationsPageHarness()
afterEach(() => {
  cleanup()
  api.automations.listRuns.mockReset()
})
let apply: typeof applyAutomationViewerAction
async function mountPage() {
  vi.resetModules()
  const [{ default: Page }, controller] = await Promise.all([
    import('./AutomationsPage'),
    import('../../runtime/automation-viewer-controller')
  ])
  apply = controller.applyAutomationViewerAction
  mocks.state.setSelectedAutomationId = (id: string | null) => {
    mocks.state.selectedAutomationId = id
  }
  mocks.state.setPendingAutomationRunNavigation = (
    value: AppState['pendingAutomationRunNavigation']
  ) => {
    mocks.state.pendingAutomationRunNavigation = value
  }
  const view = render(
    <TooltipProvider>
      <Page />
    </TooltipProvider>
  )
  await settleHostQueries()
  let pending: ReturnType<typeof apply> | undefined
  await act(async () => {
    pending = apply({ kind: 'view', value: 'runs' })
  })
  await pending
  await settleHostQueries()
  return view
}
async function reviewed() {
  await waitFor(async () => expect((await apply({ kind: 'get' })).runs?.loading).toBe(false))
  const state = (await apply({ kind: 'get' })).runs
  if (!state) {
    throw new Error('Missing runs dashboard')
  }
  return state
}

it('opens the same run through its actual row and public reviewed entry', async () => {
  api.automations.listRuns.mockResolvedValue([makeRun({ id: 'visible-run', title: 'Visible run' })])
  await mountPage()
  await reviewed()
  fireEvent.click(screen.getByTestId('automation-runs-row'))
  await settleHostQueries()
  await waitFor(async () =>
    expect((await apply({ kind: 'get' })).runNavigation?.runId).toBe('visible-run')
  )
  const ui = (await apply({ kind: 'get' })).runNavigation
  let pending: ReturnType<typeof apply> | undefined
  await act(async () => {
    pending = apply({ kind: 'navigate', value: 'runs' })
  })
  await pending
  await settleHostQueries()
  const before = await reviewed()
  const entry = before.entries[0]
  if (!entry) {
    throw new Error('Missing visible run')
  }
  await act(async () => {
    pending = apply({
      kind: 'runs-open',
      entryKey: entry.key,
      reviewedTarget: before.reviewedTarget
    })
  })
  await expect(pending).resolves.toMatchObject({ view: 'run', detailOpen: true, runNavigation: ui })
  expect(api.automations.runNow).not.toHaveBeenCalled()
  expect(api.automations.update).not.toHaveBeenCalled()
})

it('rejects stale and hidden entries without opening a run', async () => {
  api.automations.listRuns.mockResolvedValue([makeRun({ id: 'visible-run' })])
  await mountPage()
  const before = await reviewed()
  let pending: ReturnType<typeof apply> | undefined
  await act(async () => {
    pending = apply({ kind: 'runs-form', action: { kind: 'query', value: 'hidden' } })
  })
  await pending
  await expect(
    apply({
      kind: 'runs-open',
      entryKey: before.entries[0]!.key,
      reviewedTarget: before.reviewedTarget
    })
  ).rejects.toThrow('viewer_target_changed')
  const current = await reviewed()
  await expect(
    apply({ kind: 'runs-open', entryKey: 'missing', reviewedTarget: current.reviewedTarget })
  ).rejects.toThrow('automation_run_not_visible')
  expect((await apply({ kind: 'get' })).view).toBe('runs')
})

function prepareSecondRun(id: string) {
  const run = makeRun({ id, automationId: 'second-auto' })
  const automations = [makeAutomation(), makeAutomation({ id: 'second-auto', name: 'Second' })]
  scopedList(automations)
  api.automations.list.mockResolvedValue(automations)
  api.automations.listRuns.mockImplementation(async (input) =>
    input.automationId === 'second-auto' ? [run] : []
  )
  return run
}

it('waits for hydrated history and blocks competing mutations until the run commits', async () => {
  const run = prepareSecondRun('delayed-run')
  await mountPage()
  const before = await reviewed()
  let finish!: (runs: ReturnType<typeof makeRun>[]) => void
  api.automations.listRuns.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      })
  )
  let pending: ReturnType<typeof apply> | undefined
  let settled = false
  await act(async () => {
    pending = apply({
      kind: 'runs-open',
      entryKey: before.entries[0]!.key,
      reviewedTarget: before.reviewedTarget
    })
    void pending.then(() => {
      settled = true
    })
  })
  expect(settled).toBe(false)
  expect((await apply({ kind: 'get' })).runNavigation?.busy).toBe(true)
  await expect(apply({ kind: 'query', value: 'competing' })).rejects.toThrow('viewer_busy')
  await act(async () => {
    finish([run])
  })
  await expect(pending).resolves.toMatchObject({
    view: 'run',
    runNavigation: { runId: 'delayed-run', busy: false }
  })
})

it('rejects a missing run instead of acknowledging the temporary run skeleton', async () => {
  prepareSecondRun('gone-run')
  await mountPage()
  const before = await reviewed()
  api.automations.listRuns.mockResolvedValueOnce([])
  let pending: ReturnType<typeof apply> | undefined
  await act(async () => {
    pending = apply({
      kind: 'runs-open',
      entryKey: before.entries[0]!.key,
      reviewedTarget: before.reviewedTarget
    })
    void pending.catch(() => undefined)
  })
  await expect(pending).rejects.toThrow('automation_run_navigation_failed')
  expect((await apply({ kind: 'get' })).runNavigation?.busy).toBe(false)
})

it('rejects an unmounted parent while its history request remains pending', async () => {
  const run = prepareSecondRun('late-run')
  const view = await mountPage()
  const before = await reviewed()
  let finish!: (runs: ReturnType<typeof makeRun>[]) => void
  api.automations.listRuns.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      })
  )
  let pending: ReturnType<typeof apply> | undefined
  await act(async () => {
    pending = apply({
      kind: 'runs-open',
      entryKey: before.entries[0]!.key,
      reviewedTarget: before.reviewedTarget
    })
    void pending.catch(() => undefined)
  })
  view.unmount()
  await expect(pending).rejects.toThrow('viewer_unmounted')
  await act(async () => {
    finish([run])
  })
  await expect(apply({ kind: 'get' })).rejects.toThrow('viewer_unavailable')
})
