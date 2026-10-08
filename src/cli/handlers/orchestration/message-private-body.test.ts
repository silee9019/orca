import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ORCHESTRATION_HANDLERS } from '../orchestration'
import { RuntimeClient } from '../../runtime-client'

let root: string
const canary = '한글 private body canary\n둘째 줄'
const call = vi.fn<RuntimeClient['call']>()
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'orca-message-body-'))
  vi.spyOn(RuntimeClient.prototype, 'call').mockImplementation(call)
  call.mockReset().mockResolvedValue({
    id: 'fixture',
    ok: true,
    _meta: { runtimeId: 'fixture' },
    result: { message: { id: 'msg_1', run_id: 'run_1', body: canary, payload: canary } }
  })
  vi.spyOn(console, 'log').mockImplementation(() => {})
})
afterEach(async () => {
  vi.restoreAllMocks()
  await rm(root, { recursive: true, force: true })
})
async function invoke(action: 'send' | 'reply', extra: [string, string | boolean][] = []) {
  await ORCHESTRATION_HANDLERS[`orchestration ${action}`]({
    flags: new Map<string, string | boolean>([
      ['from', 'term_coord'],
      ['to', 'term_coord'],
      ['subject', 'fixture'],
      ['id', 'msg_original'],
      ...extra
    ]),
    client: new RuntimeClient(),
    cwd: root,
    json: true
  })
}
it.each(['send', 'reply'] as const)(
  'reads %s body from a client file and omits it from the receipt',
  async (action) => {
    await writeFile(join(root, 'body.txt'), canary)
    await invoke(action, [['body-file', 'body.txt']])
    expect(call).toHaveBeenCalledWith(
      `orchestration.${action}`,
      expect.objectContaining({ body: canary })
    )
    const output = JSON.stringify(vi.mocked(console.log).mock.calls)
    expect(output).toContain('msg_1')
    expect(output).not.toContain('private body canary')
  }
)
it.each(['send', 'reply'] as const)(
  'rejects conflicting %s inputs before any RPC',
  async (action) => {
    await expect(
      invoke(action, [
        ['body', canary],
        ['body-file', 'body.txt']
      ])
    ).rejects.toMatchObject({ code: 'invalid_argument' })
    expect(call).not.toHaveBeenCalled()
  }
)
it('rejects an oversized body before any RPC without echoing it', async () => {
  await writeFile(join(root, 'large.txt'), canary.repeat(100_000))
  await expect(invoke('send', [['body-file', 'large.txt']])).rejects.toMatchObject({
    code: 'invalid_argument',
    message: expect.not.stringContaining(canary)
  })
  expect(call).not.toHaveBeenCalled()
})

it('reads piped stdin without an RPC-side path', async () => {
  vi.spyOn(process.stdin, Symbol.asyncIterator).mockImplementation(async function* () {
    yield Buffer.from(canary)
    return undefined
  })
  await invoke('send', [['body-file', '-']])
  expect(call).toHaveBeenCalledWith('orchestration.send', expect.objectContaining({ body: canary }))
})
it('rejects invalid UTF-8 files without echoing input', async () => {
  await writeFile(join(root, 'invalid.txt'), Buffer.from([0xc3, 0x28]))
  await expect(invoke('send', [['body-file', 'invalid.txt']])).rejects.toMatchObject({
    code: 'invalid_argument'
  })
  expect(call).not.toHaveBeenCalled()
})

it.each(['send', 'reply'] as const)(
  'refuses malformed piped UTF-8 for %s before RPC',
  async (action) => {
    vi.spyOn(process.stdin, Symbol.asyncIterator).mockImplementation(async function* () {
      yield Buffer.from([0xc3, 0x28])
      return undefined
    })
    await expect(invoke(action, [['body-file', '-']])).rejects.toMatchObject({
      code: 'invalid_argument'
    })
    expect(call).not.toHaveBeenCalled()
  }
)
