import {
  directory,
  source,
  store,
  ctx,
  fsProvider,
  disconnect
} from './workspace-data-cli-remote-clone-fixture'
import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { WORKSPACE_REMOTE_FOLDER_DOWNLOAD_HANDLERS } from '../../src/cli/handlers/workspace-remote-folder-download'
import {
  WORKSPACE_REMOTE_FOLDER_DOWNLOAD_METHODS,
  setRemoteFolderDownloadForRpc
} from '../../src/main/runtime/rpc/methods/workspace-remote-folder-download'
import { registerFilesystemDownloadFolderHandlers } from '../../src/main/ipc/filesystem-download-folder'
import { registerRemoteFolderDownloadForRpc } from '../../src/main/remote-folder-download-requests'
import { OrcaRuntimeService } from '../../src/main/runtime/orca-runtime'
import { RpcDispatcher } from '../../src/main/runtime/rpc/dispatcher'
import { RuntimeClientError } from '../../src/cli/runtime-client'
let destinationPath: string
let latestId: string | undefined
async function invoke(action: string, extra: object = {}, confirm = true) {
  const params =
    action === 'start'
      ? {
          expectedExecutionHostId: 'local',
          expectedWriteHostId: 'local',
          connectionId: 'clone-fixture',
          expectedReadHostId: 'ssh:clone-fixture',
          dirPath: source,
          destinationPath,
          ...extra
        }
      : { expectedExecutionHostId: 'local', requestId: latestId, ...extra }
  const input = join(directory, `folder-download-${action}.json`)
  await writeFile(input, JSON.stringify(params))
  ctx.flags = new Map([['params-file', input]])
  if (confirm) {
    ctx.flags.set('confirm', action === 'start' ? destinationPath : (latestId ?? ''))
  }
  await WORKSPACE_REMOTE_FOLDER_DOWNLOAD_HANDLERS[`file remote-folder-download-${action}`](ctx)
  return JSON.parse(vi.mocked(console.log).mock.calls.at(-1)![0]).result
}
async function settled() {
  for (let attempt = 0; attempt < 200; attempt++) {
    const result = await invoke('status')
    if (['completed', 'failed', 'cancelled'].includes(result.state) && !result.cleanupPending) {
      return result
    }
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  throw new Error('Private folder transfer did not settle')
}
beforeEach(() => {
  destinationPath = join(directory, 'downloaded-folder')
  latestId = undefined
  fsProvider.downloadFolder = vi.fn(async (remote, local, options) => {
    options?.signal?.throwIfAborted()
    await cp(remote, local, { recursive: true, force: false, errorOnExist: false })
    options?.signal?.throwIfAborted()
  })
  registerFilesystemDownloadFolderHandlers(store)
  const dispatcher = new RpcDispatcher({
    runtime: new OrcaRuntimeService(store),
    methods: WORKSPACE_REMOTE_FOLDER_DOWNLOAD_METHODS
  })
  vi.mocked(ctx.client.call).mockImplementation(async (method, params) => {
    const response = await dispatcher.dispatch({
      id: 'fixture',
      authToken: 'fixture',
      method,
      params
    })
    if (!response.ok) {
      throw new RuntimeClientError(response.error.code, response.error.message)
    }
    return response
  })
})
afterEach(async () => {
  if (latestId) {
    await invoke('cancel').catch(() => {})
  }
  setRemoteFolderDownloadForRpc(null)
})
it('downloads actual nested binary bytes and preserves the result after completed cancellation', async () => {
  await mkdir(join(source, 'nested'))
  const bytes = Buffer.from('한글 private folder\0binary')
  await writeFile(join(source, 'nested', 'file.bin'), bytes)
  const started = await invoke('start')
  latestId = started.requestId
  expect(started).toMatchObject({ state: 'pending' })
  registerRemoteFolderDownloadForRpc(store)
  expect(await settled()).toMatchObject({ state: 'completed', cleanupPending: false })
  expect(await readFile(join(destinationPath, 'nested', 'file.bin'))).toEqual(bytes)
  expect(await invoke('cancel')).toMatchObject({ state: 'completed', cleanupPending: false })
  expect(await readFile(join(destinationPath, 'nested', 'file.bin'))).toEqual(bytes)
  expect((await readdir(directory)).some((name) => name.endsWith('.download'))).toBe(false)
  expect(JSON.stringify(vi.mocked(console.log).mock.calls)).not.toContain('private folder')
})
it('never overwrites an existing folder or falls back when the SSH connection disappears', async () => {
  await mkdir(destinationPath)
  await writeFile(join(destinationPath, 'sentinel'), 'untouched')
  latestId = (await invoke('start')).requestId
  expect(await settled()).toMatchObject({ state: 'failed', cleanupPending: false })
  expect(fsProvider.downloadFolder).not.toHaveBeenCalled()
  expect(await readFile(join(destinationPath, 'sentinel'), 'utf8')).toBe('untouched')
  await invoke('cancel')
  disconnect()
  await expect(invoke('start')).rejects.toThrow()
  expect(fsProvider.downloadFolder).not.toHaveBeenCalled()
})
it('waits for a noncooperative provider before acknowledging cancellation and cleaning late bytes', async () => {
  let release!: () => void
  let entered = false
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  fsProvider.downloadFolder = vi.fn(async (_remote, local) => {
    entered = true
    await gate
    await writeFile(join(local, 'late'), 'private late bytes')
  })
  latestId = (await invoke('start')).requestId
  await vi.waitFor(() => expect(entered).toBe(true))
  await expect(invoke('start')).rejects.toThrow()
  let done = false
  const cancellation = invoke('cancel').then((result) => {
    done = true
    return result
  })
  await vi.waitFor(async () =>
    expect(await invoke('status')).toMatchObject({ state: 'cancel_requested' })
  )
  expect(done).toBe(false)
  release()
  expect(await cancellation).toMatchObject({ state: 'cancelled', cleanupPending: false })
  await expect(readFile(join(destinationPath, 'late'))).rejects.toMatchObject({ code: 'ENOENT' })
  expect((await readdir(directory)).some((name) => name.endsWith('.download'))).toBe(false)
})
it('keeps provider errors private and never reports a lost transfer as completed', async () => {
  fsProvider.downloadFolder = vi.fn(async () => {
    throw new Error('secret account provider detail')
  })
  latestId = (await invoke('start')).requestId
  expect(await settled()).toMatchObject({ state: 'failed', cleanupPending: false })
  expect(JSON.stringify(vi.mocked(console.log).mock.calls)).not.toContain('secret account')
})
it('rejects authority, foreign ownership and missing confirmation before RPC; old peers fail explicitly', async () => {
  for (const extra of [
    { expectedReadHostId: 'ssh:foreign' },
    { expectedWriteHostId: 'ssh:clone-fixture' },
    { expectedExecutionHostId: 'ssh:clone-fixture' },
    { dirPath: 'relative' },
    { destinationPath: '//wsl.localhost/Ubuntu/file' },
    { transferId: 'renderer' },
    { viewerId: 1 }
  ]) {
    vi.mocked(ctx.client.call).mockClear()
    await expect(invoke('start', extra)).rejects.toThrow()
    expect(ctx.client.call).not.toHaveBeenCalled()
  }
  await expect(invoke('start', {}, false)).rejects.toThrow()
  fsProvider.downloadFolder = undefined
  await expect(invoke('start')).rejects.toThrow()
  vi.mocked(ctx.client.call).mockRejectedValue(
    new RuntimeClientError('method_not_found', 'Old peer')
  )
  await expect(invoke('start')).rejects.toMatchObject({ code: 'method_not_found' })
})
