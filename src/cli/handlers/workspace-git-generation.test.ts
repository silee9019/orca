import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { RuntimeClient } from '../runtime-client'
import type { HandlerContext } from '../dispatch'
import { WORKSPACE_GIT_GENERATION_HANDLERS } from './workspace-git-generation'

let directory: string
let input: string
let ctx: HandlerContext
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'orca-workspace-provider-'))
  input = join(directory, 'input.json')
  ctx = {
    client: new RuntimeClient(directory),
    cwd: directory,
    json: true,
    flags: new Map([['params-file', input]])
  }
  vi.spyOn(console, 'log').mockImplementation(() => {})
})
afterEach(async () => {
  vi.restoreAllMocks()
  await rm(directory, { recursive: true, force: true })
})

it('keeps generation on the selected host and rejects an unsuccessful generation without leaking its error', async () => {
  const params = { worktree: 'id:ssh:fixture' }
  await writeFile(input, JSON.stringify(params))
  const call = vi.spyOn(ctx.client, 'call').mockResolvedValue({
    id: 'fixture',
    ok: true,
    result: { success: false, error: 'canary-token' },
    _meta: { runtimeId: 'fixture' }
  })
  await expect(
    WORKSPACE_GIT_GENERATION_HANDLERS['git generate-commit-message'](ctx)
  ).rejects.toMatchObject({ code: 'operation_failed' })
  expect(call).toHaveBeenCalledWith('git.generateCommitMessage', params)
  expect(console.log).not.toHaveBeenCalled()
})

it('requires the precise worktree before cancellation and preserves old-peer errors without retry', async () => {
  await writeFile(input, JSON.stringify({ worktree: 'id:fixture' }))
  const call = vi.spyOn(ctx.client, 'call').mockRejectedValue(new Error('old peer'))
  await expect(WORKSPACE_GIT_GENERATION_HANDLERS['git cancel-commit-message'](ctx)).rejects.toThrow(
    '--confirm'
  )
  expect(call).not.toHaveBeenCalled()
  ctx.flags.set('confirm', 'id:fixture')
  await expect(WORKSPACE_GIT_GENERATION_HANDLERS['git cancel-commit-message'](ctx)).rejects.toThrow(
    'old peer'
  )
  expect(call).toHaveBeenCalledTimes(1)
})

it('rejects an empty model-discovery agent before RPC', async () => {
  await writeFile(input, JSON.stringify({ worktree: 'id:fixture', agentId: '' }))
  const call = vi.spyOn(ctx.client, 'call')
  await expect(
    WORKSPACE_GIT_GENERATION_HANDLERS['git discover-commit-models'](ctx)
  ).rejects.toMatchObject({ code: 'invalid_argument' })
  expect(call).not.toHaveBeenCalled()
})
