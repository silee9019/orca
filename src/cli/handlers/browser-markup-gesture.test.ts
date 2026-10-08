import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, basename } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { parseArgs, validateCommandAndFlags } from '../args'
import { RuntimeClient } from '../runtime-client'
import { BROWSER_MARKUP_GESTURE_COMMAND_SPECS } from '../specs/browser-markup-gesture'
import { BROWSER_MARKUP_GESTURE_HANDLERS } from './browser-markup-gesture'
const client = new RuntimeClient(join(tmpdir(), 'markup-gesture-fixture'), 60_000, null, null)
const directories = new Set<string>()
async function makeInput(input: string) {
  const cwd = await mkdtemp(join(tmpdir(), 'orca-markup-points-'))
  directories.add(cwd)
  const file = join(cwd, 'points.json')
  await writeFile(file, input)
  return { cwd, file }
}
async function run(cwd: string, file: string, extra: string[] = []) {
  const parsed = parseArgs([
    'browser',
    'markup',
    'gesture',
    '--viewer',
    'host',
    '--page',
    'page',
    '--points-file',
    file,
    ...extra
  ])
  validateCommandAndFlags(BROWSER_MARKUP_GESTURE_COMMAND_SPECS, parsed)
  await BROWSER_MARKUP_GESTURE_HANDLERS['browser markup gesture']({
    flags: parsed.flags,
    client,
    cwd,
    json: true
  })
}
afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(
    [...directories].map((directory) => rm(directory, { recursive: true, force: true }))
  )
  directories.clear()
})
it.each([false, true])(
  'sends bounded normalized input from a cwd-relative file with cancel=%s',
  async (cancel) => {
    const points = [
      { x: 0.1, y: 0.2 },
      { x: 0.8, y: 0.7 }
    ]
    const { cwd, file } = await makeInput(JSON.stringify(points))
    const call = vi.spyOn(client, 'call').mockResolvedValue({
      id: 'fixture',
      ok: true,
      result: { applied: true },
      _meta: { runtimeId: 'fixture' }
    })
    vi.spyOn(process.stdout, 'write').mockReturnValue(true)
    await run(cwd, basename(file), cancel ? ['--cancel'] : [])
    expect(call).toHaveBeenCalledWith('ui.browserViewer', {
      viewer: 'host',
      page: 'page',
      operation: 'markup-editor',
      command: { action: 'gesture', points, cancel }
    })
  }
)
it.each([
  'invalid',
  '[]',
  '[{"x":2,"y":0}]',
  JSON.stringify(Array.from({ length: 4097 }, () => ({ x: 0, y: 0 })))
])('refuses malformed or unbounded point input before RPC', async (input) => {
  const { cwd, file } = await makeInput(input)
  const call = vi.spyOn(client, 'call')
  await expect(run(cwd, file)).rejects.toThrow()
  expect(call).not.toHaveBeenCalled()
})
it('refuses oversized and non-regular input before RPC', async () => {
  const { cwd, file } = await makeInput(' '.repeat(256 * 1024 + 1))
  const call = vi.spyOn(client, 'call')
  await expect(run(cwd, file)).rejects.toThrow('at most 256 KiB')
  await expect(run(cwd, cwd)).rejects.toThrow('regular file')
  expect(call).not.toHaveBeenCalled()
})
it('refuses a value on the cancel flag instead of silently ignoring it', async () => {
  const { cwd, file } = await makeInput('[{"x":0,"y":0}]')
  const call = vi.spyOn(client, 'call')
  await expect(run(cwd, file, ['--cancel', 'yes'])).rejects.toThrow('--cancel takes no value')
  expect(call).not.toHaveBeenCalled()
})
