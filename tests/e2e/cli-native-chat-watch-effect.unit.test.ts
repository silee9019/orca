import '../../src/main/runtime/orca-runtime-test-mocks.spec'
import { appendFile, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { OrcaRuntimeService } from '../../src/main/runtime/orca-runtime'
import { OrcaRuntimeRpcServer } from '../../src/main/runtime/runtime-rpc'
import { NATIVE_CHAT_METHODS } from '../../src/main/runtime/rpc/methods/native-chat'
import { STATUS_METHODS } from '../../src/main/runtime/rpc/methods/status'
import { getActiveNativeChatWatcherCount } from '../../src/main/native-chat/transcript-watch'
import { readMetadata } from '../../src/cli/runtime/metadata'
import { main } from '../../src/cli/index'

let root: string
let transcript: string
let server: OrcaRuntimeRpcServer
let baseline: number
function line(id: string, text: string) {
  return `${JSON.stringify({
    type: 'user',
    uuid: id,
    timestamp: '2026-10-08T08:40:00.000Z',
    message: { role: 'user', content: text }
  })}\n`
}
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'orca-cli-transcript-watch-'))
  baseline = getActiveNativeChatWatcherCount()
  transcript = join(root, 'fixture.jsonl')
  await writeFile(transcript, line('fixture-first', 'private explicit transcript fixture'))
  vi.stubEnv('ORCA_USER_DATA_PATH', root)
  for (const key of ['ORCA_ENVIRONMENT', 'ORCA_PAIRING_CODE', 'ORCA_REMOTE_PAIRING']) {
    vi.stubEnv(key, undefined)
  }
  server = new OrcaRuntimeRpcServer({
    runtime: new OrcaRuntimeService(),
    userDataPath: root,
    enableWebSocket: false,
    methods: NATIVE_CHAT_METHODS
  })
  await server.start()
})
afterEach(async () => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  process.exitCode = 0
  await server.stop()
  await vi.waitFor(() => expect(getActiveNativeChatWatcherCount()).toBe(baseline))
  await rm(root, { recursive: true, force: true })
})
async function cli(request: unknown, onFrame?: (frame: unknown) => void) {
  const path = join(root, 'request.json')
  await writeFile(path, JSON.stringify(request), { mode: 0o600 })
  const stdout = vi.spyOn(console, 'log').mockImplementation((...values: unknown[]) => {
    if (onFrame) {
      const frame: unknown = JSON.parse(values.join(' '))
      onFrame(frame)
    }
  })
  const stderr = vi.spyOn(console, 'error').mockImplementation(() => {})
  process.exitCode = 0
  try {
    await main(['agent', 'history', 'watch', '--request-file', path, '--json'], root)
    const calls = stdout.mock.calls.map((call) => call.join(' '))
    const text = calls.join('\n')
    const frames: unknown[] = calls.filter(Boolean).map((value) => JSON.parse(value))
    return { code: Number(process.exitCode), frames, text }
  } finally {
    stdout.mockRestore()
    stderr.mockRestore()
  }
}
function request(watchMs = 1000) {
  return { agent: 'claude', sessionId: 'fixture', transcriptPath: transcript, watchMs }
}
it('streams canonical private snapshots and appends through the public CLI and closes its watcher on timeout', async () => {
  let snapshot = false
  const pending = cli(request(), (frame) => {
    if (
      frame !== null &&
      typeof frame === 'object' &&
      'type' in frame &&
      frame.type === 'snapshot'
    ) {
      snapshot = true
    }
  })
  await vi.waitFor(() => expect(snapshot).toBe(true))
  await appendFile(transcript, line('fixture-appended', 'private appended transcript fixture'))
  const result = await pending
  expect(result.code).toBe(0)
  expect(result.frames).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        type: 'snapshot',
        messages: expect.arrayContaining([expect.objectContaining({ id: 'fixture-first' })])
      }),
      expect.objectContaining({
        type: 'appended',
        messages: expect.arrayContaining([expect.objectContaining({ id: 'fixture-appended' })])
      }),
      expect.objectContaining({ type: 'watch-ended', reason: 'timeout', transcriptComplete: false })
    ])
  )
  expect(result.text).toContain('private explicit transcript fixture')
  expect(result.text).not.toContain(readMetadata(root).authToken)
  await vi.waitFor(() => expect(getActiveNativeChatWatcherCount()).toBe(baseline))
})
it('cancels only its own watcher when its registered interrupt callback runs', async () => {
  let interrupt: (() => void) | undefined
  const originalOn = process.on
  vi.spyOn(process, 'on').mockImplementation((event, listener) => {
    if (event === 'SIGINT') {
      interrupt = () => listener()
      return process
    }
    return originalOn.call(process, event, listener)
  })
  const pending = cli(request(10_000))
  await vi.waitFor(() => expect(getActiveNativeChatWatcherCount()).toBe(baseline + 1))
  if (!interrupt) {
    throw new Error('fixture interrupt callback missing')
  }
  interrupt()
  const result = await pending
  expect(result.code).toBe(130)
  expect(result.frames).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        type: 'watch-ended',
        reason: 'interrupted',
        transcriptComplete: false
      })
    ])
  )
  await vi.waitFor(() => expect(getActiveNativeChatWatcherCount()).toBe(baseline))
})
it('refuses a local host without the optional streaming capability', async () => {
  const metadata = readMetadata(root)
  await writeFile(
    join(root, 'orca-runtime.json'),
    JSON.stringify({ ...metadata, nativeChatStreaming: undefined }),
    { mode: 0o600 }
  )
  const result = await cli(request(100))
  expect(result.code).toBe(1)
  expect(result.frames).toEqual([
    expect.objectContaining({
      ok: false,
      error: expect.objectContaining({ code: 'method_not_supported' })
    })
  ])
  expect(getActiveNativeChatWatcherCount()).toBe(baseline)
})
it.each([
  { agent: 'claude', sessionId: 'fixture', watchMs: 0 },
  { agent: 'claude', sessionId: 'fixture' },
  { agent: 'claude', sessionId: 'fixture', watchMs: 100, unknown: true },
  { agent: 'claude', sessionId: '', watchMs: 100 },
  { agent: 'claude', sessionId: 'fixture', watchMs: 100, subscriptionId: 'caller-selected' }
])('refuses malformed watch input without opening a watcher: %j', async (value) => {
  expect((await cli(value)).code).toBe(1)
  expect(getActiveNativeChatWatcherCount()).toBe(baseline)
})

it('uses the selected paired host over E2EE without requiring local runtime metadata', async () => {
  const remoteRoot = await mkdtemp(join(tmpdir(), 'orca-paired-transcript-watch-'))
  const remote = new OrcaRuntimeRpcServer({
    runtime: new OrcaRuntimeService(),
    userDataPath: remoteRoot,
    enableWebSocket: true,
    wsPort: 0,
    pinnedBindHost: '127.0.0.1',
    methods: [...NATIVE_CHAT_METHODS, ...STATUS_METHODS]
  })
  try {
    const remoteTranscript = join(remoteRoot, 'fixture.jsonl')
    await writeFile(remoteTranscript, line('paired-first', 'private paired fixture'))
    await remote.start()
    const offer = remote.createPairingOffer({
      address: '127.0.0.1',
      name: 'fixture-watch-client',
      scope: 'runtime'
    })
    if (!offer.available) {
      throw new Error('fixture pairing unavailable')
    }
    vi.stubEnv('ORCA_PAIRING_CODE', offer.pairingUrl)
    await rm(join(root, 'orca-runtime.json'))
    const result = await cli({ ...request(100), transcriptPath: remoteTranscript })
    expect(result.code).toBe(0)
    expect(result.frames).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'snapshot',
          messages: expect.arrayContaining([expect.objectContaining({ id: 'paired-first' })])
        })
      ])
    )
    expect(result.text).not.toContain(offer.pairingUrl)
    await vi.waitFor(() => expect(getActiveNativeChatWatcherCount()).toBe(baseline))
  } finally {
    await remote.stop()
    await rm(remoteRoot, { recursive: true, force: true })
  }
})
it('preserves paired-host status refusal without falling back to the available local runtime', async () => {
  const remoteRoot = await mkdtemp(join(tmpdir(), 'orca-paired-transcript-refusal-'))
  const remote = new OrcaRuntimeRpcServer({
    runtime: new OrcaRuntimeService(),
    userDataPath: remoteRoot,
    enableWebSocket: true,
    wsPort: 0,
    pinnedBindHost: '127.0.0.1',
    methods: NATIVE_CHAT_METHODS
  })
  try {
    await remote.start()
    const offer = remote.createPairingOffer({
      address: '127.0.0.1',
      name: 'fixture-refusal-client',
      scope: 'runtime'
    })
    if (!offer.available) {
      throw new Error('fixture pairing unavailable')
    }
    vi.stubEnv('ORCA_PAIRING_CODE', offer.pairingUrl)
    const result = await cli(request(100))
    expect(result.code).toBe(1)
    expect(result.frames).toEqual([
      expect.objectContaining({
        ok: false,
        error: expect.objectContaining({ code: 'method_not_found' })
      })
    ])
    expect(getActiveNativeChatWatcherCount()).toBe(baseline)
  } finally {
    await remote.stop()
    await rm(remoteRoot, { recursive: true, force: true })
  }
})
