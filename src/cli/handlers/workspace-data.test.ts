import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RuntimeClient, RuntimeClientError } from '../runtime-client'
import type { HandlerContext } from '../dispatch'
import { WORKSPACE_FILE_HANDLERS } from './workspace-file'
import { WORKSPACE_GIT_HANDLERS } from './workspace-git'
import { WORKSPACE_FOLDER_HANDLERS } from './workspace-folder'

let directory: string
let inputFile: string
let client: RuntimeClient
let ctx: HandlerContext

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'orca-workspace-data-'))
  inputFile = join(directory, 'input.json')
  client = new RuntimeClient(directory)
  ctx = { client, cwd: directory, json: true, flags: new Map([['params-file', inputFile]]) }
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(async () => {
  vi.restoreAllMocks()
  await rm(directory, { recursive: true, force: true })
})

describe('workspace CLI targets and input validation', () => {
  it('rejects a missing write content before contacting the runtime without echoing input', async () => {
    await writeFile(
      inputFile,
      JSON.stringify({ worktree: 'ssh:fixture', relativePath: 'a', secret: 'canary' })
    )
    const call = vi.spyOn(client, 'call')
    await expect(WORKSPACE_FILE_HANDLERS['file write'](ctx)).rejects.toThrow('Invalid input')
    expect(call).not.toHaveBeenCalled()
    expect(console.log).not.toHaveBeenCalled()
  })

  it('sends an explicit empty file to the selected host and observes the fixture bytes', async () => {
    const target = join(directory, 'empty.txt')
    await writeFile(target, 'before')
    await writeFile(
      inputFile,
      JSON.stringify({
        worktree: 'id:ssh-host::/srv/folder',
        relativePath: 'empty.txt',
        content: '',
        expectedExecutionHostId: 'ssh:fixture'
      })
    )
    const call = vi.spyOn(client, 'call').mockImplementation(async (method, params) => {
      expect(method).toBe('files.write')
      expect(params).toEqual({
        worktree: 'id:ssh-host::/srv/folder',
        relativePath: 'empty.txt',
        content: '',
        expectedExecutionHostId: 'ssh:fixture'
      })
      await writeFile(target, '')
      return { id: 'test', _meta: { runtimeId: 'fixture' }, ok: true, result: {} }
    })
    await WORKSPACE_FILE_HANDLERS['file write'](ctx)
    expect(call).toHaveBeenCalledTimes(1)
    expect(await readFile(target, 'utf8')).toBe('')
  })

  it('requires exact workspace confirmation before discarding changes', async () => {
    await writeFile(
      inputFile,
      JSON.stringify({ worktree: 'id:fixture::/srv/repo', filePaths: ['a', 'b'] })
    )
    const call = vi
      .spyOn(client, 'call')
      .mockResolvedValue({ id: 'test', _meta: { runtimeId: 'fixture' }, ok: true, result: {} })
    await expect(WORKSPACE_GIT_HANDLERS['git discard'](ctx)).rejects.toThrow('--confirm')
    expect(call).not.toHaveBeenCalled()
    ctx.flags.set('confirm', 'id:fixture::/srv/repo')
    await WORKSPACE_GIT_HANDLERS['git discard'](ctx)
    expect(call).toHaveBeenCalledWith('git.bulkDiscard', {
      worktree: 'id:fixture::/srv/repo',
      filePaths: ['a', 'b']
    })
  })

  it('rejects a flag-shaped branch before Git receives it', async () => {
    await writeFile(
      inputFile,
      JSON.stringify({ worktree: 'path:/repo', baseRef: '--upload-pack=bad' })
    )
    const call = vi.spyOn(client, 'call')
    await expect(WORKSPACE_GIT_HANDLERS['git rebase'](ctx)).rejects.toThrow('Invalid input')
    expect(call).not.toHaveBeenCalled()
  })

  it('creates a folder workspace without resolving a Git repository', async () => {
    await writeFile(
      inputFile,
      JSON.stringify({
        projectGroupId: 'group',
        folderPath: '/srv/plain-folder',
        connectionId: 'ssh:fixture',
        name: 'notes'
      })
    )
    const call = vi.spyOn(client, 'call').mockResolvedValue({
      id: 'test',
      _meta: { runtimeId: 'fixture' },
      ok: true,
      result: { folderWorkspace: { id: 'folder-1' } }
    })
    await WORKSPACE_FOLDER_HANDLERS['folder-workspace create'](ctx)
    expect(call).toHaveBeenCalledWith('folderWorkspace.create', {
      projectGroupId: 'group',
      folderPath: '/srv/plain-folder',
      connectionId: 'ssh:fixture',
      name: 'notes'
    })
  })

  it('propagates unavailable old-peer methods without retrying a write', async () => {
    await writeFile(
      inputFile,
      JSON.stringify({ projectGroupId: 'group', folderPath: '/srv/folder' })
    )
    const call = vi
      .spyOn(client, 'call')
      .mockRejectedValue(new RuntimeClientError('method_not_found', 'Old host'))
    await expect(WORKSPACE_FOLDER_HANDLERS['folder-workspace create'](ctx)).rejects.toMatchObject({
      code: 'method_not_found'
    })
    expect(call).toHaveBeenCalledTimes(1)
  })
})
