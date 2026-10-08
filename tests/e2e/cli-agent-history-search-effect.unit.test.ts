import '../../src/main/runtime/rpc/unused-default-rpc-methods.test-fixture'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { OrcaRuntimeService } from '../../src/main/runtime/orca-runtime'
import { RpcDispatcher } from '../../src/main/runtime/rpc/dispatcher'
import { AI_VAULT_METHODS } from '../../src/main/runtime/rpc/methods/ai-vault'
import { RuntimeRpcFailureError } from '../../src/cli/runtime/types'
import { main } from '../../src/cli/index'
import {
  openSessionSearchIndexerHarness,
  writeClaudeTranscript,
  type SessionSearchIndexerHarness
} from '../../src/main/ai-vault-search/session-search-indexer-test-fixture'
import { installInProcessSessionSearchService } from '../../src/main/ai-vault-search/session-search-in-process-service'
import { resetSessionSearchScopeCatalogForTests } from '../../src/main/ai-vault-search/session-search-scope-catalog'
import { setSessionSearchService } from '../../src/main/ai-vault-search/session-search-service-registry'

const state = vi.hoisted(() => ({ call: vi.fn() }))
vi.mock('../../src/cli/runtime-client', async () => {
  const errors = await import('../../src/cli/runtime/types.js')
  class RuntimeClient {
    readonly isRemote = false
    call = state.call
  }
  return { RuntimeClient, ...errors }
})
let harness: SessionSearchIndexerHarness
let installed: ReturnType<typeof installInProcessSessionSearchService>
beforeEach(async () => {
  harness = await openSessionSearchIndexerHarness('orca-cli-history-search')
  installed = null
  const rpc = new RpcDispatcher({ runtime: new OrcaRuntimeService(), methods: AI_VAULT_METHODS })
  state.call.mockImplementation(async (method: string, params: unknown) => {
    const response = await rpc.dispatch({ id: 'fixture', authToken: 'fixture', method, params })
    if (!response.ok) {
      throw new RuntimeRpcFailureError(response)
    }
    return response
  })
  process.exitCode = undefined
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(async () => {
  installed?.dispose()
  setSessionSearchService(null)
  resetSessionSearchScopeCatalogForTests()
  vi.restoreAllMocks()
  process.exitCode = undefined
  await harness.cleanup()
})
async function search(...flags: string[]) {
  vi.mocked(console.log).mockClear()
  await main(['search', ...flags, '--json'], harness.root)
  const output = vi.mocked(console.log).mock.calls.at(-1)?.[0]
  if (typeof output !== 'string') {
    throw new Error('Missing CLI JSON')
  }
  return JSON.parse(output)
}
it('searches indexed real transcripts and respects an explicit host path filter', async () => {
  const id = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
  await writeClaudeTranscript(
    join(harness.claudeProjectDir, `${id}.jsonl`),
    ['privateledger 한글 검색'],
    id
  )
  installed = installInProcessSessionSearchService({
    dataRoot: harness.root,
    roots: harness.roots,
    settings: { enabled: true, historyDays: null }
  })
  expect(installed).not.toBeNull()
  const response = await search('--query', 'privateledger', '--fresh')
  expect(process.exitCode).toBeUndefined()
  expect(response.result.kind).toBe('results')
  expect(response.result.hits).toContainEqual(expect.objectContaining({ sessionId: id }))
  const excluded = await search(
    '--query',
    'privateledger',
    '--path',
    '/different-fixture-workspace'
  )
  expect(process.exitCode).toBeUndefined()
  expect(excluded.result).toMatchObject({ kind: 'results', hits: [] })
  const status = await search('--index-status')
  expect(status.result.filesIndexed).toBeGreaterThan(0)
})
it('reports a host without a search service', async () => {
  const response = await search('--query', 'privateledger')
  expect(process.exitCode).toBeUndefined()
  expect(response.result).toMatchObject({ kind: 'unavailable', reason: 'no-service' })
})
it('reports disabled indexing without enabling it', async () => {
  installed = installInProcessSessionSearchService({
    dataRoot: harness.root,
    roots: harness.roots,
    settings: { enabled: false, historyDays: null }
  })
  expect(installed).not.toBeNull()
  const response = await search('--query', 'privateledger')
  expect(response.result).toMatchObject({ kind: 'unavailable', reason: 'disabled' })
  expect(process.exitCode).toBeUndefined()
})
