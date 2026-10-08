import '../../src/main/runtime/orca-runtime-test-mocks.spec'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { installFakeAppEnvironment } from '../../config/scripts/vitest-host-ports-setup'
import { initDataPath } from '../../src/main/persistence/loading-store/user-data-path'
import { Store } from '../../src/main/persistence/loading-store/store'
import { OrcaRuntimeService } from '../../src/main/runtime/orca-runtime'
import { RpcDispatcher } from '../../src/main/runtime/rpc/dispatcher'
import { RuntimeRpcFailureError } from '../../src/cli/runtime/types'
import { main } from '../../src/cli/index'
import type { PersistedState } from '../../src/shared/persisted-state-types'

const mocks = vi.hoisted(() => ({ call: vi.fn() }))
vi.mock('../../src/cli/runtime-client', async () => {
  const errors = await import('../../src/cli/runtime/types.js')
  return {
    RuntimeClient: class {
      readonly isRemote = false
      call = mocks.call
    },
    ...errors
  }
})
const cache: PersistedState['githubCache'] = {
  pr: {
    'ssh:fixture:branch': {
      fetchedAt: 123,
      data: {
        number: 7,
        title: 'Private cached PR',
        state: 'open',
        url: 'https://github.example/fixture/repo/pull/7',
        checksStatus: 'pending',
        updatedAt: '2026-10-08T00:00:00Z',
        mergeable: 'UNKNOWN'
      }
    }
  },
  issue: {
    'folder:fixture:9': {
      fetchedAt: 125,
      data: {
        number: 9,
        title: 'Private cached issue',
        state: 'open',
        url: 'https://github.example/fixture/repo/issues/9',
        labels: [],
        description: 'private cache body canary'
      }
    }
  }
}
let root: string
let store: Store
let runtime: OrcaRuntimeService
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'orca-cli-review-cache-'))
  installFakeAppEnvironment({ getPath: () => join(root, 'legacy') })
  initDataPath()
  store = new Store({
    dataFile: join(root, 'orca-data.json'),
    serializedState: JSON.stringify({ githubCache: cache })
  })
  runtime = new OrcaRuntimeService(store)
  mocks.call.mockReset().mockImplementation(async (method: string, params: unknown) => {
    const { WORKSPACE_REVIEW_CACHE_METHODS } =
      await import('../../src/main/runtime/rpc/methods/workspace-review-cache')
    const response = await new RpcDispatcher({
      runtime,
      methods: WORKSPACE_REVIEW_CACHE_METHODS
    }).dispatch({ id: 'cache', authToken: 'fixture', method, params })
    if (!response.ok) {
      throw new RuntimeRpcFailureError(response)
    }
    return response
  })
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  process.exitCode = undefined
})
afterEach(async () => {
  vi.restoreAllMocks()
  process.exitCode = undefined
  await rm(root, { recursive: true, force: true })
})
async function command(...flags: string[]) {
  vi.mocked(console.log).mockClear()
  await main(['agent', 'workspace-cache', 'github', ...flags, '--json'], root)
  return JSON.parse(String(vi.mocked(console.log).mock.calls.at(-1)?.[0]))
}
it('reads the addressed Store cache with original timestamps and private content without changing it', async () => {
  const before = structuredClone(store.getGitHubCache())
  expect(await command()).toEqual(expect.objectContaining({ ok: true, result: { cache } }))
  expect(store.getGitHubCache()).toEqual(before)
  expect(mocks.call).toHaveBeenCalledExactlyOnceWith('cache.getGitHub', {})
})
it('refuses an absent host Store rather than inventing an empty cache', async () => {
  runtime = new OrcaRuntimeService()
  expect(await command()).toMatchObject({ ok: false })
})
it('rejects unexpected flags before RPC', async () => {
  expect(await command('--page', 'fixture-viewer')).toMatchObject({ ok: false })
  expect(mocks.call).not.toHaveBeenCalled()
})
it('fails once against an old host without a GitHub network fallback', async () => {
  mocks.call.mockRejectedValue(
    new RuntimeRpcFailureError({
      id: 'old',
      ok: false,
      error: { code: 'method_not_found', message: 'Old host' }
    })
  )
  expect(await command()).toMatchObject({ ok: false })
  expect(mocks.call).toHaveBeenCalledTimes(1)
})
