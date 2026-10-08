import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createReadStream } from 'node:fs'
import type * as FsModule from 'node:fs'
import { readConnectionInput, readConnectionJson } from './connection-input'
vi.mock('node:fs', async (load) => {
  const actual = await load<typeof FsModule>()
  return { ...actual, createReadStream: vi.fn(actual.createReadStream) }
})
const directories: string[] = []
afterEach(async () => {
  vi.clearAllMocks()
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))
  )
})
async function fixture(text: string) {
  const directory = await mkdtemp(join(tmpdir(), 'orca-connection-input-'))
  directories.push(directory)
  const file = join(directory, 'input')
  await writeFile(file, text, { mode: 0o600 })
  return file
}
it('streams an oversized file through the bounded reader and does not expose its contents', async () => {
  const file = await fixture('private-input-canary'.repeat(100000))
  await expect(readConnectionInput(new Map([['input-file', file]]))).rejects.toMatchObject({
    code: 'invalid_argument',
    message: 'Connection input exceeds 64 KiB'
  })
  expect(createReadStream).toHaveBeenCalledExactlyOnceWith(file)
})
it('accepts exactly 64 KiB while counting UTF-8 bytes', async () => {
  const text = `${'한'.repeat(21845)}x`
  const file = await fixture(text)
  expect(Buffer.byteLength(text)).toBe(65536)
  expect(await readConnectionInput(new Map([['input-file', file]]))).toBe(text)
})
it('rejects mutually exclusive file and stdin inputs before opening the file', async () => {
  const flags = new Map<string, string | boolean>([
    ['input-file', 'private-file-canary'],
    ['input-stdin', true]
  ])
  await expect(readConnectionInput(flags)).rejects.toMatchObject({
    code: 'invalid_argument',
    message: 'Choose exactly one of --input-file or --input-stdin'
  })
  expect(createReadStream).not.toHaveBeenCalled()
})
it('does not echo invalid JSON input', async () => {
  const file = await fixture('private-invalid-json-canary')
  await expect(readConnectionJson(new Map([['input-file', file]]))).rejects.toMatchObject({
    code: 'invalid_argument',
    message: 'Connection input must be valid JSON'
  })
})
