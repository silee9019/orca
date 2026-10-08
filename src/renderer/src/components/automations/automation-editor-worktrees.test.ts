import { expect, it } from 'vitest'
import { getAutomationEditorWorktrees } from './automation-editor-worktrees'
import { makeStoreState, makeWorktree, REPO_ID } from './automations-page-fixtures'
import { toSshExecutionHostId, toRuntimeExecutionHostId } from '../../../../shared/execution-host'

it('keeps native, SSH and runtime ownership separate and retains the runtime owner fallback', () => {
  const repo = makeStoreState().repoMap.get(REPO_ID)
  if (!repo) {
    throw new Error('missing repo')
  }
  const local = makeWorktree()
  const ssh = makeWorktree({ id: 'ssh', hostId: toSshExecutionHostId('server') })
  const runtime = makeWorktree({ id: 'runtime', hostId: toRuntimeExecutionHostId('gpu') })
  const fallback = makeWorktree({
    id: 'fallback',
    hostId: 'local',
    runtimeOwnerEnvironmentId: 'gpu'
  })
  const candidates = [local, ssh, runtime, fallback]
  expect(getAutomationEditorWorktrees(undefined, candidates)).toEqual([])
  expect(getAutomationEditorWorktrees(repo, candidates)).toEqual([local, fallback])
  expect(getAutomationEditorWorktrees({ ...repo, connectionId: 'server' }, candidates)).toEqual([
    local,
    ssh
  ])
  expect(
    getAutomationEditorWorktrees(
      { ...repo, executionHostId: toRuntimeExecutionHostId('gpu') },
      candidates
    )
  ).toEqual([local, runtime, fallback])
  expect(getAutomationEditorWorktrees({ ...repo, kind: 'folder' }, [local])).toEqual([local])
})
