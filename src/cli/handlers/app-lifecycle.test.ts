import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RuntimeClient } from '../runtime-client'
import { APP_LIFECYCLE_HANDLERS } from './app-lifecycle'
import { APP_LIFECYCLE_COMMAND_SPECS } from '../specs/app-lifecycle'
import { parseArgs, validateCommandAndFlags } from '../args'

const call = vi.spyOn(RuntimeClient.prototype, 'call')
afterEach(() => vi.clearAllMocks())

async function invoke(argv: string[]): Promise<void> {
  const parsed = parseArgs(
    argv,
    APP_LIFECYCLE_COMMAND_SPECS.map((s) => s.path),
    APP_LIFECYCLE_COMMAND_SPECS
  )
  validateCommandAndFlags(APP_LIFECYCLE_COMMAND_SPECS, parsed)
  const handler = APP_LIFECYCLE_HANDLERS[parsed.commandPath.join(' ')]
  if (!handler) {
    throw new Error('Missing lifecycle handler')
  }
  await handler({
    client: new RuntimeClient(),
    flags: parsed.flags,
    cwd: process.cwd(),
    json: true
  })
}

describe('app lifecycle CLI', () => {
  it('has one handler for every public lifecycle command', () => {
    const paths = APP_LIFECYCLE_COMMAND_SPECS.map((spec) => spec.path.join(' ')).sort()
    expect(Object.keys(APP_LIFECYCLE_HANDLERS).sort()).toEqual(paths)
    expect(new Set(paths).size).toBe(paths.length)
  })
  it('saves private prompt content only into a new private output file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'orca-private-output-'))
    const input = join(dir, 'selector.json')
    const outputFile = join(dir, 'prompt.json')
    const output = vi.spyOn(console, 'log').mockImplementation(() => {})
    call.mockResolvedValue({
      id: 'fixture',
      ok: true,
      result: { prompt: 'private-canary' },
      _meta: { runtimeId: 'fixture-host' }
    })
    try {
      await writeFile(
        input,
        JSON.stringify({ agent: 'claude', filePath: join(dir, 'session.jsonl') })
      )
      await invoke([
        'app',
        'vault',
        'first-prompt',
        '--input-file',
        input,
        '--output-file',
        outputFile,
        '--json'
      ])
      expect(await readFile(outputFile, 'utf8')).toContain('private-canary')
      if (process.platform !== 'win32') {
        expect((await stat(outputFile)).mode & 0o777).toBe(0o600)
      }
      expect(output.mock.calls.flat().join(' ')).not.toContain('private-canary')
      await expect(
        invoke(['app', 'vault', 'first-prompt', '--input-file', input, '--output-file', outputFile])
      ).rejects.toMatchObject({ code: 'EEXIST' })
    } finally {
      output.mockRestore()
      await rm(dir, { recursive: true, force: true })
    }
  })
  it('addresses the desktop updater separately from the server updater', async () => {
    call.mockResolvedValue({
      id: 'fixture',
      ok: true,
      result: { state: 'idle' },
      _meta: { runtimeId: 'fixture-host' }
    })
    const output = vi.spyOn(console, 'log').mockImplementation(() => {})
    await invoke(['app', 'update', 'status', '--json'])
    expect(call).toHaveBeenCalledWith('desktopUpdater.getStatus')
    expect(output).toHaveBeenCalledWith(expect.stringContaining('fixture-host'))
    output.mockRestore()
  })
  it('rejects installation without an exact target confirmation before RPC', async () => {
    await expect(invoke(['app', 'update', 'install'])).rejects.toThrow('confirm-target')
    expect(call).not.toHaveBeenCalled()
  })
  it('passes the explicit WSL distro to the owning runtime', async () => {
    call.mockResolvedValue({
      id: 'fixture',
      ok: true,
      result: { state: 'installed' },
      _meta: { runtimeId: 'fixture-host' }
    })
    const output = vi.spyOn(console, 'log').mockImplementation(() => {})
    await invoke(['app', 'cli', 'status', '--distro', 'Ubuntu', '--json'])
    expect(call).toHaveBeenCalledWith('desktopCli.getWslInstallStatus', { distro: 'Ubuntu' })
    output.mockRestore()
  })
  it('refuses unknown update channels before RPC', async () => {
    await expect(invoke(['app', 'update', 'builds', '--channel', 'unknown'])).rejects.toThrow()
    expect(call).not.toHaveBeenCalled()
  })
})
