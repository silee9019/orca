import '../../src/main/runtime/orca-runtime-test-mocks.spec'
import { mkdtemp, rm } from 'node:fs/promises'
import { createConnection, type Socket } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { AiVaultListResult } from '../../src/shared/ai-vault-types'
import type { AiVaultServiceScanOptions } from '../../src/main/ai-vault/session-scanner-service-protocol'
import { OrcaRuntimeService } from '../../src/main/runtime/orca-runtime'
import { RpcDispatcher } from '../../src/main/runtime/rpc/dispatcher'
import { AI_VAULT_METHODS } from '../../src/main/runtime/rpc/methods/ai-vault'
import { OrcaRuntimeRpcServer } from '../../src/main/runtime/runtime-rpc'
import { readRuntimeMetadata } from '../../src/main/runtime/runtime-metadata'
import { resetAiVaultSessionListCacheForTests } from '../../src/main/ai-vault/cached-session-list'

const { scan } = vi.hoisted(() => ({
  scan: vi.fn<
    (options: AiVaultServiceScanOptions, signal?: AbortSignal) => Promise<AiVaultListResult>
  >()
}))
vi.mock('../../src/main/ai-vault/session-scanner-service-spawn', async (original) => ({
  ...(await original<object>()),
  scanAiVaultSessionsInService: scan
}))
let root: string
let endpoint: string
let transport: OrcaRuntimeRpcServer
let authToken: string
let rpc: RpcDispatcher
let runtime: OrcaRuntimeService
const clients: Socket[] = []
const responses = new Map<string, unknown>()
const result: AiVaultListResult = { sessions: [], issues: [], scannedAt: '2026-10-08T04:00:00Z' }
let finishScan: (result: AiVaultListResult) => void = () => {}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'orca-history-cancel-'))
  resetAiVaultSessionListCacheForTests()
  responses.clear()
  scan.mockReset().mockImplementation(
    (_options, signal) =>
      new Promise((resolve, reject) => {
        finishScan = resolve
        signal?.addEventListener('abort', () => reject(new Error('Fixture scan cancelled')), {
          once: true
        })
      })
  )
  runtime = new OrcaRuntimeService()
  vi.spyOn(runtime, 'listAiVaultSessions')
  vi.spyOn(runtime, 'ensureStructuredAgentSessionHost').mockResolvedValue(undefined)
  rpc = new RpcDispatcher({ runtime, methods: AI_VAULT_METHODS })
  transport = new OrcaRuntimeRpcServer({ runtime, userDataPath: root, enableWebSocket: false })
  await transport.start()
  const metadata = readRuntimeMetadata(root)
  const local = metadata?.transports?.find(
    (item) => item.kind === 'unix' || item.kind === 'named-pipe'
  )
  if (!metadata?.authToken || !local) {
    throw new Error('Missing isolated runtime transport metadata')
  }
  endpoint = local.endpoint
  authToken = metadata.authToken
})
afterEach(async () => {
  for (const client of clients.splice(0)) {
    client.destroy()
  }
  finishScan(result)
  await transport?.stop()
  resetAiVaultSessionListCacheForTests()
  vi.restoreAllMocks()
  await rm(root, { recursive: true, force: true })
})
async function request(id: string): Promise<Socket> {
  const client = createConnection(endpoint)
  clients.push(client)
  await new Promise<void>((resolve, reject) => {
    client.once('connect', resolve)
    client.once('error', reject)
  })
  let buffered = ''
  client.on('data', (data) => {
    buffered += data.toString('utf8')
    for (;;) {
      const newline = buffered.indexOf('\n')
      if (newline === -1) {
        break
      }
      const row = JSON.parse(buffered.slice(0, newline))
      buffered = buffered.slice(newline + 1)
      if (typeof row.id === 'string') {
        responses.set(row.id, row)
      }
    }
  })
  client.write(
    `${JSON.stringify({ id, authToken, method: 'aiVault.listSessions', params: { limit: 20 } })}\n`
  )
  return client
}
function scanSignal(): AbortSignal {
  const signal = scan.mock.calls[0]?.[1]
  if (!signal) {
    throw new Error('Missing scan cancellation signal')
  }
  return signal
}
it('cancels the scan when its only socket disconnects and permits a fresh scan', async () => {
  const client = await request('cancel')
  await vi.waitFor(() => expect(scan).toHaveBeenCalledTimes(1))
  const signal = scanSignal()
  expect(signal.aborted).toBe(false)
  client.destroy()
  await vi.waitFor(() => expect(signal.aborted).toBe(true))
  await expect(vi.mocked(runtime.listAiVaultSessions).mock.results[0]?.value).rejects.toBeDefined()
  scan.mockResolvedValueOnce(result)
  await expect(
    rpc.dispatch({
      id: 'fresh',
      authToken: 'fixture',
      method: 'aiVault.listSessions',
      params: { limit: 20 }
    })
  ).resolves.toMatchObject({ ok: true, result })
  expect(scan).toHaveBeenCalledTimes(2)
})
it('detaches a disconnected waiter while a second socket completes the shared scan', async () => {
  const first = await request('first')
  await vi.waitFor(() => expect(scan).toHaveBeenCalledTimes(1))
  await request('second')
  await vi.waitFor(() => expect(runtime.listAiVaultSessions).toHaveBeenCalledTimes(2))
  first.destroy()
  await expect(vi.mocked(runtime.listAiVaultSessions).mock.results[0]?.value).rejects.toBeDefined()
  expect(scanSignal().aborted).toBe(false)
  finishScan(result)
  await vi.waitFor(() => expect(responses.get('second')).toMatchObject({ ok: true, result }))
  expect(scan).toHaveBeenCalledTimes(1)
  await expect(
    rpc.dispatch({
      id: 'cached',
      authToken: 'fixture',
      method: 'aiVault.listSessions',
      params: { limit: 20 }
    })
  ).resolves.toMatchObject({ ok: true, result })
  expect(scan).toHaveBeenCalledTimes(1)
})
