import type * as GitCommandTarget from '../../runtime-git-command-target'
import { expect, it, vi } from 'vitest'
import { RuntimeGitGenerationCommands } from '../../runtime-git-generation-commands'

const route = vi.hoisted(() => vi.fn())
vi.mock('../../runtime-git-command-target', async (importOriginal) => ({
  ...(await importOriginal<typeof GitCommandTarget>()),
  runtimeGitRouteForTarget: route
}))

it('does not acknowledge either remote generation cancellation when its provider is unavailable', async () => {
  route.mockReturnValue({ kind: 'ssh', connectionId: 'fixture', provider: null })
  const commands = new RuntimeGitGenerationCommands({
    resolveRuntimeGitTarget: vi
      .fn()
      .mockResolvedValue({ worktree: { path: '/remote' }, executionHostId: 'ssh:fixture' }),
    getRuntimeSettings: vi.fn()
  })
  await expect(commands.cancelRuntimeGenerateCommitMessage('id:fixture')).rejects.toThrow(
    'Remote connection dropped'
  )
  await expect(commands.cancelRuntimeGeneratePullRequestFields('id:fixture')).rejects.toThrow(
    'Remote connection dropped'
  )
  const cancel = vi.fn().mockResolvedValue(undefined)
  route.mockReturnValue({
    kind: 'ssh',
    connectionId: 'fixture',
    provider: { cancelGenerateCommitMessage: cancel }
  })
  await commands.cancelRuntimeGenerateCommitMessage('id:fixture')
  await commands.cancelRuntimeGeneratePullRequestFields('id:fixture')
  expect(cancel.mock.calls).toEqual([
    ['/remote', 'commit-message'],
    ['/remote', 'pull-request-fields']
  ])
})
