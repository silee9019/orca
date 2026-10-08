import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { createRuntimeFileCommands } from '../../src/main/runtime/orca-runtime-files-test-harness'
import { RuntimeClient } from '../../src/cli/runtime-client'
import { WORKSPACE_FILE_HANDLERS } from '../../src/cli/handlers/workspace-file'
import type { HandlerContext } from '../../src/cli/dispatch'
import {
  FileCopy,
  FileDelete,
  FileMutationOpen,
  FileRename,
  FileWrite
} from '../../src/shared/rpc-contract/files-mutation-params'

vi.mock('../../src/main/ipc/filesystem-auth', () => ({
  resolveAuthorizedPath: async (path: string) => path
}))

let directory: string | undefined
afterEach(async () => {
  vi.restoreAllMocks()
  if (directory) {
    await rm(directory, { recursive: true, force: true })
  }
})

it('persists CLI create, write, copy, rename and delete through the existing runtime file service', async () => {
  directory = await mkdtemp(join(tmpdir(), 'orca-cli-file-effect-'))
  const { commands } = createRuntimeFileCommands({ path: directory })
  const input = join(directory, 'input.json')
  const client = new RuntimeClient(directory)
  const ctx: HandlerContext = {
    client,
    cwd: directory,
    json: true,
    flags: new Map([['params-file', input]])
  }
  const call = vi.spyOn(client, 'call').mockImplementation(async (method, payload) => {
    let result: unknown
    switch (method) {
      case 'files.createFile': {
        const p = FileMutationOpen.parse(payload)
        result = await commands.createFileExplorerFile(
          p.worktree,
          p.relativePath,
          undefined,
          undefined,
          p.expectedExecutionHostId
        )
        break
      }
      case 'files.write': {
        const p = FileWrite.parse(payload)
        result = await commands.writeFileExplorerFile(
          p.worktree,
          p.relativePath,
          p.content,
          undefined,
          undefined,
          p.expectedExecutionHostId
        )
        break
      }
      case 'files.copy': {
        const p = FileCopy.parse(payload)
        result = await commands.copyFileExplorerPath(
          p.worktree,
          p.sourceRelativePath,
          p.destinationRelativePath,
          undefined,
          undefined,
          p.expectedExecutionHostId
        )
        break
      }
      case 'files.rename': {
        const p = FileRename.parse(payload)
        result = await commands.renameFileExplorerPath(
          p.worktree,
          p.oldRelativePath,
          p.newRelativePath,
          undefined,
          undefined,
          p.expectedExecutionHostId
        )
        break
      }
      case 'files.delete': {
        const p = FileDelete.parse(payload)
        result = await commands.deleteFileExplorerPath(
          p.worktree,
          p.relativePath,
          p.recursive,
          undefined,
          undefined,
          p.expectedExecutionHostId
        )
        break
      }
      default:
        throw new Error(`Unexpected fixture method: ${method}`)
    }
    return { id: 'fixture', ok: true, result, _meta: { runtimeId: 'isolated-fixture' } }
  })
  vi.spyOn(console, 'log').mockImplementation(() => {})
  const worktree = 'id:folder:fixture'
  const expectedExecutionHostId = 'local'
  await writeFile(
    input,
    JSON.stringify({ worktree, expectedExecutionHostId, relativePath: 'notes.md' })
  )
  await WORKSPACE_FILE_HANDLERS['file create'](ctx)
  expect(await readFile(join(directory, 'notes.md'), 'utf8')).toBe('')

  await writeFile(
    input,
    JSON.stringify({
      worktree,
      expectedExecutionHostId,
      relativePath: 'notes.md',
      content: 'CLI 효과'
    })
  )
  await WORKSPACE_FILE_HANDLERS['file write'](ctx)
  expect(await readFile(join(directory, 'notes.md'), 'utf8')).toBe('CLI 효과')

  await writeFile(
    input,
    JSON.stringify({
      worktree,
      expectedExecutionHostId,
      sourceRelativePath: 'notes.md',
      destinationRelativePath: 'copy.md'
    })
  )
  await WORKSPACE_FILE_HANDLERS['file copy'](ctx)
  expect(await readFile(join(directory, 'copy.md'), 'utf8')).toBe('CLI 효과')
  await expect(WORKSPACE_FILE_HANDLERS['file copy'](ctx)).rejects.toThrow()
  expect(await readFile(join(directory, 'copy.md'), 'utf8')).toBe('CLI 효과')

  await writeFile(
    input,
    JSON.stringify({
      worktree,
      expectedExecutionHostId,
      oldRelativePath: 'copy.md',
      newRelativePath: 'moved.md'
    })
  )
  await WORKSPACE_FILE_HANDLERS['file rename'](ctx)
  expect(await readFile(join(directory, 'moved.md'), 'utf8')).toBe('CLI 효과')
  await expect(readFile(join(directory, 'copy.md'))).rejects.toMatchObject({ code: 'ENOENT' })

  await writeFile(
    input,
    JSON.stringify({
      worktree,
      expectedExecutionHostId,
      relativePath: '../outside.md',
      content: 'blocked'
    })
  )
  await expect(WORKSPACE_FILE_HANDLERS['file write'](ctx)).rejects.toThrow()

  await writeFile(
    input,
    JSON.stringify({ worktree, expectedExecutionHostId, relativePath: 'moved.md' })
  )
  ctx.flags.set('confirm', worktree)
  await WORKSPACE_FILE_HANDLERS['file delete'](ctx)
  await expect(readFile(join(directory, 'moved.md'))).rejects.toMatchObject({ code: 'ENOENT' })
  expect(await readFile(join(directory, 'notes.md'), 'utf8')).toBe('CLI 효과')
  expect(call).toHaveBeenCalledTimes(7)
  expect(relative(tmpdir(), directory)).not.toMatch(/^\.\./)
})
