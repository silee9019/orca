import '../../src/main/runtime/orca-runtime-test-mocks.spec'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import { main } from '../../src/cli/index'
import { OrcaRuntimeRpcServer } from '../../src/main/runtime/runtime-rpc'
import {
  createRuntime,
  syncSinglePty,
  TEST_WORKTREE_ID
} from '../../src/main/runtime/orca-runtime-test-fixtures.spec'
import { TerminalPreviewOutputStream } from '../../src/main/ipc/terminal-preview-output-stream'
import { readMetadata } from '../../src/cli/runtime/metadata'
it.each([
  'local',
  'ssh',
  'paired',
  'resync',
  'old-local',
  'old-paired',
  'private-refused',
  'wrong-renderer',
  'wrong-pty',
  'destroyed',
  'send-failed',
  'stale-owner',
  'other-runtime'
])('observes canonical preview sends without creating a preview or credit: %s', async (mode) => {
  const root = await mkdtemp(join(tmpdir(), 'orca-preview-data-')),
    runtime = createRuntime(),
    id = mode === 'ssh' ? 'ssh:fixture@@preview-pty' : 'preview-pty',
    host = mode === 'ssh' ? 'ssh:fixture' : 'local',
    incarnationId = 'fixture-incarnation'
  runtime.setPtyController({
    write: () => true,
    kill: () => {},
    getForegroundProcess: async () => null,
    getSize: () => ({ cols: 80, rows: 24 })
  })
  syncSinglePty(runtime, id)
  const bind = (value: string) =>
    runtime.registerPty(id, TEST_WORKTREE_ID, mode === 'ssh' ? 'fixture' : null, {
      tabId: 'tab-1',
      leafId: 'pane:1',
      incarnationId: value
    })
  bind(incarnationId)
  vi.spyOn(runtime, 'ensureStructuredAgentSessionHost').mockResolvedValue(undefined)
  const rawView = vi.spyOn(runtime, 'registerRawTerminalViewSubscriber'),
    fit = vi.spyOn(runtime, 'updateRemoteDesktopViewer'),
    dataSubscription = vi.spyOn(runtime, 'subscribeToTerminalData'),
    release = vi.fn(),
    dispose = vi.fn(),
    send = vi.fn(() => {
      if (mode === 'send-failed') {
        throw new Error('private-preview-error')
      }
    }),
    contents = {
      id: mode === 'wrong-renderer' ? 422 : 421,
      isDestroyed: () => mode === 'destroyed',
      send
    },
    stream = new TerminalPreviewOutputStream(
      contents,
      mode === 'wrong-pty' ? 'other-pty' : id,
      release,
      dispose,
      mode === 'other-runtime' ? createRuntime() : runtime
    ),
    ack = vi.spyOn(stream, 'acknowledge'),
    paired = mode === 'paired' || mode === 'old-paired',
    server = new OrcaRuntimeRpcServer({
      runtime,
      userDataPath: root,
      enableWebSocket: paired,
      wsPort: 0,
      pinnedBindHost: '127.0.0.1',
      ...(mode === 'old-paired'
        ? { methods: (await import('../../src/main/runtime/rpc/methods/status')).STATUS_METHODS }
        : {})
    }),
    frames: unknown[] = []
  for (const key of ['ORCA_ENVIRONMENT', 'ORCA_PAIRING_CODE', 'ORCA_REMOTE_PAIRING']) {
    vi.stubEnv(key, undefined)
  }
  vi.stubEnv('ORCA_USER_DATA_PATH', root)
  vi.spyOn(console, 'log').mockImplementation((v) => {
    if (typeof v === 'string' && v.startsWith('{')) {
      frames.push(JSON.parse(v))
    }
  })
  vi.spyOn(console, 'error').mockImplementation(() => {})
  let pending: Promise<void> | undefined
  try {
    await server.start()
    if (paired) {
      const offer = server.createPairingOffer({
        address: '127.0.0.1',
        name: 'isolated-preview-data',
        scope: 'runtime'
      })
      if (!offer.available) {
        throw new Error('Fixture pairing unavailable')
      }
      vi.stubEnv('ORCA_PAIRING_CODE', offer.pairingUrl)
      await rm(join(root, 'orca-runtime.json'))
    } else if (mode === 'old-local') {
      await writeFile(
        join(root, 'orca-runtime.json'),
        JSON.stringify({ ...readMetadata(root), terminalPreviewDataStreaming: undefined })
      )
    }
    const terminal = (await runtime.listTerminals()).terminals[0].handle,
      file = join(root, 'request.json')
    await writeFile(
      file,
      JSON.stringify({
        terminal,
        expectedPtyId: id,
        expectedIncarnationId: incarnationId,
        expectedExecutionHostId: host,
        expectedRendererId: 421,
        includeContent: mode !== 'private-refused',
        watchMs: 500
      })
    )
    pending = main(['terminal', 'watch-preview-data', '--request-file', file, '--json'], root)
    if (['old-local', 'old-paired', 'private-refused'].includes(mode)) {
      await pending
      expect(process.exitCode).toBe(1)
      expect(frames).not.toContainEqual(expect.objectContaining({ type: 'ready' }))
      return
    }
    await vi.waitFor(() =>
      expect(frames).toContainEqual(expect.objectContaining({ type: 'ready' }))
    )
    stream.append('private pre-snapshot bytes')
    expect(stream.completeSnapshot()).toHaveLength(1)
    if (mode === 'stale-owner') {
      bind('replacement')
    }
    const data = 'private preview data 한글'
    if (mode === 'resync') {
      stream.requestResync()
    } else {
      stream.append(data)
    }
    await pending
    const events = frames.filter(
        (f) => typeof f === 'object' && f !== null && 'type' in f && f.type === 'event'
      ),
      expected = ['local', 'ssh', 'paired', 'resync'].includes(mode)
    expect(events).toHaveLength(expected ? 1 : 0)
    if (expected) {
      expect(events).toEqual([
        expect.objectContaining({
          request: {
            kind: 'preview-data',
            ptyId: id,
            rendererId: 421,
            payload:
              mode === 'resync'
                ? { type: 'resync', ptyId: id }
                : { type: 'data', ptyId: id, data, bytes: Buffer.byteLength(data, 'utf8') }
          },
          rendererApplied: false
        })
      ])
    }
    expect(process.exitCode ?? 0, JSON.stringify(frames)).toBe(mode === 'stale-owner' ? 1 : 0)
    expect(JSON.stringify(frames)).not.toContain('private pre-snapshot bytes')
    expect(JSON.stringify(frames)).not.toContain('private-preview-error')
    expect(rawView).not.toHaveBeenCalled()
    expect(fit).not.toHaveBeenCalled()
    expect(dataSubscription).not.toHaveBeenCalled()
    expect(ack).not.toHaveBeenCalled()
  } finally {
    await pending
    stream.dispose()
    expect(release).toHaveBeenCalledOnce()
    await server.stop()
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
    process.exitCode = undefined
    await rm(root, { recursive: true, force: true })
  }
})

it('isolates preview observer payloads and failures from renderer delivery', async () => {
  const { subscribePtyControlRequests, getPtyControlRequestObserverCount } =
    await import('../../src/main/runtime/pty-control-request-observers')
  const owner = {},
    failed = vi.fn(),
    observed: unknown[] = [],
    send = vi.fn(),
    first = subscribePtyControlRequests(
      owner,
      (request) => {
        if (request.kind === 'preview-data' && request.payload.type === 'data') {
          request.payload.data = 'mutated private preview'
        }
        throw new Error('isolated observer failure')
      },
      failed
    ),
    second = subscribePtyControlRequests(
      owner,
      (request) => observed.push(request),
      () => {}
    ),
    stream = new TerminalPreviewOutputStream(
      { id: 421, isDestroyed: () => false, send },
      'fixture-pty',
      () => {},
      () => {},
      owner
    )
  try {
    stream.completeSnapshot()
    stream.append('private original preview 한글')
    await vi.waitFor(() => expect(send).toHaveBeenCalledOnce())
    expect(failed).toHaveBeenCalledOnce()
    expect(getPtyControlRequestObserverCount(owner)).toBe(1)
    expect(observed).toEqual([
      expect.objectContaining({
        payload: expect.objectContaining({ data: 'private original preview 한글' })
      })
    ])
    expect(send.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({ data: 'private original preview 한글' })
    )
    stream.append('second private original preview')
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(2))
    expect(observed).toHaveLength(2)
  } finally {
    first()
    second()
    stream.dispose()
    expect(getPtyControlRequestObserverCount(owner)).toBe(0)
  }
})
