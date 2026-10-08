import { directory, store, ctx } from './workspace-data-cli-remote-clone-fixture'
import { writeFile, readFile, readdir, symlink } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { WORKSPACE_DOWNLOAD_SESSION_HANDLERS } from '../../src/cli/handlers/workspace-download-session'
import {
  WORKSPACE_DOWNLOAD_SESSION_METHODS,
  setDesktopDownloadSessionForRpc
} from '../../src/main/runtime/rpc/methods/workspace-download-session'
import { registerDesktopDownloadSessionForRpc } from '../../src/main/desktop-download-session-requests'
import { OrcaRuntimeService } from '../../src/main/runtime/orca-runtime'
import { RpcDispatcher } from '../../src/main/runtime/rpc/dispatcher'
import { RuntimeClientError } from '../../src/cli/runtime-client'
let destinationPath: string
async function invoke(content: string, extra: object = {}, confirm = true) {
  const input = join(directory, 'save-params.json')
  await writeFile(
    input,
    JSON.stringify({
      expectedExecutionHostId: 'local',
      expectedWriteHostId: 'local',
      destinationPath,
      content,
      ...extra
    })
  )
  ctx.flags = new Map([['params-file', input]])
  if (confirm) {
    ctx.flags.set('confirm', destinationPath)
  }
  await WORKSPACE_DOWNLOAD_SESSION_HANDLERS['file save-downloaded'](ctx)
  return JSON.parse(vi.mocked(console.log).mock.calls.at(-1)![0]).result
}
beforeEach(() => {
  destinationPath = join(directory, 'saved.bin')
  registerDesktopDownloadSessionForRpc(store)
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
it.each(['utf8', 'base64'])(
  'saves %s bytes through the original authorized exclusive staging and promotion',
  async (encoding) => {
    const bytes = Buffer.from('한글 private\0binary content')
    const content = bytes.toString(encoding === 'base64' ? 'base64' : 'utf8')
    expect(await invoke(content, { encoding })).toMatchObject({
      state: 'finished',
      byteOffset: bytes.length,
      cleanupPending: false
    })
    expect(await readFile(destinationPath)).toEqual(bytes)
    expect(JSON.stringify(vi.mocked(console.log).mock.calls)).not.toContain(content)
    expect((await readdir(directory)).some((name) => name.endsWith('.download'))).toBe(false)
  }
)
it('supports empty content and preserves existing/symbolic files without explicit safe overwrite', async () => {
  expect(await invoke('')).toMatchObject({ state: 'finished', byteOffset: 0 })
  expect((await readFile(destinationPath)).length).toBe(0)
  await expect(invoke('replacement')).rejects.toMatchObject({
    code: 'operation_failed',
    data: { requestId: expect.any(String), state: 'failed', cleanupPending: false }
  })
  expect((await readFile(destinationPath)).length).toBe(0)
  expect(await invoke('replacement', { overwrite: true })).toMatchObject({ state: 'finished' })
  expect(await readFile(destinationPath, 'utf8')).toBe('replacement')
  const sentinel = join(directory, 'sentinel')
  await writeFile(sentinel, 'untouched')
  destinationPath = join(directory, 'symbolic')
  await symlink(sentinel, destinationPath)
  await expect(invoke('foreign', { overwrite: true })).rejects.toThrow()
  expect(await readFile(sentinel, 'utf8')).toBe('untouched')
})
it('rejects authority/encoding/content/confirmation before RPC and preserves old-peer failure', async () => {
  for (const extra of [
    { expectedWriteHostId: 'ssh:foreign' },
    { requestId: 'renderer' },
    { encoding: 'hex' },
    { destinationPath: '//wsl.localhost/Ubuntu/file' }
  ]) {
    vi.mocked(ctx.client.call).mockClear()
    await expect(invoke('private', extra)).rejects.toThrow()
    expect(ctx.client.call).not.toHaveBeenCalled()
  }
  await expect(invoke('private', {}, false)).rejects.toThrow()
  await expect(invoke('not base64', { encoding: 'base64' })).rejects.toThrow()
  vi.mocked(ctx.client.call).mockRejectedValue(
    new RuntimeClientError('method_not_found', 'Old peer')
  )
  await expect(invoke('private')).rejects.toMatchObject({ code: 'method_not_found' })
})
