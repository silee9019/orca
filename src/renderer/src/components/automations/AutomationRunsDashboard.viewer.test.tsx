// @vitest-environment happy-dom
import { act } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { TooltipProvider } from '../ui/tooltip'
import { AutomationRunsDashboard } from './AutomationRunsDashboard'
import { makeAutomation, makeRun } from './automations-page-fixtures'
import type { AutomationListRow } from './automation-list-row-identity'
import { buildAutomationRunsDashboardEntries } from './automation-runs-dashboard-model'
import { applyAutomationRunsViewerAction as apply } from '../../runtime/automation-runs-viewer-controller'

const local: AutomationListRow = {
  key: 'local-row',
  hostLabel: 'Local Mac',
  usageSummary: null,
  catalogRef: { authority: { kind: 'desktop' }, selector: { kind: 'self' } },
  automation: makeAutomation({ id: 'local-definition', name: 'Alpha' })
}
const remote: AutomationListRow = {
  key: 'remote-row',
  hostLabel: 'Build server',
  usageSummary: null,
  catalogRef: {
    authority: { kind: 'runtime', environmentId: 'build' },
    selector: { kind: 'self' }
  },
  automation: makeAutomation({ id: 'remote-definition', name: 'Beta' })
}
const entries = buildAutomationRunsDashboardEntries(
  [local, remote],
  new Map([
    [
      local.key,
      [makeRun({ id: 'local-run', title: 'Alpha run', scheduledFor: 10, status: 'completed' })]
    ],
    [
      remote.key,
      [
        makeRun({
          id: 'remote-run',
          title: 'Beta run',
          scheduledFor: 20,
          status: 'dispatch_failed'
        })
      ]
    ]
  ])
)
const onRefresh = vi.fn()
const onLoadMore = vi.fn()
const onOpenRun = vi.fn()
function mount() {
  return render(
    <TooltipProvider>
      <AutomationRunsDashboard
        rows={[local, remote]}
        entries={entries}
        failures={[]}
        loading={false}
        hasMore={false}
        now={30}
        onRefresh={onRefresh}
        onLoadMore={onLoadMore}
        onOpenRun={onOpenRun}
      />
    </TooltipProvider>
  )
}
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

it('shares actual search and status menu state with committed CLI filters', async () => {
  mount()
  const input = screen.getByRole('textbox', { name: 'Search runs…' })
  if (!(input instanceof HTMLInputElement)) {
    throw new Error('missing runs search input')
  }
  fireEvent.change(input, { target: { value: 'Alpha' } })
  expect((await apply({ kind: 'get' })).entries.map((entry) => entry.run.id)).toEqual(['local-run'])
  let pending: ReturnType<typeof apply> | undefined
  await act(async () => {
    pending = apply({ kind: 'query', value: '' })
  })
  await expect(pending).resolves.toMatchObject({ query: '', querySettled: true })
  expect(input.value).toBe('')
  fireEvent.keyDown(screen.getByRole('button', { name: 'Filters' }), { key: 'Enter' })
  fireEvent.keyDown(screen.getByRole('menuitem', { name: 'Status' }), { key: 'ArrowRight' })
  fireEvent.click(await screen.findByRole('menuitemradio', { name: 'Failed' }))
  expect((await apply({ kind: 'get' })).entries.map((entry) => entry.run.id)).toEqual([
    'remote-run'
  ])
  await act(async () => {
    pending = apply({ kind: 'status', value: 'successful' })
  })
  await expect(pending).resolves.toMatchObject({
    status: 'successful',
    entries: [{ run: { id: 'local-run' } }]
  })
  expect(onRefresh).not.toHaveBeenCalled()
  expect(onLoadMore).not.toHaveBeenCalled()
  expect(onOpenRun).not.toHaveBeenCalled()
})

it('shares the actual host checkbox and rejects unknown host keys', async () => {
  mount()
  const before = await apply({ kind: 'get' })
  const host = before.hosts.find((host) => host.label === 'Build server')
  if (!host) {
    throw new Error('missing host option')
  }
  fireEvent.keyDown(screen.getByRole('button', { name: 'Filters' }), { key: 'Enter' })
  fireEvent.keyDown(screen.getByRole('menuitem', { name: 'Host' }), { key: 'ArrowRight' })
  fireEvent.click(await screen.findByRole('menuitemcheckbox', { name: 'Build server' }))
  expect((await apply({ kind: 'get' })).hostKeys).toEqual([host.key])
  let pending: ReturnType<typeof apply> | undefined
  await act(async () => {
    pending = apply({ kind: 'host-toggle', value: host.key })
  })
  await expect(pending).resolves.toMatchObject({ hostKeys: [] })
  expect(
    screen.getByRole('menuitemcheckbox', { name: 'Build server' }).getAttribute('aria-checked')
  ).toBe('false')
  await act(async () => {
    pending = apply({ kind: 'hosts', values: [host.key] })
  })
  await expect(pending).resolves.toMatchObject({ entries: [{ run: { id: 'remote-run' } }] })
  await act(async () => {
    pending = apply({ kind: 'hosts-clear' })
  })
  await expect(pending).resolves.toMatchObject({ hostKeys: [] })
  await expect(apply({ kind: 'host-toggle', value: 'not-an-option' })).rejects.toThrow(
    'automation_runs_host_not_loaded'
  )
})

it('rejects unmount before a deferred query commit and ambiguous mounted dashboards', async () => {
  const first = mount()
  const second = mount()
  await expect(apply({ kind: 'get' })).rejects.toThrow('viewer_ambiguous')
  second.unmount()
  let pending: ReturnType<typeof apply> | undefined
  act(() => {
    pending = apply({ kind: 'query', value: 'Beta' })
    void pending.catch(() => undefined)
    first.unmount()
  })
  await expect(pending).rejects.toThrow('viewer_unmounted')
  await expect(apply({ kind: 'get' })).rejects.toThrow('viewer_unavailable')
})
