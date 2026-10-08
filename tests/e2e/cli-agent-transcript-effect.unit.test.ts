import '../../src/main/runtime/rpc/unused-default-rpc-methods.test-fixture'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import type * as OsModule from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { OrcaRuntimeService } from '../../src/main/runtime/orca-runtime'
import { RpcDispatcher } from '../../src/main/runtime/rpc/dispatcher'
import { NATIVE_CHAT_METHODS } from '../../src/main/runtime/rpc/methods/native-chat'
import { RuntimeRpcFailureError } from '../../src/cli/runtime/types'
import { main } from '../../src/cli/index'

const state = vi.hoisted(() => ({ call: vi.fn(), home: '' }))
vi.mock('node:os', async () => ({
  ...(await vi.importActual<typeof OsModule>('node:os')),
  homedir: () => state.home
}))
vi.mock('../../src/cli/runtime-client', async () => {
  const errors = await import('../../src/cli/runtime/types.js')
  class RuntimeClient {
    readonly isRemote = false
    call = state.call
  }
  return { RuntimeClient, ...errors }
})
let root: string
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'orca-cli-transcript-'))
  state.home = root
  vi.stubEnv('CLAUDE_CONFIG_DIR', join(root, '.claude'))
  const rpc = new RpcDispatcher({ runtime: new OrcaRuntimeService(), methods: NATIVE_CHAT_METHODS })
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
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  process.exitCode = undefined
  await rm(root, { recursive: true, force: true })
})
async function read(request: unknown) {
  const file = join(root, 'request.json')
  await writeFile(file, JSON.stringify(request))
  await main(['agent', 'history', 'read', '--request-file', file, '--json'], root)
}
it('reads actual UTF-8 transcript turns and pages older history on the owning host', async () => {
  const transcriptPath = join(root, 'session.jsonl')
  await writeFile(
    transcriptPath,
    [1, 2, 3]
      .map((n) =>
        JSON.stringify({
          type: 'user',
          uuid: `message-${n}`,
          message: { role: 'user', content: `한글 turn ${n}` }
        })
      )
      .concat([''])
      .join('\n')
  )
  await read({ agent: 'claude', sessionId: 'fixture', transcriptPath, limit: 1 })
  expect(process.exitCode).toBeUndefined()
  const output = vi.mocked(console.log).mock.calls.at(-1)?.[0]
  if (typeof output !== 'string') {
    throw new Error('Missing CLI JSON')
  }
  const tail = JSON.parse(output)
  expect(JSON.stringify(tail.result.messages)).toContain('한글 turn 3')
  expect(tail.result.hasMore).toBe(true)
  expect(tail.result.messages).toHaveLength(1)
  await read({
    agent: 'claude',
    sessionId: 'fixture',
    transcriptPath,
    limit: 1,
    beforeOffset: tail.result.beforeOffset
  })
  expect(process.exitCode).toBeUndefined()
  expect(JSON.stringify(vi.mocked(console.log).mock.calls.at(-1))).toContain('한글 turn 2')
})
it.each(['claude', 'antigravity'])(
  'refuses an unavailable %s transcript instead of success',
  async (agent) => {
    await read({ agent, sessionId: 'missing-fixture' })
    expect(process.exitCode).toBe(1)
    const output = vi.mocked(console.log).mock.calls.at(-1)?.[0]
    if (typeof output !== 'string') {
      throw new Error('Missing CLI failure JSON')
    }
    expect(JSON.parse(output)).toMatchObject({
      ok: false,
      error: {
        code: agent === 'claude' ? 'transcript_not_found' : 'transcript_unavailable',
        data: { notFound: agent === 'claude' }
      }
    })
  }
)
