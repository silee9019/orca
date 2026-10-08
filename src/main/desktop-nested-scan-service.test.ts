import './runtime/rpc/unused-default-rpc-methods.test-fixture'
import { mkdtemp, mkdir, readdir, readFile, lstat, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { IFilesystemProvider } from './providers/types'
import type { SshGitProvider } from './providers/ssh-git-provider'
vi.mock('./providers/ssh-filesystem-dispatch', () => ({
  getSshFilesystemProvider: (id: string) => (id === 'nested-scan-fixture' ? files : undefined)
}))
vi.mock('./providers/ssh-git-dispatch', () => ({
  getSshGitProvider: (id: string) => (id === 'nested-scan-fixture' ? git : undefined)
}))
import {
  registerDesktopNestedScanForRpc,
  type DesktopNestedScanService
} from './desktop-nested-scan-service'
import { setDesktopNestedScanForRpc } from './runtime/rpc/methods/workspace-nested-scan'
import { DesktopNestedScanStart } from '../shared/rpc-contract/workspace-nested-scan-params'
import { setSshConnectionGeneration } from './ssh/ssh-connection-generation'
let directory: string, service: DesktopNestedScanService
let files: Pick<IFilesystemProvider, 'readDir' | 'readFile' | 'stat'> | undefined
let git: Pick<SshGitProvider, 'isGitRepoAsync'> | undefined
let generation = 1000
function start() {
  return service.start(
    DesktopNestedScanStart.parse({
      expectedExecutionHostId: 'local',
      expectedScanHostId: 'ssh:nested-scan-fixture',
      path: directory
    })
  )
}
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'orca-nested-scan-ssh-'))
  await mkdir(join(directory, 'repo'))
  await mkdir(join(directory, 'repo', '.git'))
  await writeFile(join(directory, '.gitignore'), 'ignored/\n')
  files = {
    readDir: async (path) =>
      (await readdir(path, { withFileTypes: true })).map((entry) => ({
        name: entry.name,
        isDirectory: entry.isDirectory(),
        isSymlink: entry.isSymbolicLink()
      })),
    readFile: async (path) => ({ content: await readFile(path, 'utf8'), isBinary: false }),
    stat: async (path) => {
      const value = await lstat(path)
      return {
        size: value.size,
        type: value.isDirectory() ? 'directory' : 'file',
        mtime: value.mtimeMs
      }
    }
  }
  git = { isGitRepoAsync: async () => ({ isRepo: false, rootPath: null }) }
  service = registerDesktopNestedScanForRpc()
})
afterEach(async () => {
  setDesktopNestedScanForRpc(null)
  files = undefined
  git = undefined
  await rm(directory, { recursive: true, force: true })
})
it('uses typed private provider reads through the original SSH scanner and records actual progress', async () => {
  const request = start()
  await vi.waitFor(() =>
    expect(service.controller.status(request.requestId).state).toBe('completed')
  )
  expect(service.controller.result(request.requestId, 0, 10).repos[0].path).toBe(
    join(directory, 'repo')
  )
  expect(service.controller.status(request.requestId).progress?.repoCount).toBe(1)
})
it('aborts between original remote reads, keeps the slot until settlement and discards late results', async () => {
  if (!files) {
    throw new Error('Missing fixture provider')
  }
  const original = files.readDir
  let finish: () => void = () => {}
  const latch = new Promise<void>((resolve) => {
    finish = resolve
  })
  const read = vi.fn(async (path: string) => {
    await latch
    return original(path)
  })
  files = { ...files, readDir: read }
  const request = start()
  await vi.waitFor(() => expect(read).toHaveBeenCalledOnce())
  expect(service.controller.cancel(request.requestId).state).toBe('cancel_requested')
  expect(() => start()).toThrow('desktop_nested_scan_busy')
  finish()
  await vi.waitFor(() =>
    expect(service.controller.status(request.requestId).state).toBe('cancelled')
  )
  expect(() => service.controller.result(request.requestId, 0, 10)).toThrow()
})
it('discards results when provider generation changes during original filesystem reads', async () => {
  if (!files) {
    throw new Error('Missing fixture provider')
  }
  const original = files.readDir
  files = {
    ...files,
    readDir: async (path) => {
      setSshConnectionGeneration('nested-scan-fixture', ++generation)
      return original(path)
    }
  }
  const request = start()
  await vi.waitFor(() => expect(service.controller.status(request.requestId).state).toBe('failed'))
  expect(() => service.controller.result(request.requestId, 0, 10)).toThrow()
})
