import { mkdtemp, rm, writeFile, truncate } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { RuntimeClient } from '../runtime-client'
import { terminalSendHandler } from './terminal-send'

let root: string
const call = vi.fn<RuntimeClient['call']>()
const canary = '한글 private terminal input\n둘째 줄'
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'orca-terminal-input-'))
  vi.spyOn(RuntimeClient.prototype, 'call').mockImplementation(call)
  call.mockReset().mockResolvedValue({
    id: 'fixture',
    ok: true,
    _meta: { runtimeId: 'fixture' },
    result: { send: { handle: 'term_fixture', accepted: true } }
  })
  vi.spyOn(console, 'log').mockImplementation(() => {})
})
afterEach(async () => {
  vi.restoreAllMocks()
  await rm(root, { recursive: true, force: true })
})
async function invoke(extra: [string, string | boolean][]) {
  await terminalSendHandler({
    flags: new Map<string, string | boolean>([['terminal', 'term_fixture'], ...extra]),
    client: new RuntimeClient(),
    cwd: root,
    json: true
  })
}
it('reads client-local UTF-8 input without echoing it in the receipt', async () => {
  await writeFile(join(root, 'input.txt'), canary)
  await invoke([['text-file', 'input.txt']])
  expect(call).toHaveBeenCalledWith('terminal.send', expect.objectContaining({ text: canary }))
  expect(JSON.stringify(vi.mocked(console.log).mock.calls)).not.toContain('private terminal input')
})
it('rejects conflicting inputs before sending bytes', async () => {
  await expect(
    invoke([
      ['text', canary],
      ['text-file', 'input.txt']
    ])
  ).rejects.toMatchObject({ code: 'invalid_argument' })
  expect(call).not.toHaveBeenCalled()
})
it('reads piped input', async () => {
  vi.spyOn(process.stdin, Symbol.asyncIterator).mockImplementation(async function* () {
    yield Buffer.from(canary)
    return undefined
  })
  await invoke([['text-file', '-']])
  expect(call).toHaveBeenCalledWith('terminal.send', expect.objectContaining({ text: canary }))
})

it.each(['missing', 'directory', 'invalid-utf8', 'oversized'] as const)(
  'refuses %s input before contacting the host',
  async (kind) => {
    let file = join(root, 'input.txt')
    if (kind === 'directory') {
      file = root
    }
    if (kind === 'invalid-utf8') {
      await writeFile(file, Buffer.from([0xc3, 0x28]))
    }
    if (kind === 'oversized') {
      await writeFile(file, canary)
      await truncate(file, 16 * 1024 * 1024 + 1)
    }
    await expect(invoke([['text-file', file]])).rejects.toMatchObject({ code: 'invalid_argument' })
    expect(call).not.toHaveBeenCalled()
  }
)

it('refuses malformed piped UTF-8 before contacting the host', async () => {
  vi.spyOn(process.stdin, Symbol.asyncIterator).mockImplementation(async function* () {
    yield Buffer.from([0xc3, 0x28])
    return undefined
  })
  await expect(invoke([['text-file', '-']])).rejects.toMatchObject({ code: 'invalid_argument' })
  expect(call).not.toHaveBeenCalled()
})
