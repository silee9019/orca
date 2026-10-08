import { directory, store, ctx } from './workspace-data-cli-remote-clone-fixture'
import { writeFile, readFile, readdir, symlink } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { WORKSPACE_DOWNLOAD_SESSION_HANDLERS } from '../../src/cli/handlers/workspace-download-session'
import {
  WORKSPACE_DOWNLOAD_SESSION_METHODS,
  setDesktopDownloadSessionForRpc
} from '../../src/main/runtime/rpc/methods/workspace-download-session'
import { registerFilesystemDownloadHandlers } from '../../src/main/ipc/filesystem/filesystem-download-handlers'
import { createFilesystemHandlerContext } from '../../src/main/ipc/filesystem/filesystem-handler-context'
import { createSenderScopedRequestCancellations } from '../../src/main/ipc/sender-scoped-request-cancellation'
import { OrcaRuntimeService } from '../../src/main/runtime/orca-runtime'
import { RpcDispatcher } from '../../src/main/runtime/rpc/dispatcher'
import { RuntimeClientError } from '../../src/cli/runtime-client'
import {
  DesktopDownloadSessionStart,
  DesktopDownloadSessionAppend
} from '../../src/shared/rpc-contract/workspace-download-session-params'
let destinationPath: string
let rendererContext: ReturnType<typeof createFilesystemHandlerContext>
async function invoke(action: string, params: object, confirm = true) {
  const input = join(directory, 'download-params.json')
  await writeFile(input, JSON.stringify({ expectedExecutionHostId: 'local', ...params }))
  ctx.flags = new Map([['params-file', input]])
  if (confirm) {
    ctx.flags.set(
      'confirm',
      action === 'start' ? destinationPath : 'requestId' in params ? String(params.requestId) : ''
    )
  }
  await WORKSPACE_DOWNLOAD_SESSION_HANDLERS[`file download-session-${action}`](ctx)
  return JSON.parse(vi.mocked(console.log).mock.calls.at(-1)![0]).result
}
function start(extra: object = {}) {
  return invoke('start', { expectedWriteHostId: 'local', destinationPath, ...extra })
}
async function wait(id: string, state: string) {
  await vi.waitFor(async () =>
    expect((await invoke('status', { requestId: id })).state).toBe(state)
  )
}
beforeEach(() => {
  destinationPath = join(directory, 'saved.bin')
  rendererContext = createFilesystemHandlerContext(
    store,
    undefined,
    createSenderScopedRequestCancellations(),
    createSenderScopedRequestCancellations()
  )
  registerFilesystemDownloadHandlers(rendererContext)
  const dispatcher = new RpcDispatcher({
    runtime: new OrcaRuntimeService(store),
    methods: WORKSPACE_DOWNLOAD_SESSION_METHODS
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
afterEach(() => setDesktopDownloadSessionForRpc(null))
it('saves private binary chunks through CLI/RPC/original destination authorization and promotion', async () => {
  const request = await start()
  await wait(request.requestId, 'open')
  const bytes = Buffer.from('한글\u0000private bytes')
  const encoded = bytes.toString('base64')
  await invoke('append', {
    requestId: request.requestId,
    expectedByteOffset: 0,
    contentBase64: encoded
  })
  expect(JSON.stringify(vi.mocked(console.log).mock.calls)).not.toContain(encoded)
  await expect(
    invoke('append', {
      requestId: request.requestId,
      expectedByteOffset: 0,
      contentBase64: encoded
    })
  ).rejects.toThrow('download_byte_offset_mismatch')
  expect(await invoke('finish', { requestId: request.requestId })).toMatchObject({
    state: 'finished',
    cleanupPending: false,
    byteOffset: bytes.length
  })
  expect(await readFile(destinationPath)).toEqual(bytes)
  expect(rendererContext.downloadSessions.size).toBe(0)
})
it('preserves existing files without explicit overwrite and keeps same Store ownership on re-registration', async () => {
  await writeFile(destinationPath, 'sentinel')
  let request = await start()
  await wait(request.requestId, 'failed')
  expect(await readFile(destinationPath, 'utf8')).toBe('sentinel')
  request = await start({ overwrite: true })
  await wait(request.requestId, 'open')
  registerFilesystemDownloadHandlers(rendererContext)
  expect((await invoke('status', { requestId: request.requestId })).state).toBe('open')
  await invoke('append', {
    requestId: request.requestId,
    expectedByteOffset: 0,
    contentBase64: Buffer.from('replacement').toString('base64')
  })
  await invoke('finish', { requestId: request.requestId })
  expect(await readFile(destinationPath, 'utf8')).toBe('replacement')
})
it('cancels only CLI staging and never follows a symbolic destination', async () => {
  let request = await start()
  await wait(request.requestId, 'open')
  await invoke('cancel', { requestId: request.requestId })
  expect((await readdir(directory)).some((name) => name.endsWith('.download'))).toBe(false)
  await writeFile(join(directory, 'sentinel'), 'original')
  await symlink(join(directory, 'sentinel'), destinationPath)
  request = await start({ overwrite: true })
  await wait(request.requestId, 'failed')
  expect(await readFile(join(directory, 'sentinel'), 'utf8')).toBe('original')
})
it('rejects authority, byte limits, confirmation omissions and unavailable/old services', async () => {
  for (const extra of [
    { transferId: 'renderer' },
    { expectedWriteHostId: 'ssh:foreign' },
    { destinationPath: '//wsl.localhost/Ubuntu/file' }
  ]) {
    expect(
      DesktopDownloadSessionStart.safeParse({
        expectedExecutionHostId: 'local',
        expectedWriteHostId: 'local',
        destinationPath,
        ...extra
      }).success
    ).toBe(false)
  }
  for (const contentBase64 of ['not base64', Buffer.alloc(1024 * 1024 + 1).toString('base64')]) {
    expect(
      DesktopDownloadSessionAppend.safeParse({
        expectedExecutionHostId: 'local',
        requestId: '00000000-0000-4000-8000-000000000001',
        expectedByteOffset: 0,
        contentBase64
      }).success
    ).toBe(false)
  }
  await expect(
    invoke('start', { expectedWriteHostId: 'local', destinationPath }, false)
  ).rejects.toThrow()
  const request = await start()
  await wait(request.requestId, 'open')
  await expect(invoke('finish', { requestId: request.requestId }, false)).rejects.toThrow()
  await expect(
    invoke('cancel', { requestId: '00000000-0000-4000-8000-000000000000' })
  ).rejects.toThrow()
  await invoke('cancel', { requestId: request.requestId })
  setDesktopDownloadSessionForRpc(null)
  await expect(start()).rejects.toMatchObject({ code: 'runtime_unavailable' })
  vi.mocked(ctx.client.call).mockRejectedValue(
    new RuntimeClientError('method_not_found', 'Old peer')
  )
  await expect(start()).rejects.toMatchObject({ code: 'method_not_found' })
})
