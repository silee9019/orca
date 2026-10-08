import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { RuntimeClient } from '../runtime-client'
import type { HandlerContext } from '../dispatch'
import { WORKSPACE_CATALOG_HANDLERS } from './workspace-catalog'
let directory: string | undefined
afterEach(async () => {
  vi.restoreAllMocks()
  if (directory) {
    await rm(directory, { recursive: true, force: true })
  }
})
it('requires the exact host, branch and head before deleting a preserved branch', async () => {
  directory = await mkdtemp(join(tmpdir(), 'orca-cli-catalog-'))
  const input = join(directory, 'input.json')
  const client = new RuntimeClient(directory)
  const params = {
    worktree: 'id:repo::/srv/folder',
    hostId: 'ssh:fixture',
    branchName: 'feature',
    expectedHead: 'abc123'
  }
  await writeFile(input, JSON.stringify(params))
  const ctx: HandlerContext = {
    client,
    cwd: directory,
    json: true,
    flags: new Map([['params-file', input]])
  }
  const call = vi.spyOn(client, 'call').mockResolvedValue({
    id: 'fixture',
    ok: true,
    result: { deleted: true },
    _meta: { runtimeId: 'fixture' }
  })
  vi.spyOn(console, 'log').mockImplementation(() => {})
  ctx.flags.set('confirm', params.worktree)
  await expect(WORKSPACE_CATALOG_HANDLERS['worktree delete-preserved-branch'](ctx)).rejects.toThrow(
    '--confirm'
  )
  expect(call).not.toHaveBeenCalled()
  ctx.flags.set(
    'confirm',
    `${params.worktree}:${params.hostId}:${params.branchName}:${params.expectedHead}`
  )
  await WORKSPACE_CATALOG_HANDLERS['worktree delete-preserved-branch'](ctx)
  expect(call).toHaveBeenCalledWith('worktree.forceDeleteBranch', params)
  await writeFile(input, JSON.stringify({ ...params, hostId: undefined }))
  await expect(WORKSPACE_CATALOG_HANDLERS['worktree delete-preserved-branch'](ctx)).rejects.toThrow(
    'Invalid input'
  )
  expect(call).toHaveBeenCalledTimes(1)
})
