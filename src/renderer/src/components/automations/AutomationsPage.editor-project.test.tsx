import type { ProjectHostSetup } from '../../../../shared/project-types'
// @vitest-environment happy-dom
import { act } from 'react'
import { cleanup, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { mocks, installAutomationsPageHarness } from './automations-page-test-harness'
import { makeStoreState, makeWorktree, REPO_ID } from './automations-page-fixtures'
import { toSshExecutionHostId } from '../../../../shared/execution-host'

vi.mock('./AutomationEditorPromptEditor', () => ({
  AutomationEditorPromptEditor: () => null,
  getAutomationPromptEditorRoot: () => null
}))
afterEach(cleanup)
installAutomationsPageHarness()
function addProject(worktrees: ReturnType<typeof makeWorktree>[]) {
  const fixture = makeStoreState()
  const original = fixture.repoMap.get(REPO_ID)
  if (!original) {
    throw new Error('missing fixture')
  }
  const setup: ProjectHostSetup = {
    id: 'setup-1',
    projectId: 'project-1',
    hostId: 'local',
    repoId: REPO_ID,
    path: original.path,
    displayName: original.displayName,
    setupState: 'ready',
    setupMethod: 'legacy-repo',
    createdAt: 1,
    updatedAt: 1
  }
  const repo = { ...original, id: 'repo-2', path: '/repos/second', displayName: 'second' }
  mocks.state.repos = [original, repo]
  mocks.state.projectHostSetups = [
    setup,
    { ...setup, id: 'setup-2', projectId: 'project-2', repoId: repo.id, path: repo.path }
  ]
  mocks.state.worktreesByRepo = { [REPO_ID]: [makeWorktree()], [repo.id]: worktrees }
  mocks.repoMap.set(repo.id, repo)
}
async function mountPage() {
  vi.resetModules()
  vi.doUnmock('./AutomationEditorDialog')
  const [
    { default: Page },
    { applyAutomationViewerAction: apply },
    { AutomationViewerActionSchema: schema }
  ] = await Promise.all([
    import('./AutomationsPage'),
    import('../../runtime/automation-viewer-controller'),
    import('../../../../shared/automation-viewer-command')
  ])
  const view = render(<Page />)
  let request: ReturnType<typeof apply> | undefined
  await act(async () => {
    request = apply({ kind: 'editor-create' })
  })
  await request
  return { view, apply, schema }
}
it('uses the actual project callback and chooses only workspaces owned by its displayed host', async () => {
  const foreign = makeWorktree({
    id: 'foreign',
    repoId: 'repo-2',
    hostId: toSshExecutionHostId('other')
  })
  const local = makeWorktree({ id: 'second-local', repoId: 'repo-2', isMainWorktree: false })
  addProject([foreign, local])
  const fetch = vi.fn().mockResolvedValue(undefined)
  mocks.state.fetchWorktrees = fetch
  const { view, apply, schema } = await mountPage()
  try {
    const editor = (await apply({ kind: 'editor-form', action: { kind: 'get' } })).editorForm
    if (!editor) {
      throw new Error('missing editor')
    }
    await expect(
      apply(
        schema.parse({
          kind: 'editor-form',
          action: { kind: 'project', reviewedTarget: editor.reviewedTarget, projectId: 'unlisted' }
        })
      )
    ).rejects.toThrow('automation_project_unavailable')
    let request: ReturnType<typeof apply> | undefined
    await act(async () => {
      request = apply(
        schema.parse({
          kind: 'editor-form',
          action: { kind: 'project', reviewedTarget: editor.reviewedTarget, projectId: 'repo-2' }
        })
      )
    })
    await expect(request).resolves.toMatchObject({
      editorForm: { draft: { projectId: 'repo-2', workspaceId: 'second-local', baseBranch: '' } }
    })
    expect(fetch).toHaveBeenCalledExactlyOnceWith('repo-2', undefined)
    const workspace = (
      await apply({
        kind: 'editor-form',
        action: {
          kind: 'workspace-form',
          reviewedTarget: editor.reviewedTarget,
          action: { kind: 'get' }
        }
      })
    ).editorForm?.workspace
    expect(workspace?.workspaceIds).toEqual(['second-local'])
  } finally {
    view.unmount()
  }
})
it('ignores an earlier project fetch after close and reopen on the same project', async () => {
  addProject([])
  const completions: (() => void)[] = []
  mocks.state.fetchWorktrees = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        completions.push(resolve)
      })
  )
  const { view, apply, schema } = await mountPage()
  try {
    const editor = (await apply({ kind: 'editor-form', action: { kind: 'get' } })).editorForm
    if (!editor) {
      throw new Error('missing editor')
    }
    let request: ReturnType<typeof apply> | undefined
    await act(async () => {
      request = apply(
        schema.parse({
          kind: 'editor-form',
          action: { kind: 'project', reviewedTarget: editor.reviewedTarget, projectId: 'repo-2' }
        })
      )
    })
    await request
    await act(async () => {
      request = apply({
        kind: 'editor-form',
        action: { kind: 'close', reviewedTarget: editor.reviewedTarget }
      })
    })
    await request
    await act(async () => {
      request = apply({ kind: 'editor-create' })
    })
    await request
    const next = (await apply({ kind: 'editor-form', action: { kind: 'get' } })).editorForm
    if (!next) {
      throw new Error('missing reopened editor')
    }
    await act(async () => {
      request = apply(
        schema.parse({
          kind: 'editor-form',
          action: { kind: 'project', reviewedTarget: next.reviewedTarget, projectId: 'repo-2' }
        })
      )
    })
    await request
    expect(completions).toHaveLength(2)
    const workspace = makeWorktree({ id: 'loaded-second', repoId: 'repo-2' })
    mocks.state.worktreesByRepo = { [REPO_ID]: [makeWorktree()], 'repo-2': [workspace] }
    const old = completions[0]
    const current = completions[1]
    if (!old || !current) {
      throw new Error('missing fetch completions')
    }
    await act(async () => {
      old()
      await Promise.resolve()
    })
    expect(
      (await apply({ kind: 'editor-form', action: { kind: 'get' } })).editorForm?.draft.workspaceId
    ).toBe('')
    await act(async () => {
      current()
      await Promise.resolve()
    })
    expect(
      (await apply({ kind: 'editor-form', action: { kind: 'get' } })).editorForm?.draft.workspaceId
    ).toBe('loaded-second')
  } finally {
    view.unmount()
  }
})

it('ignores an earlier A selection after switching to B and back to A', async () => {
  addProject([])
  const completions: (() => void)[] = []
  mocks.state.fetchWorktrees = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        completions.push(resolve)
      })
  )
  const { view, apply, schema } = await mountPage()
  try {
    const editor = (await apply({ kind: 'editor-form', action: { kind: 'get' } })).editorForm
    if (!editor) {
      throw new Error('missing editor')
    }
    for (const projectId of ['repo-2', REPO_ID, 'repo-2']) {
      let request: ReturnType<typeof apply> | undefined
      await act(async () => {
        request = apply(
          schema.parse({
            kind: 'editor-form',
            action: { kind: 'project', reviewedTarget: editor.reviewedTarget, projectId }
          })
        )
      })
      await request
    }
    expect(completions).toHaveLength(3)
    mocks.state.worktreesByRepo = {
      [REPO_ID]: [makeWorktree()],
      'repo-2': [makeWorktree({ id: 'latest-a', repoId: 'repo-2' })]
    }
    const first = completions[0]
    const last = completions[2]
    if (!first || !last) {
      throw new Error('missing fetch completions')
    }
    await act(async () => {
      first()
      await Promise.resolve()
    })
    expect(
      (await apply({ kind: 'editor-form', action: { kind: 'get' } })).editorForm?.draft.workspaceId
    ).toBe('')
    await act(async () => {
      last()
      await Promise.resolve()
    })
    expect(
      (await apply({ kind: 'editor-form', action: { kind: 'get' } })).editorForm?.draft.workspaceId
    ).toBe('latest-a')
  } finally {
    view.unmount()
  }
})
