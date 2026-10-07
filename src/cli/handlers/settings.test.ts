import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RuntimeClient, RuntimeRpcFailureError } from '../runtime-client'
import { SETTINGS_HANDLERS } from './settings'

let directory: string
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'orca-cli-settings-'))
})
afterEach(async () => {
  vi.restoreAllMocks()
  await rm(directory, { recursive: true, force: true })
})

async function invoke(key: string, flags = new Map<string, string | boolean>()) {
  const handler = SETTINGS_HANDLERS[key]
  if (!handler) {throw new Error(`Missing handler ${key}`)}
  await handler({
    client: new RuntimeClient(directory, 1000, null, null),
    cwd: directory,
    flags,
    json: true
  })
}

function response(settings: unknown) {
  return { id: 'test', ok: true as const, result: { settings }, _meta: { runtimeId: 'host-2' } }
}

describe('settings CLI', () => {
  it('prints a safe host-stamped projection even if a host adds secret fields', async () => {
    const call = vi.spyOn(RuntimeClient.prototype, 'call').mockResolvedValue(
      response({
        machineName: 'build-host',
        agentDefaultEnv: { codex: { KEY: 'secret-canary' } },
        futureSecret: 'future-canary'
      })
    )
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    await invoke('settings get')
    expect(call).toHaveBeenCalledExactlyOnceWith('settings.control.get')
    expect(String(log.mock.calls[0]?.[0])).toContain('host-2')
    expect(String(log.mock.calls[0]?.[0])).toContain('build-host')
    expect(String(log.mock.calls[0]?.[0])).not.toContain('canary')
  })

  it('reads secrets from a file, writes once and prints the host read-back', async () => {
    await writeFile(
      join(directory, 'input.json'),
      JSON.stringify({
        machineName: 'requested',
        agentDefaultEnv: { codex: { KEY: 'secret-canary' } }
      })
    )
    const call = vi.spyOn(RuntimeClient.prototype, 'call').mockResolvedValue(
      response({
        machineName: 'applied',
        agentDefaultEnv: { codex: { KEY: 'secret-canary' } }
      })
    )
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    await invoke('settings update', new Map([['file', 'input.json']]))
    expect(call).toHaveBeenCalledExactlyOnceWith('settings.control.update', {
      machineName: 'requested',
      agentDefaultEnv: { codex: { KEY: 'secret-canary' } }
    })
    expect(String(log.mock.calls[0]?.[0])).toContain('applied')
    expect(String(log.mock.calls[0]?.[0])).not.toContain('canary')
  })

  it.each(['{"machineName": 7}', '{"nestedWorkerMaxDepth": 99}', '{secret-canary'])(
    'rejects invalid input before connecting to a runtime: %s',
    async (input) => {
      await writeFile(join(directory, 'input.json'), input)
      const call = vi.spyOn(RuntimeClient.prototype, 'call')
      await expect(
        invoke('settings update', new Map([['file', 'input.json']]))
      ).rejects.toMatchObject({ code: 'invalid_argument' })
      expect(call).not.toHaveBeenCalled()
    }
  )

  it('asks an old host to update without retrying the unsafe legacy settings read', async () => {
    const call = vi.spyOn(RuntimeClient.prototype, 'call').mockRejectedValue(
      new RuntimeRpcFailureError({
        id: 'old',
        ok: false,
        error: { code: 'method_not_found', message: 'Unknown method' },
        _meta: { runtimeId: 'old-host' }
      })
    )
    await expect(invoke('settings get')).rejects.toMatchObject({ code: 'update_required' })
    expect(call).toHaveBeenCalledTimes(1)
  })

  it('prints only the desktop acknowledgement and safe settings fields', async () => {
    vi.spyOn(RuntimeClient.prototype, 'call').mockResolvedValue({
      id: 'desktop',
      ok: true,
      _meta: { runtimeId: 'desktop-host' },
      result: {
        settings: { theme: 'dark', opencodeSessionCookie: 'secret-canary' },
        persisted: true,
        rendered: false,
        futureSecret: 'future-canary'
      }
    })
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    await writeFile(join(directory, 'desktop.json'), JSON.stringify({ theme: 'dark' }))
    await invoke('settings desktop update', new Map([['file', 'desktop.json']]))
    const output = String(log.mock.calls[0]?.[0])
    expect(output).toContain('desktop-host')
    expect(JSON.parse(output).result).toMatchObject({ persisted: true, rendered: false })
    expect(output).not.toContain('canary')
  })

  it('rejects invalid shortcut actions before contacting the host', async () => {
    await writeFile(
      join(directory, 'shortcut.json'),
      JSON.stringify({ actionId: 'unknown', bindings: [] })
    )
    const call = vi.spyOn(RuntimeClient.prototype, 'call')
    await expect(
      invoke('settings keybindings set', new Map([['file', 'shortcut.json']]))
    ).rejects.toMatchObject({ code: 'invalid_argument' })
    expect(call).not.toHaveBeenCalled()
  })

  it('updates a review bot through the atomic override operation', async () => {
    const call = vi
      .spyOn(RuntimeClient.prototype, 'call')
      .mockResolvedValue(response({ prBotAuthorOverrides: ['review-bot'] }))
    vi.spyOn(console, 'log').mockImplementation(() => {})
    await invoke(
      'settings review-bot',
      new Map([
        ['author', 'review-bot'],
        ['is-bot', 'true']
      ])
    )
    expect(call).toHaveBeenCalledExactlyOnceWith('settings.control.updatePRBotAuthorOverride', {
      author: 'review-bot',
      isBot: true
    })
  })
})
