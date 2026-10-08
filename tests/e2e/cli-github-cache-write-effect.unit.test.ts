import '../../src/main/runtime/orca-runtime-test-mocks.spec'
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { installFakeAppEnvironment } from '../../config/scripts/vitest-host-ports-setup'
import { initDataPath } from '../../src/main/persistence/loading-store/user-data-path'
import { Store } from '../../src/main/persistence/loading-store/store'
import { OrcaRuntimeService } from '../../src/main/runtime/orca-runtime'
import { RpcDispatcher } from '../../src/main/runtime/rpc/dispatcher'
import { WORKSPACE_REVIEW_CACHE_WRITE_METHODS } from '../../src/main/runtime/rpc/methods/workspace-review-cache-write'
import { RuntimeRpcFailureError } from '../../src/cli/runtime/types'
import { main } from '../../src/cli/index'
import { workspaceGitHubCacheFixture } from './cli-github-cache-test-data'

const mocks = vi.hoisted(() => ({ call: vi.fn() }))
vi.mock('../../src/cli/runtime-client', async () => ({
  ...(await import('../../src/cli/runtime/types.js')),
  RuntimeClient: class {
    readonly isRemote = false
    call = mocks.call
  }
}))
let root: string
let store: Store
let runtime: OrcaRuntimeService
const empty = { pr: {}, issue: {} }
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'orca-cli-cache-write-'))
  installFakeAppEnvironment({ getPath: () => join(root, 'legacy') })
  initDataPath()
  store = new Store({
    dataFile: join(root, 'orca-data.json'),
    serializedState: JSON.stringify({ githubCache: empty })
  })
  runtime = new OrcaRuntimeService(store)
  mocks.call.mockReset().mockImplementation(async (method: string, params: unknown) => {
    const response = await new RpcDispatcher({
      runtime,
      methods: WORKSPACE_REVIEW_CACHE_WRITE_METHODS
    }).dispatch({ id: 'fixture', authToken: 'fixture', method, params })
    if (!response.ok) {
      throw new RuntimeRpcFailureError(response)
    }
    return response
  })
})
afterEach(async () => {
  vi.restoreAllMocks()
  process.exitCode = 0
  await rm(root, { recursive: true, force: true })
})
async function cli(request: unknown) {
  const path = join(root, 'request.json')
  await writeFile(path, JSON.stringify(request), { mode: 0o600 })
  const stdout = vi.spyOn(console, 'log').mockImplementation(() => {})
  const stderr = vi.spyOn(console, 'error').mockImplementation(() => {})
  process.exitCode = 0
  try {
    await main(['agent', 'workspace-cache', 'set-github', '--request-file', path, '--json'], root)
    const text = stdout.mock.calls.map((call) => call.join(' ')).join('\n')
    const parsed: unknown = text ? JSON.parse(text) : null
    return { code: Number(process.exitCode), parsed, text }
  } finally {
    stdout.mockRestore()
    stderr.mockRestore()
  }
}
it('replaces the canonical in-memory cache without claiming a durable write or echoing private data', async () => {
  const next = workspaceGitHubCacheFixture()
  const before = await readdir(root)
  const result = await cli({ confirm: true, expected: empty, next })
  expect(result.code).toBe(0)
  expect(result.parsed).toMatchObject({ result: { appliedInMemory: true, durable: false } })
  expect(store.getGitHubCache()).toEqual(next)
  expect(result.text).not.toContain('private cache write')
  expect((await readdir(root)).sort()).toEqual([...before, 'request.json'].sort())
})
it('rejects a stale expected snapshot and preserves the newer canonical cache', async () => {
  const newer = workspaceGitHubCacheFixture()
  store.setGitHubCache(newer)
  expect((await cli({ confirm: true, expected: empty, next: empty })).code).toBe(1)
  expect(store.getGitHubCache()).toEqual(newer)
})
it('accepts the exact current snapshot with reordered object keys', async () => {
  const expected = workspaceGitHubCacheFixture()
  store.setGitHubCache(expected)
  expect(
    (
      await cli({
        confirm: true,
        expected: { issue: expected.issue, pr: expected.pr },
        next: empty
      })
    ).code
  ).toBe(0)
  expect(store.getGitHubCache()).toEqual(empty)
})
it('refuses an unavailable host Store', async () => {
  runtime = new OrcaRuntimeService()
  expect((await cli({ confirm: true, expected: empty, next: empty })).code).toBe(1)
})
it.each([
  { expected: empty, next: empty },
  { confirm: false, expected: empty, next: empty },
  { confirm: true, expected: empty, next: { pr: {}, issue: {}, unknown: true } },
  {
    confirm: true,
    expected: empty,
    next: { pr: { invalid: { data: { number: 'bad' }, fetchedAt: 1 } }, issue: {} }
  },
  { confirm: true, expected: empty, next: empty, destination: '/other/profile' }
])('rejects unconfirmed or malformed cache data before RPC: %j', async (request) => {
  expect((await cli(request)).code).toBe(1)
  expect(mocks.call).not.toHaveBeenCalled()
  expect(store.getGitHubCache()).toEqual(empty)
})
it('refuses an old host once without applying a local cache fallback', async () => {
  mocks.call.mockImplementation(async () => {
    throw new RuntimeRpcFailureError({
      id: 'fixture',
      ok: false,
      error: { code: 'method_not_found', message: 'fixture old host' }
    })
  })
  expect(
    (await cli({ confirm: true, expected: empty, next: workspaceGitHubCacheFixture() })).code
  ).toBe(1)
  expect(mocks.call).toHaveBeenCalledTimes(1)
  expect(store.getGitHubCache()).toEqual(empty)
})

it('rejects malformed nested merge settings before RPC', async () => {
  const next = workspaceGitHubCacheFixture()
  const entry = Object.values(next.pr).find((value) => value.data !== null)
  if (!entry?.data) {
    throw new Error('fixture requires a PR')
  }
  const malformed = {
    ...next,
    pr: {
      invalid: {
        ...entry,
        data: {
          ...entry.data,
          mergeMethodSettings: {
            defaultMethod: 'squash',
            allowedMethods: { merge: false, squash: 'yes', rebase: false }
          }
        }
      }
    }
  }
  expect((await cli({ confirm: true, expected: empty, next: malformed })).code).toBe(1)
  expect(mocks.call).not.toHaveBeenCalled()
  expect(store.getGitHubCache()).toEqual(empty)
})
it('rejects prototype-reserved cache keys before RPC', async () => {
  const next = { pr: { constructor: { data: null, fetchedAt: 1 } }, issue: {} }
  expect((await cli({ confirm: true, expected: empty, next })).code).toBe(1)
  expect(mocks.call).not.toHaveBeenCalled()
  expect(store.getGitHubCache()).toEqual(empty)
})
