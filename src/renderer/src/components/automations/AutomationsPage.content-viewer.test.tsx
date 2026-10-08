// @vitest-environment happy-dom
import { act } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { TooltipProvider } from '../ui/tooltip'
import {
  installAutomationsPageHarness,
  api,
  mocks,
  settleHostQueries
} from './automations-page-test-harness'
import { makeExternalManager } from './automations-page-fixtures'
import type { ExternalAutomationRun } from '../../../../shared/automations-types'
import type { applyAutomationViewerAction } from '../../runtime/automation-viewer-controller'
installAutomationsPageHarness()
beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(180)
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(80)
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})
vi.mock('@/components/sidebar/CommentMarkdown', () => ({
  default: ({ content }: { content: string }) => <p>{content}</p>
}))
let apply: typeof applyAutomationViewerAction
const run: ExternalAutomationRun = {
  id: 'external-run',
  managerId: 'hermes:local',
  provider: 'hermes',
  jobId: 'job-1',
  runAt: '2026-10-08T10:00:00.000Z',
  status: 'completed',
  outputPreview: 'External run preview',
  outputContent: '## Prompt\nprivate external prompt\n\n## Trace\nprivate trace',
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

it('uses root disclosure actions for the actual SSH external run output and fences late reviews', async () => {
  await mountExternalRun('ssh-disclosure')
  const first = (await apply({ kind: 'get' })).contentDisclosures.find(
    (target) => target.label === 'Prompt'
  )
  if (!first) {
    throw new Error('missing prompt')
  }
  expect(first.kind).toBe('hermes-output')
  expect(JSON.stringify(first)).not.toContain('private external prompt')
  expect(screen.queryByText('private external prompt')).toBeNull()
  const expanded = await request({
    kind: 'content-disclosure',
    expanded: true,
    reviewedTarget: first.reviewedTarget
  })
  expect(expanded.contentDisclosure?.expanded).toBe(true)
  expect(screen.getByText('private external prompt')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Prompt' }))
  expect(screen.queryByText('private external prompt')).toBeNull()
  await expect(
    request({ kind: 'content-disclosure', expanded: true, reviewedTarget: first.reviewedTarget })
  ).rejects.toThrow('viewer_target_changed')
  const back = (await apply({ kind: 'get' })).runPage
  if (!back) {
    throw new Error('missing run')
  }
  await request({
    kind: 'run-page-form',
    action: { kind: 'back', reviewedTarget: back.reviewedTarget }
  })
  await expect(
    request({ kind: 'content-disclosure', expanded: true, reviewedTarget: first.reviewedTarget })
  ).rejects.toThrow('viewer_unavailable')
})
it('uses root disclosure actions for the actual local detail prompt', async () => {
  vi.resetModules()
  vi.doUnmock('./AutomationsDetailPane')
  const [{ default: Page }, controller] = await Promise.all([
    import('./AutomationsPage'),
    import('../../runtime/automation-viewer-controller')
  ])
  apply = controller.applyAutomationViewerAction
  render(
    <TooltipProvider>
      <Page />
    </TooltipProvider>
  )
  await settleHostQueries()
  const rowKey = (await apply({ kind: 'get' })).visibleRowKeys[0]
  if (!rowKey) {
    throw new Error('missing local row')
  }
  await request({ kind: 'select', source: 'local', rowKey })
  await settleHostQueries()
  const first = (await apply({ kind: 'get' })).contentDisclosures.find(
    (target) => target.kind === 'prompt'
  )
  if (!first) {
    throw new Error('missing local prompt')
  }
  fireEvent.click(screen.getByRole('button', { name: 'Show more' }))
  const current = (await apply({ kind: 'get' })).contentDisclosures.find(
    (target) => target.kind === 'prompt'
  )
  if (!current) {
    throw new Error('missing local prompt')
  }
  expect(current.expanded).toBe(true)
  const collapsed = await request({
    kind: 'content-disclosure',
    expanded: false,
    reviewedTarget: current.reviewedTarget
  })
  expect(collapsed.contentDisclosure?.expanded).toBe(false)
  expect(screen.getByRole('button', { name: 'Show more' }).getAttribute('aria-expanded')).toBe(
    'false'
  )
})
