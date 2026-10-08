import {
  directory,
  store,
  ctx,
  fsProvider,
  disconnect
} from './workspace-data-cli-remote-clone-fixture'
import { constants } from 'node:fs'
import { copyFile, mkdir, readFile, readdir, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { WORKSPACE_REMOTE_FILE_DOWNLOAD_HANDLERS } from '../../src/cli/handlers/workspace-remote-file-download'
import {
  WORKSPACE_REMOTE_FILE_DOWNLOAD_METHODS,
  setRemoteFileDownloadForRpc
} from '../../src/main/runtime/rpc/methods/workspace-remote-file-download'
import { registerFilesystemDownloadFolderHandlers } from '../../src/main/ipc/filesystem-download-folder'
import { OrcaRuntimeService } from '../../src/main/runtime/orca-runtime'
import { RpcDispatcher } from '../../src/main/runtime/rpc/dispatcher'
import { RuntimeClientError } from '../../src/cli/runtime-client'
let destinationPath: string
let remoteFile: string
let latestId: string | undefined
async function invoke(action: string, extra: object = {}, confirm = true) {
  const params =
    action === 'start'
      ? {
          expectedExecutionHostId: 'local',
          expectedWriteHostId: 'local',
          connectionId: 'clone-fixture',
          expectedReadHostId: 'ssh:clone-fixture',
          filePath: remoteFile,
          destinationPath,
          ...extra
        }
      : { expectedExecutionHostId: 'local', requestId: latestId, ...extra }
  const input = join(directory, `file-download-${action}.json`)
  await writeFile(input, JSON.stringify(params))
  ctx.flags = new Map([['params-file', input]])
  if (confirm) {
    ctx.flags.set('confirm', action === 'start' ? destinationPath : (latestId ?? ''))
  }
  await WORKSPACE_REMOTE_FILE_DOWNLOAD_HANDLERS[`file remote-file-download-${action}`](ctx)
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
  throw new Error('Private file transfer did not settle')
}
async function leftovers() {
  return (await readdir(directory)).filter((name) => /\.(download|backup)$/.test(name))
}
beforeEach(async () => {
  destinationPath = join(directory, 'downloaded.bin')
  remoteFile = join(directory, 'remote.bin')
  latestId = undefined
  await writeFile(remoteFile, Buffer.from('한글 private file\0binary'))
  // Why: system SSH downloads create the target exclusively, so the staged path must not pre-exist.
  fsProvider.downloadFile = vi.fn(async (remote, local) => {
    await copyFile(remote, local, constants.COPYFILE_EXCL)
  })
  registerFilesystemDownloadFolderHandlers(store)
  const dispatcher = new RpcDispatcher({
    runtime: new OrcaRuntimeService(store),
    methods: WORKSPACE_REMOTE_FILE_DOWNLOAD_METHODS
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
  setRemoteFileDownloadForRpc(null)
})
it('downloads actual bytes into an exclusively created staged path and keeps the result after completed cancellation', async () => {
  const started = await invoke('start')
  latestId = started.requestId
  expect(started).toMatchObject({ state: 'pending' })
  expect(await settled()).toMatchObject({ state: 'completed', cleanupPending: false })
  expect(await readFile(destinationPath)).toEqual(await readFile(remoteFile))
  expect(await invoke('cancel')).toMatchObject({ state: 'completed', cleanupPending: false })
  expect(await readFile(destinationPath)).toEqual(await readFile(remoteFile))
  expect(await leftovers()).toEqual([])
  expect(JSON.stringify(vi.mocked(console.log).mock.calls)).not.toContain('private file')
})
it('refuses an existing destination unless overwrite is explicit and never follows a symbolic link', async () => {
  await writeFile(destinationPath, 'sentinel')
  latestId = (await invoke('start')).requestId
  expect(await settled()).toMatchObject({ state: 'failed', cleanupPending: false })
  expect(fsProvider.downloadFile).not.toHaveBeenCalled()
  expect(await readFile(destinationPath, 'utf8')).toBe('sentinel')
  await invoke('cancel')
  latestId = (await invoke('start', { overwrite: true })).requestId
  expect(await settled()).toMatchObject({ state: 'completed', cleanupPending: false })
  expect(await readFile(destinationPath)).toEqual(await readFile(remoteFile))
  expect(await leftovers()).toEqual([])
  await invoke('cancel')
  const target = join(directory, 'symbolic-target')
  const link = join(directory, 'link.bin')
  await writeFile(target, 'untouched')
  await symlink(target, link)
  destinationPath = link
  latestId = (await invoke('start', { overwrite: true })).requestId
  expect(await settled()).toMatchObject({ state: 'failed', cleanupPending: false })
  expect(await readFile(target, 'utf8')).toBe('untouched')
})
it('rejects a remote directory without invoking the provider download', async () => {
  const folder = join(directory, 'remote-folder')
  await mkdir(folder)
  latestId = (await invoke('start', { filePath: folder })).requestId
  expect(await settled()).toMatchObject({ state: 'failed', cleanupPending: false })
  expect(fsProvider.downloadFile).not.toHaveBeenCalled()
  await expect(readFile(destinationPath)).rejects.toMatchObject({ code: 'ENOENT' })
})
it('waits for a noncooperative provider before acknowledging cancellation and cleaning late bytes', async () => {
  let release!: () => void
  let entered = false
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  fsProvider.downloadFile = vi.fn(async (_remote, local) => {
    entered = true
    await gate
    await writeFile(local, 'private late bytes', { flag: 'wx' })
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
  await expect(readFile(destinationPath)).rejects.toMatchObject({ code: 'ENOENT' })
  expect(await leftovers()).toEqual([])
})
it('keeps provider errors private and never reports a lost transfer as completed', async () => {
  fsProvider.downloadFile = vi.fn(async (_remote, local) => {
    await writeFile(local, 'partial', { flag: 'wx' })
    throw new Error('secret account provider detail')
  })
  latestId = (await invoke('start')).requestId
  expect(await settled()).toMatchObject({ state: 'failed', cleanupPending: false })
  expect(JSON.stringify(vi.mocked(console.log).mock.calls)).not.toContain('secret account')
  await expect(readFile(destinationPath)).rejects.toMatchObject({ code: 'ENOENT' })
  expect(await leftovers()).toEqual([])
})
it('rejects authority, foreign ownership and missing confirmation before RPC; old peers and lost connections fail explicitly', async () => {
  for (const extra of [
    { expectedReadHostId: 'ssh:foreign' },
    { expectedWriteHostId: 'ssh:clone-fixture' },
    { expectedExecutionHostId: 'ssh:clone-fixture' },
    { filePath: 'relative' },
    { destinationPath: '//wsl.localhost/Ubuntu/file' },
    { overwrite: 'yes' },
    { transferId: 'renderer' },
    { viewerId: 1 }
  ]) {
    vi.mocked(ctx.client.call).mockClear()
    await expect(invoke('start', extra)).rejects.toThrow()
    expect(ctx.client.call).not.toHaveBeenCalled()
  }
  await expect(invoke('start', {}, false)).rejects.toThrow()
  const downloadFile = fsProvider.downloadFile
  fsProvider.downloadFile = undefined
  await expect(invoke('start')).rejects.toThrow()
  fsProvider.downloadFile = downloadFile
  disconnect()
  await expect(invoke('start')).rejects.toThrow()
  expect(downloadFile).not.toHaveBeenCalled()
  vi.mocked(ctx.client.call).mockRejectedValue(
    new RuntimeClientError('method_not_found', 'Old peer')
  )
  await expect(invoke('start')).rejects.toMatchObject({ code: 'method_not_found' })
})
