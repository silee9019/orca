// @vitest-environment happy-dom
import { act, useState } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { mocks, installAutomationsPageHarness } from './automations-page-test-harness'
import { makeStoreState, REPO_ID } from './automations-page-fixtures'
import type { Repo } from '../../../../shared/repo-types'
import { AutomationProjectViewerActionSchema } from '../../../../shared/automation-project-viewer-command'
import {
  applyAutomationProjectViewerAction as apply,
  automationProjectViewerSnapshot
} from '../../runtime/automation-project-viewer-controller'
import Picker from './AutomationProjectCombobox'

installAutomationsPageHarness()
afterEach(cleanup)
function repos(): Repo[] {
  const repo = makeStoreState().repoMap.get(REPO_ID)
  if (!repo) {
    throw new Error('fixture missing')
  }
  return [
    { ...repo, id: 'local', upstream: { owner: 'orca', repo: 'orca' } },
    {
      ...repo,
      id: 'ssh',
      path: '/remote/orca',
      connectionId: 'builder',
      upstream: { owner: 'orca', repo: 'orca' }
    },
    { ...repo, id: 'other', displayName: 'Other', path: '/other' }
  ]
}
function Field({ allowAddProject = true }: { allowAddProject?: boolean }) {
  const [value, setValue] = useState('local')
  return (
    <Picker
      repos={repos()}
      value={value}
      onValueChange={setValue}
      allowAddProject={allowAddProject}
    />
  )
}
async function run(action: Record<string, unknown>) {
  const current = await apply({ kind: 'get' })
  let request: ReturnType<typeof apply> | undefined
  await act(async () => {
    request = apply(
      AutomationProjectViewerActionSchema.parse({
        reviewedTarget: current.reviewedTarget,
        ...action
      })
    )
    void request.catch(() => undefined)
  })
  return request
}
it('uses mounted controls for search, command, host menu, delayed hover, focus and host selection', async () => {
  render(<Field />)
  expect((await apply({ kind: 'get' })).open).toBe(false)
  await run({ kind: 'open', value: true })
  expect(screen.getByPlaceholderText('Search projects/folders...')).toBeTruthy()
  const held = await apply({ kind: 'get' })
  expect(
    (await run({ kind: 'query', value: 'Other' }))?.groups.map((group) => group.commandValue)
  ).toEqual(['other'])
  await expect(
    apply({ kind: 'select', reviewedTarget: held.reviewedTarget, repoId: 'ssh' })
  ).rejects.toThrow('viewer_target_changed')
  await expect(run({ kind: 'select', repoId: 'ssh' })).rejects.toThrow(
    'automation_project_not_visible'
  )
  await run({ kind: 'query', value: '' })
  expect((await run({ kind: 'command', repoId: 'other' }))?.commandValue).toBe('other')
  const projectKey = (await apply({ kind: 'get' })).groups.find(
    (group) => group.sources.length === 2
  )?.key
  if (!projectKey) {
    throw new Error('group missing')
  }
  expect((await run({ kind: 'host-menu', projectKey }))?.hostMenuProjectKey).toBe(projectKey)
  await run({ kind: 'host-menu', projectKey: null })
  await run({ kind: 'host-hover', projectKey, region: 'row', hovered: true })
  const leaving = run({ kind: 'host-hover', projectKey, region: 'row', hovered: false })
  await waitFor(() => expect(automationProjectViewerSnapshot()?.busy).toBe(true))
  await expect(run({ kind: 'query', value: 'Other' })).rejects.toThrow('viewer_busy')
  expect((await leaving)?.hostMenuProjectKey).toBeNull()
  expect((await run({ kind: 'focus' }))?.outcome).toEqual({ action: 'focus', focused: true })
  expect((await run({ kind: 'select', repoId: 'ssh' }))?.value).toBe('ssh')
  expect((await apply({ kind: 'get' })).open).toBe(false)
})
it('native row search and selection reach the same mounted state as CLI actions', async () => {
  const view = render(<Field />)
  fireEvent.click(screen.getByRole('combobox'))
  const input = screen.getByPlaceholderText('Search projects/folders...')
  fireEvent.change(input, { target: { value: 'Other' } })
  await waitFor(() => expect(automationProjectViewerSnapshot()?.query).toBe('Other'))
  fireEvent.click(screen.getByRole('button', { name: /Other/ }))
  const native = await apply({ kind: 'get' })
  view.unmount()
  render(<Field />)
  await run({ kind: 'open', value: true })
  await run({ kind: 'query', value: 'Other' })
  const cli = await run({ kind: 'select', repoId: 'other' })
  expect(cli).toMatchObject({
    value: native.value,
    open: native.open,
    query: native.query,
    hostMenuProjectKey: native.hostMenuProjectKey
  })
})
it('adds the explicit path through the existing store and waits for workspace fetch', async () => {
  const added = repos()[2]
  if (!added) {
    throw new Error('fixture missing')
  }
  const add = vi.fn().mockResolvedValue(added)
  const native = vi.fn().mockResolvedValue(added)
  const fetch = vi.fn().mockResolvedValue(undefined)
  mocks.state.addRepoPath = add
  mocks.state.addRepo = native
  mocks.state.fetchWorktrees = fetch
  const view = render(<Field />)
  await run({ kind: 'open', value: true })
  const result = await run({ kind: 'add', path: '/chosen/project' })
  expect(add).toHaveBeenCalledExactlyOnceWith('/chosen/project', 'git', {
    runtimeEnvironmentId: null
  })
  expect(native).not.toHaveBeenCalled()
  expect(fetch).toHaveBeenCalledExactlyOnceWith('other')
  expect(result?.outcome).toEqual({
    action: 'add',
    result: { operation: 'added', repoId: 'other', selected: true, workspaceRead: 'loaded' },
    reviewStatus: 'current'
  })
  view.unmount()
  render(<Field />)
  fireEvent.click(screen.getByRole('combobox'))
  fireEvent.click(screen.getByRole('button', { name: 'Add project' }))
  await waitFor(() => expect(automationProjectViewerSnapshot()?.value).toBe('other'))
  expect(native).toHaveBeenCalledOnce()
})
it('preserves cancellation and refuses hidden addition, malformed paths and excessive UTF-8 queries', async () => {
  mocks.state.addRepoPath = vi.fn().mockResolvedValue(null)
  const view = render(<Field />)
  await run({ kind: 'open', value: true })
  expect((await run({ kind: 'add', path: '/cancel' }))?.outcome).toMatchObject({
    result: { operation: 'not-added', selected: false }
  })
  view.rerender(<Field allowAddProject={false} />)
  await expect(run({ kind: 'add', path: '/hidden' })).rejects.toThrow(
    'automation_project_add_unavailable'
  )
  const review = (await apply({ kind: 'get' })).reviewedTarget
  for (const action of [
    { kind: 'query', value: '한'.repeat(683) },
    { kind: 'add', path: '' },
    { kind: 'get', path: '/extra' }
  ]) {
    expect(
      AutomationProjectViewerActionSchema.safeParse({ reviewedTarget: review, ...action }).success
    ).toBe(false)
  }
})
it('retains addition acknowledgement after workspace-read failure', async () => {
  mocks.state.addRepoPath = vi.fn().mockResolvedValue(repos()[2])
  mocks.state.fetchWorktrees = vi.fn().mockRejectedValue(new Error('read failed'))
  render(<Field />)
  await run({ kind: 'open', value: true })
  expect((await run({ kind: 'add', path: '/added' }))?.outcome).toMatchObject({
    result: { operation: 'added', repoId: 'other', selected: false, workspaceRead: 'failed' }
  })
  expect((await apply({ kind: 'get' })).value).toBe('local')
})
it('latches profile replacement and return while addition is delayed', async () => {
  let complete: ((repo: Repo) => void) | undefined
  mocks.state.addRepoPath = vi.fn(
    () =>
      new Promise<Repo>((resolve) => {
        complete = resolve
      })
  )
  mocks.state.fetchWorktrees = vi.fn().mockResolvedValue(undefined)
  mocks.state.activeOrcaProfileId = 'owner-1'
  const view = render(<Field />)
  await run({ kind: 'open', value: true })
  const request = run({ kind: 'add', path: '/slow' })
  await waitFor(() => expect(automationProjectViewerSnapshot()?.isAdding).toBe(true))
  mocks.state.activeOrcaProfileId = 'owner-2'
  view.rerender(<Field />)
  mocks.state.activeOrcaProfileId = 'owner-1'
  view.rerender(<Field />)
  const repo = repos()[2]
  if (!complete || !repo) {
    throw new Error('completion missing')
  }
  const finish = complete
  await act(async () => {
    finish(repo)
  })
  expect((await request)?.outcome).toMatchObject({
    reviewStatus: 'changed',
    result: { operation: 'added', selected: false }
  })
  expect((await apply({ kind: 'get' })).value).toBe('local')
})
it('rejects unmount and ignores delayed addition selection', async () => {
  let complete: ((repo: Repo) => void) | undefined
  mocks.state.addRepoPath = vi.fn(
    () =>
      new Promise<Repo>((resolve) => {
        complete = resolve
      })
  )
  mocks.state.fetchWorktrees = vi.fn().mockResolvedValue(undefined)
  const view = render(<Field />)
  await run({ kind: 'open', value: true })
  const request = run({ kind: 'add', path: '/slow' })
  void request.catch(() => undefined)
  await waitFor(() => expect(automationProjectViewerSnapshot()?.isAdding).toBe(true))
  view.unmount()
  await expect(request).rejects.toThrow('viewer_unmounted')
  const repo = repos()[2]
  if (!complete || !repo) {
    throw new Error('completion missing')
  }
  const finish = complete
  await act(async () => {
    finish(repo)
  })
  expect(automationProjectViewerSnapshot()).toBeNull()
})
