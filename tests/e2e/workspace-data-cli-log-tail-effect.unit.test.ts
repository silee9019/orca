import { directory, store, ctx } from './workspace-data-cli-remote-clone-fixture'
import { appendFile, mkdir, rename, symlink, truncate, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import {
  registerLocalLogTailHandlers,
  getActiveLocalLogTailWatcherCount,
  closeAllLocalLogTailWatchers
} from '../../src/main/ipc/local-log-tail'
import { WORKSPACE_LOG_TAIL_HANDLERS } from '../../src/cli/handlers/workspace-log-tail'
import {
  WORKSPACE_LOG_TAIL_METHODS,
  setDesktopLogTailForRpc
} from '../../src/main/runtime/rpc/methods/workspace-log-tail'
import { OrcaRuntimeService } from '../../src/main/runtime/orca-runtime'
import { RpcDispatcher } from '../../src/main/runtime/rpc/dispatcher'
import { RuntimeClientError } from '../../src/cli/runtime-client'
import { LOCAL_LOG_TAIL_CHUNK_BYTES } from '../../src/shared/local-log-tail-types'
let filePath: string
async function invoke(action: string, params: object) {
  const input = join(directory, 'tail-params.json')
  await writeFile(input, JSON.stringify({ expectedExecutionHostId: 'local', ...params }))
  ctx.flags = new Map([['params-file', input]])
  await WORKSPACE_LOG_TAIL_HANDLERS[`file log-tail-${action}`](ctx)
  return JSON.parse(vi.mocked(console.log).mock.calls.at(-1)![0]).result
}
function read(extra: object = {}) {
  return invoke('read', { expectedReadHostId: 'local', filePath, ...extra })
}
function start() {
  return invoke('start', { expectedReadHostId: 'local', filePath })
}
async function wait(id: string, state: string) {
  await vi.waitFor(async () =>
    expect((await invoke('status', { requestId: id })).state).toBe(state)
  )
}
beforeEach(async () => {
  filePath = join(directory, 'fixture.log')
  await writeFile(filePath, 'initial\n')
  registerLocalLogTailHandlers(store)
  const dispatcher = new RpcDispatcher({
    runtime: new OrcaRuntimeService(store),
    methods: WORKSPACE_LOG_TAIL_METHODS
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
afterEach(() => {
  setDesktopLogTailForRpc(null)
  closeAllLocalLogTailWatchers()
})
it('reads the original bounded byte range and resets on truncation and file replacement', async () => {
  const bytes = Buffer.from('한글 '.repeat(100000), 'utf8')
  await writeFile(filePath, bytes)
  const first = await read()
  expect(first).toMatchObject({
    nextByteOffset: LOCAL_LOG_TAIL_CHUNK_BYTES,
    hasMore: true,
    reset: false
  })
  expect(Buffer.from(first.contentBase64, 'base64')).toEqual(
    bytes.subarray(0, LOCAL_LOG_TAIL_CHUNK_BYTES)
  )
  const second = await read({
    fromByteOffset: first.nextByteOffset,
    expectedIdentity: first.fileIdentity
  })
  expect(Buffer.from(second.contentBase64, 'base64')).toEqual(
    bytes.subarray(first.nextByteOffset, second.nextByteOffset)
  )
  await truncate(filePath, 0)
  expect(
    await read({ fromByteOffset: second.nextByteOffset, expectedIdentity: first.fileIdentity })
  ).toMatchObject({ reset: true, nextByteOffset: 0 })
  await rename(filePath, join(directory, 'retired.log'))
  await writeFile(filePath, 'replacement')
  const replacement = await read({ expectedIdentity: first.fileIdentity })
  expect(replacement).toMatchObject({ reset: true, nextByteOffset: 0, contentBase64: '' })
  expect(replacement.fileIdentity).not.toBe(first.fileIdentity)
  expect(
    Buffer.from(
      (await read({ expectedIdentity: replacement.fileIdentity })).contentBase64,
      'base64'
    ).toString()
  ).toBe('replacement')
})
it('uses the native watcher callback and keeps renderer teardown separate from CLI ownership', async () => {
  const request = await start()
  await wait(request.requestId, 'watching')
  expect(getActiveLocalLogTailWatcherCount()).toBe(0)
  closeAllLocalLogTailWatchers()
  expect((await invoke('status', { requestId: request.requestId })).state).toBe('watching')
  await appendFile(filePath, 'private appended content')
  await vi.waitFor(async () =>
    expect((await invoke('status', { requestId: request.requestId })).sequence).toBeGreaterThan(0)
  )
  expect(JSON.stringify(await invoke('status', { requestId: request.requestId }))).not.toContain(
    'private appended content'
  )
  await expect(start()).rejects.toThrow('desktop_log_tail_busy')
  await invoke('stop', { requestId: request.requestId })
  await wait(request.requestId, 'stopped')
  expect((await invoke('status', { requestId: request.requestId })).watcherClosed).toBe(true)
})
it('resolves a user-named symlink file and preserves the same Store watch across registration', async () => {
  const alias = join(directory, 'alias.log')
  await symlink(filePath, alias)
  filePath = alias
  expect(Buffer.from((await read()).contentBase64, 'base64').toString()).toBe('initial\n')
  const request = await start()
  await wait(request.requestId, 'watching')
  registerLocalLogTailHandlers(store)
  expect((await invoke('status', { requestId: request.requestId })).state).toBe('watching')
  await invoke('stop', { requestId: request.requestId })
  await wait(request.requestId, 'stopped')
})
it('rejects caller ownership, unsupported hosts, non-files, invalid offsets and old peers', async () => {
  for (const extra of [
    { subscriptionId: 'foreign' },
    { expectedReadHostId: 'ssh:foreign' },
    { filePath: '//wsl.localhost/Ubuntu/log' },
    { fromByteOffset: -1 }
  ]) {
    await expect(read(extra)).rejects.toThrow()
  }
  await mkdir(join(directory, 'folder'))
  await expect(read({ filePath: join(directory, 'folder') })).rejects.toThrow()
  await expect(read({ filePath: join(directory, 'missing.log') })).rejects.toThrow()
  await expect(
    invoke('stop', { requestId: '00000000-0000-4000-8000-000000000000' })
  ).rejects.toThrow()
  setDesktopLogTailForRpc(null)
  await expect(read()).rejects.toMatchObject({ code: 'runtime_unavailable' })
  vi.mocked(ctx.client.call).mockRejectedValue(
    new RuntimeClientError('method_not_found', 'Old peer')
  )
  await expect(start()).rejects.toMatchObject({ code: 'method_not_found' })
})
