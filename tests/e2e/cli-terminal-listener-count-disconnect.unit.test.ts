import '../../src/main/runtime/orca-runtime-test-mocks.spec'
import { EventEmitter } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { createConnection } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import { createRuntime } from '../../src/main/runtime/orca-runtime-test-fixtures.spec'
import { OrcaRuntimeRpcServer } from '../../src/main/runtime/runtime-rpc'
import { readRuntimeMetadata } from '../../src/main/runtime/runtime-metadata'
import { requestPtyDataListenerCount } from '../../src/main/window/pty-data-listener-count-request'
import { PTY_DATA_LISTENER_COUNT_REPLY } from '../../src/shared/pty-data-listener-count'
it('releases the targeted preload waiter when the actual local RPC socket disconnects', async () => {
  const root = await mkdtemp(join(tmpdir(), 'orca-listener-disconnect-')),
    runtime = createRuntime()
  const ipc = new EventEmitter(),
    contents = Object.assign(new EventEmitter(), {
      id: 421,
      mainFrame: {},
      isDestroyed: () => false,
      send: () => {}
    }),
    abort = new AbortController()
  const read = vi
    .spyOn(runtime, 'readPtyDataListenerCount')
    .mockImplementation((rendererId, timeoutMs, signal) => {
      signal?.addEventListener('abort', () => abort.abort(), { once: true })
      return requestPtyDataListenerCount(
        { isDestroyed: () => false, webContents: contents },
        ipc,
        rendererId,
        timeoutMs,
        abort.signal
      )
    })
  const server = new OrcaRuntimeRpcServer({ runtime, userDataPath: root, enableWebSocket: false })
  let client: ReturnType<typeof createConnection> | undefined
  try {
    await server.start()
    const metadata = readRuntimeMetadata(root),
      local = metadata?.transports?.find(
        (item) => item.kind === 'unix' || item.kind === 'named-pipe'
      )
    if (!metadata?.authToken || !local) {
      throw new Error('Missing isolated runtime transport')
    }
    client = createConnection(local.endpoint)
    await new Promise<void>((resolve, reject) => {
      client?.once('connect', resolve)
      client?.once('error', reject)
    })
    client.write(
      `${JSON.stringify({
        id: 'disconnect-fixture',
        authToken: metadata.authToken,
        method: 'terminal.dataListenerCount',
        params: {
          expectedRuntimeId: runtime.getRuntimeId(),
          executionHostId: 'local',
          expectedRendererId: 421,
          timeoutMs: 10000
        }
      })}\n`
    )
    await vi.waitFor(() => expect(ipc.listenerCount(PTY_DATA_LISTENER_COUNT_REPLY)).toBe(1))
    client.destroy()
    await vi.waitFor(() => expect(ipc.listenerCount(PTY_DATA_LISTENER_COUNT_REPLY)).toBe(0))
    expect(read.mock.calls[0][2]?.aborted).toBe(true)
    expect(contents.listenerCount('did-start-navigation')).toBe(0)
  } finally {
    client?.destroy()
    abort.abort()
    await server.stop()
    vi.restoreAllMocks()
    await rm(root, { recursive: true, force: true })
  }
})
